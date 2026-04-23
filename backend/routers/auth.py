from fastapi import APIRouter, HTTPException, Request
import hashlib
import sqlite3

from database import get_db, pwd_context, write_audit
from helpers import hash_password, _doctor_access_payload
from schemas import LoginRequest, PINRequest, RFIDRequest, StaffRegisterRequest, ApproveRequestBody, RejectRequestBody

router = APIRouter()


def verify_password(plain_password: str, stored_hash: str) -> bool:
    """
    Verify a password against its stored hash.
    Uses SHA-256 hashing (same as seed.py hash_password).
    
    Args:
        plain_password: The plain text password to verify
        stored_hash: The stored password hash from database
    
    Returns:
        True if password matches, False otherwise
    """
    return hash_password(plain_password) == stored_hash

@router.post("/api/rfid")
def check_rfid(req: RFIDRequest, request: Request):
    ip = request.client.host if request.client else ""
    conn = get_db()
    doc = conn.execute("SELECT * FROM doctors WHERE rfid_uid=?", (req.uid.upper(),)).fetchone()
    conn.close()
    if doc:
        out = _doctor_access_payload(doc)
        conn = get_db()
        try:
            write_audit(
                conn,
                actor=out["name"],
                actor_role=out["role"],
                action="LOGIN",
                target_type="doctor",
            )
        finally:
            conn.close()
        return out
    conn = get_db()
    try:
        write_audit(
            conn,
            actor="unknown",
            actor_role=None,
            action="LOGIN_FAILED",
            target_type="doctor",
        )
    finally:
        conn.close()
    return {
        "access": False,
        "name": "",
        "role": "",
        "role_code": "",
        "can_prescribe": False,
        "message": "Badge non reconnu",
    }



@router.post("/api/pin")
def check_pin(req: PINRequest, request: Request):
    ip = request.client.host if request.client else ""
    conn = get_db()
    doc = conn.execute("SELECT * FROM doctors WHERE rfid_uid=?", (req.uid.upper(),)).fetchone()
    if not doc:
        conn.close()
        conn = get_db()
        try:
            write_audit(
                conn,
                actor="unknown",
                actor_role=None,
                action="LOGIN_FAILED",
                target_type="doctor",
            )
            conn.commit()
        finally:
            conn.close()
        return {
            "access": False,
            "name": "",
            "role": "",
            "role_code": "",
            "can_prescribe": False,
            "message": "Badge non reconnu"
        }
    d = dict(doc)
    conn.close()
    ok = False
    if d.get("pin_hash"):
        try:
            ok = pwd_context.verify(req.pin, d["pin_hash"])
        except Exception:
            ok = False
    else:
        ok = str(d.get("pin") or "") == str(req.pin)
    name = d["name"]
    role = d.get("role") or ""
    if ok:
        conn = get_db()
        try:
            write_audit(
                conn,
                actor=name,
                actor_role=role,
                action="LOGIN",
                target_type="doctor",
            )
            conn.commit()
        finally:
            conn.close()
        return _doctor_access_payload(d)
    conn = get_db()
    try:
        write_audit(
            conn,
            actor=name,
            actor_role=role,
            action="LOGIN_FAILED",
            target_type="doctor",
        )
        conn.commit()
    finally:
        conn.close()
    return {
        "access": False,
        "name": name,
        "role": role,
        "role_code": d.get("role_code", "unknown"),
        "can_prescribe": False,
        "message": "Code PIN incorrect"
    }

# ══════════════════════════════════════════════════════════════════
# AUTH — Username/Password Login
# ══════════════════════════════════════════════════════════════════
@router.post("/api/auth/login")
def login(req: LoginRequest):
    """
    Username/Password login endpoint.
    - Searches doctors by username (case-insensitive)
    - Verifies password hash against stored hash
    - Returns doctor info on success
    """
    conn = get_db()
    try:
        doc = None

        # Try exact username match first
        doc = conn.execute(
            "SELECT id, name, role, username, password_hash, status FROM doctors WHERE LOWER(username)=? LIMIT 1",
            (req.username.lower(),),
        ).fetchone()

        # If no exact match, try partial name match (LIKE)
        if not doc:
            doc = conn.execute(
                "SELECT id, name, role, username, password_hash, status FROM doctors WHERE LOWER(name) LIKE ? LIMIT 1",
                (f"%{req.username.lower()}%",),
            ).fetchone()

        if not doc:
            write_audit(
                conn,
                actor=req.username,
                actor_role=None,
                action="LOGIN_FAILED",
                target_type="doctor",
            )
            conn.commit()
            raise HTTPException(status_code=401, detail="Identifiants incorrects")

        d = dict(doc)

        # Verify password hash
        password_valid = False
        if d.get("password_hash"):
            password_valid = verify_password(req.password, d["password_hash"])

        if not password_valid:
            write_audit(
                conn,
                actor=d["name"],
                actor_role=d.get("role"),
                action="LOGIN_FAILED",
                target_type="doctor",
            )
            conn.commit()
            raise HTTPException(status_code=401, detail="Identifiants incorrects")

        write_audit(
            conn,
            actor=d["name"],
            actor_role=d.get("role"),
            action="LOGIN",
            target_type="doctor",
        )
        conn.commit()
        return {
            "id": d["id"],
            "name": d["name"],
            "role": d["role"],
            "username": d.get("username", d["name"]),
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[POST /api/auth/login] Error: {e}")
        raise HTTPException(status_code=500, detail="Erreur serveur")
    finally:
        conn.close()


@router.get("/api/auth/debug/doctors")
def debug_doctors_list():
    """Debug endpoint — shows all doctors in database. Remove after testing."""
    conn = get_db()
    try:
        doctors = conn.execute(
            "SELECT id, name, username, role, status FROM doctors"
        ).fetchall()
        return [dict(d) for d in doctors]
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════════
# AUTH — Staff Registration (Disabled)
# ══════════════════════════════════════════════════════════════════
@router.post("/api/auth/register")
def register_staff(req: StaffRegisterRequest):
    """Registration is disabled in single-doctor mode."""
    raise HTTPException(
        status_code=403,
        detail="L'enregistrement de nouveaux comptes est désactivé. Le système fonctionne avec un compte unique."
    )


# ══════════════════════════════════════════════════════════════════
# ADMIN — Pending Staff Requests (Disabled)
# ══════════════════════════════════════════════════════════════════
@router.get("/api/admin/pending-requests")
def get_pending_requests(skip: int = 0, limit: int = 50):
    return []


@router.get("/api/admin/pending-count")
def get_pending_count():
    return {"count": 0}


@router.put("/api/admin/approve/{request_id}")
def approve_staff_request(request_id: int, body: ApproveRequestBody):
    raise HTTPException(status_code=403, detail="Action non autorisée")


@router.put("/api/admin/reject/{request_id}")
def reject_staff_request(request_id: int, body: RejectRequestBody):
    raise HTTPException(status_code=403, detail="Action non autorisée")


# ══════════════════════════════════════════════════════════════════
# ADMIN — Doctor Status Management (Disabled)
# ══════════════════════════════════════════════════════════════════
@router.put("/api/admin/suspend/{doctor_id}")
def suspend_doctor(doctor_id: int):
    raise HTTPException(status_code=403, detail="Action non autorisée")


@router.put("/api/admin/reactivate/{doctor_id}")
def reactivate_doctor(doctor_id: int):
    raise HTTPException(status_code=403, detail="Action non autorisée")
