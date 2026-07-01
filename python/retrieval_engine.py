import os
import cv2
import numpy as np
import torch
import faiss
from PIL import Image
from insightface.app import FaceAnalysis
from transformers import AutoProcessor, AutoModel
from paddleocr import PaddleOCR
import json

class RetrievalEngine:
    def __init__(self, use_gpu=False):
        self.device = "cuda" if use_gpu and torch.cuda.is_available() else "cpu"
        
        # 1. Face Analysis (RetinaFace + ArcFace)
        face_providers = ['CPUExecutionProvider']
        if self.device == "cuda":
            face_providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']
            
        try:
            self.face_app = FaceAnalysis(name='buffalom_l', providers=face_providers)
            self.face_app.prepare(ctx_id=0, det_size=(640, 640))
        except Exception as e:
            print(f"Face Analysis INIT ERROR: {e}. Falling back to CPU.")
            self.face_app = FaceAnalysis(name='buffalom_l', providers=['CPUExecutionProvider'])
            self.face_app.prepare(ctx_id=0, det_size=(640, 640))
        
        # 2. SigLIP (Visual Embeddings)
        self.siglip_model_id = "google/siglip-so400m-patch14-384"
        self.siglip_processor = AutoProcessor.from_pretrained(self.siglip_model_id)
        try:
            self.siglip_model = AutoModel.from_pretrained(self.siglip_model_id).to(self.device)
        except Exception as e:
            print(f"SigLIP CUDA INIT ERROR: {e}. Falling back to CPU.")
            self.device = "cpu"
            self.siglip_model = AutoModel.from_pretrained(self.siglip_model_id).to("cpu")
        
        # 3. OCR (PaddleOCR)
        self.ocr = PaddleOCR(use_angle_cls=True, lang='en', show_log=False)
        
        # 4. Indices
        self.visual_index = None
        self.face_index = None

    def get_blur_score(self, image):
        """Calculates the variance of the Laplacian to estimate image blur."""
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        return cv2.Laplacian(gray, cv2.CV_64F).var()
        
    def calculate_face_quality(self, det_score, blur_score, size_px):
        """Combines multiple metrics into a single quality score (0.0 to 1.0)"""
        size_comp = min(1.0, size_px / 40000.0)
        blur_comp = min(1.0, blur_score / 150.0)
        return (det_score * 0.4) + (blur_comp * 0.4) + (size_comp * 0.2)
        
    def get_patches(self, img_pil, patch_size=224, max_patches=24):
        """Robust patch sampling for any image size with coordinate-based deduplication."""
        w, h = img_pil.size
        patches = []
        seen_coords = set()
        
        # Clamp patch size if image is smaller than requested patch
        actual_patch_w = min(patch_size, w)
        actual_patch_h = min(patch_size, h)
        
        # 1. Corner patches (highly relevant for logos)
        corners = [
            (0, 0, actual_patch_w, actual_patch_h),
            (max(0, w - actual_patch_w), 0, w, actual_patch_h),
            (0, max(0, h - actual_patch_h), actual_patch_w, h),
            (max(0, w - actual_patch_w), max(0, h - actual_patch_h), w, h)
        ]
        
        for c in corners:
            if c not in seen_coords:
                patches.append(img_pil.crop(c))
                seen_coords.add(c)
            
        # 2. Central patch
        cx, cy = w // 2, h // 2
        central = (
            max(0, cx - actual_patch_w // 2), 
            max(0, cy - actual_patch_h // 2), 
            min(w, cx + actual_patch_w // 2), 
            min(h, cy + actual_patch_h // 2)
        )
        if central not in seen_coords:
            patches.append(img_pil.crop(central))
            seen_coords.add(central)
        
        # 3. Grid sampling (only if enough space)
        if w > actual_patch_w or h > actual_patch_h:
            stride_x = max(actual_patch_w, w // 4)
            stride_y = max(actual_patch_h, h // 4)
            
            for y in range(0, max(1, h - actual_patch_h + 1), stride_y):
                for x in range(0, max(1, w - actual_patch_w + 1), stride_x):
                    p_box = (x, y, x + actual_patch_w, y + actual_patch_h)
                    if len(patches) < max_patches and p_box not in seen_coords:
                        patches.append(img_pil.crop(p_box))
                        seen_coords.add(p_box)
        
        return patches[:max_patches]

    def analyze_screenshot(self, image_path, quality_threshold):
        """Deep analysis of screenshot: OCR, Face Detection, and SigLIP Embeddings."""
        if not os.path.exists(image_path):
            return {"error": "File not found"}
            
        try:
            # 0. Load and Validate Image
            img_cv = cv2.imread(image_path)
            if img_cv is None:
                return {"error": "Invalid image data (cv2)"}
                
            with Image.open(image_path) as img_temp:
                img_pil = img_temp.convert('RGB')
        except Exception as e:
            return {"error": f"Image corruption or load error: {str(e)}"}
            
        # 1. OCR (PaddleOCR)
        ocr_result = self.ocr.ocr(image_path, cls=True)
        full_text = ""
        meeting_ids = []
        
        # Pattern library for meeting detection
        ID_PATTERNS = [
            r'[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3}',   # Google Meet
            r'[0-9]{3}-[0-9]{3}-[0-9]{3}',            # 9-digit Zoom style
            r'meeting-[a-z0-9]+',                     # Custom label meeting-xyz
            r'room-[a-z0-9]+',                        # Custom label room-xyz
            r'conference-[a-z0-9]+',                  # Custom label conference-xyz
        ]
        
        if ocr_result and ocr_result[0]:
            import re
            for line in ocr_result[0]:
                text = line[1][0]
                full_text += text + " "
                lower_text = text.lower()
                for pattern in ID_PATTERNS:
                    m_ids = re.findall(pattern, lower_text)
                    meeting_ids.extend(m_ids)
        
        # 2. Face Analysis
        faces = self.face_app.get(img_cv)
        face_data = []
        
        # QUALITY VALIDATION: Never use hardcoded fallback here.
        # Threshold must be passed from Electron/Database settings.
        try:
            q_thresh = float(quality_threshold)
        except (TypeError, ValueError):
            # If invalid, return error to avoid unpredictable behavior
            return {"error": f"Invalid Face Quality Threshold: {quality_threshold}"}
        
        for face in faces:
            bbox = face.bbox.astype(int).tolist()
            w, h = bbox[2]-bbox[0], bbox[3]-bbox[1]
            
            face_crop = img_cv[max(0,bbox[1]):min(img_cv.shape[0],bbox[3]), max(0,bbox[0]):min(img_cv.shape[1],bbox[2])]
            if face_crop.size == 0: continue
            
            blur_score = self.get_blur_score(face_crop)
            quality_score = self.calculate_face_quality(float(face.det_score), blur_score, w*h)
            
            if quality_score < q_thresh:
                continue
            
            face_data.append({
                "bbox": bbox,
                "embedding": face.embedding.tolist(),
                "confidence": float(face.det_score),
                "blur_score": blur_score,
                "face_quality_score": quality_score,
                "size_px": w*h
            })
        
        # 3. Patch-based Visual Embedding (SigLIP)
        inputs = self.siglip_processor(images=img_pil, return_tensors="pt").to(self.device)
        with torch.no_grad():
            features = self.siglip_model.get_image_features(**inputs)
            features = features / features.norm(p=2, dim=-1, keepdim=True)
            global_embedding = features.cpu().numpy()[0].tolist()
            
        patch_embeddings = []
        patches = self.get_patches(img_pil)
        if patches:
            p_inputs = self.siglip_processor(images=patches, return_tensors="pt").to(self.device)
            with torch.no_grad():
                p_features = self.siglip_model.get_image_features(**p_inputs)
                p_features = p_features / p_features.norm(p=2, dim=-1, keepdim=True)
                patch_embeddings = p_features.cpu().numpy().tolist()
            
        return {
            "full_text": full_text.strip(),
            "meeting_ids": list(set(meeting_ids)),
            "faces": face_data,
            "visual_embedding": global_embedding,
            "patch_embeddings": patch_embeddings
        }

    def encode_text(self, text):
        inputs = self.siglip_processor(text=[text], return_tensors="pt", padding=True).to(self.device)
        with torch.no_grad():
            features = self.siglip_model.get_text_features(**inputs)
            features = features / features.norm(p=2, dim=-1, keepdim=True)
            return features.cpu().numpy()[0].tolist()

    def search_image(self, query_image_path):
        """Unified hybrid search: supports multiple faces in query image."""
        if not os.path.exists(query_image_path):
            return {"error": "Query image not found"}
            
        try:
            img_cv = cv2.imread(query_image_path)
            if img_cv is None:
                return {"error": "Invalid query image data"}
            with Image.open(query_image_path) as img_temp:
                img_pil = img_temp.convert('RGB')
        except Exception as e:
             return {"error": f"Failed to load query image: {str(e)}"}
        
        # 1. Global Visual Search (SigLIP)
        inputs = self.siglip_processor(images=img_pil, return_tensors="pt").to(self.device)
        with torch.no_grad():
            v_features = self.siglip_model.get_image_features(**inputs)
            v_features = v_features / v_features.norm(p=2, dim=-1, keepdim=True)
            visual_embedding = v_features.cpu().numpy()[0].tolist()
            
        # 2. Multi-Face Search (ArcFace)
        faces = self.face_app.get(img_cv)
        face_embeddings = []
        # Return all detected face embeddings to Electron for multi-query matching
        if faces:
            for face in faces:
                face_embeddings.append(face.embedding.tolist())
            
        return {
            "visual_embedding": visual_embedding,
            "face_embeddings": face_embeddings # Note: changed from face_embedding to plural
        }
