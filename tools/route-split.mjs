import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const lines = fs.readFileSync(path.join(root, 'backend', 'main.py'), 'utf8').split(/\r?\n/);

function routePath(block) {
  const m = block.match(/@app\.(get|post|put|delete)\("([^"]+)"/);
  return m ? m[2] : '';
}

function classify(p) {
  if (p === '/api/rfid' || p === '/api/pin' || p === '/api/auth/login') return 'auth';
  if (p.startsWith('/api/doctors')) return 'doctors';
  if (p.startsWith('/api/rooms')) return 'rooms';
  if (p === '/api/medications') return 'medications';
  if (p.startsWith('/api/drug-interactions')) return 'interactions';
  if (p.startsWith('/api/pharmacy')) return 'pharmacy';
  if (p.startsWith('/api/tech/') || p === '/api/status') return 'tech';
  if (p === '/api/analytics' || p === '/api/stats' || p === '/api/shift-report') return 'analytics';
  if (p.startsWith('/api/notification-log') || p === '/api/notification-log') return 'notifications';
  if (p === '/api/audit-log') return 'audit';
  if (p === '/api/dispense' || p.startsWith('/api/log') || p === '/api/prises/valider') return 'dispense';
  if (p.startsWith('/api/prescriptions/')) return 'prescriptions';
  if (p.startsWith('/api/ordonnances')) return 'prescriptions';
  if (p.startsWith('/api/patients')) {
    if (p.includes('/medications')) return 'medications';
    if (
      p.includes('/prescriptions') ||
      p.includes('/ordonnance') ||
      p.includes('/prescription-validation') ||
      p.includes('/missed-doses')
    )
      return 'prescriptions';
    return 'patients';
  }
  return 'patients';
}

// First @app line is index 1247 (line 1248)
let i = 0;
while (i < lines.length && !lines[i].startsWith('@app.')) i++;
const routeLines = lines.slice(i);
const blocks = [];
let k = 0;
while (k < routeLines.length) {
  if (!routeLines[k].startsWith('@app.')) {
    k++;
    continue;
  }
  const start = k;
  k++;
  while (k < routeLines.length && !routeLines[k].startsWith('@app.')) {
    if (routeLines[k].includes('STATIC (React')) break;
    k++;
  }
  blocks.push(routeLines.slice(start, k).join('\n'));
}

const groups = Object.fromEntries(
  ['auth', 'doctors', 'rooms', 'patients', 'medications', 'prescriptions', 'dispense', 'pharmacy', 'audit', 'analytics', 'notifications', 'tech', 'interactions'].map((x) => [x, []])
);
for (const b of blocks) {
  const p = routePath(b);
  const g = classify(p);
  if (!groups[g]) throw new Error(`Bad path ${p}`);
  groups[g].push(b);
}

const header = `from fastapi import APIRouter, HTTPException, Request
from passlib.context import CryptContext

from ..database import get_db, write_audit
from ..helpers import (
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
from ..mqtt import TOPIC_CMD, get_mqtt, mqtt_publish, robot_state
from ..schemas import (
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

`;

const authHeader = `from fastapi import APIRouter, HTTPException, Request

from ..database import get_db, pwd_context, write_audit
from ..helpers import hash_password, _doctor_access_payload
from ..schemas import LoginRequest, PINRequest, RFIDRequest

router = APIRouter()

`;

function body(blocks) {
  return blocks
    .join('\n\n')
    .replace(/@app\./g, '@router.')
    .replace(/\bgetdb\(\)/g, 'get_db()');
}

const rdir = path.join(root, 'backend', 'routers');
fs.mkdirSync(rdir, { recursive: true });
fs.writeFileSync(path.join(rdir, '__init__.py'), '"""API routers."""\n');

const files = {
  auth: authHeader + body(groups.auth),
  doctors: header + body(groups.doctors),
  rooms: header + body(groups.rooms),
  patients: header + body(groups.patients),
  medications: header + body(groups.medications),
  prescriptions: header + body(groups.prescriptions),
  dispense: header + body(groups.dispense),
  pharmacy: header + body(groups.pharmacy),
  audit: header + body(groups.audit),
  analytics: header + body(groups.analytics),
  notifications: header + body(groups.notifications),
  tech: header + body(groups.tech),
  interactions: header + body(groups.interactions),
};

for (const [name, text] of Object.entries(files)) {
  fs.writeFileSync(path.join(rdir, `${name}.py`), text.replace(/\n/g, '\n'), 'utf8');
}

console.log('Routers written:', Object.keys(files).join(', '));
for (const [k, v] of Object.entries(groups)) console.log(k, v.length);
