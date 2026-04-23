from fastapi import APIRouter, HTTPException

from database import get_db, write_audit
from schemas import VitalsCreate

router = APIRouter(tags=["vitals"])


@router.post("/api/patients/{patient_id}/vitals")
def save_vitals(patient_id: int, data: VitalsCreate):
    conn = get_db()
    try:
        if not conn.execute("SELECT id FROM patients WHERE id=?", (patient_id,)).fetchone():
            raise HTTPException(404, "Patient introuvable")
        c = conn.execute(
            """INSERT INTO vitals(patient_id, temperature, respiratory_rate, spo2, diuresis, transit, glasgow, recorded_by, shift)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (patient_id, data.temperature, data.respiratory_rate, data.spo2, data.diuresis, data.transit, data.glasgow, data.recorded_by, data.shift),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM vitals WHERE id=?", (c.lastrowid,)).fetchone()
        flags = {
            "hyperthermie": bool(data.temperature is not None and data.temperature > 39.0),
            "desaturation": bool(data.spo2 is not None and data.spo2 < 92),
        }
        write_audit(conn, actor=data.recorded_by or "system", actor_role="système", action="SAVE_VITALS", target_type="patient", target_id=patient_id, detail=flags)
        out = dict(row)
        out.update(flags)
        return out
    finally:
        conn.close()


@router.get("/api/patients/{patient_id}/vitals")
def get_vitals(patient_id: int):
    conn = get_db()
    try:
        if not conn.execute("SELECT id FROM patients WHERE id=?", (patient_id,)).fetchone():
            raise HTTPException(404, "Patient introuvable")
        rows = conn.execute("SELECT * FROM vitals WHERE patient_id=? ORDER BY id DESC LIMIT 10", (patient_id,)).fetchall()
        write_audit(conn, actor="système", actor_role="système", action="GET_VITALS", target_type="patient", target_id=patient_id)
        return [dict(r) for r in rows]
    finally:
        conn.close()
