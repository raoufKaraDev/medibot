from fastapi import APIRouter, HTTPException, Request
import sqlite3

from database import get_db, write_audit
from helpers import (
    calc_dose_ml,
    calc_pediatric_dose_mg,
    enrich_patient_dict,
    hash_password,
    infer_role_code,
    parse_weight_kg,
    pediatric_dose_hint,
    row_to_dict,
    rows_to_list,
    stock_with_status,
    _doctor_access_payload,
    _dump_patient_update,
    _dump_treatment_update,
    _ph_int,
    _pharmacy_patch,
    _allergies_to_json_for_db,
    _json_str_list_for_db,
)
from mqtt import TOPIC_CMD, get_mqtt, mqtt_publish, robot_state
from passlib.context import CryptContext
from schemas import (
    DispenseRequest,
    DoctorCreate,
    DoctorUpdate,
    DrugInteractionCreate,
    DrugInteractionUpdate,
    FirmwareMeta,
    GuardianCreate,
    GuardianUpdate,
    LogNote,
    LoginRequest,
    NotificationLogCreate,
    NotifyPatientBody,
    OrdonnanceCreate,
    PINRequest,
    PhotoUpload,
    PrescriptionCreate,
    PrescriptionDocCreate,
    PrescriptionValidationBody,
    PriseValiderBody,
    RFIDRequest,
    RestockRequest,
    PatientCreate,
    PatientTreatmentCreate,
    PatientTreatmentUpdate,
    PatientUpdate,
    PharmacyLotCreate,
    PharmacyStockCreate,
    PharmacyStockUpdate,
    WasteBody,
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
router = APIRouter()

# ══════════════════════════════════════════════════════════════════
# DOCTORS
# ══════════════════════════════════════════════════════════════════

@router.get("/api/doctors")
def list_doctors():
    conn = get_db()
    rows = conn.execute(
        "SELECT id, rfid_uid, name, role, pin, username, phone, status, created_at FROM doctors ORDER BY created_at DESC"
    ).fetchall()
    conn.close()
    return rows_to_list(rows)


@router.post("/api/doctors", status_code=201)
def create_doctor(data: DoctorCreate):
    # Disable adding doctors - single doctor model enforced
    raise HTTPException(
        status_code=403,
        detail="Ajout de médecin désactivé : le système fonctionne avec un seul compte."
    )


@router.put("/api/doctors/{doctor_id}")
def update_doctor(doctor_id: int, data: DoctorUpdate):
    conn = None
    try:
        conn = get_db()

        # Verify this is the single allowed doctor (rfid_uid = 3E487B89)
        existing = conn.execute("SELECT rfid_uid FROM doctors WHERE id=?", (doctor_id,)).fetchone()
        if not existing:
            conn.close()
            raise HTTPException(404, "Médecin introuvable")

        if existing[0] != "3E487B89":
            conn.close()
            raise HTTPException(403, "Modification interdite : seul le médecin KARA Abderraouf peut être modifié")

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


@router.delete("/api/doctors/{doctor_id}")
def delete_doctor(doctor_id: int):
    # Disable deleting doctors - single doctor model enforced
    raise HTTPException(
        status_code=403,
        detail="Suppression de médecin interdite : un compte unique est requis."
    )


@router.put("/api/doctors/{doctor_id}/status")
def update_doctor_status(doctor_id: int, data: dict):
    """Update doctor status (ACTIVE or SUSPENDED)."""
    conn = None
    try:
        status = data.get("status", "").strip().upper()
        if status not in ("ACTIVE", "SUSPENDED"):
            raise HTTPException(400, "Statut invalide. Valeurs acceptées: ACTIVE, SUSPENDED")
        
        conn = get_db()
        existing = conn.execute("SELECT id, name FROM doctors WHERE id=?", (doctor_id,)).fetchone()
        if not existing:
            conn.close()
            raise HTTPException(404, "Médecin introuvable")
        
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


# ══════════════════════════════════════════════════════════════════
# ROOMS
# ══════════════════════════════════════════════════════════════════
