import sys
import json
import os
from sentence_transformers import SentenceTransformer, util
import sqlite3
import re
from collections import Counter

# Initialize the lightweight semantic model
model = SentenceTransformer('all-MiniLM-L6-v2')

DB_PATH = os.path.join(os.path.dirname(__file__), '../data/metadata.db')

def extract_dominant_terms(text):
    # Filter for words > 4 chars, focusing on salient academic terms
    words = re.findall(r'\b\w{5,}\b', text.lower())
    # Remove common filler words
    stop_words = {'about', 'there', 'their', 'would', 'could', 'should', 'through'}
    filtered = [w for w in words if w not in stop_words]
    common = Counter(filtered).most_common(2)
    if common:
        return "_".join([w[0].capitalize() for w in common])
    return None

def get_study_groups():
    if not os.path.exists(DB_PATH): return []
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM study_groups")
    groups = [row[0] for row in cursor.fetchall()]
    conn.close()
    return groups

def create_study_group(name):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("INSERT OR IGNORE INTO study_groups (name) VALUES (?)", (name,))
    conn.commit()
    conn.close()

def analyze_semantic(text):
    if not text or len(text.strip()) < 10:
        return "General_Notes"

    existing_groups = get_study_groups()
    query_embedding = model.encode(text, convert_to_tensor=True)
    
    if not existing_groups:
        new_name = extract_dominant_terms(text) or "Study_Cluster_1"
        create_study_group(new_name)
        return new_name

    group_embeddings = model.encode(existing_groups, convert_to_tensor=True)
    cosine_scores = util.cos_sim(query_embedding, group_embeddings)[0]
    
    best_match_idx = int(cosine_scores.argmax())
    best_score = float(cosine_scores[best_match_idx])
    
    # LOWER THRESHOLD (0.45) for aggressive merging of similar topics like Statistics
    SIMILARITY_THRESHOLD = 0.45 
    
    if best_score > SIMILARITY_THRESHOLD:
        return existing_groups[best_match_idx]
    else:
        term_name = extract_dominant_terms(text)
        new_group_name = term_name if term_name else f"Study_Cluster_{len(existing_groups) + 1}"
        create_study_group(new_group_name)
        return new_group_name

if __name__ == "__main__":
    if len(sys.argv) > 1:
        text_input = sys.argv[1]
        result = analyze_semantic(text_input)
        print(json.dumps({"study_group": result}))
    else:
        print(json.dumps({"error": "No text provided"}))
