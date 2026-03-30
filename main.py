from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import json
import random
import string
import shutil
import logging
import os
from typing import Dict, List

# Basic setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("Talk")
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Folder setup
BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
INDEX_FILE = BASE_DIR / "index.html"

if os.getenv("VERCEL"):
    # Vercel functions can only write to /tmp, and files there are ephemeral.
    UPLOADS_DIR = Path("/tmp/talk-uploads")
else:
    UPLOADS_DIR = BASE_DIR / "uploads"

UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

class ConnectionManager:
    def __init__(self):
        self.rooms: Dict[str, List[WebSocket]] = {}
    async def connect(self, ws, rid):
        await ws.accept()
        if rid not in self.rooms: self.rooms[rid] = []
        self.rooms[rid].append(ws)
    def disconnect(self, ws, rid):
        if rid in self.rooms and ws in self.rooms[rid]: self.rooms[rid].remove(ws)
    async def broadcast(self, msg, rid):
        if rid in self.rooms:
            for ws in self.rooms[rid]:
                try: await ws.send_text(msg)
                except: pass

mgr = ConnectionManager()

# Serve files
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

@app.get("/")
def get():
    return HTMLResponse(content=INDEX_FILE.read_text(encoding="utf-8"))

@app.get("/generate-pin")
def pin(): return {"pin": "".join(random.choices(string.digits, k=6))}

@app.post("/upload")
async def upload(
    file: UploadFile = File(...),
    room_id: str = Query(...),
    sender: str = Query(...)
):
    """
    Using Query parameters instead of Form to avoid multipart parsing issues
    """
    try:
        logger.info(f"Uploading {file.filename} to room {room_id}")
        
        # Path logic
        room_dir = UPLOADS_DIR / room_id
        room_dir.mkdir(parents=True, exist_ok=True)

        safe_name = "".join([c for c in file.filename if c.isalnum() or c in "._-"]).strip()
        safe_name = safe_name or "upload"
        dest = room_dir / safe_name

        # Binary save
        with dest.open("wb") as f:
            shutil.copyfileobj(file.file, f)
            
        url = f"/uploads/{room_id}/{safe_name}"
        
        # Notify
        msg = {"sender": sender, "message": safe_name, "url": url, "type": "file"}
        await mgr.broadcast(json.dumps(msg), room_id)
        
        return {"status": "ok", "url": url}
    except Exception as e:
        logger.error(f"Error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.websocket("/ws/{room_id}/{client_id}")
async def ws(websocket: WebSocket, room_id: str, client_id: str):
    await mgr.connect(websocket, room_id)
    try:
        while True:
            data = await websocket.receive_text()
            msg = {"sender": client_id, "message": data, "type": "message"}
            await mgr.broadcast(json.dumps(msg), room_id)
    except WebSocketDisconnect:
        mgr.disconnect(websocket, room_id)
    except:
        mgr.disconnect(websocket, room_id)

if __name__ == "__main__":
    import uvicorn
    # Use 0.0.0.0 to listen on all interfaces (better for ngrok)
    uvicorn.run(app, host="0.0.0.0", port=5000)
