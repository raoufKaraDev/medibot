from math import sqrt
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends

from database import get_db, write_audit
from helpers import (
    _allergies_to_json_for_db,
    _dump_patient_update,
    _dump_treatment_update,
    _json_str_list_for_db,
    _ph_int,
    _split_blood_type_code,
    enrich_patient_dict,
    parse_patient_row,
    parse_weight_kg,
    row_to_dict,
    rows_to_list,
)
from schemas import (
    GuardianCreate,
    GuardianUpdate,
    NotifyPatientBody,
    PatientCreate,
    PatientTreatmentCreate,
    PatientTreatmentUpdate,
    PatientUpdate,
    PhotoUpload,
    DeletePatientRequest,
)
from middleware import require_admin

router = APIRouter(tags=["patients"])


def _patient_full_name(patient: dict) -> str:
    """Format patient full name defensively."""
    first = patient.get('first_name', '').strip() if patient.get('first_name') else ''
    last = patient.get('last_name', '').strip() if patient.get('last_name') else ''
    return f"{first} {last}".strip()


def _round2(value: Optional[float]) -> Optional[float]:
    return None if value is None else round(float(value), 2)


@router.get("/api/patients")
def list_patients(room_id: Optional[int] = None, actifs_seulement: bool = True):
    conn = get_db()
    if room_id:
        if actifs_seulement:
            rows = conn.execute("SELECT * FROM patients WHERE room_id=? AND is_archived=0 ORDER BY bed", (room_id,)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM patients WHERE room_id=? ORDER BY bed", (room_id,)).fetchall()
    else:
        if actifs_seulement:
            rows = conn.execute("SELECT * FROM patients WHERE is_archived=0 ORDER BY room_id, bed", ()).fetchall()
        else:
            rows = conn.execute("SELECT * FROM patients ORDER BY room_id, bed", ()).fetchall()
    result = []
    for r in rows:
        p = parse_patient_row(r)  # Parse JSON fields
        enrich_patient_dict(p, conn=None, with_treatments=False)
        p["full_name"] = _patient_full_name(p)
        g = conn.execute("SELECT * FROM guardians WHERE patient_id=? LIMIT 1", (p["id"],)).fetchone()
        p["guardian"] = row_to_dict(g)
        p.setdefault("current_treatments", [])
        result.append(p)
    conn.close()
    return result


@router.post("/api/patients", status_code=201, dependencies=[Depends(require_admin)])
def create_patient(data: PatientCreate):
    conn = None
    try:
        conn = get_db()
        # Validate blood_type is provided
        if not data.blood_type:
            raise HTTPException(400, "Le groupe sanguin est requis")
        room = conn.execute("SELECT * FROM rooms WHERE id=?", (data.room_id,)).fetchone()
        if not room:
            raise HTTPException(404, f"Salle {data.room_id} introuvable")
        occupied = conn.execute("SELECT id FROM patients WHERE room_id=? AND bed=?", (data.room_id, data.bed)).fetchone()
        if occupied:
            raise HTTPException(409, f"Lit {data.bed} de la salle {data.room_id} déjà occupé")
        drug_names = list(dict.fromkeys([*(data.drug_allergies or []), *(data.allergies or [])]))
        other_names = list(dict.fromkeys(data.other_allergies or []))
        allj = _allergies_to_json_for_db([{"medication": x} for x in drug_names])
        drug_j = _json_str_list_for_db(drug_names)
        oth_j = _json_str_list_for_db(other_names)
        vacs_j = _json_str_list_for_db(data.vaccinations or [])
        gs = data.groupe_sanguin or data.blood_type
        abo = (data.groupe_abo or "").strip() or _split_blood_type_code(data.blood_type)[0]
        rh = (data.rhesus or "positif").strip().lower()
        if rh not in ("positif", "negatif"):
            rh = "positif"
        c = conn.execute(
            """INSERT INTO patients(first_name,last_name,age,weight,blood_type,diagnostic,room_id,bed,allergies,notes,
               date_naissance,groupe_sanguin,groupe_abo,rhesus,ph_C,ph_c,ph_E,ph_e,ph_K,ph_k,
               antecedents,traitement_en_cours,drug_allergies,other_allergies,taille,pcranien,poidsnaissance,
               poidsref,vaccination_status,vaccinations) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                data.first_name,
                data.last_name,
                data.age,
                data.weight,
                data.blood_type,
                data.diagnostic,
                data.room_id,
                data.bed,
                allj,
                data.notes,
                data.date_naissance,
                gs,
                abo,
                rh,
                _ph_int(data.ph_C, 0),
                _ph_int(data.ph_c, 0),
                _ph_int(data.ph_E, 0),
                _ph_int(data.ph_e, 0),
                _ph_int(data.ph_K, 0),
                _ph_int(data.ph_k, 0),
                data.antecedents or "",
                data.traitement_en_cours or "",
                drug_j,
                oth_j,
                data.taille,
                data.pcranien,
                data.poidsnaissance,
                data.poidsref,
                data.vaccination_status or "inconnu",
                vacs_j,
            ),
        )
        conn.commit()
        new_id = c.lastrowid
        write_audit(conn, actor=_patient_full_name({"first_name": data.first_name, "last_name": data.last_name}), actor_role="système", action="CREATE_PATIENT", target_type="patient", target_id=new_id)
        row = conn.execute("SELECT * FROM patients WHERE id=?", (new_id,)).fetchone()
        p = dict(row)
        enrich_patient_dict(p, conn=conn, with_treatments=True)
        p["full_name"] = _patient_full_name(p)
        conn.close()
        return p
    except HTTPException:
        if conn:
            conn.close()
        raise
    except Exception as e:
        print(f"[POST /api/patients] Error: {e}")
        if conn:
            conn.close()
        raise HTTPException(500, f"Erreur lors de la création du patient: {str(e)}")
    finally:
        if conn and not conn:
            conn.close()


@router.get("/api/patients/{patient_id}")
def get_patient(patient_id: int):
    conn = None
    try:
        conn = get_db()
        row = conn.execute("SELECT * FROM patients WHERE id=?", (patient_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Patient introuvable")
        
        # Parse patient row with JSON field handling
        p = parse_patient_row(row)
        
        # Enrich with computed fields
        enrich_patient_dict(p, conn=conn, with_treatments=True)
        treatment_rows = conn.execute("SELECT * FROM patient_current_treatments WHERE patient_id=? AND active=1 ORDER BY id", (patient_id,)).fetchall()
        p["current_treatments"] = rows_to_list(treatment_rows)
        # Add full name and guardian info
        p["full_name"] = _patient_full_name(p)
        g = conn.execute("SELECT * FROM guardians WHERE patient_id=? LIMIT 1", (patient_id,)).fetchone()
        p["guardian"] = row_to_dict(g)
        
        # Add guardians list and medications
        p["guardians"] = rows_to_list(conn.execute("SELECT * FROM guardians WHERE patient_id=?", (patient_id,)).fetchall())
        
        # Safely get medications - handle case where no prescriptions exist
        med_rows = conn.execute(
            "SELECT m.*, pr.start_date, pr.end_date FROM medications m LEFT JOIN prescriptions pr ON pr.medication_id=m.id WHERE pr.patient_id=?",
            (patient_id,)
        ).fetchall()
        p["medications"] = rows_to_list(med_rows) if med_rows else []
        
        # CHANGE 3: Newborn weight loss alert
        p["alerts"] = []
        if p.get("date_naissance"):
            try:
                from datetime import datetime, date as dtdate
                birth_date = datetime.strptime(p["date_naissance"][:10], "%Y-%m-%d").date()
                age_days = (dtdate.today() - birth_date).days
                if age_days <= 10 and p.get("poidsnaissance") and p.get("weight"):
                    birth_weight = float(p["poidsnaissance"]) if isinstance(p["poidsnaissance"], (int, float)) else None
                    current_weight = parse_weight_kg(p["weight"])
                    if birth_weight and current_weight and birth_weight > 0:
                        weight_loss_pct = ((birth_weight - current_weight) / birth_weight) * 100
                        if weight_loss_pct > 10:
                            p["alerts"].append({
                                "type": "newborn_weight_loss",
                                "message": f"Perte de poids \u00e9lev\u00e9e: {weight_loss_pct:.1f}% (age {age_days}j)",
                                "severity": "warning"
                            })
            except Exception:
                pass
        
        return p
    except HTTPException:
        raise
    except Exception as e:
        print(f"[GET /api/patients/{patient_id}] Error: {e}")
        raise HTTPException(500, f"Erreur lors de la récupération du patient: {str(e)}")
    finally:
        if conn:
            conn.close()


@router.put("/api/patients/{patient_id}", dependencies=[Depends(require_admin)])
def update_patient(patient_id: int, data: PatientUpdate):
    conn = get_db()
    try:
        if not conn.execute("SELECT id FROM patients WHERE id=?", (patient_id,)).fetchone():
            raise HTTPException(404, "Patient introuvable")
        fields = {k: v for k, v in _dump_patient_update(data.dict()).items() if v is not None}
        if "allergies" in fields:
            fields["allergies"] = _allergies_to_json_for_db(fields["allergies"])
        if "drug_allergies" in fields:
            fields["drug_allergies"] = _json_str_list_for_db(fields["drug_allergies"])
        if "other_allergies" in fields:
            fields["other_allergies"] = _json_str_list_for_db(fields["other_allergies"])
        if "vaccinations" in fields:
            fields["vaccinations"] = _json_str_list_for_db(fields["vaccinations"])
        for k in ("ph_C", "ph_c", "ph_E", "ph_e", "ph_K", "ph_k"):
            if k in fields:
                fields[k] = _ph_int(fields[k], 0)
        if "rhesus" in fields:
            r = str(fields["rhesus"]).lower()
            fields["rhesus"] = r if r in ("positif", "negatif") else "positif"
        if fields:
            sets = ", ".join(f"{k}=?" for k in fields)
            conn.execute(f"UPDATE patients SET {sets} WHERE id=?", (*fields.values(), patient_id))
            conn.commit()
        write_audit(conn, actor="système", actor_role="système", action="EDIT_PATIENT", target_type="patient", target_id=patient_id)
        return get_patient(patient_id)
    finally:
        conn.close()


@router.delete("/api/patients/{patient_id}", dependencies=[Depends(require_admin)])
def delete_patient(patient_id: int, data: DeletePatientRequest):
    conn = get_db()
    try:
        if not conn.execute("SELECT id FROM patients WHERE id=?", (patient_id,)).fetchone():
            raise HTTPException(404, "Patient introuvable")
        
        # Check for prescriptions or dispense history
        px_count = conn.execute("SELECT COUNT(*) FROM prescriptions WHERE patient_id=?", (patient_id,)).fetchone()[0]
        dispense_count = conn.execute("SELECT COUNT(*) FROM dispense_log WHERE patient_id=?", (patient_id,)).fetchone()[0]
        
        if px_count > 0 or dispense_count > 0:
            raise HTTPException(
                403,
                "Impossible de supprimer un dossier avec des données cliniques. Utilisez la procédure de sortie."
            )
        
        conn.execute("DELETE FROM patients WHERE id=?", (patient_id,))
        conn.commit()
        write_audit(
            conn,
            actor=data.actor,
            actor_role="Médecin Chef Pédiatrie",
            action="PATIENT_DELETED",
            target_type="patient",
            target_id=patient_id,
            detail={"reason": data.reason}
        )
        return {"success": True}
    finally:
        conn.close()


@router.post("/api/patients/{patient_id}/photo", dependencies=[Depends(require_admin)])
def upload_photo(patient_id: int, data: PhotoUpload):
    conn = get_db()
    try:
        if not conn.execute("SELECT id FROM patients WHERE id=?", (patient_id,)).fetchone():
            raise HTTPException(404, "Patient introuvable")
        conn.execute("UPDATE patients SET photo=? WHERE id=?", (data.photo, patient_id))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.get("/api/patients/{patient_id}/photo")
def get_photo(patient_id: int):
    conn = get_db()
    row = conn.execute("SELECT photo FROM patients WHERE id=?", (patient_id,)).fetchone()
    conn.close()
    if not row or not row["photo"]:
        raise HTTPException(404, "Aucune photo")
    return {"photo": row["photo"]}


@router.get("/api/patients/{patient_id}/guardians")
def list_guardians(patient_id: int):
    conn = get_db()
    rows = conn.execute("SELECT * FROM guardians WHERE patient_id=?", (patient_id,)).fetchall()
    conn.close()
    return rows_to_list(rows)


@router.post("/api/patients/{patient_id}/guardians", status_code=201, dependencies=[Depends(require_admin)])
def add_guardian(patient_id: int, data: GuardianCreate):
    conn = get_db()
    try:
        if not conn.execute("SELECT id FROM patients WHERE id=?", (patient_id,)).fetchone():
            raise HTTPException(404, "Patient introuvable")
        c = conn.execute("INSERT INTO guardians(patient_id,name,phone,relationship,present) VALUES (?,?,?,?,?)", (patient_id, data.name, data.phone, data.relationship, int(data.present)))
        conn.commit()
        row = conn.execute("SELECT * FROM guardians WHERE id=?", (c.lastrowid,)).fetchone()
        return row_to_dict(row)
    finally:
        conn.close()


@router.put("/api/guardians/{guardian_id}", dependencies=[Depends(require_admin)])
def update_guardian(guardian_id: int, data: GuardianUpdate):
    conn = get_db()
    try:
        fields = {k: v for k, v in data.dict().items() if v is not None}
        if "present" in fields:
            fields["present"] = int(fields["present"])
        if fields:
            sets = ", ".join(f"{k}=?" for k in fields)
            conn.execute(f"UPDATE guardians SET {sets} WHERE id=?", (*fields.values(), guardian_id))
            conn.commit()
        row = conn.execute("SELECT * FROM guardians WHERE id=?", (guardian_id,)).fetchone()
        return row_to_dict(row)
    finally:
        conn.close()


@router.delete("/api/guardians/{guardian_id}", dependencies=[Depends(require_admin)])
def delete_guardian(guardian_id: int):
    conn = get_db()
    try:
        if not conn.execute("SELECT id FROM guardians WHERE id=?", (guardian_id,)).fetchone():
            raise HTTPException(404, "Tuteur introuvable")
        conn.execute("DELETE FROM guardians WHERE id=?", (guardian_id,))
        conn.commit()
        return {"success": True}
    finally:
        conn.close()


@router.get("/api/patients/{patient_id}/current-treatments")
def list_patient_current_treatments(patient_id: int):
    conn = get_db()
    if not conn.execute("SELECT id FROM patients WHERE id=?", (patient_id,)).fetchone():
        conn.close()
        raise HTTPException(404, "Patient introuvable")
    rows = conn.execute("SELECT * FROM patient_current_treatments WHERE patient_id=? ORDER BY id", (patient_id,)).fetchall()
    conn.close()
    return rows_to_list(rows)


@router.post("/api/patients/{patient_id}/current-treatments", status_code=201, dependencies=[Depends(require_admin)])
def add_patient_current_treatment(patient_id: int, data: PatientTreatmentCreate):
    from datetime import date as _date

    conn = get_db()
    try:
        if not conn.execute("SELECT id FROM patients WHERE id=?", (patient_id,)).fetchone():
            raise HTTPException(404, "Patient introuvable")
        c = conn.execute(
            """INSERT INTO patient_current_treatments(patient_id, med_name, dose, frequency, route, start_date, end_date, origin, notes, active)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (patient_id, data.med_name.strip(), data.dose or "", data.frequency or "", data.route or "", data.start_date or str(_date.today()), data.end_date, data.origin or "Hospitalisation", data.notes or "", 1 if data.active else 0),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM patient_current_treatments WHERE id=?", (c.lastrowid,)).fetchone()
        return row_to_dict(row)
    finally:
        conn.close()


@router.put("/api/patients/{patient_id}/current-treatments/{treatment_id}", dependencies=[Depends(require_admin)])
def update_patient_current_treatment(patient_id: int, treatment_id: int, data: PatientTreatmentUpdate):
    conn = get_db()
    try:
        row = conn.execute("SELECT id FROM patient_current_treatments WHERE id=? AND patient_id=?", (treatment_id, patient_id)).fetchone()
        if not row:
            raise HTTPException(404, "Traitement introuvable pour ce patient")
        fields = {k: v for k, v in _dump_treatment_update(data).items() if v is not None}
        if "active" in fields:
            fields["active"] = 1 if fields["active"] else 0
        if fields:
            sets = ", ".join(f"{k}=?" for k in fields)
            conn.execute(f"UPDATE patient_current_treatments SET {sets} WHERE id=? AND patient_id=?", (*fields.values(), treatment_id, patient_id))
            conn.commit()
        row2 = conn.execute("SELECT * FROM patient_current_treatments WHERE id=?", (treatment_id,)).fetchone()
        return row_to_dict(row2)
    finally:
        conn.close()


@router.delete("/api/patients/{patient_id}/current-treatments/{treatment_id}", dependencies=[Depends(require_admin)])
def delete_patient_current_treatment(patient_id: int, treatment_id: int):
    conn = get_db()
    try:
        cur = conn.execute("DELETE FROM patient_current_treatments WHERE id=? AND patient_id=?", (treatment_id, patient_id))
        if cur.rowcount == 0:
            raise HTTPException(404, "Traitement introuvable pour ce patient")
        conn.commit()
        return {"success": True}
    finally:
        conn.close()


@router.put("/api/patients/{patient_id}/notify-guardian", dependencies=[Depends(require_admin)])
def set_notify_guardian(patient_id: int, data: NotifyPatientBody):
    conn = get_db()
    try:
        conn.execute("UPDATE patients SET notify_guardian=? WHERE id=?", (1 if data.notify_guardian else 0, patient_id))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.get("/api/patients/{patient_id}/surface-corporelle")
def patient_surface_corporelle(patient_id: int):
    conn = get_db()
    try:
        row = conn.execute("SELECT taille, weight FROM patients WHERE id=?", (patient_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Patient introuvable")
        taille = row["taille"]
        weight_kg = parse_weight_kg(row["weight"])
        if not taille or weight_kg is None:
            raise HTTPException(400, "Taille ou poids indisponible")
        sc = sqrt((float(taille) * float(weight_kg)) / 3600)
        payload = {"sc_m2": round(sc, 2), "taille_cm": int(taille), "weight_kg": round(weight_kg, 2), "formula": "Mosteller"}
        write_audit(conn, actor="système", actor_role="système", action="GET_SURFACE_CORPORELLE", target_type="patient", target_id=patient_id, detail=payload)
        return payload
    finally:
        conn.close()


@router.get("/api/patients/{patient_id}/emergency-doses")
def emergency_doses(patient_id: int):
    conn = get_db()
    try:
        row = conn.execute("SELECT id, weight FROM patients WHERE id=?", (patient_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Patient introuvable")
        weight_kg = parse_weight_kg(row["weight"])
        if weight_kg is None:
            raise HTTPException(400, "Poids patient indisponible")

        adrenaline_mg = min(1.0, max(0.1, 0.01 * weight_kg))
        diazepam_mg = min(10.0, max(2.5, 0.3 * weight_kg))
        atropine_mg = min(0.6, max(0.1, 0.02 * weight_kg))
        hydrocortisone_mg = 4.0 * weight_kg

        payload = {
            "weight_kg": _round2(weight_kg),
            "adrenaline": {"dose_mg": _round2(adrenaline_mg), "volume_ml": _round2(adrenaline_mg), "formula": "0.01 mg/kg", "concentration": "1mg/1ml"},
            "diazepam": {"dose_mg": _round2(diazepam_mg), "volume_ml": _round2(diazepam_mg / 5.0), "formula": "0.3 mg/kg", "concentration": "10mg/2ml"},
            "atropine": {"dose_mg": _round2(atropine_mg), "volume_ml": _round2(atropine_mg * 5.0), "formula": "0.02 mg/kg", "concentration": "0.5mg/2.5ml"},
            "hydrocortisone": {"dose_mg": _round2(hydrocortisone_mg), "volume_ml": None, "formula": "4 mg/kg", "concentration": "injectable"},
        }
        write_audit(conn, actor="système", actor_role="système", action="GET_EMERGENCY_DOSES", target_type="patient", target_id=patient_id, detail={"weight_kg": payload["weight_kg"]})
        return payload
    finally:
        conn.close()
