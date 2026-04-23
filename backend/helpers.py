import hashlib
import json
import re
import sqlite3
from datetime import date as dtdate, datetime
from typing import Any, Optional


def hash_password(pwd: str) -> str:
    """Hash a password using SHA-256."""
    return hashlib.sha256(pwd.encode()).hexdigest()


def row_to_dict(row: Any) -> Optional[dict]:
    return dict(row) if row else None


def rows_to_list(rows: Any) -> list:
    return [dict(r) for r in rows]


def _patient_full_name(patient: dict) -> str:
    """Format patient full name defensively with null safety."""
    first = patient.get('first_name', '').strip() if patient.get('first_name') else ''
    last = patient.get('last_name', '').strip() if patient.get('last_name') else ''
    return f"{first} {last}".strip()


def parse_weight_kg(weight_str: Optional[str]) -> Optional[float]:
    """Extrait un poids en kg depuis une chaîne type '21 kg', '21,5', '12.3kg'."""
    if not weight_str:
        return None
    m = re.search(r"([\d.,]+)", str(weight_str).replace(",", "."))
    if not m:
        return None
    try:
        v = float(m.group(1))
        return v if v > 0 else None
    except ValueError:
        return None


def calc_pediatric_dose_mg(mg_per_kg: Optional[float], weight_kg: Optional[float]) -> Optional[float]:
    """Dose totale en mg = mg/kg × poids (kg)."""
    if mg_per_kg is None or weight_kg is None:
        return None
    try:
        mgpk = float(mg_per_kg)
        w = float(weight_kg)
    except (TypeError, ValueError):
        return None
    if mgpk <= 0 or w <= 0:
        return None
    return round(mgpk * w, 2)


def calc_dose_ml(
    dose_mg: Optional[float],
    volume_ampoule_ml: Optional[float],
    dose_ampoule_mg: Optional[float],
) -> Optional[float]:
    """dose_ml = (dose_mg * volume_ampoule_ml) / dose_ampoule_mg"""
    if dose_mg is None or volume_ampoule_ml is None or dose_ampoule_mg is None:
        return None
    try:
        dm = float(dose_mg)
        vol = float(volume_ampoule_ml)
        d_amp = float(dose_ampoule_mg)
    except (TypeError, ValueError):
        return None
    if d_amp <= 0 or vol <= 0:
        return None
    return round(dm * vol / d_amp, 3)


def pediatric_dose_hint(
    mg_per_kg: Optional[float], weight_kg: Optional[float], dose_mg: Optional[float]
) -> Optional[str]:
    """Texte court pour affichage médecin (kiosk)."""
    if mg_per_kg is None:
        return None
    try:
        mgpk = float(mg_per_kg)
    except (TypeError, ValueError):
        return None
    if mgpk <= 0:
        return None
    if weight_kg and dose_mg is not None:
        return f"Dose estimée ~{dose_mg:g} mg ({mgpk:g} mg/kg × {float(weight_kg):g} kg)"
    return f"Posologie enfant : {mgpk:g} mg/kg (renseigner le poids patient pour le calcul)"


def stock_with_status(row: Any) -> dict:
    d = dict(row)
    qty = d.get("quantity", 0)
    minqty = d.get("min_stock", 10)
    exp = d.get("expiry_date")
    expired = exp and exp < str(dtdate.today())
    if expired:
        d["status"] = "expired"
    elif qty == 0:
        d["status"] = "critical"
    elif qty < minqty:
        d["status"] = "low"
    else:
        d["status"] = "ok"
    days_left = None
    if exp:
        try:
            ed = datetime.strptime(exp[:10], "%Y-%m-%d").date()
            days_left = (ed - dtdate.today()).days
        except Exception:
            pass
    d["days_until_expiry"] = days_left
    cday = d.get("consumption_per_day")
    if cday and float(cday) > 0 and qty > 0:
        d["depletion_days_est"] = int(qty / float(cday))
    else:
        d["depletion_days_est"] = None
    return d


def _split_blood_type_code(blood_type: str):
    """Split blood type (e.g., 'O+') into (abo, rh) tuple."""
    if not blood_type:
        return None, None
    blood_type = blood_type.upper().strip()
    if blood_type.endswith('+'):
        abo = blood_type[:-1]
        rh = '+'
    elif blood_type.endswith('-'):
        abo = blood_type[:-1]
        rh = '-'
    else:
        abo = blood_type
        rh = None
    return abo, rh


def infer_role_code(role: Optional[str]) -> str:
    """Infer role code from role string. Explicit about unknown roles."""
    if not role:
        return "unknown"
    role_lower = role.lower()
    if "chef" in role_lower:
        return "chef"
    elif "infirmier" in role_lower or "nurse" in role_lower:
        return "infirmier"
    elif "pharma" in role_lower:
        return "pharmacien"
    elif "medecin" in role_lower or "doctor" in role_lower:
        return "medecin"
    else:
        return "unknown"


def _doctor_access_payload(doc: Any) -> dict:
    """Create a doctor access payload from a doctor row."""
    d = dict(doc) if hasattr(doc, "keys") else doc
    name = d.get("name", "")
    role = d.get("role", "")
    role_code = d.get("role_code") or infer_role_code(role)
    return {
        "access": True,
        "name": name,
        "role": role,
        "role_code": role_code,
        "can_prescribe": bool(d.get("can_prescribe", False)),
        "message": "Accès autorisé",
    }


def compute_bsa(taille_cm: Optional[float], weight_str: Optional[str]) -> Optional[float]:
    """Compute Body Surface Area using Mosteller formula: BSA = sqrt((height_cm * weight_kg) / 3600)."""
    if not taille_cm or not weight_str:
        return None
    try:
        height = float(taille_cm)
        weight = parse_weight_kg(weight_str)
        if not weight or height <= 0 or weight <= 0:
            return None
        bsa = (height * weight / 3600) ** 0.5
        return round(bsa, 2)
    except (TypeError, ValueError):
        return None


def _build_phenotype_display(p: dict) -> str:
    """Build phenotype display string from individual phenotype fields."""
    f = lambda v, pos, neg: pos if v else neg
    return (f(p.get('ph_C'), 'C+', 'C-') +
            f(p.get('ph_c'), 'c+', 'c-') +
            f(p.get('ph_E'), 'E+', 'E-') +
            f(p.get('ph_e'), 'e+', 'e-') +
            f(p.get('ph_K'), 'K+', 'K-'))

def compute_pews(vitals: dict, age_months: Optional[int] = None) -> dict:
    """
    Compute Pediatric Early Warning Score (PEWS) based on vitals.
    Scores 3 components: respiratory (RR+SpO2), temperature, glasgow.
    Returns dict with pews_score (0-9), severity, label, and alerts list.
    """
    score = 0
    alerts = []
    
    try:
        # Component 1: Respiratory (RR + SpO2)
        rr = vitals.get('respiratory_rate')
        spo2 = vitals.get('spo2')
        
        if rr is not None:
            rr = float(rr)
            if rr < 10 or rr > 60:
                score += 2
                alerts.append("FR anormale")
            elif rr < 15 or rr > 40:
                score += 1
        
        if spo2 is not None:
            spo2 = float(spo2)
            if spo2 < 91:
                score += 2
                alerts.append("SpO2 faible")
            elif spo2 < 95:
                score += 1
        
        # Component 2: Temperature
        temp = vitals.get('temperature')
        if temp is not None:
            temp = float(temp)
            if temp < 36.0 or temp > 38.5:
                score += 2
                alerts.append("Température anormale")
            elif temp < 36.5 or temp > 38.0:
                score += 1
        
        # Component 3: Glasgow
        glasgow = vitals.get('glasgow')
        if glasgow is not None:
            glasgow = int(glasgow)
            if glasgow < 9:
                score += 3
                alerts.append("Glasgow faible")
            elif glasgow < 11:
                score += 1
        
    except (TypeError, ValueError):
        pass
    
    # Cap score at 9
    score = min(score, 9)
    
    # Determine severity and label
    if score >= 6:
        severity = "critical"
        label = "URGENCE ABSOLUE"
    elif score >= 4:
        severity = "warning"
        label = "Alerter médecin senior"
    elif score >= 2:
        severity = "alert"
        label = "Surveillance rapprochée"
    else:
        severity = "normal"
        label = "Surveillance standard"
    
    return {
        "pews_score": score,
        "severity": severity,
        "label": label,
        "alerts": alerts
    }

def enrich_patient_dict(p: dict, conn=None, with_treatments: bool = False) -> dict:
    """Enrich patient dictionary with additional data."""
    if not p:
        return p
    # Basic enrichment - add computed fields
    weight = p.get("weight")
    if weight:
        p["weight_kg"] = parse_weight_kg(weight)
    # Add phenotype display
    p["phenotype_display"] = _build_phenotype_display(p)
    # CHANGE 2: Add BSA computation
    p["bsa_m2"] = compute_bsa(p.get("taille"), p.get("weight"))
    return p


def _dump_patient_update(data: dict) -> dict:
    """Prepare patient data for database update."""
    return {k: v for k, v in data.items() if v is not None}


def _dump_treatment_update(data: dict) -> dict:
    """Prepare treatment data for database update."""
    return {k: v for k, v in data.items() if v is not None}


def _ph_int(val: Any, default: int = 0) -> int:
    """Parse value to int, return default if invalid."""
    try:
        return int(val) if val is not None else default
    except (TypeError, ValueError):
        return default


def _pharmacy_patch(old: dict, new: dict) -> dict:
    """Merge pharmacy data for patch operations."""
    result = dict(old)
    result.update({k: v for k, v in new.items() if v is not None})
    return result


def _allergies_to_json_for_db(allergies: Optional[list]) -> Optional[str]:
    """Convert allergies list to JSON string for database."""
    if not allergies:
        return None
    return json.dumps(allergies, ensure_ascii=False)


def _json_str_list_for_db(items: Optional[list]) -> Optional[str]:
    """Convert list to JSON string for database."""
    if not items:
        return None
    return json.dumps(items, ensure_ascii=False)


def parse_patient_row(row: Any) -> dict:
    """
    Parse a patient row from the database.
    Converts JSON string fields to actual arrays/objects.
    Handles NULL values by converting them to empty arrays.
    """
    p = dict(row) if hasattr(row, "keys") else row
    # Fields that are stored as JSON strings but should be parsed
    json_fields = [
        "drug_allergies",
        "other_allergies",
        "vaccinations",
        "current_treatments",
        "allergies",
    ]
    for field in json_fields:
        if field in p:
            if p[field] is None:
                # Convert NULL to empty array
                p[field] = []
            elif isinstance(p[field], str):
                # Parse JSON string to array
                try:
                    p[field] = json.loads(p[field])
                except (json.JSONDecodeError, TypeError):
                    p[field] = []
            elif not isinstance(p[field], (list, dict)):
                # If it's some other type, convert to empty array
                p[field] = []
    return p


def parse_concentration(dosage_str: Optional[str]) -> Optional[float]:
    """
    Parse concentration from dosage string.
    Examples:
      '250mg/5ml'  → 50.0
      '500mg/5ml'  → 100.0
      '100mg/ml'   → 100.0
      '10mg/2ml'   → 5.0
      '500mg'      → None (solid form)
    Returns mg/ml float or None.
    """
    if not dosage_str:
        return None
    dosage_str = str(dosage_str).strip()
    # Match pattern: number mg / number ml
    match = re.search(r'(\d+\.?\d*)\s*mg\s*/\s*(\d+\.?\d*)\s*ml', dosage_str, re.IGNORECASE)
    if not match:
        return None
    try:
        mg = float(match.group(1))
        ml = float(match.group(2))
        if ml <= 0:
            return None
        return round(mg / ml, 2)
    except (ValueError, ZeroDivisionError):
        return None


def check_allergy(medname: str, patient_allergies: list) -> bool:
    """
    Check if medication name matches any patient allergies.
    Returns True if allergy found, False otherwise.
    """
    if not medname or not patient_allergies:
        return False
    medname_lower = medname.lower()
    for allergy in patient_allergies:
        if isinstance(allergy, str) and allergy.lower() in medname_lower:
            return True
        if isinstance(allergy, dict):
            m = (allergy.get('medication') or '').lower()
            if m and m in medname_lower:
                return True
    return False
