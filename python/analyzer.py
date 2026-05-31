import sys
import json
import os
import sqlite3
import re
from collections import Counter
import cv2
import numpy as np
from sentence_transformers import SentenceTransformer, util

# Initialize models
model = SentenceTransformer('all-MiniLM-L6-v2')

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
    Detects layout type using OpenCV heuristics.
    """
    if not os.path.exists(image_path):
        return "UNKNOWN"
        
    img = cv2.imread(image_path)
    if img is None:
        return "UNKNOWN"
        
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 50, 150)
    
    # 1. Detect Chat Layout (Message avatars/bubbles on sides)
    # 2. Detect Code Layout (High indentation diversity, specific punctuation)
    # 3. Detect Flowchart/Diagram (High edge connectivity, shapes)
    
    # Heuristic for Code: High vertical alignment on specific columns
    # Heuristic for Chat: Specific aspect ratios for contours (bubbles)
    
    height, width = gray.shape
    
    # Simple Layout Logic
    # Chat: Look for repeated small contours on left/right
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    bubble_count = 0
    code_indentation = 0
    shapes_count = 0
    
    for cnt in contours:
        x, y, w, h = cv2.boundingRect(cnt)
        aspect_ratio = float(w)/h
        if 50 < h < 200 and aspect_ratio > 1.5:
            bubble_count += 1
        if w > 100 and h > 100:
            shapes_count += 1
            
    if bubble_count > 4:
        return "CHAT_LAYOUT"
    if shapes_count > 5:
        return "DIAGRAM_LAYOUT"
        
    return "DOCUMENT_LAYOUT"

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
    if not text or len(text.strip()) < 15:
        return "GENERAL_NOTES"

    clusters = []
    if os.path.exists(DB_PATH):
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT study_group_name, GROUP_CONCAT(ocr_text, ' ') 
            FROM (
                SELECT study_group_name, ocr_text 
                FROM screenshots 
                WHERE main_category = 'STUDY' AND study_group_name IS NOT NULL
                ORDER BY created_at DESC
            ) 
            GROUP BY study_group_name
        """)
        clusters = cursor.fetchall()
        conn.close()

    query_embedding = model.encode(text, convert_to_tensor=True)
    
    if not clusters:
        new_name = (extract_dominant_terms(text) or "STUDY_CLUSTER_1").upper()
        return new_name

    cluster_names = [c[0] for c in clusters]
    cluster_texts = [c[1] if c[1] else c[0] for c in clusters]
    cluster_embeddings = model.encode(cluster_texts, convert_to_tensor=True)
    
    cosine_scores = util.cos_sim(query_embedding, cluster_embeddings)[0]
    best_match_idx = int(cosine_scores.argmax())
    best_score = float(cosine_scores[best_match_idx])
    
    if best_score > 0.50:
        return cluster_names[best_match_idx].upper()
    else:
        term_name = extract_dominant_terms(text)
        return (term_name if term_name else f"STUDY_CLUSTER_{len(clusters) + 1}").upper()

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    
    if mode == "semantic_search":
        query = sys.argv[2] if len(sys.argv) > 2 else ""
        results = semantic_search(query)
        print(json.dumps(results))
        
    elif mode == "analyze_layout":
        img_path = sys.argv[2] if len(sys.argv) > 2 else ""
        layout = analyze_layout(img_path)
        print(json.dumps({"layout": layout}))
        
    elif mode == "analyze_semantic":
        text_input = sys.argv[2] if len(sys.argv) > 2 else ""
        result = analyze_semantic(text_input)
        print(json.dumps({"study_group": result}))
    
    else:
        # Backward compatibility
        if len(sys.argv) > 1:
            text_input = sys.argv[1]
            result = analyze_semantic(text_input)
            print(json.dumps({"study_group": result}))
