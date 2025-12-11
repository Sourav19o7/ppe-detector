"""
Smart Helmet Service - Serial Reader and Data Processing
Reads sensor data from ESP32 helmet via serial port and provides REST API access.
"""
import serial
import asyncio
import re
import random
from datetime import datetime
from typing import Dict, Optional, Any
from database import get_database

# ================= CONFIGURATION =================
SERIAL_PORT = "COM5"  # Change to your ESP32 port
BAUD_RATE = 115200
SERIAL_ENABLED = True  # Set to False to use mock data for testing

# ================= GLOBAL STATE =================
# Store latest readings per helmet/worker
latest_helmet_data: Dict[str, Dict[str, Any]] = {}

# Worker ID to Name mapping for demo helmets
DEMO_WORKER_NAMES = {
    "worker_1": "Stavan Sheth",
    "worker_2": "Tanush Maloo",
}

# For faking heart rate and SpO2 oscillation
_fake_hr_direction = 1
_fake_hr_value = 90
_fake_spo2_direction = 1
_fake_spo2_value = 91.0

# ================= ALERT THRESHOLDS =================
THRESHOLDS = {
    "methane_ppm": {"high": 4000, "severity": "critical"},
    "battery_voltage": {"low": 3.32, "severity": "high"},
    "heart_rate_low": {"low": 50, "severity": "medium"},
    "heart_rate_high": {"high": 120, "severity": "medium"},
    "spo2": {"low": 90, "severity": "high"},
}


def get_fake_vitals() -> tuple:
    """
    Generate fake heart rate and SpO2 values that oscillate.
    Heart rate: oscillates between 88-94 BPM
    SpO2: oscillates between 90.0-92.5%
    """
    global _fake_hr_direction, _fake_hr_value, _fake_spo2_direction, _fake_spo2_value

    # Heart rate oscillation (88-94)
    _fake_hr_value += _fake_hr_direction * random.randint(1, 2)
    if _fake_hr_value >= 94:
        _fake_hr_direction = -1
    elif _fake_hr_value <= 88:
        _fake_hr_direction = 1

    # SpO2 oscillation (90.0-92.5)
    _fake_spo2_value += _fake_spo2_direction * random.uniform(0.1, 0.3)
    if _fake_spo2_value >= 92.5:
        _fake_spo2_direction = -1
    elif _fake_spo2_value <= 90.0:
        _fake_spo2_direction = 1

    return _fake_hr_value, round(_fake_spo2_value, 1)


def parse_arduino_array(arr: list) -> Optional[Dict[str, Any]]:
    """
    Converts the raw integer list from Arduino into a named dictionary.
    Applies the math logic found in the Arduino code.
    """
    if len(arr) < 20:
        return None

    # Get fake vitals
    heart_rate, spo2 = get_fake_vitals()

    # Calculate battery voltage and check if low
    battery_voltage = round(arr[11] / 1000.0, 2)
    battery_low = battery_voltage < THRESHOLDS["battery_voltage"]["low"]

    # Get methane value
    methane_ppm = round(arr[9] / 10.0, 1)

    # Determine SOS status
    sos_active = arr[15] == 1

    # Determine severity
    severity = "normal"
    if sos_active:
        severity = "critical"
    elif methane_ppm > THRESHOLDS["methane_ppm"]["high"]:
        severity = "critical"
    elif battery_low:
        severity = "high"
    elif heart_rate < THRESHOLDS["heart_rate_low"]["low"] or heart_rate > THRESHOLDS["heart_rate_high"]["high"]:
        severity = "medium"
    elif spo2 < THRESHOLDS["spo2"]["low"]:
        severity = "high"

    data_dict = {
        # Motion data
        "accel_x": arr[0],
        "accel_y": arr[1],
        "accel_z": arr[2],
        "gyro_x": arr[3],
        "gyro_y": arr[4],
        "gyro_z": arr[5],

        # Orientation
        "roll": round(arr[6] / 100.0, 2),
        "pitch": round(arr[7] / 100.0, 2),
        "yaw": round(arr[8] / 100.0, 2),

        # Gas sensors
        "methane_ppm": methane_ppm,
        "co_raw": arr[19],

        # Power
        "battery_voltage": battery_voltage,
        "battery_low": battery_low,

        # FSR sensor
        "fsr_force": arr[12],
        "fsr_state": "Touch" if arr[13] == 2 else "None",

        # Status
        "system_state": arr[14],
        "sos_active": sos_active,
        "manual_override": arr[16] == 1,

        # Health vitals (faked)
        "heart_rate": heart_rate,
        "spo2": spo2,

        # Metadata
        "severity": severity,
        "timestamp": datetime.utcnow(),
    }

    return data_dict


async def check_and_store_alerts(worker_id: str, data: Dict[str, Any], db) -> bool:
    """
    Check if any thresholds are exceeded and store alert in database.
    Returns True if an alert was created.
    """
    alert_messages = []
    severity = "normal"

    # Check methane
    if data["methane_ppm"] > THRESHOLDS["methane_ppm"]["high"]:
        alert_messages.append(f"CRITICAL: Methane level {data['methane_ppm']} PPM exceeds threshold (4000 PPM)")
        severity = "critical"

    # Check SOS
    if data["sos_active"]:
        alert_messages.append(f"CRITICAL: SOS activated by worker")
        severity = "critical"

    # Check battery
    if data["battery_low"]:
        alert_messages.append(f"WARNING: Low battery ({data['battery_voltage']}V < 3.32V)")
        if severity == "normal":
            severity = "high"

    # Check SpO2
    if data["spo2"] < THRESHOLDS["spo2"]["low"]:
        alert_messages.append(f"WARNING: Low oxygen saturation ({data['spo2']}% < 90%)")
        if severity == "normal":
            severity = "high"

    # Check heart rate
    if data["heart_rate"] < THRESHOLDS["heart_rate_low"]["low"]:
        alert_messages.append(f"CAUTION: Low heart rate ({data['heart_rate']} BPM < 50)")
        if severity == "normal":
            severity = "medium"
    elif data["heart_rate"] > THRESHOLDS["heart_rate_high"]["high"]:
        alert_messages.append(f"CAUTION: High heart rate ({data['heart_rate']} BPM > 120)")
        if severity == "normal":
            severity = "medium"

    if alert_messages:
        # Store helmet reading in database (only when threshold exceeded)
        reading_doc = {
            "worker_id": worker_id,
            "timestamp": data["timestamp"],
            "severity": severity,
            **{k: v for k, v in data.items() if k not in ["timestamp", "severity"]}
        }
        reading_result = await db.helmet_readings.insert_one(reading_doc)

        # Create alert
        alert_doc = {
            "alert_type": "helmet_sensor",
            "severity": severity,
            "status": "active",
            "message": " | ".join(alert_messages),
            "worker_id": worker_id,
            "helmet_reading_id": reading_result.inserted_id,
            "created_at": datetime.utcnow(),
            "details": {
                "methane_ppm": data["methane_ppm"],
                "battery_voltage": data["battery_voltage"],
                "heart_rate": data["heart_rate"],
                "spo2": data["spo2"],
                "sos_active": data["sos_active"],
            }
        }
        await db.alerts.insert_one(alert_doc)
        return True

    return False


def get_mock_helmet_data(worker_id: str = "worker_1") -> Dict[str, Any]:
    """Generate mock helmet data for testing without hardware."""
    heart_rate, spo2 = get_fake_vitals()

    return {
        "worker_id": worker_id,
        "accel_x": random.randint(-100, 100),
        "accel_y": random.randint(-100, 100),
        "accel_z": random.randint(900, 1100),
        "gyro_x": random.randint(-50, 50),
        "gyro_y": random.randint(-50, 50),
        "gyro_z": random.randint(-50, 50),
        "roll": round(random.uniform(-5, 5), 2),
        "pitch": round(random.uniform(-5, 5), 2),
        "yaw": round(random.uniform(0, 360), 2),
        "methane_ppm": round(random.uniform(100, 500), 1),  # Normal range
        "co_raw": random.randint(50, 150),
        "battery_voltage": round(random.uniform(3.5, 4.2), 2),
        "battery_low": False,
        "fsr_force": random.randint(0, 100),
        "fsr_state": "None",
        "system_state": 1,
        "sos_active": False,
        "manual_override": False,
        "heart_rate": heart_rate,
        "spo2": spo2,
        "severity": "normal",
        "timestamp": datetime.utcnow(),
    }


async def serial_reader():
    """
    Background task that reads from serial port and updates latest_helmet_data.
    Stores alerts in database when thresholds are exceeded.
    """
    global latest_helmet_data

    print(f"[Helmet Service] Starting serial reader on {SERIAL_PORT}...")
    ser = None

    # For demo: currently hardcoded to worker_1
    # In future: RFID integration will determine worker_id
    current_worker_id = "worker_1"

    while True:
        try:
            if not SERIAL_ENABLED:
                # Use mock data when serial is disabled
                mock_data = get_mock_helmet_data(current_worker_id)
                mock_data["worker_id"] = current_worker_id
                latest_helmet_data[current_worker_id] = mock_data
                await asyncio.sleep(1)
                continue

            if ser is None:
                try:
                    ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
                    print(f"[Helmet Service] Serial connected to {SERIAL_PORT}")
                except Exception as e:
                    print(f"[Helmet Service] Serial connection failed: {e}")
                    # Fall back to mock data
                    mock_data = get_mock_helmet_data(current_worker_id)
                    latest_helmet_data[current_worker_id] = mock_data
                    await asyncio.sleep(2)
                    continue

            if ser.in_waiting > 0:
                line = ser.readline().decode('utf-8', errors='ignore').strip()

                # Filter for packet
                if line.startswith("INT32_PACKET:"):
                    match = re.search(r"\[(.*?)\]", line)
                    if match:
                        content = match.group(1)
                        raw_values = [int(float(x)) for x in content.split(',') if x.strip()]

                        # Parse to dictionary
                        parsed_data = parse_arduino_array(raw_values)

                        if parsed_data:
                            parsed_data["worker_id"] = current_worker_id
                            latest_helmet_data[current_worker_id] = parsed_data

                            # Check thresholds and store alerts if needed
                            try:
                                db = get_database()
                                await check_and_store_alerts(current_worker_id, parsed_data, db)
                            except Exception as e:
                                print(f"[Helmet Service] DB error: {e}")

            await asyncio.sleep(0.01)

        except Exception as e:
            print(f"[Helmet Service] Error: {e}")
            if ser:
                ser.close()
            ser = None
            await asyncio.sleep(1)


def get_latest_helmet_data(worker_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Get the latest helmet data.
    If worker_id is provided, returns data for that worker only.
    Otherwise returns all helmet data.
    """
    if worker_id:
        return latest_helmet_data.get(worker_id, {})
    return latest_helmet_data


def get_all_helmet_data() -> list:
    """Get latest data from all helmets as a list."""
    return list(latest_helmet_data.values())


async def start_helmet_reader():
    """Start the helmet serial reader as a background task."""
    await serial_reader()
