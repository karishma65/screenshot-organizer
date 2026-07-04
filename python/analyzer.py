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

# ── GLOBAL STDOUT REDIRECTION ──
# Store original stdout for bridge communication
_orig_stdout = sys.stdout
_orig_stdout_fd = os.dup(1)

def bridge_print(data):
    """Explicitly print JSON to the REAL stdout for the bridge."""
    payload = json.dumps(data)
    os.write(_orig_stdout_fd, (payload + "\n").encode('utf-8'))

# Redirect everything else to stderr (including native output)
sys.stdout = sys.stderr
os.dup2(sys.stderr.fileno(), 1)

print("[DIAG] Global stdout redirection active", file=sys.stderr, flush=True)

print("[DIAG] Starting analyzer.py initialization...", file=sys.stderr, flush=True)
print(f"[DIAG] Torch version: {torch.__version__}", file=sys.stderr, flush=True)
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"[DIAG] Device selected: {device}", file=sys.stderr, flush=True)

print("[DIAG] Torch sanity check (moving tensor to device)...", file=sys.stderr, flush=True)
t_test = torch.randn(1, 1).to(device)
print("[DIAG] Torch sanity check PASSED", file=sys.stderr, flush=True)

try:
    print("[DIAG] Loading SentenceTransformer...", file=sys.stderr, flush=True)
    model = SentenceTransformer('all-MiniLM-L6-v2', device=device)
    print("[DIAG] SentenceTransformer loaded", file=sys.stderr, flush=True)
except Exception as e:
    print(f"ERROR: SentenceTransformer failed: {e}", file=sys.stderr, flush=True)
    model = None

try:
    print("[DIAG] Loading CLIP model...", file=sys.stderr, flush=True)
    clip_model, preprocess = clip.load("ViT-B/32", device=device)
    print("[DIAG] CLIP model loaded", file=sys.stderr, flush=True)
except Exception as e:
    print(f"ERROR: CLIP failed: {e}", file=sys.stderr, flush=True)
    clip_model = None

def get_setting(key, default):
    try:
        conn = get_db_connection()
        res = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        conn.close()
        return res[0] if res else default
    except: return default

def get_scoring_weights():
    return {
        "visual": float(get_setting("weight_visual", 0.7)),
        "semantic": float(get_setting("weight_semantic", 0.15)),
        "face": float(get_setting("weight_face", 0.1)),
        "identifier": float(get_setting("weight_id_match", 0.05)),
        "global_vs_patch": float(get_setting("weight_global", 0.4)),
        "patch_density_boost": float(get_setting("boost_density", 0.05)),
        "max_density_boost": float(get_setting("boost_density_max", 1.25))
    }

def extract_identifiers(text):
    """Broad set of identifiers: URLs, Emails, GH repos, Meeting IDs, etc."""
    if not text: return set()
    matches = []
    # URLs / GH
    matches.extend(re.findall(r'https?://[^\s<>"]+|github\.com/[a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+', text.lower()))
    # Emails
    matches.extend(re.findall(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', text.lower()))
    # Meeting IDs / Alphanumeric IDs / Order IDs
    matches.extend(re.findall(r'[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3}|[0-9]{3}-[0-9]{3}-[0-9]{3}|[A-Z0-9]{8,12}', text))
    return set([m.strip('.,/()') for m in matches if len(m) > 4])

try:
    print("[DIAG] Instantiating RetrievalEngine...", file=sys.stderr, flush=True)
    retrieval_eng = retrieval_engine.RetrievalEngine(use_gpu=(device == "cuda"))
    print("[DIAG] RetrievalEngine instantiated", file=sys.stderr, flush=True)
except Exception as e:
    print(f"ERROR: RetrievalEngine init failed: {e}", file=sys.stderr, flush=True)
    retrieval_eng = None

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

try:
    print("[DIAG] Instantiating VectorManager...", file=sys.stderr, flush=True)
    v_manager = vector_manager.VectorManager(data_dir=os.path.dirname(DB_PATH))
    print("[DIAG] VectorManager instantiated", file=sys.stderr, flush=True)
except Exception as e:
    print(f"ERROR: VectorManager init failed: {e}", file=sys.stderr)
    v_manager = None

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
        "SELECT id, ocr_full FROM screenshots WHERE ocr_full IS NOT NULL AND ocr_full != ''"
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
        if not retrieval_eng: return {"error": "RetrievalEngine not initialized"}
        return retrieval_eng.analyze_screenshot(img_path, quality_threshold=q_th)

    elif mode == "retrieval_push_vectors":
        sid = req.get("screenshot_id")
        visual_embeddings = req.get("visual_embeddings", [])
        faces = req.get("faces", [])
        
        if not v_manager: 
            return {"error": "VectorManager not initialized"}
        
        updated = False
        # Validate that embeddings contain actual data (not null/undefined)
        valid_visual = [v for v in visual_embeddings if v is not None and len(v) > 0]
        if valid_visual:
            v_manager.add_visual(sid, valid_visual)
            updated = True
            
        for face in faces:
            if face.get("embedding") and face.get("db_id"):
                v_manager.add_face(face["embedding"], face["db_id"])
                updated = True
                
        if updated:
            v_manager.save()
            return {"success": True, "saved": True}
        return {"success": True, "saved": False}

    elif mode == "retrieval_rollback":
        sid = req.get("screenshot_id")
        face_ids = req.get("face_ids", [])
        if sid:
            if v_manager:
                v_manager.remove_screenshot_vectors(sid, face_ids=face_ids)
                v_manager.save()
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
        SIMILARITY_THRESHOLD = float(get_setting("retrieval_threshold", 0.45))
        weights = get_scoring_weights()
        
        if q_type == "text":
            text = req.get("query", "")
            if not retrieval_eng: return {"error": "RetrievalEngine not initialized"}
            embedding = retrieval_eng.encode_text(text)
            if not v_manager: return {"error": "VectorManager not initialized"}
            indices, distances = v_manager.search_visual(embedding)
            
            filtered = [(idx, float(dist)) for idx, dist in zip(indices, distances) if dist >= SIMILARITY_THRESHOLD]
            return {
                "search_type": "text_to_image",
                "faiss_indices": [f[0] for f in filtered], 
                "scores": [f[1] for f in filtered]
            }

        elif q_type == "get_vectors":
            sid = req.get("screenshot_id")
            if not v_manager or not v_manager.visual_index: return {"error": "Index unavailable"}
            try:
                flat_index = v_manager.visual_index.index
                vectors = []
                ids = faiss.vector_to_array(v_manager.visual_index.id_map)
                matching_indices = np.where(ids == sid)[0]
                for midx in matching_indices:
                    vec = flat_index.reconstruct(int(midx))
                    vectors.append(vec.tolist())
                return {"visual_embeddings": vectors}
            except Exception as e:
                return {"error": f"Vector reconstruction failed: {str(e)}"}
            
        elif q_type == "image":
            q_path = req.get("query_image_path")
            if not retrieval_eng: return {"error": "RetrievalEngine not initialized"}
            if not v_manager: return {"error": "VectorManager not initialized"}
            
            # 1. Multi-Scale Analysis
            query_data = retrieval_eng.analyze_screenshot(q_path, quality_threshold=0.1)
            query_vectors = [query_data["visual_embedding"]] + (query_data.get("patch_embeddings", []))
            
            query_embs = np.array(query_vectors).astype('float32')
            faiss.normalize_L2(query_embs)
            
            if v_manager.visual_index:
                # Batch search for all patches + global
                v_distances, v_indices = v_manager.visual_index.search(query_embs, 100)
                match_groups = {} 
                
                for row_idx, (dists, idxs) in enumerate(zip(v_distances, v_indices)):
                    is_global = (row_idx == 0)
                    for d, idx in zip(dists, idxs):
                        if idx == -1: continue
                        sid = int(idx)
                        score = float(d)
                        if sid not in match_groups: match_groups[sid] = {"global": 0.0, "patches": []}
                        if is_global: match_groups[sid]["global"] = score
                        else: match_groups[sid]["patches"].append(score)

                # 2. Base Ranking: Spatial Density Aggregation
                aggregated_scores = {}
                for sid, m in match_groups.items():
                    g_score = m["global"]
                    p_scores = m["patches"]
                    if not p_scores:
                        final_v_score = g_score
                    else:
                        top_p = sorted(p_scores, reverse=True)[:3]
                        avg_p = sum(top_p) / len(top_p)
                        raw_boost = 1.0 + (math.log(len(p_scores) + 1) * weights["patch_density_boost"])
                        density_boost = min(weights["max_density_boost"], raw_boost)
                        w_g = weights["global_vs_patch"]
                        final_v_score = (g_score * w_g + avg_p * (1.0 - w_g)) * density_boost
                    
                    aggregated_scores[sid] = {"visual": min(1.0, final_v_score), "semantic": 0.0, "face": 0.0, "identifier": 0.0}

                # 3. Component Interaction & Fusion (Lazy Semantic + Jaccard Identifiers)
                ids_to_fuse = list(aggregated_scores.keys())
                if ids_to_fuse:
                    try:
                        q_text = query_data.get("full_text", "").strip()
                        q_ids = extract_identifiers(q_text)
                        
                        q_text_emb = None
                        if q_text and len(q_text) > 15 and model:
                            q_text_emb = model.encode(q_text[:512])

                        with get_db_connection() as conn:
                            placeholders = ','.join(['?'] * len(ids_to_fuse))
                            sql = f"SELECT id, text_embedding, COALESCE(ocr_full, ocr_text) as content FROM screenshots WHERE id IN ({placeholders})"
                            rows = conn.execute(sql, ids_to_fuse).fetchall()

                            for row in rows:
                                sid = row['id']
                                db_text = row['content'] or ""
                                
                                # A. Semantic (Lazy Generation + Validation)
                                db_emb = None
                                stored_blob = row['text_embedding']
                                if stored_blob:
                                    db_emb = np.frombuffer(stored_blob, dtype=np.float32)
                                    if not np.isfinite(db_emb).all() or len(db_emb) == 0:
                                        db_emb = None
                                
                                # Lazy generate if missing or invalid
                                if db_emb is None and db_text and len(db_text) > 15 and model:
                                    db_emb = model.encode(db_text[:512])
                                
                                if db_emb is not None and q_text_emb is not None:
                                    norm = np.linalg.norm(db_emb)
                                    if norm > 1e-10:
                                        db_emb = db_emb / norm
                                        sem_sim = np.dot(q_text_emb, db_emb)
                                        aggregated_scores[sid]["semantic"] = max(0.0, float(sem_sim))
                                
                                # B. Jaccard Identifier Fusion
                                db_ids = extract_identifiers(db_text)
                                if q_ids and db_ids:
                                    intersect = q_ids.intersection(db_ids)
                                    union = q_ids.union(db_ids)
                                    jaccard = len(intersect) / len(union) if union else 0
                                    aggregated_scores[sid]["identifier"] = float(jaccard)

                        # C. Face Identity Fusion
                        q_faces_data = query_data.get("faces", [])
                        if q_faces_data and v_manager.face_index:
                            face_match_cache = {} # face_db_id -> score
                            for q_face in q_faces_data:
                                f_indices, f_scores = v_manager.search_face(q_face["embedding"], k=10)
                                for f_idx, f_score in zip(f_indices, f_scores):
                                    if f_idx == -1: continue
                                    fid = int(f_idx)
                                    face_match_cache[fid] = max(face_match_cache.get(fid, 0.0), float(f_score))
                            
                            if face_match_cache:
                                fids = list(face_match_cache.keys())
                                sqlite_fids = ','.join(['?'] * len(fids))
                                with get_db_connection() as conn:
                                    f_rows = conn.execute(f"SELECT id, screenshot_id FROM faces WHERE id IN ({sqlite_fids})", fids).fetchall()
                                    for f_row in f_rows:
                                        fid, sid = f_row['id'], f_row['screenshot_id']
                                        f_score = face_match_cache[fid]
                                        if sid not in aggregated_scores:
                                            aggregated_scores[sid] = {"visual": 0.0, "semantic": 0.0, "face": 0.0, "identifier": 0.0}
                                        aggregated_scores[sid]["face"] = max(aggregated_scores[sid]["face"], f_score)

                    except Exception as e:
                        print(f"[FUSION ERROR] {e}", file=sys.stderr)

                # 4. Final Final Weighted Fusion
                final_results = {}
                for sid, comps in aggregated_scores.items():
                    f_score = (comps["visual"] * weights["visual"] +
                               comps["semantic"] * weights["semantic"] +
                               comps["face"] * weights["face"] +
                               comps["identifier"] * weights["identifier"])
                    final_results[sid] = min(1.0, f_score)

                # 5. Sort and Filter
                sorted_res = sorted(final_results.items(), key=lambda x: x[1], reverse=True)
                final_indices = [r[0] for r in sorted_res if r[1] >= SIMILARITY_THRESHOLD]
                final_scores = [r[1] for r in sorted_res if r[1] >= SIMILARITY_THRESHOLD]

                return {
                    "search_type": "multi_stage_fusion",
                    "visual": {"indices": final_indices, "scores": final_scores},
                    "faces": [] 
                }
            return {"error": "Visual index not available"}

    elif mode == "rebuild_reset":
        if v_manager:
            v_manager.visual_index = None
            v_manager.face_index = None
            for p in [v_manager.visual_index_path, v_manager.face_index_path]:
                if os.path.exists(p):
                    try: os.unlink(p)
                    except: pass
        return {"success": True}
        
    return {"error": f"Unknown mode: {mode}"}


def run_bridge():
    # Signal readiness to JS bridge
    bridge_print({"ready": True})

    for raw_line in sys.stdin:
        raw_line = raw_line.strip()
        if not raw_line: continue
        try:
            req = json.loads(raw_line)
            req_id = req.get("request_id")
            mode = req.get("mode")
            print(f"[PY RECEIVE] request_id: {req_id} mode: {mode}", file=sys.stderr, flush=True)

            result = handle_request(req)
            
            if isinstance(result, dict):
                result["request_id"] = req_id
                result["mode"] = mode
            else:
                # If result was a list (semantic_search etc), wrap it to include metadata
                result = {"data": result, "request_id": req_id, "mode": mode}

            print(f"[PY SEND] request_id: {req_id} mode: {mode}", file=sys.stderr, flush=True)
            bridge_print(result)
        except Exception as e:
            bridge_print({"error": str(e), "request_id": req.get("request_id") if 'req' in locals() else None})


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else ""

    # ── Persistent bridge mode (called by pythonBridge.js) ────────────────
    if mode == "--bridge":
        run_bridge()

    # ── One-shot CLI modes (for debugging / testing) ───────────────────────
    elif mode == "semantic_search":
        query = sys.argv[2] if len(sys.argv) > 2 else ""
        bridge_print(semantic_search(query))

    elif mode == "analyze_layout":
        img_path = sys.argv[2] if len(sys.argv) > 2 else ""
        layout, conf = analyze_layout(img_path)
        bridge_print({"layout": layout, "confidence": conf})

    elif mode == "analyze_semantic":
        # Returns the cluster_name string directly
        text_in = sys.argv[2] if len(sys.argv) > 2 else ""
        bridge_print({"study_group": analyze_semantic(text_in)})

    elif mode == "analyze_visual":
        img_path = sys.argv[2] if len(sys.argv) > 2 else ""
        bridge_print(analyze_visual(img_path))

    elif mode == "cluster_id":
        cname = sys.argv[2] if len(sys.argv) > 2 else ""
        cid   = get_cluster_id_by_name(cname)
        bridge_print({"cluster_id": cid})

    else:
        if len(sys.argv) > 1:
            print(json.dumps({"study_group": analyze_semantic(sys.argv[1])}))