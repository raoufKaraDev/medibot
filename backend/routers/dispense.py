import json

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
    LogNote,
    PriseValiderBody,
    WasteBody,
)

router = APIRouter()

@router.post("/api/dispense")
def dispense(req: DispenseRequest):
    conn = None
    try:
        payload = {"cmd": "open_drawer", "drawer": req.drawer, "patient": req.patient, "med": req.med}
        ok = mqtt_publish(payload)
        conn = get_db()
        pid_row = conn.execute(
            "SELECT id FROM patients WHERE (first_name || ' ' || last_name)=? LIMIT 1", (req.patient,)
        ).fetchone()
        patient_id = pid_row["id"] if pid_row else None
        cursor = conn.execute(
            "INSERT INTO dispense_log(med_name,drawer,mqtt_sent,patient_id) VALUES (?,?,?,?)",
            (req.med, req.drawer, int(ok), patient_id),
        )
        log_id = cursor.lastrowid
        conn.commit()
        try:
            # NOTE: DispenseRequest in app/schemas.py should declare:
            #   doctor: Optional[str] = None
            #   doctorrole: Optional[str] = None
            write_audit(
                conn,
                actor=getattr(req, 'doctor', None) or 'Kiosk',
                actor_role=getattr(req, 'doctorrole', None) or 'Infirmiere',
                action='DISPENSE',
                target_type='patient',
                target_id=patient_id,
                detail=f"{req.med} — Tiroir {req.drawer} — Patient: {req.patient}"
            )
        except Exception:
            pass
        conn.close()
        print(f"[DISPENSE] {'✓' if ok else '✗'} tiroir={req.drawer} patient={req.patient} med={req.med}")
        return {"success": True, "mqtt_sent": ok, "log_id": log_id, "published": json.dumps(payload)}
    except Exception as e:
        print(f"[POST /api/dispense] Error: {e}")
        if conn:
            conn.close()
        raise


@router.post("/api/log/{log_id}/note")
def add_dispense_note(log_id: int, data: LogNote):
    conn = None
    try:
        conn = get_db()
        conn.execute("UPDATE dispense_log SET note=? WHERE id=?", (data.note, log_id))
        conn.commit()
        conn.close()
        return {"success": True}
    except Exception as e:
        print(f"[POST /api/log/{log_id}/note] Error: {e}")
        if conn:
            conn.close()
        raise


@router.get("/api/log")
def get_log():
    conn = get_db()
    # Join dispense_log with patients and pharmacy_stock to get names
    rows = conn.execute("""
        SELECT
            d.id, d.timestamp, d.patient_id, d.med_name, d.drawer, d.doctor,
            d.mqtt_sent, d.note, d.waste_reason, d.waste_detail, d.dose_status,
            d.prise_confirmed_at, d.prise_confirmed_by,
            p.first_name || ' ' || p.last_name AS patient_name,
            s.name AS drug_name, s.dosage, s.unit, s.maxdosemg24h
        FROM dispense_log d
        LEFT JOIN patients p ON d.patient_id = p.id
        LEFT JOIN pharmacy_stock s ON d.med_name = s.name AND d.drawer = s.drawer
        ORDER BY d.timestamp DESC LIMIT 50
    """).fetchall()
    conn.close()
    return rows_to_list(rows)



@router.post("/api/prises/valider")
def prise_valider(body: PriseValiderBody):
    conn = None
    try:
        conn = get_db()
        row = conn.execute("SELECT id FROM dispense_log WHERE id=?", (body.log_id,)).fetchone()
        if not row:
            conn.close()
            raise HTTPException(404, "Entrée de journal introuvable")
        conn.execute(
            """UPDATE dispense_log SET dose_status=?, prise_confirmed_at=datetime('now'), prise_confirmed_by=?
               WHERE id=?""",
            ("prise_confirmee", body.confirmed_by, body.log_id),
        )
        conn.commit()
        try:
            write_audit(
                conn,
                actor=body.confirmed_by or "system",
                actor_role="infirmier",
                action="CONFIRM_DOSAGE",
                target_type="dispense_log",
                target_id=body.log_id,
            )
            conn.commit()
        except Exception:
            pass
        conn.close()
        return {"ok": True}
    except Exception as e:
        print(f"[POST /api/prises/valider] Error: {e}")
        if conn:
            conn.close()
        raise



@router.post("/api/log/{log_id}/waste")
def log_waste(log_id: int, data: WasteBody):
    conn = None
    try:
        conn = get_db()
        conn.execute(
            "UPDATE dispense_log SET waste_reason=?, waste_detail=? WHERE id=?",
            (data.reason, data.detail, log_id),
        )
        conn.commit()
        conn.close()
        return {"ok": True}
    except Exception as e:
        print(f"[POST /api/log/{log_id}/waste] Error: {e}")
        if conn:
            conn.close()
        raise
