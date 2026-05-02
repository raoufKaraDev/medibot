import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from database import init_db
from middleware import register_audit_middleware
from mqtt import setup_mqtt_client
import mqtt as mqtt_mod
from routers import (
    analytics, audit, auth, dispense, doctors, interactions, lifecycle, medications,
    notifications, patients, pharmacy, prescriptions, rooms, tech, vitals,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    setup_mqtt_client()
    yield
    if mqtt_mod._mqtt:
        mqtt_mod._mqtt.loop_stop()
        mqtt_mod._mqtt.disconnect()


app = FastAPI(title="MediBot API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
register_audit_middleware(app)

for _r in (
    auth, patients, doctors, rooms, medications, prescriptions, dispense,
    pharmacy, audit, analytics, notifications, tech, interactions, vitals, lifecycle,
):
    app.include_router(_r.router)

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
