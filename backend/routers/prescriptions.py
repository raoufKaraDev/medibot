import uuid
import json
from datetime import date as dtdate, datetime
from typing import Optional, List

from fastapi import APIRouter, HTTPException

from database import get_db, write_audit
from helpers import (
    calc_dose_ml, infer_role_code, rows_to_list, row_to_dict,
    parse_concentration, check_allergy
)
from schemas import (
    DoseCheckRequest, OrdonnanceCreate, PrescriptionDocCreate, 
    PrescriptionValidationBody
)

router = APIRouter(tags=["prescriptions"])


def _format_ord_id(prescription_id: int) -> str:
    """Format prescription ID as ORD-YYYY-{id:04d}"""
    year = datetime.now().year
    return f"ORD-{year}-{prescription_id:04d}"


@router.get("/api/patients/{patient_id}/prescriptions")
def list_prescriptions(patient_id: int):
    """Get all prescriptions for a patient with complete details and formatted IDs."""
    conn = get_db()
    try:
        if not conn.execute("SELECT id FROM patients WHERE id=?", (patient_id,)).fetchone():
            raise HTTPException(404, "Patient introuvable")
        
        rows = conn.execute(
            "SELECT * FROM prescription_docs WHERE patient_id=? ORDER BY created_at DESC", 
            (patient_id,)
        ).fetchall()
        
        result = []
        for r in rows:
            d = dict(r)
            doc_id = d.get("id")
            d["formatted_id"] = _format_ord_id(doc_id)
            
            # Get items with pharmacy data
            items_rows = conn.execute(
                """SELECT pi.*, m.drawer, ps.dosage as stock_dosage_text
                   FROM prescription_items pi
                   LEFT JOIN medications m ON m.id = pi.medicationid
                   LEFT JOIN pharmacy_stock ps ON ps.drawer = m.drawer
                   WHERE pi.prescription_id=?""",
                (doc_id,)
            ).fetchall()
            
            items = []
            for item in items_rows:
                item_dict = dict(item)
                # Compute concentration if is_system
                if item_dict.get("is_system") and item_dict.get("stock_dosage_text"):
                    concentration = parse_concentration(item_dict["stock_dosage_text"])
                    item_dict["concentration_mg_per_ml"] = concentration
                    
                    # Compute dose_ml if dose_mg and concentration available
                    if item_dict.get("dose_mg") and concentration:
                        item_dict["dose_ml"] = round(item_dict["dose_mg"] / concentration, 2)
                
                items.append(item_dict)
            
            d["items"] = items
            result.append(d)
        
        conn.close()
        return result
    except Exception as e:
        conn.close()
        raise HTTPException(500, str(e))


@router.post("/api/patients/{patient_id}/prescriptions")
def create_prescription(patient_id: int, data: PrescriptionDocCreate):
    conn = get_db()
    try:
        if not conn.execute("SELECT id FROM patients WHERE id=?", (patient_id,)).fetchone():
            raise HTTPException(404, "Patient introuvable")
        c = conn.execute("INSERT INTO prescription_docs(patient_id,doctor_name,date,notes) VALUES (?,?,?,?)", (patient_id, data.doctor_name, data.date or str(dtdate.today()), data.notes))
        pid = c.lastrowid
        for item in data.items:
            conn.execute("INSERT INTO prescription_items(prescription_id,med_name,dosage,frequency,duration,instructions) VALUES (?,?,?,?,?,?)", (pid, item.med_name, item.dosage, item.frequency, item.duration, item.instructions))
        conn.commit()
        try:
            write_audit(conn, actor=data.doctor_name, actor_role="Médecin",
                        action="ORDONNANCE", target_type="patient", target_id=patient_id,
                        detail=f"Nouvelle ordonnance créée — {len(data.items)} médicament(s)")
        except Exception:
            pass
        return {"id": pid, "ok": True}
    finally:
        conn.close()


@router.delete("/api/prescriptions/{prescription_id}")
def delete_prescription(prescription_id: int):
    conn = get_db()
    try:
        conn.execute("DELETE FROM prescription_docs WHERE id=?", (prescription_id,))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.get("/api/patients/{patient_id}/ordonnance-lignes")
def get_ordonnance_lignes(patient_id: int):
    conn = get_db()
    ord_row = conn.execute("SELECT id FROM ordonnances WHERE patient_id=? AND statut='active' ORDER BY id DESC LIMIT 1", (patient_id,)).fetchone()
    if not ord_row:
        conn.close()
        return {"ordonnance_id": None, "lignes": []}
    oid = ord_row["id"]
    rows = conn.execute(
        """SELECT l.id AS ligne_id, l.medicament_id, l.medicament_libre, l.dose_mg, l.dose_ml,
                  l.nb_prises_par_jour, l.duree_jours, l.moment_prise, l.distributed_by_robot,
                  m.name AS med_name, m.dosage, m.schedule, m.drawer, m.time,
                  m.numero_lot, m.volume_ampoule_ml, m.dose_ampoule_mg, m.classe_therapeutique,
                  COALESCE(m.is_high_risk,0) AS is_high_risk
           FROM lignes_ordonnance l
           LEFT JOIN medications m ON m.id = l.medicament_id
           WHERE l.ordonnance_id=?""",
        (oid,),
    ).fetchall()
    conn.close()
    out = []
    for r in rows:
        d = dict(r)
        d["display_name"] = d.get("med_name") or d.get("medicament_libre") or "?"
        out.append(d)
    return {"ordonnance_id": oid, "lignes": out}


@router.post("/api/patients/{patient_id}/ordonnances", status_code=201)
def post_ordonnance_patient(patient_id: int, data: OrdonnanceCreate):
    conn = get_db()
    try:
        if data.patient_id != patient_id:
            raise HTTPException(400, "Identifiant patient incohérent")
        doc = conn.execute("SELECT * FROM doctors WHERE rfid_uid=?", (data.prescripteur_rfid.upper(),)).fetchone()
        if not doc:
            raise HTTPException(404, "Prescripteur introuvable")
        dr = dict(doc)
        rc = (dr.get("role_code") or infer_role_code(dr.get("role") or "")).lower()
        can_p = dr.get("can_prescribe")
        can_p = (0 if rc == "interne" else 1) if can_p is None else int(can_p)
        if rc == "interne" or not can_p:
            raise HTTPException(403, "Les internes ne peuvent pas cr�er ou modifier d'ordonnance")
        if not conn.execute("SELECT id FROM patients WHERE id=?", (patient_id,)).fetchone():
            raise HTTPException(404, "Patient introuvable")
        c = conn.execute("INSERT INTO ordonnances(patient_id, prescripteur_id, statut, notes, date_modification) VALUES (?,?,?,?, datetime('now'))", (patient_id, data.prescripteur_rfid.upper(), "active", data.notes))
        oid = c.lastrowid
        for ln in data.lignes:
            vol = None
            d_amp = None
            if ln.medicament_id:
                m = conn.execute("SELECT volume_ampoule_ml, dose_ampoule_mg FROM medications WHERE id=?", (ln.medicament_id,)).fetchone()
                if m:
                    vol = m["volume_ampoule_ml"]
                    d_amp = m["dose_ampoule_mg"]
            dose_ml = calc_dose_ml(ln.dose_mg, vol, d_amp)
            conn.execute(
                """INSERT INTO lignes_ordonnance(ordonnance_id, medicament_id, medicament_libre, dose_mg, dose_ml,
                    nb_prises_par_jour, duree_jours, moment_prise, distributed_by_robot)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (oid, ln.medicament_id, ln.medicament_libre, ln.dose_mg, dose_ml, ln.nb_prises_par_jour, ln.duree_jours, ln.moment_prise, ln.distributed_by_robot),
            )
        conn.commit()
        return {"id": oid, "ok": True}
    finally:
        conn.close()


@router.post("/api/ordonnances", status_code=201)
def post_ordonnance_root(data: OrdonnanceCreate):
    return post_ordonnance_patient(data.patient_id, data)


@router.get("/api/patients/{patient_id}/prescription-validation")
def get_prescription_validation(patient_id: int):
    conn = get_db()
    row = conn.execute("SELECT * FROM prescription_validation WHERE patient_id=?", (patient_id,)).fetchone()
    conn.close()
    if not row:
        return {"patient_id": patient_id, "status": "approved", "reviewer": None, "note": None, "updated_at": None}
    return dict(row)


@router.put("/api/patients/{patient_id}/prescription-validation")
def put_prescription_validation(patient_id: int, data: PrescriptionValidationBody):
    conn = get_db()
    try:
        if data.status not in ("pending", "approved", "rejected"):
            raise HTTPException(400, "status invalide")
        if not conn.execute("SELECT id FROM patients WHERE id=?", (patient_id,)).fetchone():
            raise HTTPException(404, "Patient introuvable")
        conn.execute(
            """INSERT INTO prescription_validation(patient_id,status,reviewer,note,updated_at)
               VALUES (?,?,?,?,datetime('now'))
               ON CONFLICT(patient_id) DO UPDATE SET
                 status=excluded.status, reviewer=excluded.reviewer, note=excluded.note, updated_at=excluded.updated_at""",
            (patient_id, data.status, data.reviewer or "", data.note or ""),
        )
        conn.commit()
        write_audit(conn, actor="système", actor_role="système", action="VALIDATE_PRESCRIPTION", target_type="patient", target_id=patient_id)
        row = conn.execute("SELECT * FROM prescription_validation WHERE patient_id=?", (patient_id,)).fetchone()
        return dict(row)
    finally:
        conn.close()


@router.get("/api/patients/{patient_id}/missed-doses")
def missed_doses_for_patient(patient_id: int):
    conn = get_db()
    meds = conn.execute("SELECT m.id, m.name, m.time, m.schedule FROM medications m JOIN prescriptions pr ON pr.medication_id=m.id WHERE pr.patient_id=?", (patient_id,)).fetchall()
    now = datetime.now()
    missed = []
    for m in meds:
        t = (m["time"] or "").strip()
        if not t or ":" not in t:
            continue
        try:
            hh = int(t.split(":")[0])
            mm = int(t.split(":")[1].split()[0])
        except Exception:
            continue
        if now.hour * 60 + now.minute > hh * 60 + mm + 90:
            row = conn.execute("SELECT id FROM dispense_log WHERE patient_id=? AND med_name=? AND date(timestamp)=date('now') LIMIT 1", (patient_id, m["name"])).fetchone()
            if not row:
                missed.append({"medication_id": m["id"], "name": m["name"], "expected_time": t})
    conn.close()
    return {"missed": missed, "count": len(missed)}


@router.post("/api/patients/{patient_id}/check-dose")
def check_dose(patient_id: int, body: DoseCheckRequest):
    conn = get_db()
    try:
        if not conn.execute("SELECT id FROM patients WHERE id=?", (patient_id,)).fetchone():
            raise HTTPException(404, "Patient introuvable")
        row = conn.execute("SELECT pediatric_mg_per_kg, maxdosemg24h, name FROM pharmacy_stock WHERE id=?", (body.medication_id,)).fetchone()
        if not row:
            row = conn.execute("SELECT ps.pediatric_mg_per_kg, ps.maxdosemg24h, ps.name FROM medications m JOIN pharmacy_stock ps ON ps.drawer=m.drawer WHERE m.id=?", (body.medication_id,)).fetchone()
        if not row:
            raise HTTPException(404, "M�dicament introuvable")
        mg_per_kg = row["pediatric_mg_per_kg"]
        if mg_per_kg is None:
            raise HTTPException(400, "Posologie p�diatrique indisponible")
        dose_calculated = round(float(mg_per_kg) * float(body.weight_kg), 2)
        max_dose = row["maxdosemg24h"]
        payload = {"safe": True, "calculated_mg": dose_calculated}
        if max_dose is not None and dose_calculated > float(max_dose):
            payload = {
                "safe": False,
                "calculated_mg": dose_calculated,
                "max_mg": round(float(max_dose), 2),
                "capped_mg": round(float(max_dose), 2),
                "warning": "Dose calcul�e d�passe la dose adulte maximale. Dose plafonn�e.",
            }
        write_audit(conn, actor="système", actor_role="système", action="CHECK_DOSE", target_type="patient", target_id=patient_id, detail={"medication_id": body.medication_id, "safe": payload["safe"]})
        return payload
    finally:
        conn.close()
