import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

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

if os.path.exists("dist"):
    app.mount("/", StaticFiles(directory="dist", html=True), name="static")
