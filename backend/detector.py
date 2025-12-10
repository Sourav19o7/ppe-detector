"""
Detection module combining PPE detection, face detection, and face recognition.
Uses local YOLO models for PPE detection (based on prodbykosta/ppe-safety-detection-ai).
"""
import pickle
import base64
import os
from io import BytesIO
from pathlib import Path
from typing import Optional, Tuple, Dict, List

import cv2
import numpy as np
import torch
from PIL import Image, ImageDraw, ImageFont
from ultralytics import YOLO
from huggingface_hub import hf_hub_download

# Try to import face recognition components
try:
    from facenet_pytorch import MTCNN, InceptionResnetV1
    FACE_RECOGNITION_AVAILABLE = True
except ImportError:
    FACE_RECOGNITION_AVAILABLE = False


# ================= CONFIGURATION =================
MODELS_DIR = Path(__file__).parent / "models"
PPE_MODEL_PATH = os.environ.get("PPE_MODEL_PATH", str(MODELS_DIR / "ppe_best.pt"))

# Detection confidence thresholds (from prodbykosta/ppe-safety-detection-ai)
HELMET_CONFIDENCE = float(os.environ.get("HELMET_CONFIDENCE", "0.65"))
VEST_CONFIDENCE = float(os.environ.get("VEST_CONFIDENCE", "0.70"))
PERSON_CONFIDENCE = float(os.environ.get("PERSON_CONFIDENCE", "0.50"))
NMS_IOU = float(os.environ.get("NMS_IOU", "0.50"))

# PPE class name mappings (handles various label formats from different YOLO models)
HELMET_LABELS = {
    "helmet", "hardhat", "hard-hat", "hard_hat", "safety_helmet",
    "safety-helmet", "head", "hard hat", "safety helmet"
}
VEST_LABELS = {
    "vest", "jacket", "reflective_jacket", "reflective_vest",
    "safety_vest", "safety-vest", "hi-vis", "high-vis",
    "safety vest", "reflective vest"
}
GOGGLES_LABELS = {"goggles", "safety_goggles", "glasses", "safety_glasses", "safety goggles"}
GLOVES_LABELS = {"gloves", "glove", "safety_gloves", "safety gloves"}
MASK_LABELS = {"mask", "face_mask", "dust_mask", "respirator", "face mask"}
SHOES_LABELS = {"shoes", "safety_shoes", "safety_shoe", "boots", "safety_boots", "safety shoes"}
PERSON_LABELS = {"person", "worker", "human"}


class PersonDetector:
    """Combined PPE and face detection/recognition using local YOLO models."""

    def __init__(self, known_faces_dir: str = "../known_faces"):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"Using device: {self.device}")

        # PPE Model configuration
        self.ppe_model = None
        self.person_model = None
        self.ppe_model_path = PPE_MODEL_PATH
        self.ppe_class_names = {}

        # Detection thresholds
        self.helmet_conf = HELMET_CONFIDENCE
        self.vest_conf = VEST_CONFIDENCE
        self.person_conf = PERSON_CONFIDENCE
        self.nms_iou = NMS_IOU
        self.min_box_area = 900  # 30x30 pixels minimum
        self.max_aspect_ratio = 3.5

        # Initialize PPE detection
        self._load_ppe_model()

        # Face Detection Model (arnabdhar/YOLOv8-Face-Detection)
        print("Loading face detection model...")
        face_model_path = hf_hub_download(
            repo_id="arnabdhar/YOLOv8-Face-Detection",
            filename="model.pt"
        )
        self.face_model = YOLO(face_model_path)

        # Face Recognition (using FaceNet)
        self.known_faces_dir = Path(known_faces_dir)
        self.known_faces_dir.mkdir(exist_ok=True)
        self.known_faces_file = self.known_faces_dir / "embeddings.pkl"

        if FACE_RECOGNITION_AVAILABLE:
            print("Loading face recognition model...")
            # MTCNN with lower thresholds for better detection
            self.mtcnn = MTCNN(
                keep_all=True,
                device=self.device,
                thresholds=[0.5, 0.6, 0.6],
                min_face_size=20,
                post_process=True
            )
            self.facenet = InceptionResnetV1(pretrained='vggface2').eval().to(self.device)
            self.known_faces = self._load_known_faces()
        else:
            print("Face recognition not available (facenet-pytorch not installed)")
            self.mtcnn = None
            self.facenet = None
            self.known_faces = {}

        # Colors for different PPE classes (green = good, red = missing/violation)
        self.colors = {
            # Positive detections (wearing PPE) - Green shades
            "helmet": (0, 200, 0),
            "Helmet": (0, 200, 0),
            "goggles": (0, 180, 80),
            "Goggles": (0, 180, 80),
            "glove": (0, 160, 60),
            "Gloves": (0, 160, 60),
            "mask": (0, 140, 100),
            "Mask": (0, 140, 100),
            "shoes": (0, 120, 80),
            "Safety Shoe": (0, 120, 80),
            "Safety Shoes": (0, 120, 80),
            "Vest": (0, 255, 0),
            "vest": (0, 255, 0),
            # Missing PPE - Red shades
            "NO Helmet": (255, 0, 0),
            "NO Goggles": (255, 50, 50),
            "NO Gloves": (255, 80, 80),
            "NO Mask": (255, 100, 100),
            "NO Safety Shoes": (255, 120, 120),
            "NO Vest": (255, 60, 60),
            # Face
            "face": (255, 255, 0),
            "default": (128, 128, 128)
        }

        print("All models loaded successfully!")

    def _load_ppe_model(self):
        """Load local YOLO model for PPE detection."""
        print("=" * 50)
        print("Initializing Local PPE Detection System")
        print("=" * 50)

        # Try to load custom PPE model
        if os.path.exists(self.ppe_model_path):
            print(f"Loading custom PPE model from: {self.ppe_model_path}")
            try:
                self.ppe_model = YOLO(self.ppe_model_path)
                self.ppe_class_names = self.ppe_model.names
                print(f"PPE Model loaded! Classes: {self.ppe_class_names}")
            except Exception as e:
                print(f"Error loading custom PPE model: {e}")
                self.ppe_model = None
        else:
            print(f"Custom PPE model not found at: {self.ppe_model_path}")

        # Load YOLOv8n for person detection (and as fallback for PPE)
        print("Loading YOLOv8n for person detection...")
        try:
            self.person_model = YOLO("yolov8n.pt")
            print("YOLOv8n loaded successfully!")

            # If no custom PPE model, use YOLOv8n for everything
            if self.ppe_model is None:
                print("Using YOLOv8n for PPE detection (limited to person detection)")
                self.ppe_model = self.person_model
                self.ppe_class_names = self.ppe_model.names
        except Exception as e:
            print(f"Error loading YOLOv8n: {e}")

        print("=" * 50)
        print(f"PPE Detection thresholds - Helmet: {self.helmet_conf}, Vest: {self.vest_conf}")
        print("=" * 50)

    def _load_known_faces(self) -> dict:
        """Load known face embeddings from disk."""
        if self.known_faces_file.exists():
            with open(self.known_faces_file, 'rb') as f:
                return pickle.load(f)
        return {}

    def _save_known_faces(self):
        """Save known face embeddings to disk."""
        with open(self.known_faces_file, 'wb') as f:
            pickle.dump(self.known_faces, f)

    def get_face_embedding(self, image: Image.Image) -> Optional[np.ndarray]:
        """Extract face embedding from image using MTCNN."""
        if not FACE_RECOGNITION_AVAILABLE:
            return None

        try:
            faces = self.mtcnn(image)
            if faces is not None and len(faces) > 0:
                face = faces[0].unsqueeze(0).to(self.device)
                with torch.no_grad():
                    embedding = self.facenet(face)
                return embedding.cpu().numpy()[0]
        except Exception as e:
            print(f"MTCNN face detection error: {e}")

        return None

    def register_face(self, name: str, image_bytes: bytes, display_name: str = None) -> bool:
        """Register a new face for recognition with fallback detection."""
        if not FACE_RECOGNITION_AVAILABLE:
            return False

        try:
            image = Image.open(BytesIO(image_bytes)).convert("RGB")

            # Preprocess image
            width, height = image.size
            max_size = 1024
            if width > max_size or height > max_size:
                ratio = min(max_size / width, max_size / height)
                new_size = (int(width * ratio), int(height * ratio))
                image = image.resize(new_size, Image.Resampling.LANCZOS)

            # Try MTCNN first
            embedding = self.get_face_embedding(image)

            # If MTCNN fails, try using YOLO face detector
            if embedding is None:
                print("MTCNN failed, trying YOLO face detection...")
                face_results = self.face_model(image, conf=0.3, verbose=False)[0]

                if len(face_results.boxes) > 0:
                    box = face_results.boxes[0]
                    x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                    padding = 30
                    x1 = max(0, x1 - padding)
                    y1 = max(0, y1 - padding)
                    x2 = min(image.width, x2 + padding)
                    y2 = min(image.height, y2 + padding)
                    face_crop = image.crop((x1, y1, x2, y2))
                    embedding = self.get_face_embedding(face_crop)

            if embedding is None:
                print(f"Failed to detect face in image for {name}")
                return False

            self.known_faces[name] = {
                "embedding": embedding,
                "display_name": display_name or name
            }
            self._save_known_faces()
            print(f"Successfully registered face for {name} ({display_name or name})")
            return True

        except Exception as e:
            print(f"Error registering face: {e}")
            import traceback
            traceback.print_exc()
            return False

    def get_known_faces(self) -> list:
        """Return list of registered face names."""
        return list(self.known_faces.keys())

    def identify_face(self, face_image: Image.Image, threshold: float = 0.8) -> Optional[Tuple[str, str]]:
        """Identify a face from known faces."""
        if not FACE_RECOGNITION_AVAILABLE or not self.known_faces:
            return None

        embedding = self.get_face_embedding(face_image)

        if embedding is None:
            try:
                face_results = self.face_model(face_image, conf=0.2, verbose=False)[0]
                if len(face_results.boxes) > 0:
                    box = face_results.boxes[0]
                    x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                    padding = 20
                    x1 = max(0, x1 - padding)
                    y1 = max(0, y1 - padding)
                    x2 = min(face_image.width, x2 + padding)
                    y2 = min(face_image.height, y2 + padding)
                    face_crop = face_image.crop((x1, y1, x2, y2))
                    embedding = self.get_face_embedding(face_crop)
            except Exception as e:
                print(f"Fallback face detection error: {e}")

        if embedding is None:
            return None

        best_match = None
        best_match_id = None
        best_distance = float('inf')

        for employee_id, face_data in self.known_faces.items():
            if isinstance(face_data, dict):
                known_embedding = face_data["embedding"]
                display_name = face_data.get("display_name", employee_id)
            else:
                known_embedding = face_data
                display_name = employee_id

            distance = np.linalg.norm(embedding - known_embedding)
            if distance < best_distance:
                best_distance = distance
                best_match_id = employee_id
                best_match = display_name

        print(f"Best match: {best_match} ({best_match_id}), distance: {best_distance:.3f}, threshold: {threshold}")

        if best_distance < threshold:
            return (best_match_id, best_match)
        return None

    def _normalize_label(self, label: str) -> str:
        """Normalize label names to standardized format."""
        label_lower = label.lower().strip().replace("-", " ").replace("_", " ")

        # Check against known label sets
        if label_lower in HELMET_LABELS or any(h in label_lower for h in HELMET_LABELS):
            return "Helmet"
        if label_lower in VEST_LABELS or any(v in label_lower for v in VEST_LABELS):
            return "Vest"
        if label_lower in GOGGLES_LABELS or any(g in label_lower for g in GOGGLES_LABELS):
            return "Goggles"
        if label_lower in GLOVES_LABELS or any(g in label_lower for g in GLOVES_LABELS):
            return "Gloves"
        if label_lower in MASK_LABELS or any(m in label_lower for m in MASK_LABELS):
            return "Mask"
        if label_lower in SHOES_LABELS or any(s in label_lower for s in SHOES_LABELS):
            return "Safety Shoes"
        if label_lower in PERSON_LABELS or any(p in label_lower for p in PERSON_LABELS):
            return "Person"

        # Missing PPE violations
        if "no" in label_lower or "without" in label_lower or "missing" in label_lower:
            if any(h in label_lower for h in ["helmet", "hardhat", "hat"]):
                return "NO Helmet"
            if any(v in label_lower for v in ["vest", "jacket"]):
                return "NO Vest"
            if "goggles" in label_lower or "glasses" in label_lower:
                return "NO Goggles"
            if "glove" in label_lower:
                return "NO Gloves"
            if "mask" in label_lower:
                return "NO Mask"
            if any(s in label_lower for s in ["shoes", "boots"]):
                return "NO Safety Shoes"

        return label

    def _is_violation(self, label: str) -> bool:
        """Check if label indicates missing PPE."""
        return label.startswith("NO ") or label.startswith("Without ")

    def _is_valid_detection(self, bbox: List[int]) -> bool:
        """Validate detection based on size and aspect ratio constraints."""
        x1, y1, x2, y2 = bbox
        width = x2 - x1
        height = y2 - y1
        area = width * height

        if area < self.min_box_area:
            return False

        aspect_ratio = height / max(width, 1)
        if aspect_ratio > self.max_aspect_ratio:
            return False

        return True

    def _run_ppe_detection(self, image: Image.Image) -> list:
        """Run PPE detection using local YOLO model."""
        detections = []

        if self.ppe_model is None:
            print("No PPE model loaded!")
            return detections

        try:
            # Convert PIL Image to numpy array for YOLO
            frame = np.array(image)
            frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)

            # Run inference
            results = self.ppe_model(
                frame,
                conf=min(self.helmet_conf, self.vest_conf, self.person_conf),
                iou=self.nms_iou,
                verbose=False
            )[0]

            # Process detections
            for box in results.boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                confidence = float(box.conf[0])
                class_id = int(box.cls[0])

                # Get class name
                raw_label = self.ppe_class_names.get(class_id, f"class_{class_id}")

                bbox = [x1, y1, x2, y2]

                # Validate detection
                if not self._is_valid_detection(bbox):
                    continue

                detections.append({
                    'bbox': bbox,
                    'label': raw_label,
                    'confidence': confidence
                })

            print(f"Local YOLO detected {len(detections)} objects")

        except Exception as e:
            print(f"PPE detection error: {e}")
            import traceback
            traceback.print_exc()

        return detections

    def process_image(self, image_bytes: bytes) -> tuple[Image.Image, dict]:
        """Process image and return annotated image with detections."""
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
        draw = ImageDraw.Draw(image)

        try:
            font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 16)
            font_small = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 14)
        except:
            font = ImageFont.load_default()
            font_small = font

        detections = {
            "ppe": [],
            "faces": [],
            "violations": []
        }

        # Run local YOLO PPE detection
        ppe_detections = self._run_ppe_detection(image)

        for det in ppe_detections:
            x1, y1, x2, y2 = det['bbox']
            raw_label = det['label']
            conf = det['confidence']

            label = self._normalize_label(raw_label)

            # Skip person detections (not a PPE item)
            if label == "Person":
                continue

            is_violation = self._is_violation(label)
            color = self.colors.get(label, (0, 255, 0) if not is_violation else (255, 0, 0))

            # Draw bounding box
            draw.rectangle([x1, y1, x2, y2], outline=color, width=3)

            # Draw label
            text = f"{label} {conf:.2f}"
            text_bbox = draw.textbbox((x1, y1 - 2), text, font=font_small)
            draw.rectangle([text_bbox[0] - 2, text_bbox[1] - 2, text_bbox[2] + 2, text_bbox[3] + 2], fill=color)
            text_color = (255, 255, 255) if is_violation else (0, 0, 0)
            draw.text((x1, y1 - 2), text, fill=text_color, font=font_small)

            detection_info = {
                "label": label,
                "confidence": conf,
                "bbox": [x1, y1, x2, y2],
                "is_violation": is_violation
            }

            detections["ppe"].append(detection_info)
            if is_violation:
                detections["violations"].append(detection_info)

        # Run face detection
        face_results = self.face_model(image, conf=0.3, verbose=False)[0]

        for box in face_results.boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            conf = float(box.conf[0])

            padding = 40
            x1_crop = max(0, x1 - padding)
            y1_crop = max(0, y1 - padding)
            x2_crop = min(image.width, x2 + padding)
            y2_crop = min(image.height, y2 + padding)

            face_crop = image.crop((x1_crop, y1_crop, x2_crop, y2_crop))
            identification = self.identify_face(face_crop, threshold=0.85)

            color = self.colors["face"]
            draw.rectangle([x1, y1, x2, y2], outline=color, width=2)

            person_id = None
            person_name = None

            if identification:
                person_id, person_name = identification
                text = f"{person_name} ({person_id})"
                print(f"Identified person: {person_name} ({person_id})")
            else:
                text = f"Unknown {conf:.2f}"
                print(f"Unknown face detected (conf: {conf:.2f})")

            text_bbox = draw.textbbox((x1, y1 - 20), text, font=font)
            draw.rectangle([text_bbox[0] - 2, text_bbox[1] - 2, text_bbox[2] + 2, text_bbox[3] + 2], fill=color)
            draw.text((x1, y1 - 20), text, fill=(0, 0, 0), font=font)

            detections["faces"].append({
                "employee_id": person_id,
                "name": person_name,
                "confidence": conf,
                "bbox": [x1, y1, x2, y2]
            })

        # Generate summary
        summary = self._generate_summary(detections)
        detections["summary"] = summary

        return image, detections

    def _generate_summary(self, detections: dict) -> dict:
        """Generate a summary of safety compliance."""
        ppe_items = detections["ppe"]
        faces = detections["faces"]
        violations = detections["violations"]

        # Count PPE by type
        ppe_counts = {}
        for item in ppe_items:
            label = item["label"]
            if not item["is_violation"]:
                ppe_counts[label] = ppe_counts.get(label, 0) + 1

        violation_counts = {}
        for item in violations:
            label = item["label"]
            violation_counts[label] = violation_counts.get(label, 0) + 1

        identified = [f["employee_id"] for f in faces if f.get("employee_id")]

        return {
            "ppe_detected": ppe_counts,
            "violations": violation_counts,
            "total_ppe_items": len([p for p in ppe_items if not p["is_violation"]]),
            "total_violations": len(violations),
            "faces_detected": len(faces),
            "identified_persons": identified,
            "identified_names": [f["name"] for f in faces if f.get("name")],
            "safety_compliant": len(violations) == 0
        }
