"""
Patient Lifecycle Management Endpoints
Handles: Dossiers (permanent patient files) and Séjours (hospitalizations)
"""
from typing import Optional
from datetime import date as dtdate
from fastapi import APIRouter, HTTPException
from database import get_db, write_audit
from helpers import row_to_dict, rows_to_list
from schemas import DossierCreate, SejourCreate, DischargeRequest
import json

router = APIRouter(tags=["lifecycle"])


# ══════════════════════════════════════════════════════════════
# DOSSIER (Permanent Patient File) ENDPOINTS
# ══════════════════════════════════════════════════════════════

@router.get("/api/dossiers/search")
def search_dossiers(
    nom: Optional[str] = None,
    prenom: Optional[str] = None,
    date_naissance: Optional[str] = None,
    telephone: Optional[str] = None,
):
    """Search for existing patient files (Dossiers) by demographics"""
    conn = get_db()
    try:
        query = "SELECT * FROM dossiers WHERE 1=1"
        params = []

        if nom:
            query += " AND nom LIKE ?"
            params.append(f"%{nom}%")
        if prenom:
            query += " AND prenom LIKE ?"
            params.append(f"%{prenom}%")
        if date_naissance:
            query += " AND date_naissance LIKE ?"
            params.append(f"%{date_naissance}%")
        if telephone:
            query += " AND telephone LIKE ?"
            params.append(f"%{telephone}%")

        query += " ORDER BY date_naissance DESC, nom, prenom"

        dossier_rows = conn.execute(query, params).fetchall()
        results = []

        for row in dossier_rows:
            d = dict(row)

            sejours_count = conn.execute(
                "SELECT COUNT(*) FROM sejours WHERE dossier_id=?",
                (d["id"],)
            ).fetchone()[0]

            dernier_sejour_row = conn.execute(
                """SELECT id, date_entree, diagnostic_entree, etat FROM sejours
                   WHERE dossier_id=? ORDER BY date_entree DESC LIMIT 1""",
                (d["id"],)
            ).fetchone()

            dernier_sejour = dict(dernier_sejour_row) if dernier_sejour_row else None

            # FIX 1: etat is 'sorti' not 'discharged' — check for 'admis' is correct
            is_currently_admitted = bool(
                conn.execute(
                    "SELECT id FROM sejours WHERE dossier_id=? AND etat='admis'",
                    (d["id"],)
                ).fetchone()
            )

            results.append({
                **d,
                "sejours_count": sejours_count,
                "dernier_sejour": dernier_sejour,
                "is_currently_admitted": is_currently_admitted,
            })

        return results
    finally:
        conn.close()


@router.get("/api/dossiers")
def list_dossiers(etat: Optional[str] = None):
    """
    List all dossiers (permanent patient files).
    Optional filter: etat='admis' for current patients, etat='sorti' for archive.
    """
    conn = get_db()
    try:
        dossier_rows = conn.execute(
            "SELECT * FROM dossiers ORDER BY createdat DESC"
        ).fetchall()
        results = []

        for row in dossier_rows:
            d = dict(row)

            sejours_rows = conn.execute(
                """SELECT id, date_entree, date_sortie, diagnostic_entree,
                          diagnostic_sortie, etat, type_sortie, roomid, bed
                   FROM sejours WHERE dossier_id=? ORDER BY date_entree DESC""",
                (d["id"],)
            ).fetchall()
            sejours = [dict(s) for s in sejours_rows]

            is_currently_admitted = any(s["etat"] == "admis" for s in sejours)

            # Filter by etat if requested
            if etat == "admis" and not is_currently_admitted:
                continue
            if etat == "sorti" and is_currently_admitted:
                continue

            d["sejours"] = sejours
            d["sejours_count"] = len(sejours)
            d["is_currently_admitted"] = is_currently_admitted
            results.append(d)

        return results
    finally:
        conn.close()


@router.get("/api/dossiers/{dossier_id}")
def get_dossier(dossier_id: int):
    """Get a single dossier with all its sejours and discharge summaries"""
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM dossiers WHERE id=?", (dossier_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Dossier introuvable")

        d = dict(row)

        sejours_rows = conn.execute(
            """SELECT * FROM sejours WHERE dossier_id=? ORDER BY date_entree DESC""",
            (dossier_id,)
        ).fetchall()

        sejours = []
        for s in sejours_rows:
            sr = dict(s)
            crs_row = conn.execute(
                "SELECT * FROM comptes_rendus_sortie WHERE sejour_id=? LIMIT 1",
                (sr["id"],)
            ).fetchone()
            sr["compte_rendu_sortie"] = dict(crs_row) if crs_row else None
            sejours.append(sr)

        d["sejours"] = sejours
        d["sejours_count"] = len(sejours)
        d["is_currently_admitted"] = any(s["etat"] == "admis" for s in sejours)
        return d
    finally:
        conn.close()


@router.post("/api/dossiers", status_code=201)
def create_dossier(data: DossierCreate):
    """Create a new permanent patient file (Dossier)"""
    conn = get_db()
    try:
        allergies_json = json.dumps(data.allergies_permanentes or []) if data.allergies_permanentes else "[]"
        vaccinations_json = json.dumps(data.vaccinations or []) if data.vaccinations else "[]"

        c = conn.execute(
            """INSERT INTO dossiers(
                nom, prenom, date_naissance, sexe,
                nom_pere, nom_mere, telephone,
                groupe_sanguin, rhesus, groupe_abo,
                allergies_permanentes, antecedents_chroniques,
                vaccinations, vaccination_status, notes_permanentes,
                created_by
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                data.nom,
                data.prenom,
                data.date_naissance,
                data.sexe,
                data.nom_pere,
                data.nom_mere,
                data.telephone,
                data.groupe_sanguin,
                data.rhesus,
                data.groupe_abo,
                allergies_json,
                data.antecedents_chroniques or "",
                vaccinations_json,
                "inconnu",
                data.notes_permanentes or "",
                data.created_by,
            ),
        )
        conn.commit()

        new_id = c.lastrowid
        write_audit(
            conn,
            actor=data.created_by,
            actor_role="système",
            action="CREATE_DOSSIER",
            target_type="dossier",
            target_id=new_id,
            detail={"nom": data.nom, "prenom": data.prenom}
        )

        row = conn.execute("SELECT * FROM dossiers WHERE id=?", (new_id,)).fetchone()
        return dict(row) if row else {"id": new_id}
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════
# SEJOUR (Hospitalization) ENDPOINTS
# ══════════════════════════════════════════════════════════════

@router.post("/api/dossiers/{dossier_id}/sejours", status_code=201)
def create_sejour(dossier_id: int, data: SejourCreate):
    """Open a new hospitalization for an existing dossier"""
    conn = get_db()
    try:
        dossier_row = conn.execute("SELECT * FROM dossiers WHERE id=?", (dossier_id,)).fetchone()
        if not dossier_row:
            raise HTTPException(404, "Dossier patient introuvable")

        room_row = conn.execute("SELECT * FROM rooms WHERE id=?", (data.roomid,)).fetchone()
        if not room_row:
            raise HTTPException(404, f"Salle {data.roomid} introuvable")

        occupied = conn.execute(
            "SELECT id FROM patients WHERE room_id=? AND bed=? AND is_archived=0",
            (data.roomid, data.bed)
        ).fetchone()
        if occupied:
            raise HTTPException(409, f"Lit {data.bed} de la salle {data.roomid} déjà occupé")

        c = conn.execute(
            """INSERT INTO sejours(
                dossier_id, date_entree, diagnostic_entree,
                roomid, bed, poids_admission, taille_admission,
                pc_cranien, tuteur_nom, tuteur_telephone, tuteur_relation,
                etat, created_by
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                dossier_id,
                dtdate.today().isoformat(),
                data.diagnostic_entree,
                data.roomid,
                data.bed,
                data.poids_admission,
                data.taille_admission,
                data.pc_cranien,
                data.tuteur_nom,
                data.tuteur_telephone,
                data.tuteur_relation,
                "admis",
                data.created_by,
            ),
        )
        conn.commit()

        new_sejour_id = c.lastrowid

        write_audit(
            conn,
            actor=data.created_by,
            actor_role="système",
            action="ADMISSION",
            target_type="sejour",
            target_id=new_sejour_id,
            detail={
                "dossier_id": dossier_id,
                "diagnostic": data.diagnostic_entree,
                "room": data.roomid,
                "bed": data.bed
            }
        )

        sejour_row = conn.execute("SELECT * FROM sejours WHERE id=?", (new_sejour_id,)).fetchone()
        result = dict(dossier_row) if dossier_row else {}
        result.update(dict(sejour_row) if sejour_row else {})
        result["sejour_id"] = new_sejour_id

        return result
    finally:
        conn.close()


@router.post("/api/patients/{patient_id}/discharge", status_code=200)
def discharge_patient(patient_id: int, data: DischargeRequest):
    """Discharge a patient (end of hospitalization)"""
    conn = get_db()
    try:
        patient_row = conn.execute("SELECT * FROM patients WHERE id=?", (patient_id,)).fetchone()
        if not patient_row:
            raise HTTPException(404, "Patient introuvable")

        patient = dict(patient_row)

        conn.execute(
            """UPDATE patients SET etat=?, date_sortie=?, type_sortie=?,
               resume_clinique=?, traitement_sortie=?, consignes_parents=?,
               medecin_sortie=?, is_archived=1, room_id=NULL, bed=NULL
               WHERE id=?""",
            (
                # FIX 2: use 'sorti' consistently, not data.type_sortie for the etat column
                "sorti",
                dtdate.today().isoformat(),
                data.type_sortie,
                data.resume_clinique,
                data.traitement_sortie,
                data.consignes_parents,
                data.medecin_sortie,
                patient_id,
            ),
        )

        conn.execute(
            """UPDATE prescriptions SET end_date=?
               WHERE patient_id=? AND end_date IS NULL""",
            (dtdate.today().isoformat(), patient_id,)
        )

        sejour_id = patient.get("sejour_id")
        dossier_id = patient.get("dossier_id")

        if not dossier_id:
            d = conn.execute(
                """INSERT INTO dossiers(
                    nom, prenom, date_naissance, sexe, telephone, created_by
                ) VALUES (?,?,?,?,?,?)""",
                (
                    patient.get("last_name", "Inconnu"),
                    patient.get("first_name", "Inconnu"),
                    patient.get("date_naissance", ""),
                    patient.get("sexe", "M"),
                    patient.get("telephone", ""),
                    data.medecin_sortie,
                ),
            )
            dossier_id = d.lastrowid
            conn.execute(
                "UPDATE patients SET dossier_id=? WHERE id=?",
                (dossier_id, patient_id)
            )

        if not sejour_id:
            c = conn.execute(
                """INSERT INTO sejours(
                    dossier_id, date_entree, diagnostic_entree,
                    roomid, bed, etat, created_by
                ) VALUES (?,?,?,?,?,?,?)""",
                (
                    dossier_id,
                    patient.get("date_entree") or dtdate.today().isoformat(),
                    patient.get("diagnostic", "Non spécifié"),
                    patient.get("room_id"),
                    patient.get("bed"),
                    # FIX 2: use 'sorti' consistently
                    "sorti",
                    data.medecin_sortie,
                ),
            )
            sejour_id = c.lastrowid
            conn.execute(
                "UPDATE patients SET sejour_id=? WHERE id=?",
                (sejour_id, patient_id)
            )
        else:
            # Update existing sejour to mark as discharged
            conn.execute(
                """UPDATE sejours SET etat='sorti', date_sortie=?,
                   diagnostic_sortie=?, type_sortie=?, resume_clinique=?,
                   traitement_sortie=?, consignes_parents=?, medecin_sortie=?
                   WHERE id=?""",
                (
                    dtdate.today().isoformat(),
                    data.diagnostic_sortie,
                    data.type_sortie,
                    data.resume_clinique,
                    data.traitement_sortie,
                    data.consignes_parents,
                    data.medecin_sortie,
                    sejour_id,
                )
            )

        crs_cursor = conn.execute(
            """INSERT INTO comptes_rendus_sortie(
                sejour_id, dossier_id, date_redaction,
                medecin_redacteur, diagnostic_principal,
                resume_sejour, traitement_sortie,
                consignes, rdv_controle, type_sortie,
                scam_signature
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (
                sejour_id,
                dossier_id,
                dtdate.today().isoformat(),
                data.medecin_sortie,
                data.diagnostic_sortie,
                data.resume_clinique,
                data.traitement_sortie,
                data.consignes_parents,
                data.rdv_controle,
                data.type_sortie,
                int(data.scam_signature),
            ),
        )
        crs_id = crs_cursor.lastrowid

        conn.commit()

        write_audit(
            conn,
            actor=data.medecin_sortie,
            actor_role="système",
            action="DISCHARGE",
            target_type="patient",
            target_id=patient_id,
            detail={
                "type_sortie": data.type_sortie,
                "diagnostic": data.diagnostic_sortie,
                "dossier_id": dossier_id,
                "sejour_id": sejour_id,
            }
        )

        return {"success": True, "crs_id": crs_id, "dossier_id": dossier_id, "sejour_id": sejour_id}
    finally:
        conn.close()


@router.get("/api/patients/{patient_id}/historique")
def get_patient_history(patient_id: int):
    """Get complete patient history including all stays"""
    conn = get_db()
    try:
        patient_row = conn.execute("SELECT * FROM patients WHERE id=?", (patient_id,)).fetchone()
        if not patient_row:
            raise HTTPException(404, "Patient introuvable")

        patient = dict(patient_row)
        dossier_id = patient.get("dossier_id")

        # FIX 3: sejours has no patient_id column — query only by dossier_id
        sejours_rows = []
        if dossier_id:
            sejours_rows = conn.execute(
                """SELECT id, date_entree, date_sortie, diagnostic_entree,
                          diagnostic_sortie, poids_admission, etat, type_sortie,
                          roomid, bed FROM sejours WHERE dossier_id=?
                   ORDER BY date_entree DESC""",
                (dossier_id,),
            ).fetchall()

        sejours = []
        for s in sejours_rows:
            sr = dict(s)
            px_count = conn.execute(
                "SELECT COUNT(*) FROM prescriptions WHERE patient_id=?",
                (patient_id,)
            ).fetchone()[0]
            sr["prescriptions_count"] = px_count
            sejours.append(sr)

        prescriptions = rows_to_list(
            conn.execute(
                "SELECT * FROM prescriptions WHERE patient_id=?",
                (patient_id,)
            ).fetchall()
        )

        audit_entries = rows_to_list(
            conn.execute(
                """SELECT * FROM audit_log WHERE target_type='patient'
                   AND target_id=? ORDER BY timestamp DESC""",
                (patient_id,)
            ).fetchall()
        )

        return {
            "patient": patient,
            "dossier_id": dossier_id,
            "sejours": sejours,
            "prescriptions": prescriptions,
            "audit_entries": audit_entries,
        }
    finally:
        conn.close()

# NOTE: DELETE /api/patients/{patient_id} is intentionally defined only in patients.py
# It was removed from here to eliminate the duplicate route conflict.
