import serial
import asyncio
import re
import uvicorn
import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from typing import List

# ================= CONFIGURATION =================
# CHANGE THIS TO YOUR ESP32 PORT
# Windows: "COM3", "COM5"
# Mac/Linux: "/dev/ttyUSB0"
SERIAL_PORT = "COM5" 
BAUD_RATE = 115200

app = FastAPI()

# ================= HTML DASHBOARD =================
html = """
<!DOCTYPE html>
<html>
    <head>
        <title>SIH Smart Helmet</title>
        <style>
            body { 
                font-family: 'Segoe UI', monospace; 
                background: #0f172a; 
                color: #e2e8f0; 
                margin: 0; 
                padding: 20px; 
            }
            h1 { text-align: center; color: #38bdf8; margin-bottom: 30px; }
            
            .grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                gap: 20px;
                max-width: 1400px;
                margin: 0 auto;
            }

            .card {
                background: #1e293b;
                border-left: 5px solid #3b82f6;
                border-radius: 8px;
                padding: 20px;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5);
                display: flex;
                justify-content: space-between;
                align-items: center;
                transition: transform 0.2s;
            }
            
            .card:hover { transform: translateY(-2px); }

            .label {
                font-size: 14px;
                color: #94a3b8;
                text-transform: uppercase;
                letter-spacing: 1px;
            }

            .value {
                font-size: 24px;
                font-weight: bold;
                color: #f8fafc;
            }

            /* Specific coloring based on content */
            .card.alert { border-left-color: #ef4444; }
            .card.safe { border-left-color: #22c55e; }

            #json-viewer {
                background: #000;
                color: #0f0;
                padding: 20px;
                margin-top: 30px;
                border-radius: 8px;
                font-family: monospace;
                white-space: pre-wrap;
                max-width: 1400px;
                margin-left: auto;
                margin-right: auto;
            }
        </style>
    </head>
    <body>
        <h1>Helmet Sensor Dictionary</h1>
        
        <div id="dashboard" class="grid">
            <!-- Cards will be injected here by JavaScript -->
        </div>

        <div id="json-viewer">Waiting for JSON data...</div>

        <script>
            var ws = new WebSocket("ws://" + window.location.host + "/ws");
            
            ws.onmessage = function(event) {
                var data = JSON.parse(event.data);
                var container = document.getElementById("dashboard");
                
                // 1. Show raw JSON at bottom
                document.getElementById("json-viewer").innerText = JSON.stringify(data, null, 4);

                // 2. Generate Cards Dynamically
                container.innerHTML = ""; // Clear old cards
                
                for (const [key, value] of Object.entries(data)) {
                    // Create card div
                    let card = document.createElement("div");
                    card.className = "card";
                    
                    // Simple logic to colorize alerts (e.g. SOS or High Methane)
                    if (key === "SOS" && value === true) card.classList.add("alert");
                    else if (key.includes("Methane") && value > 4000) card.classList.add("alert");
                    else card.classList.add("safe");

                    // Content
                    let labelSpan = document.createElement("span");
                    labelSpan.className = "label";
                    labelSpan.innerText = key;

                    let valueSpan = document.createElement("span");
                    valueSpan.className = "value";
                    valueSpan.innerText = value;

                    card.appendChild(labelSpan);
                    card.appendChild(valueSpan);
                    container.appendChild(card);
                }
            };
        </script>
    </body>
</html>
"""

# ================= BACKEND LOGIC =================

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

@app.get("/")
async def get():
    return HTMLResponse(html)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

def parse_arduino_array(arr):
    """
    Converts the raw integer list from Arduino into a named dictionary.
    Applies the math logic found in the Arduino code.
    """
    # Safety check for length
    if len(arr) < 20: 
        return {"error": "Incomplete packet", "raw": arr}

    # Arduino Mapping (Based on your C++ code):
    # 0,1,2: Accel (mg)
    # 3,4,5: Gyro (mdps)
    # 6,7,8: Roll/Pitch/Yaw (centi-degrees -> divide by 100)
    # 9:     CH4 (ppm * 10 -> divide by 10)
    # 11:    Batt (mV -> divide by 1000)
    # 12:    FSR Raw
    # 14:    State (Enum)
    # 15:    SOS Latched (0 or 1)
    # 17:    Heart Rate (val = real + 90 -> subtract 90)
    # 18:    SpO2 (val = real + 92 -> subtract 92)
    # 19:    MQ7 Raw
    
    data_dict = {
        "Accel X": arr[0],
        "Accel Y": arr[1],
        "Accel Z": arr[2],
        "Gyro X":  arr[3],
        "Gyro Y":  arr[4],
        "Gyro Z":  arr[5],
        
        "Roll (Deg)":  round(arr[6] / 100.0, 2),
        "Pitch (Deg)": round(arr[7] / 100.0, 2),
        "Yaw (Deg)":   round(arr[8] / 100.0, 2),
        
        "Methane (PPM)": round(arr[9] / 10.0, 1),
        "Battery (V)":   round(arr[11] / 1000.0, 2),
        
        "FSR Force": arr[12],
        "FSR State": "Touch" if arr[13] == 2 else "None",
        
        "System State": arr[14],
        "SOS": True if arr[15] == 1 else False,
        "Manual Override": True if arr[16] == 1 else False,
        
        # Reversing the Arduino offset
        "Heart Rate (BPM)": arr[17] - 90,
        "SpO2 (%)":         arr[18] - 92,
        
        "CO Sensor (MQ7)": arr[19]
    }
    
    return data_dict

async def serial_reader():
    print(f"Connecting to {SERIAL_PORT}...")
    ser = None
    
    while True:
        try:
            if ser is None:
                try:
                    ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
                    print("Serial Connected!")
                except:
                    await asyncio.sleep(2)
                    continue

            if ser.in_waiting > 0:
                line = ser.readline().decode('utf-8', errors='ignore').strip()
                
                # Filter for your specific packet
                if line.startswith("INT32_PACKET:"):
                    match = re.search(r"\[(.*?)\]", line)
                    if match:
                        content = match.group(1)
                        # Clean split
                        raw_values = [int(float(x)) for x in content.split(',') if x.strip()]
                        
                        # CONVERT TO DICTIONARY HERE
                        final_data = parse_arduino_array(raw_values)
                        
                        # Send Dictionary to UI
                        await manager.broadcast(json.dumps(final_data))
            
            await asyncio.sleep(0.001)

        except Exception as e:
            print(f"Error: {e}")
            if ser: ser.close()
            ser = None
            await asyncio.sleep(1)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(serial_reader())

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)