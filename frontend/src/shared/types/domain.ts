export type AppMode = 'kiosk' | 'admin';

export type AdminView =
  | 'dashboard'
  | 'rooms'
  | 'patients'
  | 'pharmacy'
  | 'doctors'
  | 'validation'
  | 'interactions'
  | 'analytics'
  | 'shift'
  | 'tech'
  | 'settings'
  | 'audit';

export interface Stats {
  total_patients: number;
  alert_patients: number;
  total_doctors: number;
  dispenses_today: number;
  rooms_occupied: number;
  total_dispenses?: number;
}

export interface Room {
  id: number;
  name: string;
  capacity: number;
  occupied: number;
  has_alert: boolean;
}

export interface PatientTreatment {
  id: number;
  patient_id: number;
  med_name: string;
  dose: string;
  frequency: string;
  route?: string;
  start_date?: string;
  end_date?: string;
  origin?: string;
  notes?: string;
  active: number;
}

export interface Patient {
  id: number;
  room_id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  age: number;
  weight: string;
  blood_type: string;
  diagnostic: string;
  guardian?: { name: string; phone?: string; relationship?: string };
  guardians?: Array<{ name: string; phone?: string; relationship?: string }>;
  allergies: Array<string | { medication: string }>;
  notes: string;
  bed: number;
  photo?: string;
  date_naissance?: string | null;
  groupe_sanguin?: string | null;
  antecedents?: string | null;
  traitement_en_cours?: string | null;
  groupe_abo?: string;
  rhesus?: string;
  ph_C?: number;
  ph_c?: number;
  ph_E?: number;
  ph_e?: number;
  ph_K?: number;
  ph_k?: number;
  drug_allergies?: string[];
  other_allergies?: string[];
  blood_type_display?: string;
  phenotype_display?: string;
  current_treatments?: PatientTreatment[];
}

/** Prescription line / medication catalog row (admin). */
export interface Med {
  id: number;
  name: string;
  dosage: string;
  schedule: string;
  drawer: number;
  time: string;
}

export interface PharmaMed {
  id: number;
  name: string;
  commercial_name?: string;
  dosage: string;
  dosage_form?: string;
  unit: string;
  quantity: number;
  min_stock: number;
  max_stock?: number;
  expiry_date?: string;
  days_until_expiry?: number | null;
  days_remaining?: number | null;
  drawer?: number;
  location?: string;
  lot_number?: string;
  reception_date?: string;
  therapeutic_class?: string;
  storage_condition?: string;
  requires_preparation?: number;
  is_psychotropic?: number;
  is_cold_chain?: number;
  is_restricted_pediatric?: number;
  is_high_risk?: number;
  supplier?: string;
  barcode?: string;
  notes?: string;
  pediatric_mg_per_kg?: number | null;
  maxdosemg24h?: number | null;
  consumption_per_day?: number | null;
  low_stock?: boolean;
  status?: string;
  updated_at?: string;
}

export interface PharmacyStock {
  id: number;
  name: string;
  dosage: string;
  unit: string;
  quantity: number;
  minstock: number;
  expirydate?: string | null;
  drawer?: number | null;
  location?: string;
  updatedat?: string;
  lotnumber?: string | null;
  consumptionperday?: number | null;
  pediatricmgperkg?: number | null;
  maxdosemg24h?: number | null;
}

export interface PharmacyLot {
  id: number;
  stock_id: number;
  lot_number: string;
  expiry_date: string;
  quantity: number;
  reception_date?: string;
  supplier?: string;
  notes?: string;
}

export interface PharmacyAlerts {
  ruptures: PharmaMed[];
  stock_critique: PharmaMed[];
  stock_faible: PharmaMed[];
  peremption_7j: PharmaMed[];
  peremption_30j: PharmaMed[];
  cold_chain: PharmaMed[];
  psychotropes: PharmaMed[];
  a_preparer: PharmaMed[];
  counts: {
    ruptures: number;
    stock_critique: number;
    peremption_7j: number;
    peremption_30j: number;
  };
}

export interface EmergencyDoseLine {
  dose_mg: number | null;
  volume_ml: number | null;
  formula: string;
  concentration: string;
}

export interface EmergencyDosePayload {
  weight_kg: number;
  adrenaline: EmergencyDoseLine;
  diazepam: EmergencyDoseLine;
  atropine: EmergencyDoseLine;
  hydrocortisone: EmergencyDoseLine;
}

export interface Doctor {
  id: number;
  rfid_uid: string;
  name: string;
  role: string;
  pin: string;
  created_at: string;
  username?: string;
  phone?: string;
  status?: 'ACTIVE' | 'SUSPENDED';
}

export interface LogEntry {
  id: number;
  med_name: string;
  drawer: number;
  mqtt_sent: number;
  timestamp: string;
  note?: string;
  dose_status?: string;
  prise_confirmed_at?: string | null;
  prise_confirmed_by?: string | null;
}

export interface AuditEntry {
  id: number;
  actor: string;
  actor_role: string;
  action: string;
  target_type: string;
  target_id: number;
  detail: string;
  timestamp: string;
}

export interface TechStatus {
  mqttbroker?: string;
  mqttws?: string;
  esp32?: string;
  stm32?: string;
  lastactivity?: string | null;
  brokerhost?: string;
  brokerport?: number;
  wsport?: number;
  robotid?: string;
  numdrawers?: number;
  brokertcp?: string;
  brokerws?: string;
  tcpok?: boolean;
  wsok?: boolean;
  tcp?: string;
  ws?: string;
  mqtt?: string;
  frontend?: string;
  mqtt_broker?: string;
  mqtt_ws?: string;
  last_activity?: string | null;
  broker_host?: string;
  broker_port?: number;
  ws_port?: number;
  robot_id?: string;
  num_drawers?: number;
}
