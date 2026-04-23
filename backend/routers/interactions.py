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

@router.get("/api/drug-interactions")
def list_drug_interactions():
    conn = get_db()
    rows = conn.execute("SELECT * FROM drug_interactions ORDER BY id").fetchall()
    conn.close()
    return rows_to_list(rows)


@router.post("/api/drug-interactions", status_code=201)
def create_drug_interaction(data: DrugInteractionCreate):
    conn = None
    try:
        conn = get_db()
        c = conn.execute(
            "INSERT INTO drug_interactions(drug_a,drug_b,severity,consequence) VALUES (?,?,?,?)",
            (data.drug_a, data.drug_b, data.severity, data.consequence),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM drug_interactions WHERE id=?", (c.lastrowid,)).fetchone()
        conn.close()
        return dict(row)
    except Exception as e:
        print(f"[POST /api/drug-interactions] Error: {e}")
        if conn:
            conn.close()
        raise


@router.put("/api/drug-interactions/{interaction_id}")
def update_drug_interaction(interaction_id: int, data: DrugInteractionUpdate):
    conn = None
    try:
        conn = get_db()
        fields = {k: v for k, v in data.dict().items() if v is not None}
        if fields:
            sets = ", ".join(f"{k}=?" for k in fields)
            conn.execute(f"UPDATE drug_interactions SET {sets} WHERE id=?", (*fields.values(), interaction_id))
            conn.commit()
        row = conn.execute("SELECT * FROM drug_interactions WHERE id=?", (interaction_id,)).fetchone()
        conn.close()
        if not row:
            raise HTTPException(404, "Interaction introuvable")
        return dict(row)
    except Exception as e:
        print(f"[PUT /api/drug-interactions/{interaction_id}] Error: {e}")
        if conn:
            conn.close()
        raise


@router.delete("/api/drug-interactions/{interaction_id}")
def delete_drug_interaction(interaction_id: int):
    conn = None
    try:
        conn = get_db()
        conn.execute("DELETE FROM drug_interactions WHERE id=?", (interaction_id,))
        conn.commit()
        conn.close()
        return {"ok": True}
    except Exception as e:
        print(f"[DELETE /api/drug-interactions/{interaction_id}] Error: {e}")
        if conn:
            conn.close()
        raise
