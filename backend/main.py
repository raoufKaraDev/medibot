import asyncio
import os
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from config import settings
from database import init_db
from middleware import register_audit_middleware
from routers.sync import router as sync_router
from sync.scheduler import run_sync_loop
import mqtt as mqtt_mod
from routers import (
    analytics, audit, auth, dispense, doctors, interactions, lifecycle, medications,
    notifications, patients, pharmacy, prescriptions, rooms, tech, vitals,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    # Only start MQTT and sync loop in LOCAL hospital mode
    if settings.MQTT_ENABLED:
        from mqtt import setup_mqtt_client
        setup_mqtt_client()
    sync_task = asyncio.create_task(run_sync_loop())
    yield
    sync_task.cancel()
    if mqtt_mod._mqtt:
        try:
            mqtt_mod._mqtt.loop_stop()
            mqtt_mod._mqtt.disconnect()
        except Exception:
            pass


app = FastAPI(title="MediBot API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
register_audit_middleware(app)

for _r in (
    auth, patients, doctors, rooms, medications, prescriptions, dispense,
    pharmacy, audit, analytics, notifications, tech, interactions, vitals, lifecycle,
):
    app.include_router(_r.router)
app.include_router(sync_router)


@app.get("/health", tags=["system"])
async def health_check():
    mqtt_connected = False
    if settings.MQTT_ENABLED:
        try:
            from mqtt import _mqtt
            mqtt_connected = bool(_mqtt and _mqtt.is_connected())
        except Exception:
            mqtt_connected = False

    return {
        "status": "ok",
        "environment": str(settings.ENVIRONMENT),
        "timestamp": datetime.utcnow().isoformat(),
        "mqtt_enabled": settings.MQTT_ENABLED,
        "mqtt_connected": mqtt_connected,
        "version": "1.0.0"
    }


# Only serve the SPA if a dist/ folder actually exists (local dev with bundled frontend).
# On Railway (pure backend), dist/ does not exist so this block is skipped entirely.
FRONTEND_DIST = Path("dist")

if FRONTEND_DIST.exists():
    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        file_path = FRONTEND_DIST / full_path
        if full_path and file_path.is_file():
            return FileResponse(file_path)
        index_file = FRONTEND_DIST / "index.html"
        if index_file.is_file():
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="Frontend build not found")
