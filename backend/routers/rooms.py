from fastapi import APIRouter, HTTPException, Request

from database import get_db, write_audit
from helpers import (
    calc_dose_ml,
    calc_pediatric_dose_mg,
    enrich_patient_dict,
    hash_password,
    infer_role_code,
    parse_patient_row,
    parse_weight_kg,
    pediatric_dose_hint,
    row_to_dict,
    rows_to_list,
    stock_with_status,
    _doctor_access_payload,
    _dump_patient_update,
    _dump_treatment_update,
    _patient_full_name,
    _ph_int,
    _pharmacy_patch,
    _allergies_to_json_for_db,
    _json_str_list_for_db,
)
from mqtt import TOPIC_CMD, get_mqtt, mqtt_publish, robot_state
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

router = APIRouter()

@router.get("/api/rooms")
def list_rooms():
    conn = get_db()
    rooms = conn.execute("SELECT * FROM rooms ORDER BY id").fetchall()
    result = []
    for r in rooms:
        room = dict(r)
        room["occupied"]  = conn.execute("SELECT COUNT(*) FROM patients WHERE room_id=? AND is_archived=0", (r["id"],)).fetchone()[0]
        # Fix: Check drug_allergies or other_allergies (not empty arrays) instead of fragile string comparison
        room["has_alert"] = conn.execute("SELECT COUNT(*) FROM patients WHERE room_id=? AND is_archived=0 AND (drug_allergies IS NOT NULL AND drug_allergies != '[]' OR other_allergies IS NOT NULL AND other_allergies != '[]')", (r["id"],)).fetchone()[0] > 0
        result.append(room)
    conn.close(); return result


@router.get("/api/rooms/{room_id}/patients")
def get_room_patients(room_id: int):
    try:
        conn = get_db()
        rows = conn.execute("SELECT * FROM patients WHERE room_id=? AND is_archived=0 ORDER BY bed", (room_id,)).fetchall()
        result = []
        for r in rows:
            p = parse_patient_row(r)  # Parse JSON fields
            enrich_patient_dict(p, conn=None, with_treatments=False)
            p["full_name"] = _patient_full_name(p)
            # Get guardian info with null safety - only select needed fields to avoid issues
            try:
                g = conn.execute("SELECT id, name, phone, relationship FROM guardians WHERE patient_id=? LIMIT 1", (p["id"],)).fetchone()
                p["guardian"] = row_to_dict(g) if g else None
            except Exception:
                p["guardian"] = None
            result.append(p)
        conn.close()
        return result
    except Exception as e:
        print(f"[get_room_patients] Error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch room patients: {str(e)}")

# ══════════════════════════════════════════════════════════════════
# PATIENTS
# ══════════════════════════════════════════════════════════════════
