import re
from typing import List, Optional

from pydantic import BaseModel, field_validator


RFID_PATTERN = re.compile(r"^[A-Z0-9]{1,8}$")


def normalize_rfid(value: str) -> str:
    rfid = (value or "").strip().upper()
    if not RFID_PATTERN.fullmatch(rfid):
        raise ValueError("RFID must contain 1 to 8 uppercase letters and numbers only")
    return rfid


class RFIDRequest(BaseModel):
    uid: str

    @field_validator("uid")
    @classmethod
    def validate_uid(cls, value: str) -> str:
        return normalize_rfid(value)


class PINRequest(BaseModel):
    uid: str
    pin: str

    @field_validator("uid")
    @classmethod
    def validate_uid(cls, value: str) -> str:
        return normalize_rfid(value)


class DispenseRequest(BaseModel):
    drawer: int
    patient: str
    med: str
    doctor: Optional[str] = None
    doctorrole: Optional[str] = None


class LogNote(BaseModel):
    note: str


class DoctorCreate(BaseModel):
    rfid_uid: str
    name: str
    role: str
    pin: str

    @field_validator("rfid_uid")
    @classmethod
    def validate_rfid_uid(cls, value: str) -> str:
        return normalize_rfid(value)


class DoctorUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    pin: Optional[str] = None
    phone: Optional[str] = None
    status: Optional[str] = None


# Admin-controlled doctor account management (username/password/RFID/role/state)
class AdminDoctorCreate(BaseModel):
    fullname: str
    username: str
    password: str
    role: str
    rfiduid: str
    pin: Optional[str] = None
    phone: Optional[str] = None
    status: str = "ACTIVE"
    note: Optional[str] = None
    photo: Optional[str] = None

    @field_validator("rfiduid")
    @classmethod
    def validate_rfiduid(cls, value: str) -> str:
        return normalize_rfid(value)

    @field_validator("status")
    @classmethod
    def normalize_status(cls, value: str) -> str:
        v = (value or "").strip().upper()
        if v not in ("ACTIVE", "SUSPENDED"):
            raise ValueError("status must be ACTIVE or SUSPENDED")
        return v


class AdminDoctorUpdate(BaseModel):
    fullname: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    rfiduid: Optional[str] = None
    pin: Optional[str] = None
    phone: Optional[str] = None
    status: Optional[str] = None
    note: Optional[str] = None
    photo: Optional[str] = None

    @field_validator("rfiduid")
    @classmethod
    def validate_rfiduid_optional(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        return normalize_rfid(value)

    @field_validator("status")
    @classmethod
    def normalize_status_optional(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        v = (value or "").strip().upper()
        if v not in ("ACTIVE", "SUSPENDED"):
            raise ValueError("status must be ACTIVE or SUSPENDED")
        return v


class AdminResetCredentials(BaseModel):
    password: Optional[str] = None
    pin: Optional[str] = None


class StaffRegisterRequest(BaseModel):
    fullname: str
    username: str
    password: str
    role: str = "MEDECIN_RESIDENT"
    phone: Optional[str] = None
    note: Optional[str] = None


class ApproveRequestBody(BaseModel):
    role: str
    rfiduid: str
    pin: str
    validatedby: str

    @field_validator("rfiduid")
    @classmethod
    def validate_rfiduid(cls, value: str) -> str:
        return normalize_rfid(value)


class RejectRequestBody(BaseModel):
    reason: Optional[str] = None


class LoginRequest(BaseModel):
    username: str
    password: str


class PatientCreate(BaseModel):
    first_name: str
    last_name: str
    age: int
    weight: str
    blood_type: str
    diagnostic: str
    room_id: int
    bed: int = 1
    allergies: List[str] = []
    notes: str = ""
    date_naissance: Optional[str] = None
    groupe_sanguin: Optional[str] = None
    antecedents: Optional[str] = None
    traitement_en_cours: Optional[str] = None
    groupe_abo: Optional[str] = None
    rhesus: Optional[str] = None
    ph_C: Optional[int] = None
    ph_c: Optional[int] = None
    ph_E: Optional[int] = None
    ph_e: Optional[int] = None
    ph_K: Optional[int] = None
    ph_k: Optional[int] = None
    drug_allergies: Optional[List[str]] = None
    other_allergies: Optional[List[str]] = None
    vaccination_status: Optional[str] = None
    vaccinations: Optional[List[str]] = None
    taille: Optional[str] = None
    pcranien: Optional[str] = None
    poidsnaissance: Optional[str] = None
    poidsref: Optional[str] = None

    @field_validator("allergies", mode="before")
    @classmethod
    def normalize_allergies(cls, v):
        if v is None:
            return []
        if isinstance(v, list):
            out = []
            for item in v:
                if isinstance(item, str):
                    out.append(item)
                elif isinstance(item, dict) and item.get("medication"):
                    out.append(str(item["medication"]))
            return out
        return []

    @field_validator("drug_allergies", "other_allergies", mode="before")
    @classmethod
    def normalize_str_lists(cls, v):
        if v is None:
            return []
        if isinstance(v, list):
            return [str(x).strip() for x in v if str(x).strip()]
        return []


class PatientUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    age: Optional[int] = None
    weight: Optional[str] = None
    blood_type: Optional[str] = None
    diagnostic: Optional[str] = None
    room_id: Optional[int] = None
    bed: Optional[int] = None
    allergies: Optional[List[str]] = None
    notes: Optional[str] = None
    date_naissance: Optional[str] = None
    groupe_sanguin: Optional[str] = None
    antecedents: Optional[str] = None
    traitement_en_cours: Optional[str] = None
    groupe_abo: Optional[str] = None
    rhesus: Optional[str] = None
    ph_C: Optional[int] = None
    ph_c: Optional[int] = None
    ph_E: Optional[int] = None
    ph_e: Optional[int] = None
    ph_K: Optional[int] = None
    ph_k: Optional[int] = None
    drug_allergies: Optional[List[str]] = None
    other_allergies: Optional[List[str]] = None
    vaccination_status: Optional[str] = None
    vaccinations: Optional[List[str]] = None
    taille: Optional[str] = None
    pcranien: Optional[str] = None
    poidsnaissance: Optional[str] = None
    poidsref: Optional[str] = None

    @field_validator("drug_allergies", "other_allergies", mode="before")
    @classmethod
    def normalize_optional_str_lists(cls, v):
        if v is None:
            return None
        if isinstance(v, list):
            return [str(x).strip() for x in v if str(x).strip()]
        return v

    @field_validator("allergies", mode="before")
    @classmethod
    def normalize_optional_allergies(cls, v):
        if v is None:
            return None
        if isinstance(v, list):
            out = []
            for item in v:
                if isinstance(item, str) and item.strip():
                    out.append(item.strip())
                elif isinstance(item, dict) and item.get("medication"):
                    out.append(str(item["medication"]).strip())
            return out
        return v


class PatientTreatmentCreate(BaseModel):
    med_name: str
    dose: str = ""
    frequency: str = ""
    route: str = ""
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    origin: str = "Hospitalisation"
    notes: str = ""
    active: bool = True


class PatientTreatmentUpdate(BaseModel):
    med_name: Optional[str] = None
    dose: Optional[str] = None
    frequency: Optional[str] = None
    route: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    origin: Optional[str] = None
    notes: Optional[str] = None
    active: Optional[bool] = None


class GuardianCreate(BaseModel):
    name: str
    phone: str
    relationship: str = "Parent"
    present: bool = True


class GuardianUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    relationship: Optional[str] = None
    present: Optional[bool] = None


class PrescriptionCreate(BaseModel):
    medication_id: int
    end_date: Optional[str] = None


class PharmacyStockCreate(BaseModel):
    name: str
    dosage: str
    unit: str = "comprimés"
    quantity: int = 0
    min_stock: int = 10
    max_stock: int = 0
    expiry_date: Optional[str] = None
    drawer: Optional[int] = None
    location: str = "Pharmacie"
    pediatric_mg_per_kg: Optional[float] = None
    lot_number: Optional[str] = None
    reception_date: Optional[str] = None
    therapeutic_class: Optional[str] = None
    commercial_name: Optional[str] = None
    dosage_form: Optional[str] = None
    storage_condition: Optional[str] = "Température ambiante"
    requires_preparation: Optional[int] = 0
    is_psychotropic: Optional[int] = 0
    is_cold_chain: Optional[int] = 0
    is_restricted_pediatric: Optional[int] = 0
    supplier: Optional[str] = None
    barcode: Optional[str] = None
    notes: Optional[str] = None
    is_high_risk: Optional[int] = 0


class PharmacyStockUpdate(BaseModel):
    name: Optional[str] = None
    dosage: Optional[str] = None
    unit: Optional[str] = None
    quantity: Optional[int] = None
    min_stock: Optional[int] = None
    max_stock: Optional[int] = None
    expiry_date: Optional[str] = None
    drawer: Optional[int] = None
    location: Optional[str] = None
    pediatric_mg_per_kg: Optional[float] = None
    lot_number: Optional[str] = None
    reception_date: Optional[str] = None
    therapeutic_class: Optional[str] = None
    commercial_name: Optional[str] = None
    dosage_form: Optional[str] = None
    storage_condition: Optional[str] = None
    requires_preparation: Optional[int] = None
    is_psychotropic: Optional[int] = None
    is_cold_chain: Optional[int] = None
    is_restricted_pediatric: Optional[int] = None
    supplier: Optional[str] = None
    barcode: Optional[str] = None
    notes: Optional[str] = None
    is_high_risk: Optional[int] = None


class RestockRequest(BaseModel):
    quantity: int
    lot_number: Optional[str] = None
    expiry_date: Optional[str] = None
    supplier: Optional[str] = None
    reception_date: Optional[str] = None


class PrescriptionItemCreate(BaseModel):
    med_name: str
    dosage: str
    frequency: str
    duration: str
    instructions: str = ""


class PrescriptionDocCreate(BaseModel):
    doctor_name: str
    date: str
    notes: str = ""
    items: List[PrescriptionItemCreate]


class PhotoUpload(BaseModel):
    photo: str


class PrescriptionValidationBody(BaseModel):
    status: str
    reviewer: str = ""
    note: str = ""


class WasteBody(BaseModel):
    reason: str
    detail: str = ""


class DrugInteractionCreate(BaseModel):
    drug_a: str
    drug_b: str
    severity: str
    consequence: str


class DrugInteractionUpdate(BaseModel):
    drug_a: Optional[str] = None
    drug_b: Optional[str] = None
    severity: Optional[str] = None
    consequence: Optional[str] = None


class NotifyPatientBody(BaseModel):
    notify_guardian: bool


class NotificationLogCreate(BaseModel):
    patient_id: int
    message: str
    status: str = "sent"


class FirmwareMeta(BaseModel):
    version: str
    filename: str = "firmware.bin"


class LigneOrdonnanceCreate(BaseModel):
    medicament_id: Optional[int] = None
    medicament_libre: Optional[str] = None
    dose_mg: float = 0.0
    nb_prises_par_jour: int = 1
    duree_jours: int = 1
    moment_prise: str = "apres_repas"
    distributed_by_robot: int = 1


class OrdonnanceCreate(BaseModel):
    patient_id: int
    prescripteur_rfid: str
    notes: str = ""
    lignes: List[LigneOrdonnanceCreate]

    @field_validator("prescripteur_rfid")
    @classmethod
    def validate_prescripteur_rfid(cls, value: str) -> str:
        return normalize_rfid(value)


class PriseValiderBody(BaseModel):
    log_id: int
    confirmed_by: str


class PharmacyLotCreate(BaseModel):
    lot_number: str
    expiry_date: str
    quantity: int
    reception_date: Optional[str] = None
    supplier: Optional[str] = ""
    notes: Optional[str] = ""


class DoseCheckRequest(BaseModel):
    med_name: str
    dosage: str
    weight_kg: Optional[float] = None
    mg_per_kg: Optional[float] = None


class VitalsCreate(BaseModel):
    temperature: Optional[float] = None
    spo2: Optional[float] = None
    heart_rate: Optional[int] = None
    blood_pressure: Optional[str] = None
    respiratory_rate: Optional[int] = None
    glasgow: Optional[int] = None
    diuresis: Optional[str] = None
    transit: Optional[str] = None
    recorded_by: str = "system"
    notes: Optional[str] = None

    @field_validator("temperature")
    @classmethod
    def validate_temperature(cls, v):
        if v is not None and (v < 30.0 or v > 44.0):
            raise ValueError("Temperature must be between 30.0 and 44.0°C")
        return v


# ══════════════════════════════════════════════════════════════
# NEW: PATIENT LIFECYCLE MANAGEMENT (Dossier / Séjour)
# ══════════════════════════════════════════════════════════════

class DossierCreate(BaseModel):
    """Create a new permanent patient file (Dossier)"""
    nom: str
    prenom: str
    date_naissance: Optional[str] = None
    sexe: str = "M"
    nom_pere: Optional[str] = None
    nom_mere: Optional[str] = None
    telephone: Optional[str] = None
    groupe_sanguin: Optional[str] = None
    rhesus: str = "positif"
    groupe_abo: Optional[str] = None
    allergies_permanentes: Optional[List[str]] = None
    antecedents_chroniques: Optional[str] = None
    vaccinations: Optional[List[str]] = None
    notes_permanentes: Optional[str] = None
    created_by: str = "system"


class SejourCreate(BaseModel):
    """Create a new hospitalization record (Séjour) for an existing dossier"""
    diagnostic_entree: str
    roomid: int
    bed: int
    poids_admission: Optional[str] = None
    taille_admission: Optional[float] = None
    pc_cranien: Optional[float] = None
    tuteur_nom: Optional[str] = None
    tuteur_telephone: Optional[str] = None
    tuteur_relation: str = "Parent"
    created_by: str = "system"


class DischargeRequest(BaseModel):
    """Discharge a patient (end of hospitalization)"""
    type_sortie: str  # 'autorisee' | 'transfert' | 'scam' | 'deces'
    transfert_destination: Optional[str] = None
    diagnostic_sortie: str
    resume_clinique: str
    traitement_sortie: str
    consignes_parents: str
    rdv_controle: Optional[str] = None
    medecin_sortie: str
    scam_signature: bool = False


class DeletePatientRequest(BaseModel):
    """Request to delete a patient (requires Chef role)"""
    reason: str
    actor: str


class DossierSearchResult(BaseModel):
    """Search result for a dossier (patient file)"""
    id: int
    nom: str
    prenom: str
    date_naissance: Optional[str]
    sexe: str
    nom_pere: Optional[str]
    nom_mere: Optional[str]
    telephone: Optional[str]
    groupe_sanguin: Optional[str]
    allergies_permanentes: Optional[str]
    antecedents_chroniques: Optional[str]
    sejours_count: int
    dernier_sejour: Optional[dict]
    is_currently_admitted: bool
