# analyzer.py — v4 (Dynamic Study Clustering)

#actual classification is done in analyzer.py using CLIP for visual classification, 
# SentenceTransformer for semantic analysis, and OpenCV-based rule logic for layout detection.

import sys
import json
import os
import sqlite3
import re
import math
from collections import Counter
import cv2
import numpy as np
from sentence_transformers import SentenceTransformer, util
import torch
import clip
import faiss
from PIL import Image
from insightface.app import FaceAnalysis
from transformers import AutoProcessor, AutoModel
import retrieval_engine
import vector_manager

# ── MODEL INIT ────────────────────────────────────────────────────────────────
device = "cuda" if torch.cuda.is_available() else "cpu"

try:
    model = SentenceTransformer('all-MiniLM-L6-v2')
except Exception as e:
    print(f"ERROR: SentenceTransformer load failed: {e}", file=sys.stderr)
    model = None

try:
    clip_model, preprocess = clip.load("ViT-B/32", device=device)
except Exception as e:
    print(f"ERROR: CLIP load failed: {e}", file=sys.stderr)
    clip_model, preprocess = None, None

# ── CLIP LABELS ───────────────────────────────────────────────────────────────

VISUAL_LABELS = [
    # Study / Educational
    "a UML class diagram or object diagram",
    "a flowchart or activity diagram with arrows",
    "a whiteboard or hand-drawn diagram with boxes",
    "a graph, bar chart, pie chart or line chart",
    "a code editor window with syntax highlighting",
    "a terminal or command line interface with text",

    # Documents
    "a PDF document page with paragraphs",
    "a PowerPoint or presentation slide",
    "a textbook or book page",
    "a certificate or official document",
    "a scanned form or paper document",

    # Photos / Personal
    "a photograph of a person or group of people",
    "a selfie or portrait photograph",
    "a photograph of an animal or pet",
    "a photo of nature, landscape or outdoors",
    "a photo of a room, furniture or indoor scene",
    "a photo of a single specific object or item",

    # Entertainment
    "an anime or cartoon screenshot",
    "a movie or TV show cinematic scene",

    # App UI
    "a chat or messaging app conversation",
    "a social media feed with posts and images",
    "an online shopping app showing products and prices",
    "a payment or banking app with transaction details",
    "a video streaming app showing thumbnails",
    "a browser webpage or website",

    # Special
    "a QR code",
]

LABEL_MAPPING = {
    "a UML class diagram or object diagram":              "diagram",
    "a flowchart or activity diagram with arrows":        "diagram",
    "a whiteboard or hand-drawn diagram with boxes":      "diagram",
    "a graph, bar chart, pie chart or line chart":        "graph",
    "a code editor window with syntax highlighting":      "code_editor",
    "a terminal or command line interface with text":     "terminal",

    "a PDF document page with paragraphs":                "pdf_page",
    "a PowerPoint or presentation slide":                 "presentation_slide",
    "a textbook or book page":                            "book_page",
    "a certificate or official document":                 "certificate",
    "a scanned form or paper document":                   "scanned_doc",

    "a photograph of a person or group of people":        "human_photo",
    "a selfie or portrait photograph":                    "human_photo",
    "a photograph of an animal or pet":                   "animal_photo",
    "a photo of nature, landscape or outdoors":           "human_photo", # Map to personal
    "a photo of a room, furniture or indoor scene":       "human_photo", # Map to personal
    "a photo of a single specific object or item":        "human_photo", # Map to personal

    "an anime or cartoon screenshot":                     "anime",
    "a movie or TV show cinematic scene":                 "movie_scene",

    "a chat or messaging app conversation":               "chat_app",
    "a social media feed with posts and images":          "social_media_feed",
    "an online shopping app showing products and prices": "shopping_app",
    "a payment or banking app with transaction details":  "payment_app",
    "a video streaming app showing thumbnails":           "video_streaming_app",
    "a browser webpage or website":                       "website",

    "a QR code":                                          "qr_code",
}

LABEL_THRESHOLDS = {
    "human_photo":         0.13, # Lowered to catch more
    "animal_photo":        0.13, # Lowered
    "anime":               0.14,
    "movie_scene":         0.14,
    "qr_code":             0.12, # Lowered
    "terminal":            0.14,
    "diagram":             0.15, # Lowered
    "graph":               0.15, # Lowered
    "code_editor":         0.15, # Lowered
    "chat_app":            0.16,
    "social_media_feed":   0.16,
    "shopping_app":        0.15, # Lowered
    "payment_app":         0.15, # Lowered
    "video_streaming_app": 0.16,
    "certificate":         0.16,
    "scanned_doc":         0.16,
    "_default":            0.18, # Lowered from 0.20
}

DB_PATH = os.path.join(os.path.dirname(__file__), '../data/metadata.db')

# ── DB HELPERS ────────────────────────────────────────────────────────────────

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def ensure_clusters_table(conn):
    """Create study_clusters table if it doesn't exist (safe to call every time)."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS study_clusters (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            cluster_name        TEXT    NOT NULL UNIQUE,
            topic_label         TEXT    NOT NULL,
            representative_text TEXT,
            member_count        INTEGER DEFAULT 1,
            created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # Add cluster_id to screenshots if missing
    try:
        conn.execute("ALTER TABLE screenshots ADD COLUMN cluster_id INTEGER REFERENCES study_clusters(id)")
    except Exception:
        pass  # Column already exists
    conn.commit()


# ── TOPIC NAME GENERATION ─────────────────────────────────────────────────────

# Common English stop-words to filter out of topic names
STOP_WORDS = {
    'the','a','an','and','or','but','in','on','at','to','for','of','with',
    'by','from','is','are','was','were','be','been','being','have','has',
    'had','do','does','did','will','would','could','should','may','might',
    'shall','can','this','that','these','those','it','its','we','our',
    'you','your','he','she','they','their','i','my','me','us','him','her',
    'not','no','so','if','as','up','out','about','into','through','during',
    'before','after','above','below','between','each','few','more','most',
    'other','some','such','than','then','there','when','where','which','who',
    'how','all','both','any','just','also','only','same','too','very','here',
    'what','get','use','used','using','using','page','see','using','given',
    'let','set','new','one','two','three','four','five','example','note',
    'fig','figure','table','section','chapter','part','step','steps','type',
}

def generate_topic_name(text: str, max_words: int = 3) -> str:
    """
    Extract a short, meaningful topic label from OCR text.

    Algorithm:
      1. Tokenise into words (alpha only, length ≥ 3).
      2. Remove stop-words and very common single-char tokens.
      3. Score by TF (term frequency) — we don't have a corpus IDF here,
         so we down-weight extremely common short words via length bonus.
      4. Return top-N words joined with underscores, title-cased.

    Examples:
      "public class Animal extends Object { ... }" → "Class_Animal_Object"
      "SELECT * FROM users WHERE id = ?" → "Select_Users_Where"
      "Chapter 3: Photosynthesis and Cell Respiration" → "Photosynthesis_Cell_Respiration"
    """
    # Tokenise
    words = re.findall(r'[a-zA-Z]{3,}', text.lower())
    if not words:
        return "STUDY_TOPIC"

    # Filter stop-words
    words = [w for w in words if w not in STOP_WORDS]
    if not words:
        return "STUDY_TOPIC"

    # Frequency count
    freq = Counter(words)

    # Length bonus: prefer longer, more specific words
    scored = {w: count * (1 + 0.1 * (len(w) - 3)) for w, count in freq.items()}

    # Pick top words
    top = sorted(scored, key=lambda w: -scored[w])[:max_words]

    # Title-case and join
    label = '_'.join(w.capitalize() for w in top)
    return label or "STUDY_TOPIC"


def make_unique_cluster_name(conn, base_name: str) -> str:
    """
    Ensure the cluster name is unique in the DB.
    Appends _2, _3, … if a collision exists.
    """
    name = base_name
    suffix = 2
    while True:
        row = conn.execute(
            "SELECT id FROM study_clusters WHERE cluster_name = ?", (name,)
        ).fetchone()
        if row is None:
            return name
        name = f"{base_name}_{suffix}"
        suffix += 1


# ── DYNAMIC SEMANTIC CLUSTERING ───────────────────────────────────────────────

def get_retrieval_thresholds():
    """Fetches retrieval related thresholds from the database with built-in defaults."""
    # Defaults
    t = {
        "reuse_threshold": 0.62,
        "create_threshold": 0.62,
        "face_similarity": 0.4,
        "visual_similarity": 0.3
    }
    try:
        from contextlib import closing
        with closing(get_db_connection()) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT key, value FROM settings WHERE key IN ('reuse_threshold', 'create_threshold', 'face_similarity_threshold', 'visual_similarity_threshold')")
            rows = cursor.fetchall()
            for row in rows:
                if row['key'] == 'reuse_threshold': t['reuse_threshold'] = float(row['value'])
                if row['key'] == 'create_threshold': t['create_threshold'] = float(row['value'])
                if row['key'] == 'face_similarity_threshold': t['face_similarity'] = float(row['value'])
                if row['key'] == 'visual_similarity_threshold': t['visual_similarity'] = float(row['value'])
    except:
        pass
    return t

def analyze_semantic(text: str) -> str:
    """
    Assign a study cluster to the given OCR text.

    Behaviour:
      • If no clusters exist → create the first one and return its name.
      • If best cosine similarity with any cluster ≥ REUSE_THRESHOLD →
          update that cluster's member_count + representative_text, return name.
      • Otherwise → generate a new topic name, create a new cluster, return name.

    The cluster name returned is stored in screenshots.study_group_name by
    pipeline.js. The cluster_id FK is also written in pipeline.js (see below).

    Returns "NONE" for empty / very short text.
    """
    if not text or len(text.strip()) < 20 or model is None:
        return "NONE"

    if not os.path.exists(DB_PATH):
        return "NONE"

    thresholds = get_retrieval_thresholds()
    try:
        conn = get_db_connection()
        ensure_clusters_table(conn)

        # ── Load all existing clusters ──────────────────────────────────
        rows = conn.execute(
            "SELECT id, cluster_name, topic_label, representative_text FROM study_clusters"
        ).fetchall()

        query_text   = text[:500]
        query_embed  = model.encode(query_text, convert_to_tensor=True)

        if rows:
            cluster_ids    = [r['id']   for r in rows]
            cluster_names  = [r['cluster_name'] for r in rows]
            cluster_reprs  = [
                (r['representative_text'] or r['topic_label'])[:500]
                for r in rows
            ]

            repr_embeds = model.encode(cluster_reprs, convert_to_tensor=True)
            scores      = util.cos_sim(query_embed, repr_embeds)[0]

            best_idx   = int(scores.argmax())
            best_score = float(scores[best_idx])

            if best_score >= thresholds['reuse_threshold']:
                # ── Reuse existing cluster ──────────────────────────────
                cid   = cluster_ids[best_idx]
                cname = cluster_names[best_idx]

                # Update representative text (rolling: use latest matched text)
                conn.execute("""
                    UPDATE study_clusters
                    SET member_count        = member_count + 1,
                        representative_text = ?,
                        updated_at          = CURRENT_TIMESTAMP
                    WHERE id = ?
                """, (query_text, cid))
                conn.commit()
                conn.close()
                return cname

        # ── Create new cluster ──────────────────────────────────────────
        topic_label  = generate_topic_name(text)
        cluster_name = make_unique_cluster_name(conn, topic_label.upper())

        conn.execute("""
            INSERT INTO study_clusters
                (cluster_name, topic_label, representative_text, member_count)
            VALUES (?, ?, ?, 1)
        """, (cluster_name, topic_label, query_text))
        conn.commit()
        conn.close()
        return cluster_name

    except Exception as e:
        print(f"SEMANTIC CLUSTER ERROR: {e}", file=sys.stderr)
        return "NONE"


def get_cluster_id_by_name(cluster_name: str):
    """
    Look up study_clusters.id by cluster_name.
    Called by pipeline.js via pythonBridge after analyze_semantic returns the name.
    Returns the integer id, or None.
    """
    if not cluster_name or cluster_name in ('NONE', 'UNCATEGORIZED'):
        return None
    try:
        conn = get_db_connection()
        row  = conn.execute(
            "SELECT id FROM study_clusters WHERE cluster_name = ?", (cluster_name,)
        ).fetchone()
        conn.close()
        return row['id'] if row else None
    except Exception as e:
        print(f"CLUSTER_ID LOOKUP ERROR: {e}", file=sys.stderr)
        return None


# ── LAYOUT ANALYZER ───────────────────────────────────────────────────────────
# UNCHANGED from v3

def analyze_layout(image_path):
    """
    Pixel-density and projection-based layout classifier.
    Layout types: PHOTO_LAYOUT, TERMINAL_LAYOUT, CODE_LAYOUT, CHAT_LAYOUT,
                  DIAGRAM_LAYOUT, DOCUMENT_LAYOUT, UNKNOWN_LAYOUT
    """
    if not os.path.exists(image_path):
        return "UNKNOWN_LAYOUT", 0

    try:
        img_color = cv2.imread(image_path)
        if img_color is None:
            return "UNKNOWN_LAYOUT", 0

        img_gray = cv2.cvtColor(img_color, cv2.COLOR_BGR2GRAY)
        h, w = img_gray.shape

        hsv      = cv2.cvtColor(img_color, cv2.COLOR_BGR2HSV)
        sat_std  = float(np.std(hsv[:, :, 1]))
        val_mean = float(np.mean(hsv[:, :, 2]))

        _, binary_light = cv2.threshold(img_gray, 200, 255, cv2.THRESH_BINARY_INV)
        _, binary_dark  = cv2.threshold(img_gray,  50, 255, cv2.THRESH_BINARY)

        total_px      = h * w
        ink_light     = int(np.count_nonzero(binary_light))
        ink_dark      = int(np.count_nonzero(binary_dark))
        density_light = ink_light / total_px
        density_dark  = ink_dark  / total_px

        if density_dark > density_light:
            binary    = binary_dark
            density   = density_dark
            is_dark_bg = True
        else:
            binary    = binary_light
            density   = density_light
            is_dark_bg = False

        v_proj = np.sum(binary, axis=0) / 255
        h_proj = np.sum(binary, axis=1) / 255

        blank_thresh  = w * 0.02
        blank_rows    = np.where(h_proj < blank_thresh)[0]
        row_variance  = float(np.var(np.diff(blank_rows))) if len(blank_rows) > 5 else 999.0

        left_density  = float(np.sum(v_proj[:int(w * 0.2)]))
        total_v       = float(np.sum(v_proj)) or 1.0

        if sat_std > 60 or (density > 0.40 and sat_std > 30):
            return "PHOTO_LAYOUT", 0.85

        if is_dark_bg and val_mean < 100 and (left_density / total_v) > 0.25 and density_dark > 0.05:
            return "TERMINAL_LAYOUT", 0.88

        if not is_dark_bg and (left_density / total_v) > 0.30 and len(blank_rows) > 15:
            return "CODE_LAYOUT", 0.90

        if 3 < len(blank_rows) < 80 and row_variance < 150:
            return "CHAT_LAYOUT", 0.85

        if 0.01 < density < 0.22:
            return "DIAGRAM_LAYOUT", 0.78

        return "DOCUMENT_LAYOUT", 0.70

    except Exception as e:
        print(f"LAYOUT ERROR: {e}", file=sys.stderr)
        return "UNKNOWN_LAYOUT", 0


# ── SEMANTIC SEARCH (unchanged) ───────────────────────────────────────────────

def semantic_search(query):
    if model is None: return []
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, ocr_text FROM screenshots WHERE ocr_text IS NOT NULL AND ocr_text != ''"
    )
    rows = cursor.fetchall()
    conn.close()

    if not rows:
        return []

    ids   = [r[0] for r in rows]
    texts = [r[1] for r in rows]

    thresholds = get_retrieval_thresholds()
    q_emb = model.encode(query, convert_to_tensor=True)
    t_emb = model.encode(texts, convert_to_tensor=True)
    scores = util.cos_sim(q_emb, t_emb)[0]

    top_idx = np.argsort(-scores.cpu().numpy())[:20]
    return [
        {"id": ids[i], "score": float(scores[i])}
        for i in top_idx if scores[i] > thresholds['visual_similarity']
    ]


# ── VISUAL ANALYZER (unchanged) ───────────────────────────────────────────────

def analyze_visual(image_path):
    if not os.path.exists(image_path) or clip_model is None:
        return []

    try:
        with Image.open(image_path) as img_raw:
            image = preprocess(img_raw).unsqueeze(0).to(device)
        
        text_inputs = clip.tokenize(VISUAL_LABELS).to(device)

        with torch.no_grad():
            img_feat  = clip_model.encode_image(image)
            txt_feat  = clip_model.encode_text(text_inputs)
            img_feat /= img_feat.norm(dim=-1, keepdim=True)
            txt_feat /= txt_feat.norm(dim=-1, keepdim=True)
            probs = (100.0 * img_feat @ txt_feat.T).softmax(dim=-1).cpu().numpy()[0]

        seen = {}
        for i, prob in enumerate(probs):
            raw   = VISUAL_LABELS[i]
            label = LABEL_MAPPING[raw]
            thr   = LABEL_THRESHOLDS.get(label, LABEL_THRESHOLDS["_default"])
            if prob > thr:
                if label not in seen or prob > seen[label]:
                    seen[label] = float(prob)

        return sorted(
            [{"label": l, "confidence": c} for l, c in seen.items()],
            key=lambda x: x["confidence"], reverse=True
        )

    except Exception as e:
        print(f"CLIP ERROR: {e}", file=sys.stderr)
        return []


# ── ENTRY POINT ───────────────────────────────────────────────────────────────

def handle_request(req):
    mode = req.get("mode", "")

    if mode == "semantic":
        text   = req.get("text", "")
        return analyze_semantic(text)

    elif mode == "cluster_id":
        cname = req.get("cluster_name", "")
        cid   = get_cluster_id_by_name(cname)
        return {"cluster_id": cid}

    elif mode == "embedding":
        text = req.get("text", "")
        if text and model:
            return model.encode(text[:1000]).tolist()
        return []

    elif mode == "layout":
        img_path = req.get("image_path", "")
        layout, conf = analyze_layout(img_path)
        return {"layout": layout, "confidence": conf}

    elif mode == "visual":
        img_path = req.get("image_path", "")
        return analyze_visual(img_path)

    elif mode == "retrieval_analyze":
        img_path = req.get("image_path", "")
        q_th = req.get("quality_threshold")
        return retrieval_engine.analyze_screenshot(img_path, quality_threshold=q_th)

    elif mode == "retrieval_push_vectors":
        sid = req.get("screenshot_id")
        visual_embeddings = req.get("visual_embeddings", [])
        faces = req.get("faces", [])
        if visual_embeddings:
            vector_manager.add_visual(sid, visual_embeddings)
        for face in faces:
            vector_manager.add_face(face["embedding"], face["db_id"])
        vector_manager.save()
        return {"success": True}

    elif mode == "retrieval_rollback":
        sid = req.get("screenshot_id")
        face_ids = req.get("face_ids", [])
        if sid:
            vector_manager.remove_screenshot_vectors(sid, face_ids=face_ids)
            vector_manager.save()
            try:
                with get_db_connection() as conn:
                    conn.execute("PRAGMA foreign_keys = ON")
                    conn.execute("DELETE FROM screenshots WHERE id = ?", (sid,))
                    conn.commit()
            except Exception as e:
                print(f"ROLLBACK DB ERROR: {e}", file=sys.stderr)
        return {"success": True}

    elif mode == "retrieval_search":
        q_type = req.get("type", "text")
        if q_type == "text":
            text = req.get("query", "")
            embedding = retrieval_engine.encode_text(text)
            indices, distances = vector_manager.search_visual(embedding)
            return {
                "search_type": "text_to_image",
                "faiss_indices": indices, "scores": [float(d) for d in distances]
            }
        elif q_type == "image":
            q_path = req.get("query_image_path")
            query_data = retrieval_engine.analyze_screenshot(q_path, quality_threshold=0.1)
            v_indices, v_scores = vector_manager.search_visual(query_data["visual_embedding"])
            all_face_results = []
            if "faces" in query_data:
                for face in query_data["faces"]:
                    indices, scores = vector_manager.search_face(face["embedding"])
                    all_face_results.append({"indices": indices, "scores": scores})
            return {
                "search_type": "hybrid_image",
                "visual": {"indices": v_indices, "scores": [float(s) for s in v_scores]},
                "faces": all_face_results
            }

    elif mode == "rebuild_reset":
        vector_manager.visual_index = None
        vector_manager.face_index = None
        for p in [vector_manager.visual_index_path, vector_manager.face_index_path]:
            if os.path.exists(p):
                try: os.unlink(p)
                except: pass
        return {"success": True}

    return {"error": f"Unknown mode: {mode}"}


def run_bridge():
    # Signal readiness to JS bridge
    print(json.dumps({"ready": True}), flush=True)

    for raw_line in sys.stdin:
        raw_line = raw_line.strip()
        if not raw_line: continue
        try:
            req = json.loads(raw_line)
            result = handle_request(req)
            print(json.dumps(result), flush=True)
        except Exception as e:
            print(json.dumps({"error": str(e)}), flush=True)


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else ""

    # ── Persistent bridge mode (called by pythonBridge.js) ────────────────
    if mode == "--bridge":
        run_bridge()

    # ── One-shot CLI modes (for debugging / testing) ───────────────────────
    elif mode == "semantic_search":
        query = sys.argv[2] if len(sys.argv) > 2 else ""
        print(json.dumps(semantic_search(query)))

    elif mode == "analyze_layout":
        img_path = sys.argv[2] if len(sys.argv) > 2 else ""
        layout, conf = analyze_layout(img_path)
        print(json.dumps({"layout": layout, "confidence": conf}))

    elif mode == "analyze_semantic":
        # Returns the cluster_name string directly
        text_in = sys.argv[2] if len(sys.argv) > 2 else ""
        print(json.dumps({"study_group": analyze_semantic(text_in)}))

    elif mode == "analyze_visual":
        img_path = sys.argv[2] if len(sys.argv) > 2 else ""
        print(json.dumps(analyze_visual(img_path)))

    elif mode == "cluster_id":
        cname = sys.argv[2] if len(sys.argv) > 2 else ""
        cid   = get_cluster_id_by_name(cname)
        print(json.dumps({"cluster_id": cid}))

    else:
        if len(sys.argv) > 1:
            print(json.dumps({"study_group": analyze_semantic(sys.argv[1])}))