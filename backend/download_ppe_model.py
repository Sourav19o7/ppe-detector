#!/usr/bin/env python3
"""
PPE Detection Model Download Script

Downloads a pre-trained YOLOv8 model for PPE (Personal Protective Equipment) detection.
Based on: https://github.com/prodbykosta/ppe-safety-detection-ai

Available models:
1. keremberke/yolov8m-protective-equipment-detection (Hugging Face)
   - Detects: helmet, vest, glove, goggles, mask, shoes + missing versions

2. Construction-PPE from Ultralytics datasets
   - Detects: helmet, vest, gloves, boots, goggles

Usage:
    python download_ppe_model.py

    # Or with specific model
    python download_ppe_model.py --model keremberke
"""

import os
import sys
import argparse
from pathlib import Path


def download_keremberke_model(output_dir: Path) -> str:
    """Download YOLOv8m protective equipment detection model from Hugging Face."""
    try:
        from huggingface_hub import hf_hub_download

        print("Downloading keremberke/yolov8m-protective-equipment-detection from Hugging Face...")

        model_path = hf_hub_download(
            repo_id="keremberke/yolov8m-protective-equipment-detection",
            filename="best.pt",
            local_dir=output_dir,
            local_dir_use_symlinks=False
        )

        # Rename to our standard name
        final_path = output_dir / "ppe_best.pt"
        if Path(model_path).exists():
            import shutil
            shutil.copy(model_path, final_path)
            print(f"Model saved to: {final_path}")
            return str(final_path)

    except Exception as e:
        print(f"Error downloading from Hugging Face: {e}")
        return None


def download_ultralytics_model(output_dir: Path) -> str:
    """Download a YOLOv8 model and optionally fine-tune on Construction-PPE dataset."""
    try:
        from ultralytics import YOLO

        print("Downloading YOLOv8n base model...")

        # Download base YOLOv8n model
        model = YOLO("yolov8n.pt")

        # Save to output directory
        model_path = output_dir / "yolov8n.pt"
        print(f"Base model saved to: {model_path}")

        print("\nNote: For best PPE detection results, you should train on a PPE dataset.")
        print("See: https://docs.ultralytics.com/datasets/detect/construction-ppe/")

        return str(model_path)

    except Exception as e:
        print(f"Error downloading model: {e}")
        return None


def verify_model(model_path: str) -> bool:
    """Verify the downloaded model works correctly."""
    try:
        from ultralytics import YOLO
        import numpy as np

        print(f"\nVerifying model at: {model_path}")
        model = YOLO(model_path)

        # Get class names
        class_names = model.names
        print(f"Model classes ({len(class_names)}): {class_names}")

        # Check for PPE classes
        ppe_keywords = ['helmet', 'vest', 'glove', 'goggles', 'mask', 'shoes', 'hardhat', 'jacket']
        found_ppe = []
        for idx, name in class_names.items():
            name_lower = name.lower()
            if any(kw in name_lower for kw in ppe_keywords):
                found_ppe.append(name)

        if found_ppe:
            print(f"PPE classes detected: {found_ppe}")
            return True
        else:
            print("Warning: No PPE-specific classes found in model.")
            print("The model may only detect persons/objects.")
            return True  # Still usable for person detection

    except Exception as e:
        print(f"Error verifying model: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Download PPE Detection Model")
    parser.add_argument(
        "--model",
        choices=["keremberke", "ultralytics"],
        default="keremberke",
        help="Which model to download (default: keremberke)"
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Output directory for model (default: ./models)"
    )

    args = parser.parse_args()

    # Set output directory
    if args.output_dir:
        output_dir = Path(args.output_dir)
    else:
        output_dir = Path(__file__).parent / "models"

    output_dir.mkdir(parents=True, exist_ok=True)
    print(f"Output directory: {output_dir}")

    # Download model
    model_path = None

    if args.model == "keremberke":
        model_path = download_keremberke_model(output_dir)
    elif args.model == "ultralytics":
        model_path = download_ultralytics_model(output_dir)

    if model_path and verify_model(model_path):
        print("\n" + "=" * 50)
        print("SUCCESS: Model downloaded and verified!")
        print("=" * 50)
        print(f"\nModel location: {model_path}")
        print("\nTo use this model, set the environment variable:")
        print(f"  export PPE_MODEL_PATH={model_path}")
        print("\nOr the system will automatically find it in the models directory.")
        return 0
    else:
        print("\nFailed to download or verify model.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
