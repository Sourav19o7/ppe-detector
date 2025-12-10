import serial
import threading
import asyncio
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from typing import List

# ================= CONFIGURATION =================
# CHANGE THIS TO YOUR PORT
SERIAL_PORT = "COM3" 
BAUD_RATE = 115200

# ================= GLOBAL STATE =================
current_state = {
    "scanning": False,
    "gate": "CLOSED",
    "result": "WAITING",
    "ppe": {
        "helmet": False,
        "vest": False,
        "boots": False
    },
    "log": "System Ready"
}

# Global reference to the main event loop
main_loop = None

# ================= SERIAL SETUP =================
ser = None
try:
    ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
    print(f"✅ Connected to {SERIAL_PORT}")
except Exception as e:
    print(f"❌ Error connecting to serial: {e}")

# ================= WEBSOCKET MANAGER =================
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        # We iterate over a copy to avoid modification errors during iteration
        for connection in self.active_connections[:]:
            try:
                await connection.send_json(message)
            except:
                self.disconnect(connection)

manager = ConnectionManager()
app = FastAPI()

# ================= BACKGROUND THREAD =================
def read_from_serial():
    """ Runs in a separate thread to read Serial without blocking """
    global current_state, main_loop
    
    print("🧵 Serial Listener Thread Started")
    
    while True:
        if ser and ser.in_waiting > 0:
            try:
                # Decode and strip whitespace
                raw_line = ser.readline()
                line = raw_line.decode('utf-8', errors='ignore').strip()
                
                if not line:
                    continue
                
                print(f"📥 ESP32: {line}") # Verify we see this in console
                current_state["log"] = line
                
                # --- PARSING LOGIC ---
                updated = False
                
                if "Scanning Started" in line:
                    current_state["scanning"] = True
                    current_state["result"] = "SCANNING"
                    current_state["ppe"] = {"helmet": False, "vest": False, "boots": False}
                    updated = True
                
                elif "Helmet Scanned" in line:
                    current_state["ppe"]["helmet"] = True
                    updated = True
                    
                elif "Vest Scanned" in line:
                    current_state["ppe"]["vest"] = True
                    updated = True
                    
                elif "Boots Scanned" in line:
                    current_state["ppe"]["boots"] = True
                    updated = True
                    
                elif "COMPLIANT" in line:
                    current_state["scanning"] = False
                    current_state["result"] = "PASS"
                    current_state["gate"] = "OPEN"
                    updated = True
                    
                elif "NON-COMPLIANT" in line:
                    current_state["scanning"] = False
                    current_state["result"] = "FAIL"
                    current_state["gate"] = "CLOSED"
                    updated = True
                
                elif "Press '1'" in line:
                    current_state["scanning"] = False
                    current_state["result"] = "WAITING"
                    current_state["gate"] = "CLOSED"
                    updated = True

                # IMPORTANT: Send update to WebSocket if something changed
                if updated and main_loop and main_loop.is_running():
                    asyncio.run_coroutine_threadsafe(manager.broadcast(current_state), main_loop)
                    
            except Exception as e:
                print(f"⚠️ parsing error: {e}")

@app.on_event("startup")
async def startup_event():
    """ This runs when the server starts. We grab the loop here. """
    global main_loop
    main_loop = asyncio.get_running_loop()
    
    # Start the serial reader thread
    t = threading.Thread(target=read_from_serial, daemon=True)
    t.start()

# ================= FRONTEND HTML =================
html_content = """
<!DOCTYPE html>
<html>
<head>
    <title>RFID Smart Gate Dashboard</title>
    <style>
        body { font-family: 'Segoe UI', sans-serif; background-color: #f0f2f5; text-align: center; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
        
        .status-box { padding: 15px; border-radius: 8px; margin: 20px 0; color: white; font-weight: bold; font-size: 1.5em; }
        .waiting { background-color: #3498db; }
        .scanning { background-color: #e67e22; animation: pulse 1.5s infinite; }
        .pass { background-color: #2ecc71; }
        .fail { background-color: #e74c3c; }

        .gate-visual { height: 100px; margin: 20px 0; display: flex; align-items: center; justify-content: center; border: 4px dashed #ccc; border-radius: 10px; font-weight: bold; font-size: 20px; }
        .gate-open { border-color: #2ecc71; color: #2ecc71; background: #e8f8f5; }
        .gate-closed { border-color: #e74c3c; color: #e74c3c; background: #fdedec; }

        .ppe-grid { display: flex; justify-content: space-around; margin-top: 30px; }
        .ppe-item { width: 30%; padding: 15px; border-radius: 10px; background: #eee; transition: all 0.3s; opacity: 0.4; }
        .ppe-active { background: #2ecc71; color: white; opacity: 1; transform: scale(1.1); box-shadow: 0 4px 10px rgba(46, 204, 113, 0.4); }
        
        button { background-color: #333; color: white; padding: 15px 40px; font-size: 18px; border: none; border-radius: 8px; cursor: pointer; margin-top: 25px; }
        button:disabled { background-color: #ccc; cursor: not-allowed; }

        .log-console { margin-top: 20px; font-family: monospace; color: #666; background: #f9f9f9; padding:10px; border-radius:5px; }
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.6; } 100% { opacity: 1; } }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚧 Smart Safety Gate 🚧</h1>
        
        <div id="main-status" class="status-box waiting">SYSTEM READY</div>
        <div id="gate-viz" class="gate-visual gate-closed">GATE CLOSED 🔒</div>

        <div class="ppe-grid">
            <div id="ppe-helmet" class="ppe-item">⛑️ Helmet</div>
            <div id="ppe-vest" class="ppe-item">🦺 Vest</div>
            <div id="ppe-boots" class="ppe-item">🥾 Boots</div>
        </div>

        <button id="start-btn" onclick="startScan()">Start Scanning</button>
        <div class="log-console" id="log-msg">Waiting...</div>
    </div>

    <script>
        const ws = new WebSocket("ws://" + window.location.host + "/ws");
        
        ws.onmessage = function(event) {
            const data = JSON.parse(event.data);
            updateUI(data);
        };

        function updateUI(data) {
            document.getElementById("log-msg").innerText = data.log;

            const statusBox = document.getElementById("main-status");
            const btn = document.getElementById("start-btn");
            statusBox.className = "status-box"; 

            if (data.result === "WAITING") {
                statusBox.classList.add("waiting");
                statusBox.innerText = "SYSTEM READY";
                btn.disabled = false;
                btn.innerText = "Start Scanning";
            } else if (data.result === "SCANNING") {
                statusBox.classList.add("scanning");
                statusBox.innerText = "SCANNING...";
                btn.disabled = true;
                btn.innerText = "Scanning...";
            } else if (data.result === "PASS") {
                statusBox.classList.add("pass");
                statusBox.innerText = "ACCESS GRANTED";
                btn.disabled = true;
            } else if (data.result === "FAIL") {
                statusBox.classList.add("fail");
                statusBox.innerText = "ACCESS DENIED";
                btn.disabled = true;
            }

            const gateViz = document.getElementById("gate-viz");
            if (data.gate === "OPEN") {
                gateViz.className = "gate-visual gate-open";
                gateViz.innerText = "GATE OPEN 🔓";
            } else {
                gateViz.className = "gate-visual gate-closed";
                gateViz.innerText = "GATE CLOSED 🔒";
            }

            togglePPE("ppe-helmet", data.ppe.helmet);
            togglePPE("ppe-vest", data.ppe.vest);
            togglePPE("ppe-boots", data.ppe.boots);
        }

        function togglePPE(id, isActive) {
            const el = document.getElementById(id);
            if (isActive) el.classList.add("ppe-active");
            else el.classList.remove("ppe-active");
        }

        function startScan() {
            // Instant visual feedback
            const statusBox = document.getElementById("main-status");
            statusBox.className = "status-box scanning";
            statusBox.innerText = "STARTING...";
            document.getElementById("start-btn").disabled = true;
            
            fetch("/start-scan", { method: "POST" });
        }
    </script>
</body>
</html>
"""

@app.get("/")
async def get():
    return HTMLResponse(html_content)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    await websocket.send_json(current_state)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.post("/start-scan")
async def start_scan():
    global current_state
    
    # 1. Update UI state immediately
    current_state["scanning"] = True
    current_state["result"] = "SCANNING"
    current_state["ppe"] = {"helmet": False, "vest": False, "boots": False}
    
    # 2. Broadcast change
    await manager.broadcast(current_state)

    # 3. Send to ESP32
    if ser and ser.is_open:
        ser.write(b"1\n")
        print("📤 Sent '1' to ESP32")
    
    return {"status": "started"}

if __name__ == "__main__":
    print("🚀 Server starting...")
    uvicorn.run(app, host="0.0.0.0", port=8000)