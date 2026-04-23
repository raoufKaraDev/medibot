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

@router.post("/api/notification-log")
def add_notification_log(data: NotificationLogCreate):
    conn = None
    try:
        conn = get_db()
        conn.execute(
            "INSERT INTO notification_log(patient_id,message,status) VALUES (?,?,?)",
            (data.patient_id, data.message, data.status),
        )
        conn.commit()
        try:
            write_audit(conn, actor="Système", actor_role="Système",
                        action="ALERTE_URGENCE", target_type="patient", target_id=data.patient_id or 0,
                        detail=data.message or "Alerte envoyée")
        except Exception:
            pass
        conn.close()
        return {"ok": True}
    except Exception as e:
        print(f"[POST /api/notification-log] Error: {e}")
        if conn:
            conn.close()
        raise


@router.get("/api/notification-log")
def get_notification_log():
    conn = get_db()
    rows = conn.execute("SELECT * FROM notification_log ORDER BY id DESC LIMIT 100").fetchall()
    conn.close()
    return rows_to_list(rows)
