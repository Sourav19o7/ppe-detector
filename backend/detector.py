"""
Detection module combining PPE detection, face detection, and face recognition.
Uses two PPE models for better coverage:
1. keremberke/yolov8m-protective-equipment-detection - detects helmet, no_helmet, goggles, etc.
2. Tanishjain9/yolov8n-ppe-detection-6classes - detects Helmet, Vest, Gloves, Goggles, Mask, Safety Shoe
"""
import pickle
from io import BytesIO
from pathlib import Path

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


class PersonDetector:
    """Combined PPE and face detection/recognition."""

    def __init__(self, known_faces_dir: str = "../known_faces"):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"Using device: {self.device}")

        # PPE Detection Model 1: keremberke (detects missing PPE too)
        # Classes: glove, goggles, helmet, mask, no_glove, no_goggles, no_helmet, no_mask, no_shoes, shoes
        print("Loading PPE detection model 1 (keremberke)...")
        ppe_model1_path = hf_hub_download(
            repo_id="keremberke/yolov8m-protective-equipment-detection",
            filename="best.pt"
        )
        self.ppe_model1 = YOLO(ppe_model1_path)

        # PPE Detection Model 2: Tanishjain9 (6 classes, good accuracy)
        # Classes: Gloves, Vest, Goggles, Helmet, Mask, Safety Shoe
        print("Loading PPE detection model 2 (Tanishjain9)...")
        ppe_model2_path = hf_hub_download(
            repo_id="Tanishjain9/yolov8n-ppe-detection-6classes",
            filename="best.pt"
        )
        self.ppe_model2 = YOLO(ppe_model2_path)

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
                thresholds=[0.5, 0.6, 0.6],  # Lower thresholds (default: [0.6, 0.7, 0.7])
                min_face_size=20,  # Detect smaller faces
                post_process=True  # Apply post-processing
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
            "Vest": (0, 255, 0),
            "vest": (0, 255, 0),
            # Missing PPE - Red shades
            "no_helmet": (255, 0, 0),
            "no_goggles": (255, 50, 50),
            "no_glove": (255, 80, 80),
            "no_mask": (255, 100, 100),
            "no_shoes": (255, 120, 120),
            # Face
            "face": (255, 255, 0),
            "default": (128, 128, 128)
        }

        print("All models loaded successfully!")

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

    def get_face_embedding(self, image: Image.Image) -> np.ndarray | None:
        """Extract face embedding from image using MTCNN."""
        if not FACE_RECOGNITION_AVAILABLE:
            return None

        try:
            # Try with lower threshold
            faces = self.mtcnn(image)
            if faces is not None and len(faces) > 0:
                face = faces[0].unsqueeze(0).to(self.device)
                with torch.no_grad():
                    embedding = self.facenet(face)
                return embedding.cpu().numpy()[0]
        except Exception as e:
            print(f"MTCNN face detection error: {e}")

        return None

    def register_face(self, name: str, image_bytes: bytes) -> bool:
        """Register a new face for recognition with fallback detection."""
        if not FACE_RECOGNITION_AVAILABLE:
            return False

        try:
            image = Image.open(BytesIO(image_bytes)).convert("RGB")

            # Preprocess image - ensure good size and quality
            width, height = image.size
            max_size = 1024
            if width > max_size or height > max_size:
                ratio = min(max_size / width, max_size / height)
                new_size = (int(width * ratio), int(height * ratio))
                image = image.resize(new_size, Image.Resampling.LANCZOS)

            # Try MTCNN first
            embedding = self.get_face_embedding(image)

            # If MTCNN fails, try using YOLO face detector to crop face
            if embedding is None:
                print("MTCNN failed, trying YOLO face detection...")
                face_results = self.face_model(image, conf=0.3, verbose=False)[0]

                if len(face_results.boxes) > 0:
                    # Get the first detected face
                    box = face_results.boxes[0]
                    x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())

                    # Add padding around face
                    padding = 30
                    x1 = max(0, x1 - padding)
                    y1 = max(0, y1 - padding)
                    x2 = min(image.width, x2 + padding)
                    y2 = min(image.height, y2 + padding)

                    face_crop = image.crop((x1, y1, x2, y2))

                    # Try MTCNN on cropped face
                    embedding = self.get_face_embedding(face_crop)

                    if embedding is not None:
                        print(f"Successfully extracted embedding using YOLO + MTCNN")

            if embedding is None:
                print(f"Failed to detect face in image for {name}")
                return False

            self.known_faces[name] = embedding
            self._save_known_faces()
            print(f"Successfully registered face for {name}")
            return True

        except Exception as e:
            print(f"Error registering face: {e}")
            import traceback
            traceback.print_exc()
            return False

    def get_known_faces(self) -> list:
        """Return list of registered face names."""
        return list(self.known_faces.keys())

    def identify_face(self, face_image: Image.Image, threshold: float = 0.7) -> str | None:
        """Identify a face from known faces."""
        if not FACE_RECOGNITION_AVAILABLE or not self.known_faces:
            return None

        embedding = self.get_face_embedding(face_image)
        if embedding is None:
            return None

        best_match = None
        best_distance = float('inf')

        for name, known_embedding in self.known_faces.items():
            distance = np.linalg.norm(embedding - known_embedding)
            if distance < best_distance:
                best_distance = distance
                best_match = name

        if best_distance < threshold:
            return best_match
        return None

    def _normalize_label(self, label: str) -> str:
        """Normalize label names across different models."""
        label_map = {
            "Helmet": "Helmet",
            "helmet": "Helmet",
            "Vest": "Vest",
            "vest": "Vest",
            "Goggles": "Goggles",
            "goggles": "Goggles",
            "Gloves": "Gloves",
            "glove": "Gloves",
            "Mask": "Mask",
            "mask": "Mask",
            "Safety Shoe": "Safety Shoes",
            "shoes": "Safety Shoes",
            "no_helmet": "NO Helmet",
            "no_goggles": "NO Goggles",
            "no_glove": "NO Gloves",
            "no_mask": "NO Mask",
            "no_shoes": "NO Safety Shoes",
        }
        return label_map.get(label, label)

    def _is_violation(self, label: str) -> bool:
        """Check if label indicates missing PPE."""
        return label.lower().startswith("no_") or label.startswith("NO ")

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

        # Track detected boxes to avoid duplicates
        detected_boxes = []

        def box_overlap(box1, box2, threshold=0.5):
            """Check if two boxes overlap significantly."""
            x1 = max(box1[0], box2[0])
            y1 = max(box1[1], box2[1])
            x2 = min(box1[2], box2[2])
            y2 = min(box1[3], box2[3])

            if x2 <= x1 or y2 <= y1:
                return False

            intersection = (x2 - x1) * (y2 - y1)
            area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
            area2 = (box2[2] - box2[0]) * (box2[3] - box2[1])

            iou = intersection / min(area1, area2)
            return iou > threshold

        # Run both PPE models
        for model, model_name in [(self.ppe_model1, "model1"), (self.ppe_model2, "model2")]:
            results = model(image, conf=0.25, verbose=False)[0]

            for box in results.boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                conf = float(box.conf[0])
                cls_id = int(box.cls[0])
                raw_label = results.names[cls_id]
                label = self._normalize_label(raw_label)

                # Skip if similar box already detected
                current_box = [x1, y1, x2, y2]
                is_duplicate = False
                for existing in detected_boxes:
                    if box_overlap(current_box, existing["bbox"]) and existing["label"] == label:
                        is_duplicate = True
                        break

                if is_duplicate:
                    continue

                detected_boxes.append({"bbox": current_box, "label": label})

                # Determine color
                is_violation = self._is_violation(label)
                color = self.colors.get(raw_label, (0, 255, 0) if not is_violation else (255, 0, 0))

                # Draw bounding box
                draw.rectangle([x1, y1, x2, y2], outline=color, width=3)

                # Draw label background and text
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
        face_results = self.face_model(image, conf=0.5, verbose=False)[0]

        for box in face_results.boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            conf = float(box.conf[0])

            face_crop = image.crop((x1, y1, x2, y2))
            person_name = self.identify_face(face_crop)

            color = self.colors["face"]
            draw.rectangle([x1, y1, x2, y2], outline=color, width=2)

            if person_name:
                text = person_name
            else:
                text = f"Person {conf:.2f}"

            text_bbox = draw.textbbox((x1, y1 - 20), text, font=font)
            draw.rectangle([text_bbox[0] - 2, text_bbox[1] - 2, text_bbox[2] + 2, text_bbox[3] + 2], fill=color)
            draw.text((x1, y1 - 20), text, fill=(0, 0, 0), font=font)

            detections["faces"].append({
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

        identified = [f["name"] for f in faces if f["name"]]

        return {
            "ppe_detected": ppe_counts,
            "violations": violation_counts,
            "total_ppe_items": len([p for p in ppe_items if not p["is_violation"]]),
            "total_violations": len(violations),
            "faces_detected": len(faces),
            "identified_persons": identified,
            "safety_compliant": len(violations) == 0
        }
