import os
import faiss
import numpy as np
import sys

class VectorManager:
    def __init__(self, data_dir):
        self.data_dir = data_dir
        self.visual_index_path = os.path.join(data_dir, "visual.index")
        self.face_index_path = os.path.join(data_dir, "faces.index")
        
        self.visual_index = None
        self.face_index = None
        
        # 0. Load Indices with Corruption Recovery
        if os.path.exists(self.visual_index_path):
            print(f"[DIAG] Loading visual index from: {self.visual_index_path}", file=sys.stderr, flush=True)
            try:
                self.visual_index = faiss.read_index(self.visual_index_path)
                print("[DIAG] Visual index loaded", file=sys.stderr, flush=True)
            except Exception as e:
                print(f"FAISS Recovery: Visual index corrupted ({str(e)}). Recreating...", file=sys.stderr, flush=True)
                if os.path.exists(self.visual_index_path): os.remove(self.visual_index_path)

        if os.path.exists(self.face_index_path):
            print(f"[DIAG] Loading face index from: {self.face_index_path}", file=sys.stderr, flush=True)
            try:
                self.face_index = faiss.read_index(self.face_index_path)
                print("[DIAG] Face index loaded", file=sys.stderr, flush=True)
            except Exception as e:
                print(f"FAISS Recovery: Face index corrupted ({str(e)}). Recreating...", file=sys.stderr, flush=True)
                if os.path.exists(self.face_index_path): os.remove(self.face_index_path)

        print("[DEBUG][FAISS]", file=sys.stderr)
        print(f"Visual index exists: {self.visual_index is not None}", file=sys.stderr)
        print(f"Visual vector count: {self.visual_index.ntotal if self.visual_index else 0}", file=sys.stderr)
        print(f"Face index exists: {self.face_index is not None}", file=sys.stderr)
        print(f"Face vector count: {self.face_index.ntotal if self.face_index else 0}", file=sys.stderr)

    def validate_vectors(self, vecs):
        """Rigorous check for NaN, Inf, and non-finite values before FAISS entry."""
        if not np.isfinite(vecs).all():
            print("[CRITICAL] FAISS: Non-finite values detected in embedding. Sanitizing...", file=sys.stderr)
            return np.nan_to_num(vecs)
        return vecs
            
    def _ensure_index(self, index_type, dim):
        if index_type == "visual":
            if self.visual_index is None:
                sub_index = faiss.IndexFlatIP(dim)
                self.visual_index = faiss.IndexIDMap(sub_index)
            elif self.visual_index.d != dim:
                raise ValueError(f"FAISS Dimension Mismatch (Visual): Index expect {self.visual_index.d}, got {dim}")
                
        elif index_type == "face":
            if self.face_index is None:
                sub_index = faiss.IndexFlatIP(dim)
                self.face_index = faiss.IndexIDMap(sub_index)
            elif self.face_index.d != dim:
                raise ValueError(f"FAISS Dimension Mismatch (Face): Index expect {self.face_index.d}, got {dim}")

    def _atomic_save(self, index, path):
        """Saves a FAISS index to a temporary file before renaming to prevent corruption."""
        temp_path = f"{path}.tmp"
        try:
            faiss.write_index(index, temp_path)
            if os.path.exists(temp_path):
                os.replace(temp_path, path)
        except Exception as e:
            print(f"FAISS Save Error: {str(e)}", file=sys.stderr)
            if os.path.exists(temp_path):
                os.remove(temp_path)

    def save(self):
        if self.visual_index:
            self._atomic_save(self.visual_index, self.visual_index_path)
        if self.face_index:
            self._atomic_save(self.face_index, self.face_index_path)
        
    def remove_screenshot_vectors(self, screenshot_id, face_ids=None):
        """Rollback helper: removes all visual and associated face vectors for a screenshot."""
        if self.visual_index:
            # This removes the global embedding and all associated patches (same ID)
            self.visual_index.remove_ids(np.array([screenshot_id]).astype('int64'))
        
        if self.face_index and face_ids:
            # Face IDs are specific to the face table, need to be removed explicitly
            self.face_index.remove_ids(np.array(face_ids).astype('int64'))

    def add_visual(self, screenshot_id, embeddings):
        """Add global + patch embeddings for a screenshot after clearing old ones."""
        embs = np.array(embeddings).astype('float32')
        embs = self.validate_vectors(embs)
        
        # Normalize for Inner Product (Cosine Similarity)
        norms = np.linalg.norm(embs, axis=1, keepdims=True)
        # Avoid division by zero
        embs = embs / (norms + 1e-10)
        
        print(f"[DEBUG] add_visual: screenshot_id={screenshot_id}, embeddings={len(embs)}", file=sys.stderr)
        
        self._ensure_index("visual", embs.shape[1])
        
        # 1. Prevent Duplicates: IndexIDMap.remove_ids removes ALL vectors associated with the ID.
        # This covers both the global embedding and all 24 patches.
        self.visual_index.remove_ids(np.array([screenshot_id]).astype('int64'))
        
        # 2. Add New Vectors
        ids = np.array([screenshot_id] * len(embs)).astype('int64')
        self.visual_index.add_with_ids(embs, ids)
        print(f"[DEBUG] add_visual complete: Current visual index size = {self.visual_index.ntotal}", file=sys.stderr)
        
    def add_face(self, embedding, face_db_id):
        """Associate a face embedding with its DB ID after clearing old entry."""
        emb = np.array([embedding]).astype('float32')
        emb = self.validate_vectors(emb)
        
        norms = np.linalg.norm(emb, axis=1, keepdims=True)
        emb = emb / (norms + 1e-10)
        
        print(f"[DEBUG] add_face: face_db_id={face_db_id}", file=sys.stderr)
        
        self._ensure_index("face", emb.shape[1])
        
        # 1. Prevent Duplicates: Clear this specific face record ID
        self.face_index.remove_ids(np.array([face_db_id]).astype('int64'))
        
        # 2. Add New Face Vector
        ids = np.array([face_db_id]).astype('int64')
        self.face_index.add_with_ids(emb, ids)
        print(f"[DEBUG] add_face complete: Current face index size = {self.face_index.ntotal}", file=sys.stderr)
        
    def search_visual(self, embedding, k=60):
        if self.visual_index is None: return [], []
        emb = np.array([embedding]).astype('float32')
        faiss.normalize_L2(emb)
        
        # Validate search dimension
        if emb.shape[1] != self.visual_index.d:
            return [], []

        distances, indices = self.visual_index.search(emb, k)
        print(f"[DEBUG] search_visual: Returned IDs={indices[0].tolist()}, Scores={distances[0].tolist()}", file=sys.stderr)
        
        results = {} 
        for dist, idx in zip(distances[0], indices[0]):
            if idx == -1: continue
            sid = int(idx)
            score = float(dist)
            if sid not in results or score > results[sid]:
                results[sid] = score
                
        sorted_results = sorted(results.items(), key=lambda x: x[1], reverse=True)
        return [r[0] for r in sorted_results], [r[1] for r in sorted_results]
        
    def search_face(self, embedding, k=30):
        if self.face_index is None: return [], []
        emb = np.array([embedding]).astype('float32')
        faiss.normalize_L2(emb)
        
        if emb.shape[1] != self.face_index.d:
            return [], []

        distances, indices = self.face_index.search(emb, k)
        print(f"[DEBUG] search_face: Returned IDs={indices[0].tolist()}, Scores={distances[0].tolist()}", file=sys.stderr)
        
        valid_indices = []
        valid_scores = []
        for dist, idx in zip(distances[0], indices[0]):
            if idx == -1: continue
            valid_indices.append(int(idx))
            valid_scores.append(float(dist))
            
        return valid_indices, valid_scores
