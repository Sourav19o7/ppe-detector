"""
Video streaming module using local YOLO for real-time PPE detection.
Streams annotated video frames with bounding boxes via WebSocket.
Based on: https://github.com/prodbykosta/ppe-safety-detection-ai
"""
import asyncio
import base64
import cv2
import numpy as np
import os
from pathlib import Path
from typing import Optional, Callable
from datetime import datetime
from threading import Thread, Event
from queue import Queue, Empty

from ultralytics import YOLO

# Flag for compatibility with main.py (always True since we use local YOLO now)
INFERENCE_PIPELINE_AVAILABLE = True

# ================= CONFIGURATION =================
MODELS_DIR = Path(__file__).parent / "models"
PPE_MODEL_PATH = os.environ.get("PPE_MODEL_PATH", str(MODELS_DIR / "ppe_best.pt"))

# Detection thresholds
HELMET_CONFIDENCE = float(os.environ.get("HELMET_CONFIDENCE", "0.65"))
VEST_CONFIDENCE = float(os.environ.get("VEST_CONFIDENCE", "0.70"))
CONFIDENCE_THRESHOLD = float(os.environ.get("CONFIDENCE_THRESHOLD", "0.50"))
NMS_IOU = float(os.environ.get("NMS_IOU", "0.50"))

# PPE class name mappings
HELMET_LABELS = {"helmet", "hardhat", "hard-hat", "hard_hat", "safety_helmet", "no_helmet", "no-helmet"}
VEST_LABELS = {"vest", "jacket", "reflective_jacket", "reflective_vest", "safety_vest", "no_vest", "no-vest"}
MISSING_PPE_PREFIXES = {"no_", "no-", "without_", "missing_"}


class VideoStreamProcessor:
    """Handles real-time video streaming with PPE detection using local YOLO model."""

    def __init__(
        self,
        model_path: str = PPE_MODEL_PATH,
        max_fps: int = 15,
    ):
        self.model_path = model_path
        self.max_fps = max_fps
        self.model: Optional[YOLO] = None
        self.class_names = {}

        self.is_running = False
        self.stop_event = Event()

        # Queue for frames to send to clients
        self.frame_queue: Queue = Queue(maxsize=30)

        # Latest detection results
        self.latest_result = None
        self.latest_frame = None

        # Callbacks for events
        self.on_violation_callback: Optional[Callable] = None

        # Load model
        self._load_model()

        # Colors for bounding boxes
        self.colors = {
            # PPE detected (green shades)
            "helmet": (0, 200, 0),
            "Helmet": (0, 200, 0),
            "vest": (0, 255, 0),
            "Vest": (0, 255, 0),
            "goggles": (0, 180, 80),
            "Goggles": (0, 180, 80),
            "gloves": (0, 160, 60),
            "Gloves": (0, 160, 60),
            "mask": (0, 140, 100),
            "Mask": (0, 140, 100),
            "shoes": (0, 120, 80),
            "Safety Shoes": (0, 120, 80),
            # Violations (red shades - BGR format)
            "NO Helmet": (0, 0, 255),
            "no_helmet": (0, 0, 255),
            "NO Vest": (0, 60, 255),
            "no_vest": (0, 60, 255),
            "NO Goggles": (80, 50, 255),
            "no_goggles": (80, 50, 255),
            "NO Gloves": (100, 80, 255),
            "no_gloves": (100, 80, 255),
            "NO Mask": (120, 100, 255),
            "no_mask": (120, 100, 255),
            "NO Safety Shoes": (140, 120, 255),
            "no_shoes": (140, 120, 255),
            # Default
            "default": (128, 128, 128),
        }

    def _load_model(self):
        """Load YOLO model for PPE detection."""
        print("=" * 50)
        print("Initializing Video Stream PPE Detection")
        print("=" * 50)

        # Try to load custom PPE model
        if os.path.exists(self.model_path):
            print(f"Loading PPE model from: {self.model_path}")
            try:
                self.model = YOLO(self.model_path)
                self.class_names = self.model.names
                print(f"PPE Model loaded! Classes: {self.class_names}")
            except Exception as e:
                print(f"Error loading PPE model: {e}")
                self.model = None
        else:
            print(f"PPE model not found at: {self.model_path}")

        # Fallback to YOLOv8n
        if self.model is None:
            print("Loading YOLOv8n as fallback...")
            try:
                self.model = YOLO("yolov8n.pt")
                self.class_names = self.model.names
                print("YOLOv8n loaded successfully (limited PPE detection)")
            except Exception as e:
                print(f"Error loading YOLOv8n: {e}")

        print("=" * 50)

    def _normalize_label(self, label: str) -> str:
        """Normalize label names to standard format."""
        label_lower = label.lower().strip().replace("-", "_").replace(" ", "_")

        # Check if this is a "missing PPE" detection
        is_missing = any(label_lower.startswith(prefix) for prefix in MISSING_PPE_PREFIXES)

        # Strip the "no_" prefix for matching
        check_label = label_lower
        for prefix in ["no_", "without_", "missing_"]:
            if check_label.startswith(prefix):
                check_label = check_label[len(prefix):]
                break

        # Check against known labels
        if check_label in HELMET_LABELS or any(h in check_label for h in ["helmet", "hardhat"]):
            return "NO Helmet" if is_missing else "Helmet"
        if check_label in VEST_LABELS or any(v in check_label for v in ["vest", "jacket"]):
            return "NO Vest" if is_missing else "Vest"
        if "goggles" in check_label or "glasses" in check_label:
            return "NO Goggles" if is_missing else "Goggles"
        if "glove" in check_label:
            return "NO Gloves" if is_missing else "Gloves"
        if "mask" in check_label:
            return "NO Mask" if is_missing else "Mask"
        if "shoes" in check_label or "boots" in check_label:
            return "NO Safety Shoes" if is_missing else "Safety Shoes"

        return label

    def _is_violation(self, label: str) -> bool:
        """Check if label indicates missing PPE."""
        label_lower = label.lower()
        return label.startswith("NO ") or label_lower.startswith("no_")

    def _process_frame(self, frame: np.ndarray) -> dict:
        """Process a single frame with YOLO detection."""
        detections = []
        violations = []

        if self.model is None:
            return {
                "detections": detections,
                "violations": violations,
                "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "compliant": True,
            }

        try:
            # Run YOLO inference
            results = self.model(
                frame,
                conf=CONFIDENCE_THRESHOLD,
                iou=NMS_IOU,
                verbose=False
            )[0]

            # Process detections
            for box in results.boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                confidence = float(box.conf[0])
                class_id = int(box.cls[0])

                # Get class name
                raw_label = self.class_names.get(class_id, f"class_{class_id}")
                label = self._normalize_label(raw_label)

                # Skip person detections
                if label.lower() == "person":
                    continue

                is_violation = self._is_violation(label)
                color = self.colors.get(label, self.colors.get(raw_label, self.colors["default"]))

                # Draw bounding box on frame
                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

                # Draw label background
                text = f"{label} {confidence:.2f}"
                (text_width, text_height), baseline = cv2.getTextSize(
                    text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 2
                )
                cv2.rectangle(
                    frame,
                    (x1, y1 - text_height - 10),
                    (x1 + text_width + 10, y1),
                    color,
                    -1,
                )

                # Draw text
                text_color = (255, 255, 255) if is_violation else (0, 0, 0)
                cv2.putText(
                    frame,
                    text,
                    (x1 + 5, y1 - 5),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.5,
                    text_color,
                    2,
                )

                detection = {
                    "label": label,
                    "confidence": confidence,
                    "bbox": [x1, y1, x2, y2],
                    "is_violation": is_violation,
                }
                detections.append(detection)

                if is_violation:
                    violations.append(detection)

        except Exception as e:
            print(f"Error in YOLO detection: {e}")

        # Add timestamp overlay
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cv2.putText(
            frame,
            timestamp,
            (10, 30),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (255, 255, 255),
            2,
        )

        # Add status indicator
        status_color = (0, 255, 0) if len(violations) == 0 else (0, 0, 255)
        status_text = "COMPLIANT" if len(violations) == 0 else f"{len(violations)} VIOLATION(S)"
        cv2.putText(
            frame,
            status_text,
            (10, 60),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            status_color,
            2,
        )

        return {
            "detections": detections,
            "violations": violations,
            "timestamp": timestamp,
            "compliant": len(violations) == 0,
        }

    def _capture_loop(self, video_source):
        """Main capture loop running in a separate thread."""
        cap = cv2.VideoCapture(video_source)

        if not cap.isOpened():
            print(f"Failed to open video source: {video_source}")
            self.is_running = False
            return

        # Set camera properties
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

        frame_delay = 1.0 / self.max_fps

        print(f"Video capture started with source: {video_source}")

        while not self.stop_event.is_set():
            ret, frame = cap.read()

            if not ret:
                print("Failed to read frame, retrying...")
                continue

            # Process frame with YOLO
            result = self._process_frame(frame)

            # Store latest
            self.latest_result = result
            self.latest_frame = frame.copy()

            # Encode frame as JPEG
            _, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            frame_base64 = base64.b64encode(buffer).decode("utf-8")

            # Put frame in queue (non-blocking)
            try:
                self.frame_queue.put_nowait({
                    "frame": frame_base64,
                    "result": result,
                })
            except:
                # Queue full, skip this frame
                pass

            # Trigger violation callback if needed
            if result["violations"] and self.on_violation_callback:
                self.on_violation_callback(result["violations"], frame_base64)

            # Control frame rate
            cv2.waitKey(int(frame_delay * 1000))

        cap.release()
        print("Video capture stopped")

    def start(self, video_source: int = 0) -> bool:
        """Start the video streaming pipeline."""
        if self.is_running:
            print("Pipeline already running")
            return True

        if self.model is None:
            print("No model loaded, cannot start")
            return False

        try:
            self.stop_event.clear()
            self.is_running = True

            # Start capture in a separate thread
            self._capture_thread = Thread(
                target=self._capture_loop,
                args=(video_source,),
                daemon=True
            )
            self._capture_thread.start()

            print(f"Video pipeline started with source: {video_source}")
            return True

        except Exception as e:
            print(f"Error starting pipeline: {e}")
            import traceback
            traceback.print_exc()
            self.is_running = False
            return False

    def stop(self) -> None:
        """Stop the video streaming pipeline."""
        if not self.is_running:
            return

        try:
            self.stop_event.set()
            self.is_running = False

            # Wait for thread to finish
            if hasattr(self, '_capture_thread') and self._capture_thread.is_alive():
                self._capture_thread.join(timeout=2.0)

            # Clear the queue
            while not self.frame_queue.empty():
                try:
                    self.frame_queue.get_nowait()
                except Empty:
                    break

            print("Video pipeline stopped")

        except Exception as e:
            print(f"Error stopping pipeline: {e}")

    def get_frame(self, timeout: float = 1.0) -> Optional[dict]:
        """Get the next frame from the queue."""
        try:
            return self.frame_queue.get(timeout=timeout)
        except Empty:
            return None

    def get_latest_frame(self) -> Optional[dict]:
        """Get the most recent frame without waiting."""
        if self.latest_frame is not None and self.latest_result is not None:
            _, buffer = cv2.imencode(
                ".jpg", self.latest_frame, [cv2.IMWRITE_JPEG_QUALITY, 80]
            )
            return {
                "frame": base64.b64encode(buffer).decode("utf-8"),
                "result": self.latest_result,
            }
        return None


# Global instance for the video processor
video_processor: Optional[VideoStreamProcessor] = None


def get_video_processor() -> VideoStreamProcessor:
    """Get or create the global video processor instance."""
    global video_processor
    if video_processor is None:
        video_processor = VideoStreamProcessor()
    return video_processor
