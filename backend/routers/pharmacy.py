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

@router.get("/api/pharmacy/prescription-queue")
def prescription_queue():
    conn = get_db()
    rows = conn.execute(
        """SELECT p.id AS patient_id, p.first_name, p.last_name,
                  v.status, v.reviewer, v.updated_at,
                  (SELECT COUNT(*) FROM prescriptions pr WHERE pr.patient_id=p.id) AS med_count
           FROM patients p
           LEFT JOIN prescription_validation v ON v.patient_id=p.id
           WHERE COALESCE(v.status,'pending') IN ('pending','rejected')
           ORDER BY (v.updated_at IS NULL), v.updated_at DESC, p.id"""
    ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["full_name"] = f"{d['first_name']} {d['last_name']}"
        meds = conn.execute(
            """SELECT m.name, m.dosage, m.drawer, COALESCE(m.is_high_risk,0) AS is_high_risk
               FROM medications m JOIN prescriptions pr ON pr.medication_id=m.id
               WHERE pr.patient_id=?""",
            (d["patient_id"],),
        ).fetchall()
        d["medications"] = rows_to_list(meds)
        out.append(d)
    conn.close()
    return out


@router.get("/api/pharmacy/stock")
def list_stock():
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM pharmacy_stock ORDER BY therapeutic_class, name"
    ).fetchall()
    conn.close()
    result = []
    today = __import__("datetime").date.today().isoformat()
    for r in rows:
        item = stock_with_status(r)
        qty = item.get("quantity", 0) or 0
        cpd = item.get("consumption_per_day") or 0
        try:
            cpd_f = float(cpd) if cpd is not None else 0.0
        except (TypeError, ValueError):
            cpd_f = 0.0
        item["days_remaining"] = round(qty / cpd_f) if cpd_f > 0 else None
        exp = item.get("expiry_date") or ""
        if exp and exp > today:
            from datetime import date as _date

            d1 = _date.fromisoformat(today)
            d2 = _date.fromisoformat(exp[:10])
            item["days_until_expiry"] = (d2 - d1).days
        else:
            item["days_until_expiry"] = 0 if exp else None
        result.append(item)
    return result



@router.get("/api/pharmacy")
def get_pharmacy():
    return list_stock()


def _pharmacy_patch(data: PharmacyStockUpdate) -> dict:
    if hasattr(data, "model_dump"):
        return data.model_dump(exclude_unset=True)
    return data.dict(exclude_unset=True)



@router.post("/api/pharmacy/stock")
def add_stock(data: PharmacyStockCreate, request: Request):
    conn = None
    try:
        conn = get_db()
        c = conn.execute(
            """INSERT INTO pharmacy_stock(
                 name,dosage,unit,quantity,min_stock,max_stock,
                 expiry_date,drawer,location,pediatric_mg_per_kg,
                 lot_number,reception_date,therapeutic_class,
                 commercial_name,dosage_form,storage_condition,
                 requires_preparation,is_psychotropic,is_cold_chain,
                 is_restricted_pediatric,supplier,barcode,notes,is_high_risk
               ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                data.name,
                data.dosage,
                data.unit,
                data.quantity,
                data.min_stock,
                data.max_stock or 0,
                data.expiry_date,
                data.drawer,
                data.location,
                data.pediatric_mg_per_kg,
                data.lot_number or "",
                data.reception_date or "",
                data.therapeutic_class or "",
                data.commercial_name or "",
                data.dosage_form or "",
                data.storage_condition or "Température ambiante",
                data.requires_preparation or 0,
                data.is_psychotropic or 0,
                data.is_cold_chain or 0,
                data.is_restricted_pediatric or 0,
                data.supplier or "",
                data.barcode or "",
                data.notes or "",
                data.is_high_risk or 0,
            ),
        )
        conn.commit()
        new_id = c.lastrowid
        try:
            actor = request.headers.get("x-medibot-user-name") or request.headers.get("X-Medibot-User-Name") or "system"
            role = request.headers.get("x-medibot-user-role") or request.headers.get("X-Medibot-User-Role")
            write_audit(conn, actor=actor, actor_role=role, action="CREATE_STOCK", target_type="pharmacy_stock", target_id=new_id, detail={"name": data.name})
            conn.commit()
        except Exception:
            pass
        row = conn.execute("SELECT * FROM pharmacy_stock WHERE id=?", (new_id,)).fetchone()
        result = row_to_dict(row)
        conn.close()
        return result
    except Exception as e:
        print(f"[POST /api/pharmacy/stock] Error: {e}")
        if conn:
            conn.close()
        raise



@router.put("/api/pharmacy/stock/{stock_id}")
def update_stock(stock_id: int, data: PharmacyStockUpdate, request: Request):
    conn = None
    try:
        conn = get_db()
        row = conn.execute(
            "SELECT * FROM pharmacy_stock WHERE id=?", (stock_id,)
        ).fetchone()
        if not row:
            conn.close()
            raise HTTPException(404, "Article introuvable")
        d = dict(row)
        for k, v in _pharmacy_patch(data).items():
            if v is not None:
                d[k] = v
        conn.execute(
            """UPDATE pharmacy_stock SET
                 name=?,dosage=?,unit=?,quantity=?,min_stock=?,max_stock=?,
                 expiry_date=?,drawer=?,location=?,pediatric_mg_per_kg=?,
                 lot_number=?,reception_date=?,therapeutic_class=?,
                 commercial_name=?,dosage_form=?,storage_condition=?,
                 requires_preparation=?,is_psychotropic=?,is_cold_chain=?,
                 is_restricted_pediatric=?,supplier=?,barcode=?,notes=?,
                 is_high_risk=?,updated_at=datetime('now')
               WHERE id=?""",
            (
                d["name"],
                d["dosage"],
                d["unit"],
                d["quantity"],
                d["min_stock"],
                d.get("max_stock", 0),
                d["expiry_date"],
                d["drawer"],
                d["location"],
                d.get("pediatric_mg_per_kg"),
                d.get("lot_number", ""),
                d.get("reception_date", ""),
                d.get("therapeutic_class", ""),
                d.get("commercial_name", ""),
                d.get("dosage_form", ""),
                d.get("storage_condition", "Température ambiante"),
                d.get("requires_preparation", 0),
                d.get("is_psychotropic", 0),
                d.get("is_cold_chain", 0),
                d.get("is_restricted_pediatric", 0),
                d.get("supplier", ""),
                d.get("barcode", ""),
                d.get("notes", ""),
                d.get("is_high_risk", 0),
                stock_id,
            ),
        )
        conn.commit()
        try:
            actor = request.headers.get("x-medibot-user-name") or request.headers.get("X-Medibot-User-Name") or "system"
            role = request.headers.get("x-medibot-user-role") or request.headers.get("X-Medibot-User-Role")
            write_audit(conn, actor=actor, actor_role=role, action="EDIT_STOCK", target_type="pharmacy_stock", target_id=stock_id, detail={"fields": _pharmacy_patch(data)})
            conn.commit()
        except Exception:
            pass
        row = conn.execute("SELECT * FROM pharmacy_stock WHERE id=?", (stock_id,)).fetchone()
        result = row_to_dict(row)
        conn.close()
        return result
    except Exception as e:
        print(f"[PUT /api/pharmacy/stock/{stock_id}] Error: {e}")
        if conn:
            conn.close()
        raise



@router.delete("/api/pharmacy/stock/{stock_id}")
def delete_stock(stock_id: int, request: Request):
    conn = None
    try:
        conn = get_db()
        conn.execute("DELETE FROM pharmacy_stock WHERE id=?", (stock_id,))
        conn.commit()
        try:
            actor = request.headers.get("x-medibot-user-name") or request.headers.get("X-Medibot-User-Name") or "system"
            role = request.headers.get("x-medibot-user-role") or request.headers.get("X-Medibot-User-Role")
            write_audit(conn, actor=actor, actor_role=role, action="DELETE_STOCK", target_type="pharmacy_stock", target_id=stock_id)
            conn.commit()
        except Exception:
            pass
        conn.close()
        return {"success": True}
    except Exception as e:
        print(f"[DELETE /api/pharmacy/stock/{stock_id}] Error: {e}")
        if conn:
            conn.close()
        raise



@router.post("/api/pharmacy/stock/{stock_id}/restock")
def restock(stock_id: int, data: RestockRequest):
    conn = None
    try:
        conn = get_db()
        conn.execute(
            "UPDATE pharmacy_stock SET quantity=quantity+?,updated_at=datetime('now') WHERE id=?",
            (data.quantity, stock_id),
        )
        if data.lot_number and data.expiry_date:
            conn.execute(
                """INSERT INTO pharmacy_stock_lots
                   (stock_id,lot_number,expiry_date,quantity,reception_date,supplier)
                   VALUES (?,?,?,?,?,?)""",
                (
                    stock_id,
                    data.lot_number,
                    data.expiry_date,
                    data.quantity,
                    data.reception_date or "",
                    data.supplier or "",
                ),
            )
            conn.execute(
                "UPDATE pharmacy_stock SET lot_number=?,expiry_date=?,updated_at=datetime('now') WHERE id=?",
                (data.lot_number, data.expiry_date, stock_id),
            )
        conn.commit()
        conn.close()
        return {"ok": True}
    except Exception as e:
        print(f"[POST /api/pharmacy/stock/{stock_id}/restock] Error: {e}")
        if conn:
            conn.close()
        raise



@router.get("/api/pharmacy/alerts")
def pharmacy_alerts():
    conn = get_db()
    from datetime import date, timedelta

    today = date.today().isoformat()
    d7 = (date.today() + timedelta(days=7)).isoformat()
    d30 = (date.today() + timedelta(days=30)).isoformat()

    def q(sql, *args):
        return [stock_with_status(r) for r in conn.execute(sql, *args).fetchall()]

    ruptures = q("SELECT * FROM pharmacy_stock WHERE quantity=0")
    critique = q(
        "SELECT * FROM pharmacy_stock WHERE quantity>0 AND quantity<min_stock"
    )
    faible = q(
        "SELECT * FROM pharmacy_stock WHERE quantity>=min_stock AND quantity<min_stock*2"
    )
    exp7 = q(
        "SELECT * FROM pharmacy_stock WHERE expiry_date IS NOT NULL AND expiry_date!='' AND expiry_date<=? AND expiry_date>=?",
        (d7, today),
    )
    exp30 = q(
        "SELECT * FROM pharmacy_stock WHERE expiry_date IS NOT NULL AND expiry_date!='' AND expiry_date<=? AND expiry_date>?",
        (d30, d7),
    )
    cold_chain = q("SELECT * FROM pharmacy_stock WHERE is_cold_chain=1")
    psychotropes = q("SELECT * FROM pharmacy_stock WHERE is_psychotropic=1")
    a_preparer = q("SELECT * FROM pharmacy_stock WHERE requires_preparation=1")

    conn.close()
    return {
        "ruptures": ruptures,
        "stock_critique": critique,
        "stock_faible": faible,
        "peremption_7j": exp7,
        "peremption_30j": exp30,
        "cold_chain": cold_chain,
        "psychotropes": psychotropes,
        "a_preparer": a_preparer,
        "counts": {
            "ruptures": len(ruptures),
            "stock_critique": len(critique),
            "peremption_7j": len(exp7),
            "peremption_30j": len(exp30),
        },
    }



@router.get("/api/pharmacy/stock/{stock_id}/lots")
def list_lots(stock_id: int):
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM pharmacy_stock_lots WHERE stock_id=? ORDER BY expiry_date ASC",
        (stock_id,),
    ).fetchall()
    conn.close()
    return rows_to_list(rows)



@router.post("/api/pharmacy/stock/{stock_id}/lots", status_code=201)
def add_lot(stock_id: int, data: PharmacyLotCreate):
    conn = None
    try:
        conn = get_db()
        c = conn.execute(
            """INSERT INTO pharmacy_stock_lots
               (stock_id,lot_number,expiry_date,quantity,reception_date,supplier,notes)
               VALUES (?,?,?,?,?,?,?)""",
            (
                stock_id,
                data.lot_number,
                data.expiry_date,
                data.quantity,
                data.reception_date or "",
                data.supplier or "",
                data.notes or "",
            ),
        )
        conn.commit()
        conn.close()
        return {"id": c.lastrowid, "ok": True}
    except Exception as e:
        print(f"[POST /api/pharmacy/stock/{stock_id}/lots] Error: {e}")
        if conn:
            conn.close()
        raise



@router.delete("/api/pharmacy/lots/{lot_id}")
def delete_lot(lot_id: int):
    conn = None
    try:
        conn = get_db()
        conn.execute("DELETE FROM pharmacy_stock_lots WHERE id=?", (lot_id,))
        conn.commit()
        conn.close()
        return {"ok": True}
    except Exception as e:
        print(f"[DELETE /api/pharmacy/lots/{lot_id}] Error: {e}")
        if conn:
            conn.close()
        raise



@router.post("/api/pharmacy")
def add_pharmacy_alias(data: PharmacyStockCreate, request: Request):
    """Alias pour le frontend (POST /api/pharmacy)."""
    return add_stock(data, request)



@router.put("/api/pharmacy/{stock_id}")
def update_pharmacy_alias(stock_id: int, data: PharmacyStockUpdate, request: Request):
    """Alias pour le frontend (PUT /api/pharmacy/{id})."""
    return update_stock(stock_id, data, request)



@router.delete("/api/pharmacy/{stock_id}")
def delete_pharmacy_alias(stock_id: int, request: Request):
    """Alias pour le frontend (DELETE /api/pharmacy/{id})."""
    return delete_stock(stock_id, request)

# ══════════════════════════════════════════════════════════════════
# TECH STATUS  — uses paho is_connected() for real TCP check
# ══════════════════════════════════════════════════════════════════
