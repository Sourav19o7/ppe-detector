"""
Video streaming module using Roboflow InferencePipeline for real-time PPE detection.
Streams annotated video frames with bounding boxes via WebSocket.
"""
import asyncio
import base64
import cv2
import numpy as np
from typing import Optional, Callable
from datetime import datetime
from threading import Thread, Event
from queue import Queue, Empty

try:
    from inference import InferencePipeline
    INFERENCE_PIPELINE_AVAILABLE = True
except ImportError:
    INFERENCE_PIPELINE_AVAILABLE = False
    print("Warning: inference package not installed. Install with: pip install inference")


class VideoStreamProcessor:
    """Handles real-time video streaming with PPE detection using Roboflow InferencePipeline."""

    def __init__(
        self,
        api_key: str = "e96XmSjaw1rrek7TBBxu",
        model_id: str = "ppe-0.3-urmh4/1",
        max_fps: int = 15,
    ):
        self.api_key = api_key
        self.model_id = model_id
        self.max_fps = max_fps

        self.pipeline: Optional[InferencePipeline] = None
        self.is_running = False
        self.stop_event = Event()

        # Queue for frames to send to clients
        self.frame_queue: Queue = Queue(maxsize=30)

        # Latest detection results
        self.latest_result = None
        self.latest_frame = None

        # Callbacks for events
        self.on_violation_callback: Optional[Callable] = None

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
            # Violations (red shades)
            "NO Helmet": (0, 0, 255),
            "NO Vest": (0, 60, 255),
            "NO Goggles": (80, 50, 255),
            "NO Gloves": (100, 80, 255),
            "NO Mask": (120, 100, 255),
            "NO Safety Shoes": (140, 120, 255),
            # Default
            "default": (128, 128, 128),
        }

    def _normalize_label(self, label: str) -> str:
        """Normalize label names from Roboflow model."""
        label_lower = label.lower().strip()

        # Positive PPE detections
        if label_lower in ["helmet", "hardhat", "hard hat", "hard-hat"]:
            return "Helmet"
        if label_lower in ["vest", "safety vest", "safety-vest", "hi-vis", "high-vis"]:
            return "Vest"
        if label_lower in ["goggles", "safety goggles", "glasses", "safety glasses"]:
            return "Goggles"
        if label_lower in ["gloves", "glove", "safety gloves"]:
            return "Gloves"
        if label_lower in ["mask", "face mask", "dust mask", "respirator"]:
            return "Mask"
        if label_lower in ["shoes", "safety shoes", "safety shoe", "boots", "safety boots"]:
            return "Safety Shoes"

        # Missing PPE violations
        if label_lower in ["no helmet", "no-helmet", "no_helmet", "missing helmet"]:
            return "NO Helmet"
        if label_lower in ["no vest", "no-vest", "no_vest", "missing vest"]:
            return "NO Vest"
        if label_lower in ["no goggles", "no-goggles", "no_goggles"]:
            return "NO Goggles"
        if label_lower in ["no gloves", "no-gloves", "no_gloves", "no glove"]:
            return "NO Gloves"
        if label_lower in ["no mask", "no-mask", "no_mask"]:
            return "NO Mask"
        if label_lower in ["no shoes", "no-shoes", "no_shoes", "no safety shoes"]:
            return "NO Safety Shoes"

        return label

    def _is_violation(self, label: str) -> bool:
        """Check if label indicates missing PPE."""
        return label.startswith("NO ")

    def _process_prediction(self, result: dict, video_frame) -> None:
        """Process each prediction from the pipeline and draw bounding boxes."""
        try:
            # Get the frame as numpy array
            if hasattr(video_frame, 'numpy_image'):
                frame = video_frame.numpy_image.copy()
            elif hasattr(video_frame, 'image'):
                frame = np.array(video_frame.image).copy()
            else:
                frame = video_frame.copy() if isinstance(video_frame, np.ndarray) else None

            if frame is None:
                return

            # Check if there's an output image with annotations already
            if result.get("output_image"):
                if hasattr(result["output_image"], 'numpy_image'):
                    frame = result["output_image"].numpy_image.copy()
                elif isinstance(result["output_image"], np.ndarray):
                    frame = result["output_image"].copy()

            detections = []
            violations = []

            # Parse predictions from result
            predictions = result.get("predictions", result.get("output", []))

            if isinstance(predictions, dict) and "predictions" in predictions:
                predictions = predictions["predictions"]

            if isinstance(predictions, list):
                for pred in predictions:
                    if not isinstance(pred, dict):
                        continue

                    # Extract bounding box
                    x = pred.get("x", 0)
                    y = pred.get("y", 0)
                    width = pred.get("width", 0)
                    height = pred.get("height", 0)

                    x1 = int(x - width / 2)
                    y1 = int(y - height / 2)
                    x2 = int(x + width / 2)
                    y2 = int(y + height / 2)

                    raw_label = pred.get("class", pred.get("label", "unknown"))
                    label = self._normalize_label(raw_label)
                    confidence = pred.get("confidence", 0.0)

                    # Skip person detections
                    if label.lower() == "person":
                        continue

                    # Skip glasses/goggles detections
                    if label == "Goggles":
                        continue

                    is_violation = self._is_violation(label)
                    color = self.colors.get(label, self.colors["default"])

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

            # Store latest result
            self.latest_result = {
                "detections": detections,
                "violations": violations,
                "timestamp": timestamp,
                "compliant": len(violations) == 0,
            }
            self.latest_frame = frame

            # Encode frame as JPEG and add to queue
            _, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            frame_base64 = base64.b64encode(buffer).decode("utf-8")

            # Put frame in queue (non-blocking)
            try:
                self.frame_queue.put_nowait({
                    "frame": frame_base64,
                    "result": self.latest_result,
                })
            except:
                # Queue full, skip this frame
                pass

            # Trigger violation callback if needed
            if violations and self.on_violation_callback:
                self.on_violation_callback(violations, frame_base64)

        except Exception as e:
            print(f"Error processing prediction: {e}")
            import traceback
            traceback.print_exc()

    def _run_pipeline(self):
        """Run the pipeline in a background thread."""
        try:
            self.pipeline.start()
            self.pipeline.join()  # Wait for the pipeline to finish
        except Exception as e:
            print(f"Pipeline error: {e}")
        finally:
            self.is_running = False
            print("Pipeline thread ended")

    def start(self, video_source: int = 0) -> bool:
        """Start the video streaming pipeline."""
        if not INFERENCE_PIPELINE_AVAILABLE:
            print("InferencePipeline not available")
            return False

        if self.is_running:
            print("Pipeline already running")
            return True

        try:
            self.stop_event.clear()

            # Initialize the pipeline with model_id
            self.pipeline = InferencePipeline.init(
                model_id=self.model_id,
                api_key=self.api_key,
                video_reference=video_source,
                max_fps=self.max_fps,
                on_prediction=self._process_prediction,
            )

            # Start pipeline in a separate thread (non-blocking)
            self.is_running = True
            self._pipeline_thread = Thread(target=self._run_pipeline, daemon=True)
            self._pipeline_thread.start()

            print(f"Video pipeline started with model: {self.model_id}, source: {video_source}")
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

            if self.pipeline:
                self.pipeline.terminate()
                self.pipeline.join()
                self.pipeline = None

            self.is_running = False

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
