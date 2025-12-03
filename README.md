# PPE & Person Detection Application

A simple application that detects safety gear (PPE) and identifies people in uploaded photos.

## Features

- **PPE Detection**: Detects helmets, vests, goggles, gloves, masks, safety shoes using two YOLOv8 models
- **Violation Detection**: Identifies missing PPE (no helmet, no goggles, etc.)
- **Face Detection**: Detects faces in images
- **Face Recognition**: Identifies known individuals (register faces first)
- **Visual Output**: Color-coded bounding boxes (green = PPE worn, red = missing)

## Project Structure

```
person-detector/
├── backend/
│   ├── main.py          # FastAPI server
│   ├── detector.py      # Detection logic
│   └── requirements.txt # Python dependencies
├── frontend/
│   └── index.html       # Web interface
├── known_faces/         # Stored face embeddings
└── README.md
```

## Models Used

1. **PPE Detection Model 1**: [keremberke/yolov8m-protective-equipment-detection](https://huggingface.co/keremberke/yolov8m-protective-equipment-detection)
   - Detects: helmet, goggles, glove, mask, shoes
   - Also detects missing: no_helmet, no_goggles, no_glove, no_mask, no_shoes

2. **PPE Detection Model 2**: [Tanishjain9/yolov8n-ppe-detection-6classes](https://huggingface.co/Tanishjain9/yolov8n-ppe-detection-6classes)
   - Detects: Helmet, Vest, Goggles, Gloves, Mask, Safety Shoe

3. **Face Detection**: [arnabdhar/YOLOv8-Face-Detection](https://huggingface.co/arnabdhar/YOLOv8-Face-Detection)

4. **Face Recognition**: FaceNet (via facenet-pytorch)

## Setup

### Backend

```bash
cd backend

# Create virtual environment with Python 3.10
/opt/homebrew/opt/python@3.10/bin/python3.10 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the server
python main.py
```

The API will be available at `http://localhost:8000`

### Frontend

Simply open `frontend/index.html` in a web browser, or serve it:

```bash
cd frontend
python -m http.server 3000
```

Then visit `http://localhost:3000`

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check |
| `/detect` | POST | Upload image for PPE and face detection |
| `/register-face` | POST | Register a new face (name + image) |
| `/known-faces` | GET | List all registered faces |

## Usage

1. **Start the backend server**
2. **Open the frontend in a browser**
3. **Detect PPE**: Upload an image to detect safety gear
4. **Register Faces** (optional): Register people's faces for identification
5. **View Results**: See annotated image with bounding boxes and detection summary

## Detection Labels

| Label | Color | Meaning |
|-------|-------|---------|
| Helmet, Vest, Goggles, etc. | Green | PPE detected (worn) |
| NO Helmet, NO Goggles, etc. | Red | Missing PPE (violation) |
| Face | Yellow | Detected face (with name if recognized) |

## Notes

- First run will download models from HuggingFace (~200MB)
- Face recognition requires registering faces first
- GPU (CUDA) is used if available for faster inference
- Use Python 3.10 (Python 3.14 is not yet supported by all packages)
