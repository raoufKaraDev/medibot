from fastapi import APIRouter, HTTPException, Depends

from passlib.context import CryptContext

from database import get_db, write_audit
from helpers import hash_password, row_to_dict, rows_to_list, infer_role_code
from schemas import DoctorCreate, DoctorUpdate, AdminDoctorCreate, AdminDoctorUpdate, AdminResetCredentials
from middleware import require_admin

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
router = APIRouter()

# ══════════════════════════════════════════════════════════════════
# DOCTORS
# ══════════════════════════════════════════════════════════════════

@router.get("/api/doctors")
def list_doctors():
    conn = get_db()
    rows = conn.execute(
        """
        SELECT
            d.id,
            d.rfid_uid,
            d.name,
            d.username,
            d.role,
            d.role_code,
            d.can_prescribe,
            d.phone,
            d.status,
            d.created_at,
            (
              SELECT MAX(a.timestamp)
              FROM audit_log a
              WHERE a.actor = d.name
            ) AS last_activity
        FROM doctors d
        ORDER BY d.created_at DESC
        """
    ).fetchall()
    conn.close()
    return rows_to_list(rows)

@router.get("/api/admin/doctors")
def admin_list_doctors():
    return list_doctors()


@router.post("/api/doctors", status_code=201, dependencies=[Depends(require_admin)])
def create_doctor(data: DoctorCreate):
    """Create a new doctor account with RFID, name, role, and PIN."""
    conn = None
    try:
        conn = get_db()
        
        # Check if doctor with same RFID already exists
        existing = conn.execute(
            "SELECT id FROM doctors WHERE rfid_uid=?",
            (data.rfid_uid.upper(),)
        ).fetchone()
        
        if existing:
            conn.close()
            raise HTTPException(
                status_code=400,
                detail=f"Un médecin avec cet RFID existe déjà."
            )
        
        # Generate username from name (lowercase, replace spaces with underscore)
        username = data.name.lower().replace(" ", "_")
        
        # Hash the PIN using bcrypt
        pin_hash = pwd_context.hash(data.pin)
        
        # Generate a default password (doctor's name + PIN)
        default_password = f"{data.name.split()[-1].lower()}{data.pin}"
        password_hash = hash_password(default_password)
        
        # Insert the new doctor
        conn.execute(
            """INSERT INTO doctors(
                rfid_uid, name, role, pin, pin_hash, username, password_hash, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                data.rfid_uid.upper(),
                data.name,
                data.role,
                data.pin,
                pin_hash,
                username,
                password_hash,
                "ACTIVE"
            )
        )
        conn.commit()
        
        # Get the created doctor
        row = conn.execute(
            "SELECT id, rfid_uid, name, role, pin, username, phone, status, created_at FROM doctors WHERE rfid_uid=?",
            (data.rfid_uid.upper(),)
        ).fetchone()
        
        try:
            write_audit(
                conn,
                actor="système",
                actor_role="système",
                action="CREATE_DOCTOR",
                target_type="doctor",
                target_id=row["id"]
            )
            conn.commit()
        except Exception:
            pass
        
        conn.close()
        
        result = row_to_dict(row)
        # Add the generated credentials for reference
        result["credentials"] = {
            "username": username,
            "password": default_password,
            "message": "Identifiants temporaires - Veuillez changer le mot de passe après la première connexion"
        }
        return result
        
    except HTTPException:
        if conn:
            conn.close()
        raise
    except Exception as e:
        print(f"[POST /api/doctors] Error: {e}")
        if conn:
            conn.close()
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/api/doctors/{doctor_id}", dependencies=[Depends(require_admin)])
def update_doctor(doctor_id: int, data: DoctorUpdate):
    conn = None
    try:
        conn = get_db()
        existing = conn.execute("SELECT id FROM doctors WHERE id=?", (doctor_id,)).fetchone()
        if not existing:
            conn.close()
            raise HTTPException(404, "Médecin introuvable")

        fields = {k: v for k, v in data.dict().items() if v is not None}
        if "pin" in fields:
            fields["pin_hash"] = pwd_context.hash(fields.pop("pin"))
        if fields:
            sets = ", ".join(f"{k}=?" for k in fields)
            conn.execute(f"UPDATE doctors SET {sets} WHERE id=?", (*fields.values(), doctor_id))
            conn.commit()
        row = conn.execute("SELECT id, rfid_uid, name, role, pin, username, phone, status, created_at FROM doctors WHERE id=?", (doctor_id,)).fetchone()
        try:
            write_audit(conn, actor="système", actor_role="système", action="EDIT_DOCTOR", target_type="doctor", target_id=doctor_id)
            conn.commit()
        except Exception:
            pass
        conn.close()
        return row_to_dict(row)
    except Exception as e:
        print(f"[PUT /api/doctors/{doctor_id}] Error: {e}")
        if conn:
            conn.close()
        raise


@router.delete("/api/doctors/{doctor_id}", dependencies=[Depends(require_admin)])
def delete_doctor(doctor_id: int):
    conn = get_db()
    try:
        row = conn.execute("SELECT id, name, role, status FROM doctors WHERE id=?", (doctor_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Médecin introuvable")
        d = dict(row)

        # prevent deleting Chef de Service accounts (keep audit continuity)
        if (d.get("role") or "").upper() == "CHEF_SERVICE":
            raise HTTPException(403, "Suppression interdite : compte Chef de Service")

        # allow delete only if never used in audit or dispense logs
        used = conn.execute(
            "SELECT 1 FROM audit_log WHERE actor=? OR (target_type='doctor' AND target_id=?) LIMIT 1",
            (d["name"], doctor_id),
        ).fetchone()
        used2 = conn.execute(
            "SELECT 1 FROM dispense_log WHERE doctor LIKE ? LIMIT 1",
            (f"%{d['name']}%",),
        ).fetchone()
        if used or used2:
            raise HTTPException(409, "Compte déjà utilisé — suspendez au lieu de supprimer")

        conn.execute("DELETE FROM doctors WHERE id=?", (doctor_id,))
        try:
            write_audit(conn, actor="système", actor_role="système", action="DELETE_DOCTOR", target_type="doctor", target_id=doctor_id)
        except Exception:
            pass
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.put("/api/doctors/{doctor_id}/status", dependencies=[Depends(require_admin)])
def update_doctor_status(doctor_id: int, data: dict):
    """Update doctor status (ACTIVE or SUSPENDED)."""
    conn = None
    try:
        status = data.get("status", "").strip().upper()
        if status not in ("ACTIVE", "SUSPENDED"):
            raise HTTPException(400, "Statut invalide. Valeurs acceptées: ACTIVE, SUSPENDED")
        
        conn = get_db()
        existing = conn.execute("SELECT id, name, role, status FROM doctors WHERE id=?", (doctor_id,)).fetchone()
        if not existing:
            conn.close()
            raise HTTPException(404, "Médecin introuvable")

        ex = dict(existing)
        # Safety: never suspend the last active Chef de Service account
        if status == "SUSPENDED" and (ex.get("role") or "").upper() == "CHEF_SERVICE":
            n_admin = conn.execute(
                "SELECT COUNT(*) AS n FROM doctors WHERE status='ACTIVE' AND UPPER(role)='CHEF_SERVICE' AND id != ?",
                (doctor_id,),
            ).fetchone()["n"]
            if int(n_admin) == 0:
                raise HTTPException(409, "Impossible de suspendre le dernier compte Chef de Service actif")
        
        conn.execute("UPDATE doctors SET status=? WHERE id=?", (status, doctor_id))
        conn.commit()
        
        try:
            action = "SUSPEND_DOCTOR" if status == "SUSPENDED" else "REACTIVATE_DOCTOR"
            write_audit(conn, actor="système", actor_role="système", action=action, target_type="doctor", target_id=doctor_id)
            conn.commit()
        except Exception:
            pass
        
        row = conn.execute("SELECT id, rfid_uid, name, role, pin, username, phone, status, created_at FROM doctors WHERE id=?", (doctor_id,)).fetchone()
        conn.close()
        return row_to_dict(row)
    except HTTPException:
        if conn:
            conn.close()
        raise
    except Exception as e:
        print(f"[PUT /api/doctors/{doctor_id}/status] Error: {e}")
        if conn:
            conn.close()
        raise HTTPException(500, str(e))


# ──────────────────────────────────────────────────────────────────
# ADMIN — full staff account management
# ──────────────────────────────────────────────────────────────────

@router.post("/api/admin/doctors", status_code=201, dependencies=[Depends(require_admin)])
def admin_create_doctor(data: AdminDoctorCreate):
    conn = get_db()
    try:
        # Uniqueness checks
        if conn.execute("SELECT 1 FROM doctors WHERE LOWER(username)=? LIMIT 1", (data.username.lower(),)).fetchone():
            raise HTTPException(400, "Nom d'utilisateur déjà utilisé")
        if conn.execute("SELECT 1 FROM doctors WHERE rfid_uid=? LIMIT 1", (data.rfiduid.upper(),)).fetchone():
            raise HTTPException(400, "RFID déjà utilisé")

        role_code = infer_role_code(data.role).lower()
        can_prescribe = 0 if role_code == "interne" else 1

        pin = (data.pin or "1234").strip()
        if len(pin) < 3:
            raise HTTPException(400, "PIN invalide")

        conn.execute(
            """INSERT INTO doctors(rfid_uid, name, username, password_hash, role, role_code, can_prescribe, pin, pin_hash, phone, status, photo)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                data.rfiduid.upper(),
                data.fullname.strip(),
                data.username.strip(),
                hash_password(data.password),
                data.role.strip(),
                role_code,
                can_prescribe,
                pin,
                pwd_context.hash(pin),
                (data.phone or None),
                data.status,
                (data.photo or None),
            ),
        )
        did = conn.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]
        try:
            write_audit(conn, actor="système", actor_role="système", action="CREATE_DOCTOR", target_type="doctor", target_id=did, detail={"username": data.username, "role": data.role, "status": data.status})
        except Exception:
            pass
        conn.commit()
        row = conn.execute(
            """SELECT id, rfid_uid, name, username, role, role_code, can_prescribe, phone, status, created_at
               FROM doctors WHERE id=?""",
            (did,),
        ).fetchone()
        return row_to_dict(row)
    finally:
        conn.close()


@router.put("/api/admin/doctors/{doctor_id}", dependencies=[Depends(require_admin)])
def admin_update_doctor(doctor_id: int, data: AdminDoctorUpdate):
    conn = get_db()
    try:
        existing = conn.execute("SELECT * FROM doctors WHERE id=?", (doctor_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Médecin introuvable")
        ex = dict(existing)

        # Privacy: username/password are not editable by admin after creation
        if data.username is not None or data.password is not None:
            raise HTTPException(403, "Modification interdite : username/mot de passe (confidentialité)")

        # Safety: don't suspend last active CHEF_SERVICE
        if data.status and data.status.upper() == "SUSPENDED" and (ex.get("role") or "").upper() == "CHEF_SERVICE":
            n_admin = conn.execute(
                "SELECT COUNT(*) AS n FROM doctors WHERE status='ACTIVE' AND UPPER(role)='CHEF_SERVICE' AND id != ?",
                (doctor_id,),
            ).fetchone()["n"]
            if int(n_admin) == 0:
                raise HTTPException(409, "Impossible de suspendre le dernier compte Chef de Service actif")

        if data.rfiduid and data.rfiduid.upper() != (ex.get("rfid_uid") or "").upper():
            if conn.execute("SELECT 1 FROM doctors WHERE rfid_uid=? AND id != ? LIMIT 1", (data.rfiduid.upper(), doctor_id)).fetchone():
                raise HTTPException(400, "RFID déjà utilisé")

        fields = {}
        if data.fullname is not None:
            fields["name"] = data.fullname.strip()
        if data.role is not None:
            fields["role"] = data.role.strip()
            rc = infer_role_code(data.role).lower()
            fields["role_code"] = rc
            fields["can_prescribe"] = 0 if rc == "interne" else 1
        if data.rfiduid is not None:
            fields["rfid_uid"] = data.rfiduid.upper()
        if data.pin is not None:
            fields["pin"] = data.pin.strip()
            fields["pin_hash"] = pwd_context.hash(data.pin.strip())
        if data.phone is not None:
            fields["phone"] = data.phone
        if data.status is not None:
            fields["status"] = data.status.upper()
        if data.photo is not None:
            fields["photo"] = data.photo

        if fields:
            sets = ", ".join([f"{k}=?" for k in fields.keys()])
            conn.execute(f"UPDATE doctors SET {sets} WHERE id=?", (*fields.values(), doctor_id))
            try:
                write_audit(conn, actor="système", actor_role="système", action="EDIT_DOCTOR", target_type="doctor", target_id=doctor_id, detail=fields)
            except Exception:
                pass
            conn.commit()

        row = conn.execute(
            """SELECT id, rfid_uid, name, username, role, role_code, can_prescribe, phone, status, created_at
               FROM doctors WHERE id=?""",
            (doctor_id,),
        ).fetchone()
        return row_to_dict(row)
    finally:
        conn.close()


@router.put("/api/admin/doctors/{doctor_id}/status", dependencies=[Depends(require_admin)])
def admin_set_doctor_status(doctor_id: int, data: dict):
    return update_doctor_status(doctor_id, data)


@router.put("/api/admin/doctors/{doctor_id}/reset", dependencies=[Depends(require_admin)])
def admin_reset_credentials(doctor_id: int, data: AdminResetCredentials):
    # Privacy policy: credentials are private and cannot be reset by admin through this panel.
    raise HTTPException(403, "Action non autorisée : reset des identifiants interdit")


# ══════════════════════════════════════════════════════════════════
# ROOMS
# ══════════════════════════════════════════════════════════════════
