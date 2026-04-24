from fastapi import APIRouter, HTTPException, Request
import hashlib
import sqlite3

from database import get_db, pwd_context, write_audit
from helpers import hash_password, _doctor_access_payload, infer_role_code
from schemas import LoginRequest, PINRequest, RFIDRequest, StaffRegisterRequest, ApproveRequestBody, RejectRequestBody

router = APIRouter()


def verify_password(plain_password: str, stored_hash: str) -> bool:
    """
    Verify a password against its stored hash.
    Supports legacy bcrypt hashes and current SHA-256 hashes.
    
    Args:
        plain_password: The plain text password to verify
        stored_hash: The stored password hash from database
    
    Returns:
        True if password matches, False otherwise
    """
    if not stored_hash:
        return False

    # Legacy: some rows store passlib bcrypt hashes (e.g. "$2b$...")
    # Current: seed.py / helpers.py stores SHA-256 hex digest.
    try:
        if isinstance(stored_hash, str) and stored_hash.startswith("$2"):
            return bool(pwd_context.verify(plain_password, stored_hash))
    except Exception:
        return False

    return hash_password(plain_password) == stored_hash

@router.post("/api/rfid")
def check_rfid(req: RFIDRequest, request: Request):
    ip = request.client.host if request.client else ""
    conn = get_db()
    doc = conn.execute("SELECT * FROM doctors WHERE rfid_uid=?", (req.uid.upper(),)).fetchone()
    conn.close()
    if doc:
        d = dict(doc)
        if (d.get("status") or "").upper() == "SUSPENDED":
            return {
                "access": False,
                "name": d.get("name", ""),
                "role": d.get("role", ""),
                "role_code": d.get("role_code", "unknown"),
                "can_prescribe": False,
                "message": "Compte suspendu",
            }
        out = _doctor_access_payload(d)
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
    if (d.get("status") or "").upper() == "SUSPENDED":
        conn.close()
        return {
            "access": False,
            "name": d.get("name", ""),
            "role": d.get("role", ""),
            "role_code": d.get("role_code", "unknown"),
            "can_prescribe": False,
            "message": "Compte suspendu",
        }
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
        if (d.get("status") or "").upper() == "SUSPENDED":
            raise HTTPException(status_code=403, detail="Compte suspendu")

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
    """
    Self-signup request for a staff account (PENDING).
    A Chef de Service must later approve and assign RFID + PIN.
    """
    conn = get_db()
    try:
        username = req.username.strip().lower()
        if not username:
            raise HTTPException(status_code=400, detail="Nom d'utilisateur requis")

        # Uniqueness: can't conflict with existing doctors or pending requests
        if conn.execute("SELECT 1 FROM doctors WHERE LOWER(username)=? LIMIT 1", (username,)).fetchone():
            raise HTTPException(status_code=400, detail="Ce nom d'utilisateur existe déjà")
        if conn.execute("SELECT 1 FROM staff_requests WHERE LOWER(username)=? AND status='PENDING' LIMIT 1", (username,)).fetchone():
            raise HTTPException(status_code=400, detail="Une demande existe déjà pour ce nom d'utilisateur")

        conn.execute(
            """INSERT INTO staff_requests(fullname, username, passwordhash, role, phone, note, status)
               VALUES (?, ?, ?, ?, ?, ?, 'PENDING')""",
            (
                req.fullname.strip(),
                username,
                hash_password(req.password),
                (req.role or "MEDECIN_RESIDENT").strip(),
                (req.phone or None),
                (req.note or None),
            ),
        )
        rid = conn.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]
        try:
            write_audit(
                conn,
                actor=req.fullname,
                actor_role=req.role,
                action="REGISTRATION_REQUEST",
                target_type="staff_request",
                target_id=rid,
            )
        except Exception:
            pass
        conn.commit()
        return {"ok": True, "request_id": rid, "message": "Demande envoyée. En attente de validation par le Chef de Service."}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[POST /api/auth/register] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════════
# ADMIN — Pending Staff Requests
# ══════════════════════════════════════════════════════════════════
@router.get("/api/admin/pending-requests")
def get_pending_requests(skip: int = 0, limit: int = 50):
    conn = get_db()
    try:
        limit = max(1, min(200, int(limit)))
        skip = max(0, int(skip))
        rows = conn.execute(
            """SELECT id, fullname, username, role, phone, note, status, createdat, validatedat, validatedby
               FROM staff_requests
               WHERE status='PENDING'
               ORDER BY createdat DESC
               LIMIT ? OFFSET ?""",
            (limit, skip),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@router.get("/api/admin/pending-count")
def get_pending_count():
    conn = get_db()
    try:
        n = conn.execute("SELECT COUNT(*) AS n FROM staff_requests WHERE status='PENDING'").fetchone()["n"]
        return {"count": int(n)}
    finally:
        conn.close()


@router.put("/api/admin/approve/{request_id}")
def approve_staff_request(request_id: int, body: ApproveRequestBody):
    conn = get_db()
    try:
        req_row = conn.execute("SELECT * FROM staff_requests WHERE id=?", (request_id,)).fetchone()
        if not req_row:
            raise HTTPException(status_code=404, detail="Demande introuvable")
        r = dict(req_row)
        if (r.get("status") or "").upper() != "PENDING":
            raise HTTPException(status_code=409, detail="Demande déjà traitée")

        username = (r.get("username") or "").strip().lower()
        if conn.execute("SELECT 1 FROM doctors WHERE LOWER(username)=? LIMIT 1", (username,)).fetchone():
            raise HTTPException(status_code=409, detail="Username déjà utilisé (compte existe)")

        rfid = body.rfiduid.upper()
        if conn.execute("SELECT 1 FROM doctors WHERE rfid_uid=? LIMIT 1", (rfid,)).fetchone():
            raise HTTPException(status_code=409, detail="RFID déjà utilisé")

        role_code = infer_role_code(body.role).lower()
        can_prescribe = 0 if role_code == "interne" else 1
        pin = (body.pin or "").strip()
        if len(pin) < 3:
            raise HTTPException(status_code=400, detail="PIN invalide")

        conn.execute(
            """INSERT INTO doctors(rfid_uid, name, username, password_hash, role, role_code, can_prescribe, pin, pin_hash, phone, status)
               VALUES (?,?,?,?,?,?,?,?,?,?, 'ACTIVE')""",
            (
                rfid,
                r.get("fullname"),
                username,
                r.get("passwordhash"),
                body.role,
                role_code,
                can_prescribe,
                pin,
                pwd_context.hash(pin),
                r.get("phone"),
            ),
        )
        did = conn.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]

        conn.execute(
            """UPDATE staff_requests
               SET status='APPROVED', rfiduid=?, pin=?, validatedat=datetime('now'), validatedby=?
               WHERE id=?""",
            (rfid, pin, body.validatedby, request_id),
        )
        try:
            write_audit(conn, actor=body.validatedby, actor_role="CHEF_SERVICE", action="APPROVE_STAFF_REQUEST", target_type="staff_request", target_id=request_id)
            write_audit(conn, actor=body.validatedby, actor_role="CHEF_SERVICE", action="CREATE_DOCTOR", target_type="doctor", target_id=did)
        except Exception:
            pass
        conn.commit()
        return {"ok": True, "doctor_id": did}
    finally:
        conn.close()


@router.put("/api/admin/reject/{request_id}")
def reject_staff_request(request_id: int, body: RejectRequestBody):
    conn = get_db()
    try:
        req_row = conn.execute("SELECT id, fullname, status FROM staff_requests WHERE id=?", (request_id,)).fetchone()
        if not req_row:
            raise HTTPException(status_code=404, detail="Demande introuvable")
        r = dict(req_row)
        if (r.get("status") or "").upper() != "PENDING":
            raise HTTPException(status_code=409, detail="Demande déjà traitée")
        conn.execute(
            "UPDATE staff_requests SET status='REJECTED', validatedat=datetime('now') WHERE id=?",
            (request_id,),
        )
        try:
            write_audit(conn, actor="CHEF_SERVICE", actor_role="CHEF_SERVICE", action="REJECT_STAFF_REQUEST", target_type="staff_request", target_id=request_id, detail={"reason": body.reason})
        except Exception:
            pass
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════════
# ADMIN — Doctor Status Management (Disabled)
# ══════════════════════════════════════════════════════════════════
@router.put("/api/admin/suspend/{doctor_id}")
def suspend_doctor(doctor_id: int):
    raise HTTPException(status_code=403, detail="Action non autorisée")


@router.put("/api/admin/reactivate/{doctor_id}")
def reactivate_doctor(doctor_id: int):
    raise HTTPException(status_code=403, detail="Action non autorisée")
