"""
Main FastAPI application for PPE detection and face recognition.
"""
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import base64
from io import BytesIO

from detector import PersonDetector

app = FastAPI(title="PPE & Person Detection API")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize detector
detector = PersonDetector()


@app.get("/")
def root():
    return {"message": "PPE & Person Detection API", "status": "running"}


@app.post("/detect")
async def detect(file: UploadFile = File(...)):
    """
    Upload an image and detect:
    - PPE equipment (helmet, vest, etc.)
    - Faces and identify known persons
    """
    try:
        # Read image
        contents = await file.read()

        # Run detection
        result_image, detections = detector.process_image(contents)

        # Convert result image to base64
        buffered = BytesIO()
        result_image.save(buffered, format="PNG")
        img_base64 = base64.b64encode(buffered.getvalue()).decode()

        return JSONResponse({
            "success": True,
            "image": f"data:image/png;base64,{img_base64}",
            "detections": detections
        })
    except Exception as e:
        return JSONResponse({
            "success": False,
            "error": str(e)
        }, status_code=500)


@app.post("/register-face")
async def register_face(name: str, file: UploadFile = File(...)):
    """
    Register a new face for recognition.
    """
    try:
        contents = await file.read()
        success = detector.register_face(name, contents)

        if success:
            return {"success": True, "message": f"Face registered for {name}"}
        else:
            return {"success": False, "message": "No face detected in image"}
    except Exception as e:
        return JSONResponse({
            "success": False,
            "error": str(e)
        }, status_code=500)


@app.get("/known-faces")
def get_known_faces():
    """Get list of registered faces."""
    return {"faces": detector.get_known_faces()}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
