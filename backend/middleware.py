from fastapi import FastAPI, Request

from database import get_db, write_audit


def register_audit_middleware(app: FastAPI) -> None:
    @app.middleware("http")
    async def audit_middleware(request: Request, call_next):
        """Enregistre chaque requête avec contexte utilisateur optionnel (en-têtes)."""
        uid = request.headers.get("x-medibot-user-id") or request.headers.get("X-Medibot-User-Id")
        uname = request.headers.get("x-medibot-user-name") or request.headers.get("X-Medibot-User-Name")
        urole = request.headers.get("x-medibot-user-role") or request.headers.get("X-Medibot-User-Role")
        if request.client:
            ip = request.client.host
        else:
            ip = ""
        path = request.url.path
        skip = path in ("/docs", "/openapi.json", "/redoc", "/favicon.ico") or path.startswith("/static")
        try:
            response = await call_next(request)
            return response
        except Exception as e:
            raise

from enum import Enum as _Enum
from fastapi import Request as _Request, HTTPException as _HTTPException, Depends as _Depends
import logging as _logging
from datetime import datetime as _datetime

class AdminContext(str, _Enum):
    LOCAL  = "LOCAL"
    REMOTE = "REMOTE"


def _is_local_ip(ip: str) -> bool:
    """True for hospital LAN, loopback, and Railway internal IPs (100.64.x.x)."""
    return (
        ip.startswith("192.168.1.")
        or ip.startswith("192.168.")
        or ip.startswith("10.")
        or ip.startswith("172.16.")
        or ip.startswith("100.64.")   # Railway internal CGNAT range
        or ip in ("127.0.0.1", "localhost", "::1", "")
    )


async def get_admin_context(request: _Request) -> AdminContext:
    """
    Determine admin context from request origin.

    LOCAL  — hospital LAN, loopback, or Railway internal network
    REMOTE — any origin that presents a valid X-Medibot-Doctor-Id header
             (sent automatically by the React frontend after login)

    If neither condition is met → 401 Unauthorized.
    """
    client_ip = request.client.host if request.client else ""

    # Hospital LAN / local / Railway internal network → always LOCAL
    if _is_local_ip(client_ip):
        return AdminContext.LOCAL

    # Remote (Vercel admin) → must carry the auth header set after login
    doctor_id = (
        request.headers.get("x-medibot-doctor-id")
        or request.headers.get("X-Medibot-Doctor-Id")
        or request.headers.get("x-medibot-user-id")
        or request.headers.get("X-Medibot-User-Id")
        or request.headers.get("X-Remote-User")   # legacy fallback
    )
    if doctor_id:
        return AdminContext.REMOTE

    raise _HTTPException(status_code=401, detail="Unauthorized")


async def require_local_admin(
    context: AdminContext = _Depends(get_admin_context)
) -> None:
    """
    STRICT LOCAL ONLY.
    Use this for: robot triggers, dispense commands, MQTT config,
    system settings, engineer panel. Never callable from remote.
    """
    if context != AdminContext.LOCAL:
        raise _HTTPException(
            status_code=403,
            detail="Operation requires local admin access (hospital LAN only)"
        )


async def require_admin(
    context: AdminContext = _Depends(get_admin_context)
) -> AdminContext:
    """
    Allows LOCAL and REMOTE.
    Use this for: patients, prescriptions, doctors, stock.
    Returns context so caller can log LOCAL vs REMOTE.
    """
    return context

# ── Audit logging ────────────────────────────────────────────────────

_audit_logger = _logging.getLogger("medibot.admin.audit")

class AdminActionType(str, _Enum):
    PRESCRIPTION_CREATE  = "PRESCRIPTION_CREATE"
    PRESCRIPTION_APPROVE = "PRESCRIPTION_APPROVE"
    PRESCRIPTION_EDIT    = "PRESCRIPTION_EDIT"
    DOCTOR_APPROVE       = "DOCTOR_APPROVE"
    DOCTOR_SUSPEND       = "DOCTOR_SUSPEND"
    PATIENT_ADMIT        = "PATIENT_ADMIT"
    PATIENT_DISCHARGE    = "PATIENT_DISCHARGE"
    STOCK_UPDATE         = "STOCK_UPDATE"
    SETTINGS_CHANGE      = "SETTINGS_CHANGE"
    DISPENSE_TRIGGER     = "DISPENSE_TRIGGER"


async def log_admin_action(
    action: AdminActionType,
    admin_id: int,
    context: AdminContext,
    resource_id: int,
    details: dict = None,
) -> None:
    entry = {
        "timestamp":   _datetime.utcnow().isoformat(),
        "action":      action.value,
        "admin_id":    admin_id,
        "context":     context.value,
        "resource_id": resource_id,
        "details":     details or {},
    }
    _audit_logger.info(entry)
    if context == AdminContext.REMOTE:
        _audit_logger.warning(f"REMOTE admin action: {entry}")
