import sys
import json
import os
import torch
import clip
from PIL import Image
from sentence_transformers import SentenceTransformer, util
import cv2
import numpy as np

# Load models ONCE at startup
print("BRIDGE_STARTING", flush=True)

device = "cuda" if torch.cuda.is_available() else "cpu"
clip_model, preprocess = clip.load("ViT-B/32", device=device)
semantic_model = SentenceTransformer('all-MiniLM-L6-v2')

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

def analyze_visual(image_path):
    if not os.path.exists(image_path): return []
    try:
        image = preprocess(Image.open(image_path)).unsqueeze(0).to(device)
        text_inputs = clip.tokenize(VISUAL_LABELS).to(device)
        with torch.no_grad():
            image_features = clip_model.encode_image(image)
            text_features = clip_model.encode_text(text_inputs)
            image_features /= image_features.norm(dim=-1, keepdim=True)
            text_features /= text_features.norm(dim=-1, keepdim=True)
            similarity = (100.0 * image_features @ text_features.T).softmax(dim=-1)
            probs = similarity.cpu().numpy()[0]
        results = []
        for i, prob in enumerate(probs):
            if prob > 0.20:
                results.append({"label": LABEL_MAPPING[VISUAL_LABELS[i]], "confidence": float(prob)})
        return sorted(results, key=lambda x: x['confidence'], reverse=True)
    except: return []

def analyze_layout(image_path):
    if not os.path.exists(image_path): return "UNKNOWN_LAYOUT", 0
    try:
        img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
        if img is None: return "UNKNOWN_LAYOUT", 0
        h, w = img.shape
        _, binary = cv2.threshold(img, 200, 255, cv2.THRESH_BINARY_INV)
        ink_pixels = np.count_nonzero(binary)
        density = ink_pixels / (h * w)
        v_proj = np.sum(binary, axis=0) / 255
        h_proj = np.sum(binary, axis=1) / 255
        blank_rows = np.where(h_proj < (w * 0.02))[0]
        row_variance = np.var(np.diff(blank_rows)) if len(blank_rows) > 5 else 0
        if density > 0.4: return "PHOTO_LAYOUT", 0.8
        left_density = np.sum(v_proj[:int(w*0.2)])
        if left_density > (np.sum(v_proj) * 0.4) and len(blank_rows) > 20: return "CODE_LAYOUT", 0.9
        if 5 < len(blank_rows) < 50 and row_variance < 100: return "CHAT_LAYOUT", 0.85
        if 0.01 < density < 0.08: return "DIAGRAM_LAYOUT", 0.75
        return "DOCUMENT_LAYOUT", 0.7
    except: return "UNKNOWN_LAYOUT", 0

def analyze_semantic(text_input, clusters):
    if not text_input or not clusters: return "NONE"
    try:
        query_embedding = semantic_model.encode(text_input, convert_to_tensor=True)
        cluster_names = [c[0] for c in clusters]
        cluster_texts = [c[1] if c[1] else c[0] for c in clusters]
        cluster_embeddings = semantic_model.encode(cluster_texts, convert_to_tensor=True)
        cosine_scores = util.cos_sim(query_embedding, cluster_embeddings)[0]
        best_match_idx = int(cosine_scores.argmax())
        best_score = float(cosine_scores[best_match_idx])
        if best_score >= 0.80: return cluster_names[best_match_idx].upper()
        return "NONE"
    except: return "NONE"

def get_embedding(text):
    if not text: return []
    try:
        embedding = semantic_model.encode(text).tolist()
        return embedding
    except: return []

print("BRIDGE_READY", flush=True)

# Main loop
for line in sys.stdin:
    try:
        data = json.loads(line)
        cmd = data.get("cmd")
        payload = data.get("payload", {})
        
        if cmd == "visual":
            res = analyze_visual(payload.get("path"))
            print(json.dumps({"id": data.get("id"), "result": res}), flush=True)
        elif cmd == "layout":
            l, c = analyze_layout(payload.get("path"))
            print(json.dumps({"id": data.get("id"), "result": {"layout": l, "confidence": c}}), flush=True)
        elif cmd == "semantic":
            res = analyze_semantic(payload.get("text"), payload.get("clusters", []))
            print(json.dumps({"id": data.get("id"), "result": res}), flush=True)
        elif cmd == "embedding":
            res = get_embedding(payload.get("text"))
            print(json.dumps({"id": data.get("id"), "result": res}), flush=True)
        elif cmd == "ping":
            print(json.dumps({"id": data.get("id"), "result": "pong"}), flush=True)
            
    except Exception as e:
        print(json.dumps({"id": data.get("id") if 'data' in locals() else None, "error": str(e)}), flush=True)
