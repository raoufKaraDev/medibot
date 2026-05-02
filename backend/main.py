import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

from database import init_db
from routers import (
    patients, rooms, medications, dispenses,
    auth, doctors, stats, pharmacy, tech,
    audit, prescriptions, vitals, interactions,
    shift, photoUpload
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(
    title="MediBot API",
    description="Syst\u00e8me de distribution automatis\u00e9 de m\u00e9dicaments — H\u00f4pital de Rou\u00efba",
    version="2.0.0",
    lifespan=lifespan
)

# ── CORS ──────────────────────────────────────────────────────────────
# On LAN: allow all (laptop + tablet on same network)
# On Railway demo: allow Vercel frontend URL via env var
allowed_origins_env = os.environ.get("ALLOWED_ORIGINS", "")
if allowed_origins_env:
    allowed_origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()]
else:
    allowed_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────
app.include_router(auth.router,          prefix="/api/auth",         tags=["auth"])
app.include_router(patients.router,      prefix="/api/patients",     tags=["patients"])
app.include_router(rooms.router,         prefix="/api/rooms",        tags=["rooms"])
app.include_router(medications.router,   prefix="/api/medications",  tags=["medications"])
app.include_router(dispenses.router,     prefix="/api/dispenses",    tags=["dispenses"])
app.include_router(doctors.router,       prefix="/api/doctors",      tags=["doctors"])
app.include_router(stats.router,         prefix="/api/stats",        tags=["stats"])
app.include_router(pharmacy.router,      prefix="/api/pharmacy",     tags=["pharmacy"])
app.include_router(tech.router,          prefix="/api/tech",         tags=["tech"])
app.include_router(audit.router,         prefix="/api/audit",        tags=["audit"])
app.include_router(prescriptions.router, prefix="/api",              tags=["prescriptions"])
app.include_router(vitals.router,        prefix="/api/vitals",       tags=["vitals"])
app.include_router(interactions.router,  prefix="/api/interactions", tags=["interactions"])
app.include_router(shift.router,         prefix="/api/shift",        tags=["shift"])
app.include_router(photoUpload.router,   prefix="/api",              tags=["photos"])

@app.get("/")
def root():
    return {"status": "ok", "service": "MediBot API", "version": "2.0.0"}

@app.get("/health")
def health():
    return {"status": "healthy"}
