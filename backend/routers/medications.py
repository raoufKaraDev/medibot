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

@router.get("/api/medications")
def list_medications():
    conn = get_db()
    rows = conn.execute("SELECT * FROM medications ORDER BY drawer").fetchall()
    conn.close(); return rows_to_list(rows)


@router.get("/api/patients/{patient_id}/medications")
def get_patient_medications(patient_id: int):
    conn = get_db()
    prow = conn.execute("SELECT weight FROM patients WHERE id=?", (patient_id,)).fetchone()
    weight_kg = parse_weight_kg(dict(prow).get("weight")) if prow else None
    rows = conn.execute(
        """SELECT m.id, m.name, m.dosage, m.schedule, m.drawer, m.time,
                  pr.start_date, pr.end_date,
                  COALESCE(m.is_high_risk, 0) AS is_high_risk,
                  ps.pediatric_mg_per_kg AS pharmacy_pediatric_mg_per_kg
           FROM medications m
           JOIN prescriptions pr ON pr.medication_id=m.id
           LEFT JOIN pharmacy_stock ps ON ps.drawer IS NOT NULL AND ps.drawer = m.drawer
           WHERE pr.patient_id=?""",
        (patient_id,),
    ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        mgpk = d.pop("pharmacy_pediatric_mg_per_kg", None)
        d["pediatric_mg_per_kg"] = mgpk
        dose = calc_pediatric_dose_mg(mgpk, weight_kg)
        d["pediatric_dose_mg"] = dose
        d["pediatric_dose_hint"] = pediatric_dose_hint(mgpk, weight_kg, dose)
        d["patient_weight_kg_used"] = weight_kg
        out.append(d)
    conn.close()
    return out


@router.post("/api/patients/{patient_id}/medications", status_code=201)
def prescribe_medication(patient_id: int, data: PrescriptionCreate):
    conn = get_db()
    try:
        # Validate prescription dates if end_date is provided
        if data.end_date:
            from datetime import datetime
            start = datetime.now().date()
            try:
                end = datetime.strptime(data.end_date, '%Y-%m-%d').date()
                if end < start:
                    raise HTTPException(400, "La date de fin doit être après la date de début")
            except ValueError:
                raise HTTPException(400, "Format de date invalide (utiliser YYYY-MM-DD)")
        
        conn.execute("INSERT INTO prescriptions(patient_id,medication_id,end_date) VALUES (?,?,?)",
                     (patient_id, data.medication_id, data.end_date))
        conn.commit()
    except sqlite3.IntegrityError as e:
        print(f"[POST /api/patients/{patient_id}/medications] IntegrityError: {e}")
        conn.close()
        raise HTTPException(409, "Médicament déjà prescrit")
    except HTTPException:
        conn.close()
        raise
    except Exception as e:
        print(f"[POST /api/patients/{patient_id}/medications] Error: {e}")
        conn.close()
        raise
    conn.close()
    return get_patient_medications(patient_id)


@router.delete("/api/patients/{patient_id}/medications/{medication_id}")
def remove_prescription(patient_id: int, medication_id: int):
    try:
        conn = get_db()
        conn.execute("DELETE FROM prescriptions WHERE patient_id=? AND medication_id=?", (patient_id, medication_id))
        conn.commit()
        conn.close()
        return {"success": True}
    except Exception as e:
        print(f"[DELETE /api/patients/{patient_id}/medications/{medication_id}] Error: {e}")
        conn.close()
        raise

# ══════════════════════════════════════════════════════════════════
# PRESCRIPTION DOCS (ordonnances)
# ══════════════════════════════════════════════════════════════════
