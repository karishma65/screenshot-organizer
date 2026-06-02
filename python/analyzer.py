import sys
import json
import os
import sqlite3
import re
from collections import Counter
import cv2
import numpy as np
from sentence_transformers import SentenceTransformer, util
import torch
import clip
from PIL import Image

# Initialize models
model = SentenceTransformer('all-MiniLM-L6-v2')
device = "cuda" if torch.cuda.is_available() else "cpu"
clip_model, preprocess = clip.load("ViT-B/32", device=device)

# CLIP Labels for zero-shot classification
VISUAL_LABELS = [
    "a diagram or chart",
    "a document or paper",
    "a code editor with syntax highlighting",
    "a website or webpage",
    "an anime scene",
    "a movie scene or cinematic shot",
    "a photo of a person",
    "a photo of an animal"
]

LABEL_MAPPING = {
    "a diagram or chart": "diagram",
    "a document or paper": "document",
    "a code editor with syntax highlighting": "code_editor",
    "a website or webpage": "website",
    "an anime scene": "anime",
    "a movie scene or cinematic shot": "movie_scene",
    "a photo of a person": "human_photo",
    "a photo of an animal": "animal_photo"
}

DB_PATH = os.path.join(os.path.dirname(__file__), '../data/metadata.db')

def get_db_connection():
    return sqlite3.connect(DB_PATH)

def extract_dominant_terms(text):
    words = re.findall(r'\b\w{5,}\b', text.lower())
    stop_words = {'about', 'there', 'their', 'would', 'could', 'should', 'through', 'please', 'thanks'}
    filtered = [w for w in words if w not in stop_words]
    common = Counter(filtered).most_common(2)
    if common:
        return "_".join([w[0].capitalize() for w in common])
    return None

def analyze_layout(image_path):
    """
    Fast layout detection using pixel density and projections.
    Suitable for 5000+ screenshots.
    """
    if not os.path.exists(image_path):
        return "UNKNOWN_LAYOUT", 0
        
    try:
        img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
        if img is None:
            return "UNKNOWN_LAYOUT", 0
            
        h, w = img.shape
        # Threshold to binary for density analysis
        _, binary = cv2.threshold(img, 200, 255, cv2.THRESH_BINARY_INV)
        
        # 1. Calculate Densities
        total_pixels = h * w
        ink_pixels = np.count_nonzero(binary)
        density = ink_pixels / total_pixels
        
        # 2. Projections (Vertical & Horizontal)
        v_proj = np.sum(binary, axis=0) / 255
        h_proj = np.sum(binary, axis=1) / 255
        
        # Blank lines (Whitespace distribution)
        blank_rows = np.where(h_proj < (w * 0.02))[0]
        row_variance = np.var(np.diff(blank_rows)) if len(blank_rows) > 5 else 0
        
        # 3. Decision Logic
        # PHOTO: Very high density or very scattered ink (no clear lines)
        if density > 0.4:
            return "PHOTO_LAYOUT", 0.8
            
        # CODE: High vertical alignment on the left (indentation)
        left_density = np.sum(v_proj[:int(w*0.2)])
        if left_density > (np.sum(v_proj) * 0.4) and len(blank_rows) > 20:
            return "CODE_LAYOUT", 0.9
            
        # CHAT: Evenly spaced horizontal blocks with gaps
        if 5 < len(blank_rows) < 50 and row_variance < 100:
            return "CHAT_LAYOUT", 0.85
            
        # DIAGRAM: Low density, scattered projections
        if 0.01 < density < 0.08:
            return "DIAGRAM_LAYOUT", 0.75
            
        return "DOCUMENT_LAYOUT", 0.7
    except:
        return "UNKNOWN_LAYOUT", 0

def semantic_search(query):
    """
    Searches screenshots based on semantic similarity to OCR text.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, ocr_text FROM screenshots WHERE ocr_text IS NOT NULL AND ocr_text != ''")
    rows = cursor.fetchall()
    conn.close()
    
    if not rows:
        return []
        
    ids = [r[0] for r in rows]
    texts = [r[1] for r in rows]
    
    query_embedding = model.encode(query, convert_to_tensor=True)
    text_embeddings = model.encode(texts, convert_to_tensor=True)
    
    cosine_scores = util.cos_sim(query_embedding, text_embeddings)[0]
    
    # Get top 20 matches
    top_results_idx = np.argsort(-cosine_scores.cpu().numpy())[:20]
    
    results = []
    for idx in top_results_idx:
        if cosine_scores[idx] > 0.35: # Threshold for 'relevant'
            results.append({
                "id": ids[idx],
                "score": float(cosine_scores[idx])
            })
            
    return results

def analyze_semantic(text):
    if not text or len(text.strip()) < 20:
        return "NONE"

    clusters = []
    if os.path.exists(DB_PATH):
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("""
                SELECT study_group_name, GROUP_CONCAT(ocr_text, ' ') 
                FROM (
                    SELECT study_group_name, ocr_text 
                    FROM screenshots 
                    WHERE main_category = 'STUDY' AND study_group_name IS NOT NULL AND study_group_name != 'NONE'
                    ORDER BY created_at DESC
                ) 
                GROUP BY study_group_name
            """)
            clusters = cursor.fetchall()
            conn.close()
        except:
            pass

    if not clusters:
        # We no longer auto-create clusters from random text.
        # This prevents fragmentation.
        return "NONE"

    query_embedding = model.encode(text, convert_to_tensor=True)
    cluster_names = [c[0] for c in clusters]
    cluster_texts = [c[1] if c[1] else c[0] for c in clusters]
    cluster_embeddings = model.encode(cluster_texts, convert_to_tensor=True)
    
    cosine_scores = util.cos_sim(query_embedding, cluster_embeddings)[0]
    best_match_idx = int(cosine_scores.argmax())
    best_score = float(cosine_scores[best_match_idx])
    
    # Strictly conservative threshold (Prefer 0.80)
    if best_score >= 0.80:
        return cluster_names[best_match_idx].upper()
    
    return "NONE"

def analyze_visual(image_path):
    if not os.path.exists(image_path):
        return []
    
    try:
        image = preprocess(Image.open(image_path)).unsqueeze(0).to(device)
        # We need to compute text features for labels
        text_inputs = clip.tokenize(VISUAL_LABELS).to(device)

        with torch.no_grad():
            image_features = clip_model.encode_image(image)
            text_features = clip_model.encode_text(text_inputs)
            
            # Normalize
            image_features /= image_features.norm(dim=-1, keepdim=True)
            text_features /= text_features.norm(dim=-1, keepdim=True)
            
            # Similarity
            similarity = (100.0 * image_features @ text_features.T).softmax(dim=-1)
            probs = similarity.cpu().numpy()[0]

        results = []
        for i, prob in enumerate(probs):
            if prob > 0.20: # Confidence threshold for CLIP
                results.append({
                    "label": LABEL_MAPPING[VISUAL_LABELS[i]],
                    "confidence": float(prob)
                })
        
        return sorted(results, key=lambda x: x['confidence'], reverse=True)
    except Exception as e:
        print(f"CLIP ERROR: {e}")
        return []

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    
    if mode == "semantic_search":
        query = sys.argv[2] if len(sys.argv) > 2 else ""
        results = semantic_search(query)
        print(json.dumps(results))
        
    elif mode == "analyze_layout":
        img_path = sys.argv[2] if len(sys.argv) > 2 else ""
        layout, confidence = analyze_layout(img_path)
        print(json.dumps({"layout": layout, "confidence": confidence}))
        
    elif mode == "analyze_semantic":
        text_input = sys.argv[2] if len(sys.argv) > 2 else ""
        result = analyze_semantic(text_input)
        print(json.dumps({"study_group": result}))
    
    elif mode == "analyze_visual":
        img_path = sys.argv[2] if len(sys.argv) > 2 else ""
        results = analyze_visual(img_path)
        print(json.dumps(results))
    
    else:
        # Backward compatibility
        if len(sys.argv) > 1:
            text_input = sys.argv[1]
            result = analyze_semantic(text_input)
            print(json.dumps({"study_group": result}))
