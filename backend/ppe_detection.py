"""
PPE Safety Detection Service
Based on: https://github.com/prodbykosta/ppe-safety-detection-ai
Detects: Helmets and Safety Vests using local YOLO model (no Roboflow dependency)
"""
import asyncio
import base64
import json
import os
import time
from io import BytesIO
from pathlib import Path
from typing import List, Dict, Any, Optional

import cv2
import numpy as np
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

# YOLO import
from ultralytics import YOLO

# ================= CONFIGURATION =================
# Model paths - will look for custom PPE model, fallback to YOLOv8n
MODELS_DIR = Path(__file__).parent / "models"
PPE_MODEL_PATH = os.environ.get("PPE_MODEL_PATH", str(MODELS_DIR / "ppe_best.pt"))

# Detection confidence thresholds (from prodbykosta/ppe-safety-detection-ai)
HELMET_CONFIDENCE = float(os.environ.get("HELMET_CONFIDENCE", "0.65"))
VEST_CONFIDENCE = float(os.environ.get("VEST_CONFIDENCE", "0.70"))
PERSON_CONFIDENCE = float(os.environ.get("PERSON_CONFIDENCE", "0.50"))
NMS_IOU = float(os.environ.get("NMS_IOU", "0.50"))

# PPE class name mappings (handles various label formats)
HELMET_LABELS = {"helmet", "hardhat", "hard-hat", "hard_hat", "safety_helmet", "safety-helmet", "head", "no_helmet", "no-helmet"}
VEST_LABELS = {"vest", "jacket", "reflective_jacket", "reflective_vest", "safety_vest", "safety-vest", "hi-vis", "high-vis", "no_vest", "no-vest"}
PERSON_LABELS = {"person", "worker", "human"}
MISSING_PPE_PREFIXES = {"no_", "no-", "no ", "without_", "without ", "missing_", "missing "}

# ================= GLOBAL STATE =================
current_detections = {
    "helmet": {"detected": False, "confidence": 0.0, "bbox": None},
    "vest": {"detected": False, "confidence": 0.0, "bbox": None},
    "persons": 0,
    "compliant": False,
    "timestamp": None,
    "frame_base64": None
}

# Temporal smoothing - track detections over time
detection_history = {
    "helmet": [],
    "vest": []
}
SMOOTHING_WINDOW = 3  # Number of frames for temporal smoothing

# Global event loop reference
main_loop = None


# ================= PPE DETECTOR CLASS =================
class LocalPPEDetector:
    """
    PPE Detection using local YOLO model.
    Based on https://github.com/prodbykosta/ppe-safety-detection-ai architecture.
    """

    def __init__(self, model_path: Optional[str] = None):
        self.model = None
        self.person_model = None
        self.model_path = model_path or PPE_MODEL_PATH
        self.class_names = {}

        # Configuration from prodbykosta implementation
        self.helmet_conf = HELMET_CONFIDENCE
        self.vest_conf = VEST_CONFIDENCE
        self.person_conf = PERSON_CONFIDENCE
        self.nms_iou = NMS_IOU
        self.min_box_area = 900  # 30x30 pixels minimum
        self.max_aspect_ratio = 3.5

        self._load_models()

    def _load_models(self):
        """Load YOLO models for PPE and person detection."""
        print("=" * 50)
        print("Initializing Local PPE Detection System")
        print("=" * 50)

        # Try to load custom PPE model
        if os.path.exists(self.model_path):
            print(f"Loading custom PPE model from: {self.model_path}")
            try:
                self.model = YOLO(self.model_path)
                self.class_names = self.model.names
                print(f"PPE Model loaded! Classes: {self.class_names}")
            except Exception as e:
                print(f"Error loading custom model: {e}")
                self.model = None
        else:
            print(f"Custom PPE model not found at: {self.model_path}")

        # Load YOLOv8n for person detection (and as fallback for PPE)
        print("Loading YOLOv8n for person detection...")
        try:
            self.person_model = YOLO("yolov8n.pt")
            print("YOLOv8n loaded successfully!")

            # If no custom PPE model, use YOLOv8n for everything
            if self.model is None:
                print("Using YOLOv8n for PPE detection (limited to person detection)")
                self.model = self.person_model
                self.class_names = self.model.names
        except Exception as e:
            print(f"Error loading YOLOv8n: {e}")

        print("=" * 50)
        print(f"Detection thresholds - Helmet: {self.helmet_conf}, Vest: {self.vest_conf}")
        print("=" * 50)

    def _normalize_label(self, label: str) -> str:
        """Normalize class label to standard format."""
        label_lower = label.lower().strip().replace(" ", "_").replace("-", "_")

        # Check if this is a "missing PPE" detection (e.g., no_helmet, no_vest)
        is_missing = any(label_lower.startswith(prefix.replace("-", "_").replace(" ", "_"))
                        for prefix in MISSING_PPE_PREFIXES)

        # Strip the "no_" prefix for matching
        check_label = label_lower
        for prefix in ["no_", "without_", "missing_"]:
            if check_label.startswith(prefix):
                check_label = check_label[len(prefix):]
                break

        if check_label in HELMET_LABELS or any(h in check_label for h in ["helmet", "hardhat", "hard_hat"]):
            return "no_helmet" if is_missing else "helmet"
        if check_label in VEST_LABELS or any(v in check_label for v in ["vest", "jacket"]):
            return "no_vest" if is_missing else "vest"
        if check_label in PERSON_LABELS or any(p in check_label for p in PERSON_LABELS):
            return "person"

        return label_lower

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

    def detect(self, image_bytes: bytes) -> Dict[str, Any]:
        """
        Run PPE detection on image.
        Returns detection results for helmet and vest.
        """
        global detection_history

        result = {
            "helmet": {"detected": False, "confidence": 0.0, "bbox": None},
            "vest": {"detected": False, "confidence": 0.0, "bbox": None},
            "persons": 0,
            "compliant": False,
            "raw_detections": [],
            "timestamp": time.time()
        }

        if self.model is None:
            print("No model loaded!")
            return result

        try:
            # Convert bytes to numpy array for YOLO
            nparr = np.frombuffer(image_bytes, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if frame is None:
                print("Failed to decode image")
                return result

            # Run PPE detection
            detections = self.model(
                frame,
                conf=min(self.helmet_conf, self.vest_conf, self.person_conf),
                iou=self.nms_iou,
                verbose=False
            )[0]

            # Process detections
            for box in detections.boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                confidence = float(box.conf[0])
                class_id = int(box.cls[0])

                # Get class name
                raw_label = self.class_names.get(class_id, f"class_{class_id}")
                label = self._normalize_label(raw_label)

                bbox = [x1, y1, x2, y2]

                # Store raw detection
                raw_detection = {
                    "label": raw_label,
                    "normalized_label": label,
                    "confidence": confidence,
                    "bbox": bbox
                }
                result["raw_detections"].append(raw_detection)

                # Validate detection
                if not self._is_valid_detection(bbox):
                    continue

                # Map to categories with appropriate confidence thresholds
                # Handle positive detections (helmet/vest present)
                if label == "helmet" and confidence >= self.helmet_conf:
                    if confidence > result["helmet"]["confidence"]:
                        result["helmet"] = {
                            "detected": True,
                            "confidence": confidence,
                            "bbox": bbox
                        }

                elif label == "vest" and confidence >= self.vest_conf:
                    if confidence > result["vest"]["confidence"]:
                        result["vest"] = {
                            "detected": True,
                            "confidence": confidence,
                            "bbox": bbox
                        }

                # Handle negative detections (no_helmet/no_vest = person without PPE)
                # These are useful for logging but don't count as "detected"
                elif label == "no_helmet" and confidence >= self.helmet_conf:
                    # Person detected without helmet - don't mark helmet as detected
                    result["persons"] += 1

                elif label == "no_vest" and confidence >= self.vest_conf:
                    # Person detected without vest - don't mark vest as detected
                    result["persons"] += 1

                elif label == "person" and confidence >= self.person_conf:
                    result["persons"] += 1

            # Apply temporal smoothing
            detection_history["helmet"].append(result["helmet"]["detected"])
            detection_history["vest"].append(result["vest"]["detected"])

            # Keep only last N frames
            detection_history["helmet"] = detection_history["helmet"][-SMOOTHING_WINDOW:]
            detection_history["vest"] = detection_history["vest"][-SMOOTHING_WINDOW:]

            # Smoothed detection - require detection in majority of recent frames
            helmet_smoothed = sum(detection_history["helmet"]) > SMOOTHING_WINDOW / 2
            vest_smoothed = sum(detection_history["vest"]) > SMOOTHING_WINDOW / 2

            # Override with smoothed values (with lower confidence indicator)
            if helmet_smoothed and not result["helmet"]["detected"]:
                result["helmet"]["detected"] = True
                result["helmet"]["confidence"] = 0.5

            if vest_smoothed and not result["vest"]["detected"]:
                result["vest"]["detected"] = True
                result["vest"]["confidence"] = 0.5

            # Determine compliance (both helmet and vest detected)
            result["compliant"] = result["helmet"]["detected"] and result["vest"]["detected"]

            print(f"PPE Detection: Helmet={result['helmet']['detected']} ({result['helmet']['confidence']:.2f}), "
                  f"Vest={result['vest']['detected']} ({result['vest']['confidence']:.2f}), "
                  f"Persons={result['persons']}, Compliant={result['compliant']}")

        except Exception as e:
            print(f"PPE Detection error: {e}")
            import traceback
            traceback.print_exc()

        return result

    def detect_with_annotations(self, image_bytes: bytes) -> tuple:
        """
        Run detection and return annotated image with results.
        Returns: (annotated_image_bytes, detection_results)
        """
        result = self.detect(image_bytes)

        # Convert to frame for annotation
        nparr = np.frombuffer(image_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if frame is not None:
            # Draw helmet detection
            if result["helmet"]["detected"] and result["helmet"]["bbox"]:
                bbox = result["helmet"]["bbox"]
                color = (0, 255, 0)  # Green for compliant
                cv2.rectangle(frame, (bbox[0], bbox[1]), (bbox[2], bbox[3]), color, 2)
                cv2.putText(frame, f"Helmet {result['helmet']['confidence']:.2f}",
                           (bbox[0], bbox[1] - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

            # Draw vest detection
            if result["vest"]["detected"] and result["vest"]["bbox"]:
                bbox = result["vest"]["bbox"]
                color = (0, 255, 0)  # Green for compliant
                cv2.rectangle(frame, (bbox[0], bbox[1]), (bbox[2], bbox[3]), color, 2)
                cv2.putText(frame, f"Vest {result['vest']['confidence']:.2f}",
                           (bbox[0], bbox[1] - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

            # Encode back to bytes
            _, buffer = cv2.imencode('.jpg', frame)
            annotated_bytes = buffer.tobytes()
            return annotated_bytes, result

        return image_bytes, result


# Initialize detector
detector = LocalPPEDetector()


# ================= WEBSOCKET MANAGER =================
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"Client connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        print(f"Client disconnected. Total connections: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        for connection in self.active_connections[:]:
            try:
                await connection.send_json(message)
            except Exception as e:
                print(f"Error broadcasting: {e}")
                self.disconnect(connection)


manager = ConnectionManager()
app = FastAPI(title="PPE Safety Detection Service (Local YOLO)")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ================= API ENDPOINTS =================

@app.get("/")
async def root():
    return {
        "service": "PPE Safety Detection (Local YOLO)",
        "model": str(detector.model_path),
        "detects": ["helmet", "vest"],
        "thresholds": {
            "helmet": detector.helmet_conf,
            "vest": detector.vest_conf,
            "person": detector.person_conf
        },
        "status": "running"
    }


@app.get("/status")
async def get_status():
    """Get current detection status."""
    return current_detections


@app.post("/detect")
async def detect_ppe(file: UploadFile = File(...)):
    """
    Run PPE detection on uploaded image.
    Returns helmet and vest detection results.
    """
    global current_detections

    try:
        # Read image
        image_bytes = await file.read()

        # Run detection
        result = detector.detect(image_bytes)

        # Update global state
        current_detections.update({
            "helmet": result["helmet"],
            "vest": result["vest"],
            "persons": result["persons"],
            "compliant": result["compliant"],
            "timestamp": result["timestamp"]
        })

        # Broadcast to WebSocket clients
        if main_loop and main_loop.is_running():
            asyncio.run_coroutine_threadsafe(
                manager.broadcast(current_detections),
                main_loop
            )

        return {
            "success": True,
            "detections": {
                "helmet": result["helmet"],
                "vest": result["vest"],
                "persons": result["persons"],
                "compliant": result["compliant"],
                "raw": result["raw_detections"]
            }
        }

    except Exception as e:
        print(f"Detection error: {e}")
        return {
            "success": False,
            "error": str(e)
        }


@app.post("/detect-frame")
async def detect_frame_base64(data: dict):
    """
    Run PPE detection on base64-encoded frame.
    Expected: { "frame": "base64_encoded_image_data" }
    """
    global current_detections

    try:
        frame_base64 = data.get("frame", "")

        # Remove data URL prefix if present
        if "," in frame_base64:
            frame_base64 = frame_base64.split(",")[1]

        # Decode base64
        image_bytes = base64.b64decode(frame_base64)

        # Run detection
        result = detector.detect(image_bytes)

        # Update global state
        current_detections.update({
            "helmet": result["helmet"],
            "vest": result["vest"],
            "persons": result["persons"],
            "compliant": result["compliant"],
            "timestamp": result["timestamp"],
            "frame_base64": frame_base64[:100] + "..."  # Truncated for logging
        })

        return {
            "success": True,
            "detections": {
                "helmet": result["helmet"],
                "vest": result["vest"],
                "persons": result["persons"],
                "compliant": result["compliant"]
            }
        }

    except Exception as e:
        print(f"Frame detection error: {e}")
        return {
            "success": False,
            "error": str(e)
        }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time detection updates."""
    await manager.connect(websocket)

    # Send current state on connect
    await websocket.send_json(current_detections)

    try:
        while True:
            # Receive frame data from client
            data = await websocket.receive_text()

            try:
                message = json.loads(data)

                if message.get("type") == "frame":
                    frame_base64 = message.get("frame", "")

                    # Remove data URL prefix if present
                    if "," in frame_base64:
                        frame_base64 = frame_base64.split(",")[1]

                    # Decode and detect
                    image_bytes = base64.b64decode(frame_base64)
                    result = detector.detect(image_bytes)

                    # Update state and broadcast
                    current_detections.update({
                        "helmet": result["helmet"],
                        "vest": result["vest"],
                        "persons": result["persons"],
                        "compliant": result["compliant"],
                        "timestamp": result["timestamp"]
                    })

                    # Send result back to this client
                    await websocket.send_json({
                        "type": "detection",
                        "data": current_detections
                    })

            except json.JSONDecodeError:
                await websocket.send_json({"error": "Invalid JSON"})

    except WebSocketDisconnect:
        manager.disconnect(websocket)


@app.post("/reset")
async def reset_detections():
    """Reset detection state."""
    global current_detections, detection_history

    current_detections = {
        "helmet": {"detected": False, "confidence": 0.0, "bbox": None},
        "vest": {"detected": False, "confidence": 0.0, "bbox": None},
        "persons": 0,
        "compliant": False,
        "timestamp": None,
        "frame_base64": None
    }

    detection_history = {
        "helmet": [],
        "vest": []
    }

    return {"status": "reset", "detections": current_detections}


@app.get("/model-info")
async def get_model_info():
    """Get information about the loaded model."""
    return {
        "model_path": str(detector.model_path),
        "model_loaded": detector.model is not None,
        "class_names": detector.class_names,
        "thresholds": {
            "helmet": detector.helmet_conf,
            "vest": detector.vest_conf,
            "person": detector.person_conf,
            "nms_iou": detector.nms_iou
        }
    }


# ================= STARTUP EVENT =================

@app.on_event("startup")
async def startup_event():
    global main_loop
    main_loop = asyncio.get_running_loop()
    print("=" * 50)
    print("PPE Detection Service started!")
    print(f"Model: {detector.model_path}")
    print(f"Model loaded: {detector.model is not None}")
    print(f"Classes: {detector.class_names}")
    print("=" * 50)


# ================= MAIN =================

if __name__ == "__main__":
    print("Starting PPE Safety Detection Service (Local YOLO)...")
    print("Endpoints:")
    print("  - POST /detect - Upload image for detection")
    print("  - POST /detect-frame - Base64 frame detection")
    print("  - GET /status - Current detection status")
    print("  - GET /model-info - Model information")
    print("  - WS /ws - WebSocket for real-time detection")

    uvicorn.run(app, host="0.0.0.0", port=8002)
