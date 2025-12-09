"""
Main FastAPI application for PPE detection, face recognition, and attendance system.
With Role-Based Access Control (RBAC) for mine safety management.
"""
import os
import base64
from io import BytesIO
from datetime import datetime, timedelta
from typing import Optional, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from bson import ObjectId
from dotenv import load_dotenv

from detector import PersonDetector
from database import connect_to_mongodb, close_mongodb_connection, get_database
from auth import (
    get_password_hash, verify_password, create_access_token,
    get_current_user, get_current_admin, verify_token, UserRole
)
from schemas import (
    EmployeeCreate, EmployeeResponse, AttendanceRecord,
    PPEViolation, AdminLogin, DashboardStats, ShiftType
)

# Import route modules
from routes.auth import router as auth_router
from routes.users import router as users_router
from routes.workers import router as workers_router
from routes.mines import router as mines_router
from routes.gate_entries import router as gate_entries_router
from routes.alerts import router as alerts_router
from routes.dashboards import router as dashboards_router
from routes.gas_sensors import router as gas_sensors_router

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    await connect_to_mongodb()
    await initialize_default_superadmin()
    yield
    await close_mongodb_connection()


app = FastAPI(
    title="Mine Safety PPE & Attendance System API",
    description="Role-based access control system for mine safety management with PPE detection",
    version="2.0.0",
    lifespan=lifespan
)

# Enable CORS for frontend - allow all origins for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,  # Must be False when using "*"
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
)


# Custom exception handler to ensure CORS headers on errors
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc: HTTPException):
    """Handle HTTP exceptions with CORS headers."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers={"Access-Control-Allow-Origin": "*"}
    )


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Handle all exceptions and ensure CORS headers are included."""
    import traceback
    print(f"Unhandled exception: {exc}")
    traceback.print_exc()

    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
        headers={"Access-Control-Allow-Origin": "*"}
    )

# Initialize detector
detector = PersonDetector()


async def initialize_default_superadmin():
    """Create default super admin if none exists."""
    db = get_database()

    # Check if any super admin exists
    admin = await db.users.find_one({"role": UserRole.SUPER_ADMIN.value})
    if not admin:
        default_password = os.getenv("ADMIN_PASSWORD", "admin123")
        await db.users.insert_one({
            "username": "superadmin",
            "password_hash": get_password_hash(default_password),
            "full_name": "System Administrator",
            "email": "admin@system.local",
            "role": UserRole.SUPER_ADMIN.value,
            "is_active": True,
            "created_at": datetime.utcnow()
        })
        print("Default super admin created (username: superadmin)")


# ==================== Include Route Modules ====================

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(workers_router)
app.include_router(mines_router)
app.include_router(gate_entries_router)
app.include_router(alerts_router)
app.include_router(dashboards_router)
app.include_router(gas_sensors_router)


# ==================== Health Check ====================

@app.get("/")
def root():
    return {
        "message": "Mine Safety PPE & Attendance System API",
        "version": "2.0.0",
        "status": "running",
        "features": [
            "Role-based access control (6 roles)",
            "Mine/Zone/Gate management",
            "PPE detection at gates",
            "Real-time compliance monitoring",
            "Worker management with compliance scores",
            "Alert and warning system",
            "Role-specific dashboards"
        ]
    }


@app.get("/health")
def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}


@app.get("/api/roles")
def get_roles():
    """Get available roles and their descriptions."""
    return {
        "roles": [
            {
                "value": UserRole.SUPER_ADMIN.value,
                "label": "Super Admin",
                "description": "Full system access, manages all configurations"
            },
            {
                "value": UserRole.GENERAL_MANAGER.value,
                "label": "General Manager",
                "description": "Organization-wide view, KPIs, regulatory compliance"
            },
            {
                "value": UserRole.AREA_SAFETY_OFFICER.value,
                "label": "Area Safety Officer",
                "description": "Oversees multiple mines, comparison analytics"
            },
            {
                "value": UserRole.MANAGER.value,
                "label": "Manager",
                "description": "Mine-level management, shift performance, approvals"
            },
            {
                "value": UserRole.SAFETY_OFFICER.value,
                "label": "Safety Officer",
                "description": "Safety enforcement, compliance analytics, PPE rules"
            },
            {
                "value": UserRole.SHIFT_INCHARGE.value,
                "label": "Shift Incharge",
                "description": "Live gate monitoring, entry overrides, shift reports"
            },
            {
                "value": UserRole.WORKER.value,
                "label": "Worker",
                "description": "Personal compliance, violations, shift timing"
            },
        ]
    }


@app.get("/api/shifts")
def get_shifts():
    """Get shift definitions."""
    return {
        "shifts": [
            {
                "value": ShiftType.DAY.value,
                "label": "Day Shift",
                "start_time": "06:00",
                "end_time": "14:00"
            },
            {
                "value": ShiftType.AFTERNOON.value,
                "label": "Afternoon Shift",
                "start_time": "14:00",
                "end_time": "22:00"
            },
            {
                "value": ShiftType.NIGHT.value,
                "label": "Night Shift",
                "start_time": "22:00",
                "end_time": "06:00"
            },
        ]
    }


# ==================== Legacy Endpoints (for backward compatibility) ====================

@app.post("/detect")
async def detect(
    file: UploadFile = File(...),
    mark_attendance: bool = Form(default=True),
    location: Optional[str] = Form(default=None)
):
    """
    Upload an image and detect:
    - PPE equipment (helmet, vest, etc.)
    - Faces and identify known persons
    - Mark attendance if face is recognized (optional)
    """
    try:
        contents = await file.read()
        result_image, detections = detector.process_image(contents)

        buffered = BytesIO()
        result_image.save(buffered, format="PNG")
        img_base64 = base64.b64encode(buffered.getvalue()).decode()

        attendance_marked = False
        attendance_record = None
        db = get_database()

        # Mark attendance if face is identified and mark_attendance is True
        if mark_attendance:
            identified_persons = detections.get("summary", {}).get("identified_persons", [])
            identified_names = detections.get("summary", {}).get("identified_names", [])

            if identified_persons:
                employee_id = identified_persons[0]
                employee_name = identified_names[0] if identified_names else None

                # Try to find worker
                worker = await db.workers.find_one({"employee_id": employee_id})
                if not worker:
                    worker = await db.employees.find_one({"employee_id": employee_id})

                if worker:
                    employee_name = worker.get("name", employee_name)

                # Get violations from detection
                violations = detections.get("violations", [])
                violation_labels = [v.get("label", "Unknown") for v in violations]

                # Create attendance record
                attendance_doc = {
                    "employee_id": employee_id,
                    "employee_name": employee_name,
                    "worker_id": str(worker["_id"]) if worker and "_id" in worker else None,
                    "type": "check_in",
                    "timestamp": datetime.utcnow(),
                    "date": datetime.utcnow().strftime("%Y-%m-%d"),
                    "location": location,
                    "ppe_compliant": len(violations) == 0,
                    "violations": violation_labels,
                    "image": f"data:image/png;base64,{img_base64}"
                }

                await db.attendance.insert_one(attendance_doc)
                attendance_marked = True
                attendance_record = {
                    "employee_id": employee_id,
                    "employee_name": employee_name,
                    "timestamp": attendance_doc["timestamp"].isoformat(),
                    "ppe_compliant": attendance_doc["ppe_compliant"],
                    "violations": violation_labels
                }

        return JSONResponse({
            "success": True,
            "image": f"data:image/png;base64,{img_base64}",
            "detections": detections,
            "attendance_marked": attendance_marked,
            "attendance": attendance_record
        })
    except Exception as e:
        return JSONResponse({
            "success": False,
            "error": str(e)
        }, status_code=500)


@app.post("/detect-and-log")
async def detect_and_log(
    file: UploadFile = File(...),
    log_violations: bool = Form(default=True),
    mark_attendance: bool = Form(default=True),
    location: Optional[str] = Form(default=None)
):
    """
    Detect PPE and faces, automatically log violations and mark attendance.
    """
    try:
        contents = await file.read()
        result_image, detections = detector.process_image(contents)

        buffered = BytesIO()
        result_image.save(buffered, format="PNG")
        img_base64 = base64.b64encode(buffered.getvalue()).decode()

        violations_logged = False
        attendance_marked = False
        attendance_record = None
        db = get_database()

        # Get identified person info
        identified_persons = detections.get("summary", {}).get("identified_persons", [])
        identified_names = detections.get("summary", {}).get("identified_names", [])
        employee_id = identified_persons[0] if identified_persons else None
        employee_name = identified_names[0] if identified_names else None
        worker = None
        worker_id = None

        if employee_id:
            # Try workers collection first
            worker = await db.workers.find_one({"employee_id": employee_id})
            if worker:
                employee_name = worker["name"]
                worker_id = str(worker["_id"])
            else:
                # Fall back to employees collection
                emp = await db.employees.find_one({"employee_id": employee_id})
                if emp:
                    employee_name = emp["name"]
                    worker_id = str(emp["_id"])

        # Get violations
        violations = detections.get("violations", [])
        violation_labels = [v.get("label", "Unknown") for v in violations]

        # Log violations if any exist and logging is enabled
        if log_violations and violations:
            violation_record = {
                "employee_id": employee_id,
                "employee_name": employee_name,
                "worker_id": worker_id,
                "violations": violations,
                "timestamp": datetime.utcnow(),
                "location": location,
                "image": f"data:image/png;base64,{img_base64}"
            }

            await db.ppe_violations.insert_one(violation_record)
            violations_logged = True

        # Mark attendance if face is identified
        if mark_attendance and employee_id:
            attendance_doc = {
                "employee_id": employee_id,
                "employee_name": employee_name,
                "worker_id": worker_id,
                "type": "check_in",
                "timestamp": datetime.utcnow(),
                "date": datetime.utcnow().strftime("%Y-%m-%d"),
                "location": location,
                "ppe_compliant": len(violations) == 0,
                "violations": violation_labels,
                "image": f"data:image/png;base64,{img_base64}"
            }

            await db.attendance.insert_one(attendance_doc)
            attendance_marked = True
            attendance_record = {
                "employee_id": employee_id,
                "employee_name": employee_name,
                "timestamp": attendance_doc["timestamp"].isoformat(),
                "ppe_compliant": attendance_doc["ppe_compliant"],
                "violations": violation_labels
            }

        return JSONResponse({
            "success": True,
            "image": f"data:image/png;base64,{img_base64}",
            "detections": detections,
            "violations_logged": violations_logged,
            "attendance_marked": attendance_marked,
            "attendance": attendance_record
        })
    except Exception as e:
        return JSONResponse({
            "success": False,
            "error": str(e)
        }, status_code=500)


# ==================== Legacy Employee Management ====================

@app.post("/employees")
async def create_employee(
    name: str = Form(...),
    employee_id: str = Form(...),
    department: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(default=None),
    current_admin: dict = Depends(get_current_admin)
):
    """Create a new employee (legacy endpoint)."""
    db = get_database()

    existing = await db.employees.find_one({"employee_id": employee_id})
    if existing:
        raise HTTPException(status_code=400, detail="Worker ID already exists.")

    employee_data = {
        "name": name,
        "employee_id": employee_id,
        "department": department,
        "created_at": datetime.utcnow(),
        "face_registered": False
    }

    if file and file.filename:
        contents = await file.read()
        if contents:
            success = detector.register_face(employee_id, contents)
            if success:
                employee_data["face_registered"] = True
            else:
                raise HTTPException(status_code=400, detail="No face detected in the uploaded image.")

    result = await db.employees.insert_one(employee_data)

    return {
        "success": True,
        "employee": {
            "id": str(result.inserted_id),
            "name": name,
            "employee_id": employee_id,
            "department": department,
            "created_at": employee_data["created_at"].isoformat(),
            "face_registered": employee_data["face_registered"]
        },
        "message": f"Worker {name} registered successfully"
    }


@app.get("/employees")
async def list_employees(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    search: Optional[str] = None
):
    """List all employees (legacy endpoint)."""
    db = get_database()

    query = {}
    if search:
        query = {
            "$or": [
                {"name": {"$regex": search, "$options": "i"}},
                {"employee_id": {"$regex": search, "$options": "i"}},
                {"department": {"$regex": search, "$options": "i"}}
            ]
        }

    cursor = db.employees.find(query).skip(skip).limit(limit).sort("name", 1)
    employees = []
    async for emp in cursor:
        employees.append({
            "id": str(emp["_id"]),
            "name": emp["name"],
            "employee_id": emp["employee_id"],
            "department": emp.get("department"),
            "created_at": emp["created_at"],
            "face_registered": emp.get("face_registered", False)
        })

    total = await db.employees.count_documents(query)

    return {"employees": employees, "total": total}


@app.get("/employees/{employee_id}")
async def get_employee(employee_id: str):
    """Get employee details (legacy endpoint)."""
    db = get_database()
    emp = await db.employees.find_one({"employee_id": employee_id})

    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    return {
        "id": str(emp["_id"]),
        "name": emp["name"],
        "employee_id": emp["employee_id"],
        "department": emp.get("department"),
        "created_at": emp["created_at"],
        "face_registered": emp.get("face_registered", False)
    }


@app.delete("/employees/{employee_id}")
async def delete_employee(
    employee_id: str,
    current_admin: dict = Depends(get_current_admin)
):
    """Delete an employee (legacy endpoint)."""
    db = get_database()

    result = await db.employees.delete_one({"employee_id": employee_id})

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Employee not found")

    if employee_id in detector.known_faces:
        del detector.known_faces[employee_id]
        detector._save_known_faces()

    return {"success": True, "message": "Employee deleted successfully"}


# ==================== Legacy Violations ====================

@app.get("/violations")
async def list_violations(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100)
):
    """List all PPE violations (legacy endpoint)."""
    db = get_database()

    cursor = db.ppe_violations.find().skip(skip).limit(limit).sort("timestamp", -1)
    violations = []
    async for v in cursor:
        violations.append({
            "id": str(v["_id"]),
            "employee_id": v.get("employee_id"),
            "employee_name": v.get("employee_name"),
            "violations": v.get("violations", []),
            "timestamp": v.get("timestamp"),
            "location": v.get("location")
        })

    total = await db.ppe_violations.count_documents({})
    return {"violations": violations, "total": total}


@app.get("/violations/today")
async def get_today_violations():
    """Get today's PPE violations (legacy endpoint)."""
    db = get_database()

    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow = today + timedelta(days=1)

    cursor = db.ppe_violations.find({
        "timestamp": {"$gte": today, "$lt": tomorrow}
    }).sort("timestamp", -1)

    violations = []
    async for v in cursor:
        violations.append({
            "id": str(v["_id"]),
            "employee_id": v.get("employee_id"),
            "employee_name": v.get("employee_name"),
            "violations": v.get("violations", []),
            "timestamp": v.get("timestamp"),
            "location": v.get("location")
        })

    return {"violations": violations, "total": len(violations)}


# ==================== Legacy Dashboard ====================

@app.get("/dashboard/stats")
async def get_dashboard_stats():
    """Get dashboard statistics (legacy endpoint)."""
    db = get_database()

    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow = today + timedelta(days=1)
    week_ago = today - timedelta(days=7)

    # Total employees (from both collections)
    total_employees = await db.employees.count_documents({})
    total_workers = await db.workers.count_documents({"is_active": True})
    total_all = total_employees + total_workers

    # Present today
    today_str = today.strftime("%Y-%m-%d")
    present_pipeline = [
        {"$match": {"date": today_str, "type": "check_in"}},
        {"$group": {"_id": "$employee_id"}}
    ]
    present_cursor = db.attendance.aggregate(present_pipeline)
    present_today = len([x async for x in present_cursor])

    # Gate entries today
    gate_entries_today = await db.gate_entries.count_documents({
        "timestamp": {"$gte": today, "$lt": tomorrow},
        "entry_type": "entry"
    })

    # Violations today
    violations_today = await db.ppe_violations.count_documents({
        "timestamp": {"$gte": today, "$lt": tomorrow}
    })
    gate_violations_today = await db.gate_entries.count_documents({
        "timestamp": {"$gte": today, "$lt": tomorrow},
        "violations": {"$ne": []}
    })

    # Violations this week
    violations_week = await db.ppe_violations.count_documents({
        "timestamp": {"$gte": week_ago}
    })

    # Compliance rate
    total_checks_week = gate_entries_today + await db.attendance.count_documents({
        "timestamp": {"$gte": week_ago}
    })
    compliance_rate = 100.0
    if total_checks_week > 0:
        compliance_rate = max(0, 100 - ((violations_week + gate_violations_today) / total_checks_week * 100))

    return {
        "total_employees": total_all,
        "present_today": present_today + gate_entries_today,
        "absent_today": max(0, total_all - present_today - gate_entries_today),
        "violations_today": violations_today + gate_violations_today,
        "violations_this_week": violations_week,
        "compliance_rate": round(compliance_rate, 1),
    }


# ==================== Legacy Face Registration ====================

@app.post("/register-face")
async def register_face(name: str, file: UploadFile = File(...)):
    """Register a new face for recognition (legacy endpoint)."""
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
