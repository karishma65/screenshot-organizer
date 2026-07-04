import os
import cv2
import numpy as np
import torch
import faiss
from PIL import Image
from insightface.app import FaceAnalysis
from transformers import AutoProcessor, SiglipModel
import json
import re
import sys

class RetrievalEngine:
    def __init__(self, use_gpu=False):
        self.device = "cuda" if use_gpu and torch.cuda.is_available() else "cpu"
        self.ocr_model = None 

        try:
            import ssl
            ssl._create_default_https_context = ssl._create_unverified_context
        except: pass

        # 1. SigLIP - LOAD FIRST TO PREVENT NATIVE CONFLICT (0xC0000005)
        # Use siglip-base-patch16-224 for significantly better memory stability
        self.siglip_model_id = "google/siglip-base-patch16-224"
        print(f"[DIAG] Initializing SigLIP: {self.siglip_model_id}", file=sys.stderr, flush=True)
        
        self.siglip_processor = AutoProcessor.from_pretrained(self.siglip_model_id)
        self.siglip_model = SiglipModel.from_pretrained(self.siglip_model_id, low_cpu_mem_usage=True).to(self.device).eval()
        
        # 2. InsightFace
        print("[DIAG] Initializing InsightFace...", file=sys.stderr, flush=True)
        face_providers = ['CUDAExecutionProvider', 'CPUExecutionProvider'] if self.device == "cuda" else ['CPUExecutionProvider']
        self.face_app = FaceAnalysis(name='buffalo_l', providers=face_providers)
        self.face_app.prepare(ctx_id=0, det_size=(640, 640))

        # 3. Model Warmup (Fixes "First Screenshot 0 Embeddings")
        print("[DIAG] Performing SigLIP warmup...", file=sys.stderr, flush=True)
        try:
            # Run one dummy inference to warm up the compute graph
            dummy_img = Image.fromarray(np.zeros((224, 224, 3), dtype=np.uint8))
            warmup_in = self.siglip_processor(images=dummy_img, return_tensors="pt").to(self.device)
            with torch.no_grad():
                _ = self.siglip_model.get_image_features(**warmup_in)
            print("[DIAG] Warmup complete", file=sys.stderr, flush=True)
        except Exception as e:
            print(f"[DIAG] Warmup failed: {e}", file=sys.stderr, flush=True)

        print("[DIAG] AI models loaded successfully", file=sys.stderr, flush=True)

    def _get_ocr(self):
        import time
        if self.ocr_model is None:
            print("[PROFILE] Creating OCR pipeline...", file=sys.stderr, flush=True)
            t_create_start = time.perf_counter()
            # Set environment variables BEFORE importing PaddlePaddle/PaddleX
            os.environ["FLAGS_use_onednn"] = "0"
            os.environ["FLAGS_enable_pir_api"] = "0"
            try:
                import paddlex
                # Recommended PaddleOCR 3.7 / PaddleX 3.7 Pipeline initialization
                # This replaces the legacy PaddleOCR wrapper
                self.ocr_model = paddlex.create_pipeline(pipeline="OCR")
                print(f"[PROFILE] OCR pipeline created: {(time.perf_counter()-t_create_start)*1000:.2f}ms", file=sys.stderr, flush=True)
            except Exception as e:
                return {"status": "error", "reason": "initialization_failed", "details": str(e)}
        else:
            print("[PROFILE] Reusing cached OCR pipeline", file=sys.stderr, flush=True)
                
        return self.ocr_model

    def get_blur_score(self, image):
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        return cv2.Laplacian(gray, cv2.CV_64F).var()
        
    def calculate_face_quality(self, det_score, blur_score, size_px):
        return (det_score * 0.4) + (min(1.0, blur_score / 150.0) * 0.4) + (min(1.0, size_px / 40000.0) * 0.2)
        
    def get_patches(self, img_pil, patch_size=224, max_patches=24):
        w, h = img_pil.size
        pw, ph = min(patch_size, w), min(patch_size, h)
        patches = []; seen_coords = set()
        corners = [(0,0,pw,ph), (max(0,w-pw),0,w,ph), (0,max(0,h-ph),pw,h), (max(0,w-pw),max(0,h-ph),w,h)]
        for c in corners:
            if c not in seen_coords: patches.append(img_pil.crop(c)); seen_coords.add(c)
        cx, cy = w // 2, h // 2
        central = (max(0,cx-pw//2), max(0,cy-ph//2), min(w,cx+pw//2), min(h,cy+ph//2))
        if central not in seen_coords: patches.append(img_pil.crop(central)); seen_coords.add(central)
        if w > pw or h > ph:
            sx, sy = max(pw, w//4), max(ph, h//4)
            for y in range(0, max(1, h-ph+1), sy):
                for x in range(0, max(1, w-pw+1), sx):
                    b = (x,y,x+pw,y+ph)
                    if len(patches)<max_patches and b not in seen_coords: patches.append(img_pil.crop(b)); seen_coords.add(b)
        return patches[:max_patches]

    def _normalize(self, feats):
        # Extremely robust normalization that handles both Tensors and ModelOutput objects
        if hasattr(feats, "pooler_output"):
            feats = feats.pooler_output
        elif not isinstance(feats, torch.Tensor) and hasattr(feats, "__getitem__"):
            feats = feats[0]
        return feats / feats.norm(p=2, dim=-1, keepdim=True)

    def analyze_screenshot(self, image_path, quality_threshold):
        import time
        t_start = time.perf_counter()
        if not os.path.exists(image_path): return {"error": "File not found"}
        
        # Robust Windows Unicode path reading
        t0 = time.perf_counter()
        try:
            im_data = np.fromfile(image_path, dtype=np.uint8)
            img_cv = cv2.imdecode(im_data, cv2.IMREAD_COLOR)
        except Exception as e:
            print(f"[DIAG] cv2 load failed: {e}", file=sys.stderr, flush=True)
            img_cv = None
        
        with Image.open(image_path) as img_temp: img_pil = img_temp.convert('RGB')
        print(f"[PROFILE] Image loading: {(time.perf_counter()-t0)*1000:.2f}ms", file=sys.stderr)

        full_text = None
        meeting_ids = []
        ocr_status = {"status": "unprocessed"}
        
        if img_cv is not None and img_cv.size > 0:
            try:
                t_ocr_init = time.perf_counter()
                ocr_result = self._get_ocr()
                print(f"[PROFILE] OCR model check/init: {(time.perf_counter()-t_ocr_init)*1000:.2f}ms", file=sys.stderr)
                
                if isinstance(ocr_result, dict) and ocr_result.get("status") == "error":
                    ocr_status = ocr_result
                else:
                    ocr = ocr_result
                    full_text = ""
                    try:
                        t_predict = time.perf_counter()
                        # Force generator evaluation to capture true inference time
                        results = list(ocr.predict(img_cv))
                        print(f"[PROFILE] OCR inference: {(time.perf_counter()-t_predict)*1000:.2f}ms", file=sys.stderr, flush=True)
                        
                        t_parse = time.perf_counter()
                        ocr_processed = False
                        for res in results:
                            text_list = []
                            if hasattr(res, 'output') and isinstance(res.output, dict) and "rec_texts" in res.output:
                                text_list = res.output["rec_texts"]
                            elif hasattr(res, 'rec_texts'):
                                text_list = res.rec_texts
                            elif isinstance(res, dict) and 'rec_texts' in res:
                                text_list = res['rec_texts']

                            if text_list:
                                ocr_processed = True
                                for text in text_list:
                                    text_str = str(text)
                                    full_text += text_str + " "
                                    m_ids = re.findall(r'[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3}|[0-9]{3}-[0-9]{3}-[0-9]{3}', text_str.lower())
                                    meeting_ids.extend(m_ids)
                        
                        print(f"[PROFILE] OCR parsing/iteration: {(time.perf_counter()-t_parse)*1000:.2f}ms", file=sys.stderr)
                        if ocr_processed:
                            full_text = full_text.strip()
                            ocr_status = {"status": "success"}
                        else:
                            ocr_status = {"status": "empty"}
                    except Exception as e:
                        print(f"[DIAG] 3.7 Inference Crash: {e}", file=sys.stderr)
                        raise e
            except Exception as e:
                err_msg = str(e)
                ocr_status = {"status": "error", "reason": "runtime_failed", "details": err_msg[:100]}

        t_face = time.perf_counter()
        faces = self.face_app.get(img_cv)
        face_data = []
        qt = float(quality_threshold)
        for face in faces:
            bbox = face.bbox.astype(int).tolist()
            w, h = bbox[2]-bbox[0], bbox[3]-bbox[1]
            crop = img_cv[max(0,bbox[1]):min(img_cv.shape[0],bbox[3]), max(0,bbox[0]):min(img_cv.shape[1],bbox[2])]
            if crop.size==0: continue
            q = self.calculate_face_quality(float(face.det_score), self.get_blur_score(crop), w*h)
            if q < qt: continue
            face_data.append({"bbox": bbox, "embedding": face.embedding.tolist(), "confidence": float(face.det_score), "face_quality_score": q})
        print(f"[PROFILE] InsightFace: {(time.perf_counter()-t_face)*1000:.2f}ms", file=sys.stderr)

        t_siglip = time.perf_counter()
        inputs = self.siglip_processor(images=img_pil, return_tensors="pt").to(self.device)
        with torch.no_grad():
            img_outputs = self.siglip_model.get_image_features(**inputs)
            img_outputs = self._normalize(img_outputs)
            v_emb = img_outputs.cpu().numpy()[0].tolist()
        print(f"[PROFILE] SigLIP Global: {(time.perf_counter()-t_siglip)*1000:.2f}ms", file=sys.stderr)
            
        t_patches = time.perf_counter()
        p_embs = []
        patches = self.get_patches(img_pil)
        if patches:
            p_in = self.siglip_processor(images=patches, return_tensors="pt").to(self.device)
            with torch.no_grad():
                p_out = self.siglip_model.get_image_features(**p_in)
                p_out = self._normalize(p_out)
                p_embs = p_out.cpu().numpy().tolist()
        print(f"[PROFILE] SigLIP Patches ({len(patches)}): {(time.perf_counter()-t_patches)*1000:.2f}ms", file=sys.stderr)
        
        print(f"[PROFILE] TOTAL analyze_screenshot: {(time.perf_counter()-t_start)*1000:.2f}ms", file=sys.stderr)
        return {
            "full_text": full_text.strip() if full_text is not None else None,
            "meeting_ids": list(set(meeting_ids)),
            "faces": face_data,
            "visual_embedding": v_emb,
            "patch_embeddings": p_embs,
            "ocr_status": ocr_status
        }

    def encode_text(self, text):
        inputs = self.siglip_processor(text=[text], return_tensors="pt", padding=True).to(self.device)
        with torch.no_grad():
            t_out = self.siglip_model.get_text_features(**inputs)
            t_out = self._normalize(t_out)
            return t_out.cpu().numpy()[0].tolist()

    def search_image(self, query_image_path):
        if not os.path.exists(query_image_path): return {"error": "Query image not found"}
        img_cv = cv2.imread(query_image_path)
        with Image.open(query_image_path) as img_temp: img_pil = img_temp.convert('RGB')
        inputs = self.siglip_processor(images=img_pil, return_tensors="pt").to(self.device)
        with torch.no_grad():
            i_out = self.siglip_model.get_image_features(**inputs)
            i_out = self._normalize(i_out)
            v_emb = i_out.cpu().numpy()[0].tolist()
        faces = self.face_app.get(img_cv)
        return {"visual_embedding": v_emb, "face_embeddings": [f.embedding.tolist() for f in faces]}
