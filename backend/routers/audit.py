from fastapi import APIRouter, HTTPException, Request

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

@router.get("/api/audit-log")
def audit_log_endpoint(
    actor: str = "",
    action: str = "",
    days: int = 30,
):
    conn = None
    try:
        conn = get_db()
        q = "SELECT * FROM audit_log WHERE timestamp >= datetime('now', ?)"
        params: list = [f"-{max(1, min(365, days))} days"]
        if actor.strip():
            q += " AND actor LIKE ?"
            params.append(f"%{actor}%")
        if action.strip():
            q += " AND action = ?"
            params.append(action)
        q += " ORDER BY timestamp DESC LIMIT 200"
        rows = conn.execute(q, params).fetchall()
        conn.close()
        return rows_to_list(rows)
    except Exception as e:
        print(f"[GET /api/audit-log] Error: {e}")
        if conn:
            conn.close()
        raise

