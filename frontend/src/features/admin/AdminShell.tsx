import React, { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from 'react';
import {
  LayoutDashboard, DoorOpen, Users, Pill, Bot, Activity,
  AlertTriangle, RefreshCw, Package, X, Cpu, Wifi,
  Plus, Trash2, Edit2, Save, Stethoscope, BadgeCheck, Search,
  Bed, Sun, Moon, FlaskConical, Wrench, Camera, FileText,
  BarChart3, Shield, ShieldAlert, ClipboardCheck, LogOut, Terminal, Power,
  Download, Pause, Play, Key, Lock, ChevronDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  PharmacistValidationView,
  DrugInteractionsAdminView,
  AnalyticsDashboardView,
  ShiftReportView,
} from '@/adminExtras';
import { DashboardView } from '@/features/admin/views/DashboardView';
import { PharmacyView } from '@/features/admin/views/PharmacyView';
import { RoomsView } from '@/features/admin/views/RoomsView';
import { useTheme } from "@/shared/context/ThemeContext";
import { PhotoUpload } from '@/shared/components/PhotoUpload';
import EmergencyPanel from '@/shared/components/EmergencyPanel';

// ── PEWSBadge Component ────────────────────────────────────────
interface PEWSBadgeProps {
  vitals: any;
  dark: boolean;
}

const PEWSBadge: React.FC<PEWSBadgeProps> = ({ vitals, dark }) => {
  if (!vitals) return null;
  
  // Compute PEWS score from vitals
  const score = vitals.pews_score ?? 0;
  const label = vitals.label ?? "Surveillance standard";
  
  let bgColor = "bg-green-100";
  let textColor = "text-green-800";
  let borderColor = "border-green-300";
  
  if (score >= 6) {
    bgColor = "bg-red-200";
    textColor = "text-red-900";
    borderColor = "border-red-400";
  } else if (score >= 4) {
    bgColor = "bg-orange-100";
    textColor = "text-orange-900";
    borderColor = "border-orange-300";
  } else if (score >= 2) {
    bgColor = "bg-amber-100";
    textColor = "text-amber-900";
    borderColor = "border-amber-300";
  }
  
  return (
    <div className={`flex items-center gap-3 mb-4 p-3 rounded-lg border ${bgColor} ${borderColor} ${textColor}`}>
      <span className="text-2xl font-black">{score}</span>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-bold uppercase">PEWS</span>
        <span className="text-xs">{label}</span>
      </div>
    </div>
  );
};

// ── Types ──────────────────────────────────────────────────────────
type AppMode   = 'kiosk' | 'admin';
type AdminView =
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

interface Stats   { total_patients:number; alert_patients:number; total_doctors:number; dispenses_today:number; rooms_occupied:number; total_dispenses?:number }
interface Room    { id:number; name:string; capacity:number; occupied:number; has_alert:boolean }
interface PatientTreatment {
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
interface Patient {
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
  date_naissance?: string;
  groupe_sanguin?: string;
  antecedents?: string;
  traitement_en_cours?: string;
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
  taille?: number;
  pcranien?: number;
  poidsnaissance?: number;
  poidsref?: number;
  bsa_m2?: number;
  alerts?: Array<{ type: string; message: string; severity: string }>;
  current_treatments?: PatientTreatment[];
}
interface Med     { id:number; name:string; dosage:string; schedule:string; drawer:number; time:string }
interface Doctor  { id:number; rfid_uid:string; name:string; role:string; created_at:string; username?:string; status?:string; phone?:string }
interface LogEntry{ id:number; med_name:string; drawer:number; mqtt_sent:number; timestamp:string; note?:string; dose_status?: string; prise_confirmed_at?: string | null; prise_confirmed_by?: string | null }
interface TechStatus { mqtt_broker:string; mqtt_ws:string; esp32:string; stm32:string; last_activity:string|null; broker_host:string; broker_port:number; ws_port:number; robot_id:string; num_drawers:number }
interface AuditEntry { id:number; actor:string; actor_role:string; action:string; target_type:string; target_id:number; detail:string; timestamp:string; ishighrisk?:boolean; oldvalue?:string; newvalue?:string; overridden?:boolean }

// ── Medical Staff Roles ────────────────────────────────────────────
const ROLES = [
  { label: "Chef de Service",        slug: "CHEF_SERVICE" },
  { label: "Médecin",                slug: "MEDECIN" },
  { label: "Pédiatre",               slug: "PEDIATRE" },
  { label: "Médecin Spécialiste",    slug: "MEDECIN_SPECIALISTE" },
  { label: "Médecin Assistant",      slug: "MEDECIN_ASSISTANT" },
  { label: "Médecin Résident",       slug: "MEDECIN_RESIDENT" },
  { label: "Interne",                slug: "INTERNE" },
  { label: "Médecin Généraliste",    slug: "MEDECIN_GENERALISTE" },
  { label: "Cadre de Santé",         slug: "CADRE_SANTE" },
  { label: "Infirmier(ère)",         slug: "INFIRMIER" },
  { label: "Pharmacien(ne)",         slug: "PHARMACIEN" },
];

const SUPER_ADMIN_ROLE = "CHEF_SERVICE";
const isSuperAdmin = (role: string | undefined) => role === SUPER_ADMIN_ROLE;

// ── Role-based page access rules ───────────────────────────────────
const PAGE_ACCESS: Record<string, string[]> = {
  dashboard:    ["CHEF_SERVICE", "MEDECIN", "PEDIATRE", "MEDECIN_SPECIALISTE", "MEDECIN_ASSISTANT", "MEDECIN_RESIDENT", "INTERNE", "MEDECIN_GENERALISTE", "CADRE_SANTE", "INFIRMIER"],
  rooms:        ["CHEF_SERVICE", "MEDECIN", "PEDIATRE", "MEDECIN_SPECIALISTE", "MEDECIN_ASSISTANT", "MEDECIN_RESIDENT", "INTERNE", "MEDECIN_GENERALISTE", "CADRE_SANTE", "INFIRMIER"],
  patients:     ["CHEF_SERVICE", "MEDECIN", "PEDIATRE", "MEDECIN_SPECIALISTE", "MEDECIN_ASSISTANT", "MEDECIN_RESIDENT", "INTERNE", "MEDECIN_GENERALISTE", "CADRE_SANTE", "INFIRMIER"],
  pharmacy:     ["CHEF_SERVICE", "CADRE_SANTE", "PHARMACIEN"],
  doctors:      ["CHEF_SERVICE"],
  validation:   ["CHEF_SERVICE", "MEDECIN", "PEDIATRE", "MEDECIN_SPECIALISTE", "MEDECIN_ASSISTANT", "MEDECIN_RESIDENT", "MEDECIN_GENERALISTE"],
  interactions: ["CHEF_SERVICE", "MEDECIN", "PEDIATRE", "MEDECIN_SPECIALISTE", "MEDECIN_ASSISTANT", "MEDECIN_RESIDENT"],
  analytics:    ["CHEF_SERVICE", "MEDECIN", "PEDIATRE", "MEDECIN_SPECIALISTE"],
  shift:        ["CHEF_SERVICE", "MEDECIN", "PEDIATRE", "MEDECIN_SPECIALISTE", "MEDECIN_ASSISTANT", "MEDECIN_RESIDENT", "INTERNE", "MEDECIN_GENERALISTE", "CADRE_SANTE", "INFIRMIER"],
  tech:         ["CHEF_SERVICE"],
  audit:        ["CHEF_SERVICE"],
};

// ── API ────────────────────────────────────────────────────────────
const api = async (path: string, opts?: RequestInit) => {
  const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};

/**
 * Normalize patient data from backend field names to frontend field names.
 */
const normalizePatient = (p: any) => {
  if (!p) return p;
  return {
    ...p,
    nom: p.last_name ?? p.nom ?? '',
    prenom: p.first_name ?? p.prenom ?? '',
    poids: p.weight_kg ?? p.poids ?? p.weight ?? 0,
    ddn: p.date_naissance ?? p.ddn ?? '',
    chambre_id: p.room_id ?? p.chambre_id ?? null,
    lit: p.bed ?? p.lit ?? null,
    allergie_medicaments: p.drug_allergies ?? p.allergie_medicaments ?? [],
    autres_allergies: p.other_allergies ?? p.autres_allergies ?? [],
    vaccinations: Array.isArray(p.vaccinations) ? p.vaccinations : [],
    tuteur: p.guardian ?? p.tuteur ?? null,
    first_name: p.first_name ?? p.prenom ?? '',
    last_name: p.last_name ?? p.nom ?? '',
    weight_kg: p.weight_kg ?? p.poids ?? p.weight ?? 0,
    room_id: p.room_id ?? p.chambre_id ?? null,
    bed: p.bed ?? p.lit ?? null,
    date_naissance: p.date_naissance ?? p.ddn ?? '',
    drug_allergies: p.drug_allergies ?? p.allergie_medicaments ?? [],
    other_allergies: p.other_allergies ?? p.autres_allergies ?? [],
    guardian: p.guardian ?? p.tuteur ?? null,
    phC: p.phC ?? 0,
    phc: p.phc ?? 0,
    phE: p.phE ?? 0,
    phe: p.phe ?? 0,
    phK: p.phK ?? 0,
    phk: p.phk ?? 0,
    phenotypedisplay: p.phenotypedisplay ?? p.phenotype_display ?? '',
    bloodtypedisplay: p.bloodtypedisplay ?? p.blood_type_display ?? p.bloodtype ?? '',
  };
};

const normalizePatients = (patients: any[]) => (patients || []).map(normalizePatient);


// ══════════════════════════════════════════════════════════════════
// LOGIN VIEW
// ══════════════════════════════════════════════════════════════════
export const LoginView = ({ onLoginSuccess }: { onLoginSuccess: (doctor: Doctor) => void }) => {
  const { dark } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [signupOpen, setSignupOpen] = useState(false);
  const [signupBusy, setSignupBusy] = useState(false);
  const [signupMsg, setSignupMsg] = useState('');
  const [signupForm, setSignupForm] = useState({
    fullname: '',
    username: '',
    password: '',
    role: 'MEDECIN_RESIDENT',
    phone: '',
    note: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      onLoginSuccess(result);
    } catch (err: any) {
      setError('Identifiants incorrects');
    } finally {
      setLoading(false);
    }
  };

  const inp = `w-full border rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 transition-all ${
    dark
      ? 'bg-gray-800 border-gray-600 text-white focus:border-teal-400 focus:ring-teal-900 placeholder-gray-500'
      : 'bg-white border-gray-200 text-gray-900 focus:border-teal-400 focus:ring-teal-100'
  }`;

  return (
    <div className={`h-screen flex items-center justify-center ${dark ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`w-full max-w-md rounded-2xl border shadow-xl p-8 ${dark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Bot className="w-8 h-8 text-white" />
          </div>
          <h1 className={`text-2xl font-black ${dark ? 'text-white' : 'text-gray-900'}`}>MediBot</h1>
          <p className="text-teal-500 text-sm font-semibold mt-1">Administration</p>
          <p className={`text-xs mt-2 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Hôpital de Rouiba — Service Pédiatrie</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={`block text-sm font-bold mb-1.5 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
              Nom d'utilisateur
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Votre nom d'utilisateur"
              className={inp}
              disabled={loading}
            />
          </div>

          <div>
            <label className={`block text-sm font-bold mb-1.5 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={inp}
              disabled={loading}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 font-semibold">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-sm transition-colors"
          >
            {loading ? '…' : 'Se connecter'}
          </button>
        </form>

        <div className="mt-5 pt-5 border-t border-gray-200/60 dark:border-gray-700/60">
          <button
            type="button"
            onClick={() => { setSignupMsg(''); setSignupOpen(true); }}
            className={`w-full py-3 rounded-xl border text-sm font-black transition-colors ${
              dark
                ? 'border-gray-700 text-gray-300 hover:bg-gray-700'
                : 'border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            Demander un compte (inscription)
          </button>
          <p className={`text-[11px] mt-2 ${dark ? 'text-gray-500' : 'text-gray-500'}`}>
            La création du compte est validée par le Chef de Service (attribution RFID + PIN).
          </p>
        </div>
      </motion.div>

      {signupOpen && (
        <Modal title="Demande de création de compte" onClose={() => setSignupOpen(false)} width="max-w-2xl">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nom complet" required>
              <input className={inp} value={signupForm.fullname} onChange={(e) => setSignupForm({ ...signupForm, fullname: e.target.value })} />
            </Field>
            <Field label="Username (login)" required>
              <input className={`${inp} font-mono`} value={signupForm.username} onChange={(e) => setSignupForm({ ...signupForm, username: e.target.value })} />
            </Field>
            <Field label="Mot de passe" required>
              <input className={`${inp} font-mono`} type="password" value={signupForm.password} onChange={(e) => setSignupForm({ ...signupForm, password: e.target.value })} />
            </Field>
            <Field label="Rôle souhaité">
              <select className={inp} value={signupForm.role} onChange={(e) => setSignupForm({ ...signupForm, role: e.target.value })}>
                {ROLES.map((r) => (
                  <option key={r.slug} value={r.slug}>{r.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Téléphone (optionnel)">
              <input className={inp} value={signupForm.phone} onChange={(e) => setSignupForm({ ...signupForm, phone: e.target.value })} />
            </Field>
            <Field label="Note (optionnel)">
              <input className={inp} value={signupForm.note} onChange={(e) => setSignupForm({ ...signupForm, note: e.target.value })} />
            </Field>
          </div>

          {signupMsg && (
            <div className={`mt-4 p-3 rounded-xl border text-sm font-bold ${
              signupMsg.startsWith('OK:')
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300'
                : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300'
            }`}>
              {signupMsg.replace(/^OK:/,'')}
            </div>
          )}

          <div className="flex gap-3 mt-6">
            <button
              disabled={signupBusy || !signupForm.fullname.trim() || !signupForm.username.trim() || !signupForm.password.trim()}
              onClick={() => void (async () => {
                setSignupMsg('');
                setSignupBusy(true);
                try {
                  await api('/api/auth/register', {
                    method: 'POST',
                    body: JSON.stringify({
                      fullname: signupForm.fullname,
                      username: signupForm.username,
                      password: signupForm.password,
                      role: signupForm.role,
                      phone: signupForm.phone || undefined,
                      note: signupForm.note || undefined,
                    }),
                  });
                  setSignupMsg('OK:Demande envoyée. Attendez la validation du Chef de Service.');
                  setSignupForm({ fullname: '', username: '', password: '', role: 'MEDECIN_RESIDENT', phone: '', note: '' });
                } catch (e: any) {
                  setSignupMsg(String(e?.message || 'Erreur inscription'));
                } finally {
                  setSignupBusy(false);
                }
              })()}
              className="flex-1 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black"
            >
              {signupBusy ? '...' : 'Envoyer la demande'}
            </button>
            <button onClick={() => setSignupOpen(false)} className={`px-5 py-3 border rounded-xl font-bold ${inp}`}>Fermer</button>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ── Theme-aware class helper ───────────────────────────────────────
// Returns the right tailwind classes based on dark mode
const tc = (light: string, dark: string, isDark: boolean) => isDark ? dark : light;

// ── UI Atoms ───────────────────────────────────────────────────────
const Badge = ({ text, color='gray' }: { text:string; color?:string }) => {
  const map: Record<string,string> = {
    red:'bg-red-100 text-red-700 border-red-200',
    green:'bg-emerald-100 text-emerald-700 border-emerald-200',
    blue:'bg-blue-100 text-blue-700 border-blue-200',
    gray:'bg-gray-100 text-gray-600 border-gray-200',
    teal:'bg-teal-100 text-teal-700 border-teal-200',
    amber:'bg-amber-100 text-amber-700 border-amber-200',
  };
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${map[color]||map.gray}`}>{text}</span>;
};

const Spinner = () => (
  <div className="flex items-center justify-center py-16">
    <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

interface ModalProps { title:string; onClose:()=>void; children:React.ReactNode; width?:string }
const Modal = ({ title, onClose, children, width='max-w-lg' }: ModalProps) => {
  const { dark } = useTheme();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <motion.div initial={{opacity:0,scale:.95}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:.95}}
        className={`rounded-2xl shadow-2xl w-full ${width} max-h-[90vh] overflow-y-auto ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white'}`}>
        <div className={`flex items-center justify-between px-6 py-4 border-b ${dark ? 'border-gray-700' : 'border-gray-100'}`}>
          <h3 className={`font-black text-lg ${dark ? 'text-white' : 'text-gray-900'}`}>{title}</h3>
          <button onClick={onClose} className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${dark ? 'bg-gray-800 hover:bg-gray-700 text-gray-400' : 'bg-gray-100 hover:bg-gray-200 text-gray-500'}`}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </motion.div>
    </div>
  );
};

interface FieldProps { label:string; required?:boolean; children:React.ReactNode }
const Field = ({ label, required, children }: FieldProps) => {
  const { dark } = useTheme();
  return (
    <div>
      <label className={`block text-sm font-bold mb-1.5 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
};

const useInpClass = () => {
  const { dark } = useTheme();
  return `w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 transition-all ${
    dark
      ? 'bg-gray-800 border-gray-600 text-white focus:border-teal-400 focus:ring-teal-900 placeholder-gray-500'
      : 'bg-white border-gray-200 text-gray-900 focus:border-teal-400 focus:ring-teal-100'
  }`;
};

// ── Theme Toggle ───────────────────────────────────────────────────
const ThemeToggle = () => {
  const { dark, toggle } = useTheme();
  return (
    <button onClick={toggle} title={dark ? 'Mode clair' : 'Mode sombre'}
      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all border ${
        dark ? 'bg-gray-800 border-gray-700 text-yellow-400 hover:bg-gray-700' : 'bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200'
      }`}>
      {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
};

// ══════════════════════════════════════════════════════════════════
// SYSTEM STATUS DOT (doctor-friendly — no MQTT/ESP32 jargon)
// ══════════════════════════════════════════════════════════════════
const SystemStatusPill = ({ techStatus }: { techStatus: TechStatus | null }) => {
  const ok = techStatus?.mqtt_broker === 'online';
  const partial = !ok && techStatus !== null;
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold ${
      ok      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
      : partial ? 'bg-amber-50 border-amber-200 text-amber-700'
      : 'bg-gray-50 border-gray-200 text-gray-400'
    }`}>
      <span className={`w-2 h-2 rounded-full ${ok ? 'bg-emerald-500 animate-pulse' : partial ? 'bg-amber-500' : 'bg-gray-300'}`} />
      {ok ? 'Robot opérationnel' : partial ? 'Vérification...' : 'Hors ligne'}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// PRESCRIPTION HELPER FUNCTIONS
function parseDosageConcentration(dosageStr: string): number | null {
  if (!dosageStr) return null;
  const match = dosageStr.match(/(\d+\.?\d*)\s*mg\s*\/\s*(\d+\.?\d*)\s*ml/i);
  if (!match) return null;
  return parseFloat(match[1]) / parseFloat(match[2]);
}

function computeDoseMl(doseMg: number, concentration: number | null): number | null {
  if (!concentration || concentration <= 0 || !doseMg) return null;
  return Math.round((doseMg / concentration) * 100) / 100;
}

function computeDoseMgPerKg(doseMg: number, weightKg: number | null): number | null {
  if (!weightKg || weightKg <= 0 || !doseMg) return null;
  return Math.round((doseMg / weightKg) * 100) / 100;
}

// ORDONNANCE (Prescription form) — WITH FULL PRESCRIBER LOGIC
// ══════════════════════════════════════════════════════════════════
const OrdonnancePanel = ({ 
  patient, 
  currentDoctor 
}: { 
  patient: Patient,
  currentDoctor: { name: string; role: string; rfiduid?: string; id?: number } | null
}) => {
  const { dark } = useTheme();
  const inp = useInpClass();
  
  // State for prescriptions
  const [prescriptions, setPrescriptions] = useState([]);
  const [expandedId, setExpandedId] = useState<number|null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [allMeds, setAllMeds] = useState<Med[]>([]);
  const [allStock, setAllStock] = useState([]);
  const [newItems, setNewItems] = useState<Array<any>>([]);
  const [saving, setSaving] = useState(false);
  const [auditLog, setAuditLog] = useState([]);
  const [activeTab, setActiveTab] = useState<'ordonnances'|'audit'>('ordonnances');
  const [busy, setBusy] = useState(true);

  // Fixed prescriber values (Single doctor model)
  const prescriber = currentDoctor?.name ?? '';
  const prescriberRole = currentDoctor?.role ?? '';

  // Load prescriptions
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [presc, meds, stock] = await Promise.all([
        api(`/api/patients/${patient.id}/prescriptions`),
        api('/api/medications'),
        api('/api/pharmacy-stock'),
      ]).catch(() => [[], [], []]);
      
      setPrescriptions(presc || []);
      setAllMeds(meds || []);
      setAllStock(stock || []);
    } finally {
      setBusy(false);
    }
  }, [patient.id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAddItem = () => {
    setNewItems([...newItems, { 
      med_name: '', 
      dose_mg: null, 
      frequency_per_day: 1, 
      duration_days: 1, 
      timing: 'Pendant le repas', 
      route: 'Per os', 
      is_system: true, 
      medicationid: null 
    }]);
  };

  const handleSaveOrdonnance = async () => {
    if (!newItems.length || !prescriber) return;
    setSaving(true);
    try {
      await api(`/api/patients/${patient.id}/prescriptions`, {
        method: 'POST',
        body: JSON.stringify({
          doctor_name: prescriber,
          date: new Date().toISOString().split('T')[0],
          notes: '',
          items: newItems.map(item => ({
            med_name: item.med_name,
            dosage: item.dosage || '',
            dose_mg: item.dose_mg,
            frequency_per_day: item.frequency_per_day,
            duration_days: item.duration_days,
            timing: item.timing,
            route: item.route,
            is_system: item.is_system,
            medicationid: item.medicationid,
            remarks: item.remarks || ''
          })),
          cosigner: null,
          status: 'active',
          actor: currentDoctor?.name,
          actor_role: currentDoctor?.role,
          prescriber: prescriber,
        })
      });
      setNewItems([]);
      setCreatingNew(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const activeCount = prescriptions.filter((p: any) => !p.status || p.status === 'active').length;

  const getSaveButtonLabel = () => {
    return saving ? 'Enregistrement...' : '✓ Valider l\'ordonnance';
  };

  return (
    <div className="p-6 max-w-5xl">
      {/* Tab bar */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('ordonnances')}
          className={`px-4 py-2 font-bold ${activeTab === 'ordonnances' ? 'text-teal-600 border-b-2 border-teal-600' : 'text-gray-500'}`}
        >
          📋 Ordonnances ({prescriptions.length})
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`px-4 py-2 font-bold ${activeTab === 'audit' ? 'text-teal-600 border-b-2 border-teal-600' : 'text-gray-500'}`}
        >
          📜 Journal d'audit
        </button>
      </div>

      {activeTab === 'ordonnances' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className={`text-2xl font-black ${dark ? 'text-white' : 'text-gray-900'}`}>Ordonnances de {patient.full_name}</h2>
              <p className={`text-sm mt-1 ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
                {prescriptions.length} ordonnance(s) — {activeCount} active(s)
              </p>
            </div>
            <button
              onClick={() => setCreatingNew(!creatingNew)}
              className="px-4 py-2 font-bold rounded-lg flex items-center gap-2 transition-all bg-teal-600 hover:bg-teal-700 text-white"
            >
              <Plus className="w-4 h-4" /> Nouvelle ordonnance
            </button>
          </div>

          {creatingNew && (
            <div className={`border-2 border-teal-300 rounded-lg p-4 ${dark ? 'bg-teal-900/20' : 'bg-teal-50'}`}>
              <div className="space-y-4">
                {/* PRESCRIBER CARD — simplified single doctor */}
                <div className={`rounded-xl border p-4 mb-4 ${dark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                  <p className={`text-xs font-black uppercase mb-3 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Prescripteur
                  </p>

                  {currentDoctor ? (
                    <div className={`flex items-center gap-3 p-3 rounded-xl ${dark ? 'bg-teal-900/20 border border-teal-800' : 'bg-teal-50 border border-teal-100'}`}>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm ${dark ? 'bg-teal-700 text-teal-200' : 'bg-teal-600 text-white'}`}>
                        {currentDoctor.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2)}
                      </div>
                      <div className="flex-1">
                        <p className={`font-black text-sm ${dark ? 'text-white' : 'text-gray-900'}`}>
                          {currentDoctor.name}
                        </p>
                        <p className={`text-xs ${dark ? 'text-teal-300' : 'text-teal-700'}`}>
                          {currentDoctor.role}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-xs font-bold ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                          {new Date().toLocaleDateString('fr-FR', {
                            day: '2-digit', month: 'long', year: 'numeric'
                          })}
                        </p>
                        <p className={`text-xs ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
                          {new Date().toLocaleTimeString('fr-FR', {
                            hour: '2-digit', minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-red-500 font-bold">
                      ⚠️ Aucun médecin connecté
                    </p>
                  )}
                </div>

                <div>
                  <p className="font-bold mb-2">Médicaments</p>
                  {newItems.map((item, idx) => (
                    <div key={idx} className="space-y-2 mb-3 pb-3 border-b">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs font-bold">Médicament</label>
                          <input
                            type="text"
                            value={item.med_name}
                            onChange={e => {
                              const updated = [...newItems];
                              updated[idx].med_name = e.target.value;
                              setNewItems(updated);
                            }}
                            placeholder="Nom du médicament"
                            className={inp}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold">Dose (mg)</label>
                          <input
                            type="number"
                            value={item.dose_mg || ''}
                            onChange={e => {
                              const updated = [...newItems];
                              updated[idx].dose_mg = parseFloat(e.target.value) || null;
                              setNewItems(updated);
                            }}
                            placeholder="500"
                            className={inp}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold">Fréquence/jour</label>
                          <input
                            type="number"
                            min="1"
                            max="6"
                            value={item.frequency_per_day}
                            onChange={e => {
                              const updated = [...newItems];
                              updated[idx].frequency_per_day = parseInt(e.target.value);
                              setNewItems(updated);
                            }}
                            className={inp}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold">Durée (jours)</label>
                          <input
                            type="number"
                            min="1"
                            value={item.duration_days}
                            onChange={e => {
                              const updated = [...newItems];
                              updated[idx].duration_days = parseInt(e.target.value);
                              setNewItems(updated);
                            }}
                            className={inp}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold">Moment</label>
                          <select
                            value={item.timing}
                            onChange={e => {
                              const updated = [...newItems];
                              updated[idx].timing = e.target.value;
                              setNewItems(updated);
                            }}
                            className={inp}
                          >
                            <option>Pendant le repas</option>
                            <option>Avant le repas</option>
                            <option>Après le repas</option>
                            <option>À jeun</option>
                            <option>Au coucher</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-bold">Voie</label>
                          <select
                            value={item.route}
                            onChange={e => {
                              const updated = [...newItems];
                              updated[idx].route = e.target.value;
                              setNewItems(updated);
                            }}
                            className={inp}
                          >
                            <option>Per os</option>
                            <option>IV lent</option>
                            <option>IM</option>
                            <option>SC</option>
                            <option>Inhalé</option>
                          </select>
                        </div>
                      </div>
                      <button
                        onClick={() => setNewItems(newItems.filter((_, i) => i !== idx))}
                        className="text-sm text-red-600 hover:text-red-700 font-bold"
                      >
                        ✕ Retirer
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={handleAddItem}
                    disabled={isInterne}
                    className={`text-sm font-bold ${
                      isInterne 
                        ? 'text-gray-400 cursor-not-allowed'
                        : 'text-teal-600 hover:text-teal-700'
                    }`}
                  >
                    + Ajouter médicament
                  </button>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleSaveOrdonnance}
                    disabled={isSaveDisabled()}
                    className={`flex-1 px-4 py-2 font-bold rounded-lg text-white transition-all ${
                      isSaveDisabled()
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-teal-600 hover:bg-teal-700'
                    }`}
                    title={isChef && delegating && !delegateTo ? 'Sélectionnez un médecin pour la délégation' : ''}
                  >
                    {getSaveButtonLabel()}
                  </button>
                  <button
                    onClick={() => { 
                      setCreatingNew(false); 
                      setNewItems([]);
                      setDelegating(false);
                      setDelegateTo(null);
                    }}
                    className="px-4 py-2 border rounded-lg font-bold"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            </div>
          )}

          {busy ? (
            <Spinner />
          ) : prescriptions.length === 0 ? (
            <div className={`text-center py-8 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
              <p>Aucune ordonnance enregistrée</p>
            </div>
          ) : (
            <div className="space-y-2">
              {prescriptions.map((ord: any) => (
                <div
                  key={ord.id}
                  className={`border rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow ${dark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
                  onClick={() => setExpandedId(expandedId === ord.id ? null : ord.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold">{ord.formatted_id}</span>
                        <span className={`text-xs px-2 py-1 rounded ${ord.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                          {ord.status === 'active' ? '✓ Active' : 'Archivée'}
                        </span>
                      </div>
                      <p className={`text-sm mt-1 ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
                        {ord.doctor_name} — {ord.date} — {ord.items?.length || 0} médicaments
                      </p>
                    </div>
                    <ChevronDown className={`w-5 h-5 transition-transform ${expandedId === ord.id ? 'rotate-180' : ''}`} />
                  </div>

                  {expandedId === ord.id && (
                    <div className="mt-4 pt-4 border-t space-y-2">
                      {ord.items?.map((item: any, i: number) => (
                        <div key={i} className={`p-2 rounded ${dark ? 'bg-gray-700' : 'bg-gray-50'}`}>
                          <p className="font-bold">{i+1}. {item.med_name}</p>
                          <p className="text-sm">{item.dose_mg}mg — {item.frequency_per_day}x/jour — {item.duration_days}j</p>
                          {item.dispensed && <p className="text-xs text-green-600">✓ Distribué</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          <p>Journal d'audit — Historique des modifications</p>
          <p className="text-sm mt-2">(Intégration du système d'audit en cours)</p>
        </div>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// PATIENTS VIEW
// ══════════════════════════════════════════════════════════════════
const ABO_OPTS = ['A','B','AB','O'] as const;
const ALLERGY_DRUG_SUGG = ['Pénicilline','Amoxicilline','Ibuprofène','Aspirine','Sulfamides','Morphine','Codéine','Tétracyclines'];
const ALLERGY_OTHER_SUGG = ['Arachides','Latex','Pollen','Lait','Gluten','Nickel'];

function formatPedAge(iso?: string | null, fallbackAge?: number): string {
  if (!iso) {
    if (fallbackAge !== undefined) return `${fallbackAge} ans`;
    return '—';
  }
  const birth = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(birth.getTime())) {
    return fallbackAge !== undefined ? `${fallbackAge} ans` : '—';
  }
  const now = new Date();
  const totalDays = Math.floor((now.getTime() - birth.getTime()) / 86400000);
  if (totalDays < 30) {
    return `${totalDays} jour${totalDays > 1 ? 's' : ''}`;
  }
  const totalMonths = Math.floor(totalDays / 30.4375);
  if (totalMonths < 24) {
    return `${totalMonths} mois`;
  }
  const yrs = Math.floor(totalMonths / 12);
  const mths = totalMonths % 12;
  if (yrs < 6) {
    return mths > 0 ? `${yrs} ans, ${mths} mois` : `${yrs} ans`;
  }
  return `${yrs} ans`;
}

function formatBirthFr(iso: string | undefined | null, fallbackAge: number): string {
  if (!iso) return `${fallbackAge} ans`;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return `${fallbackAge} ans`;
  const label = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const formatted = formatPedAge(iso, fallbackAge);
  return `${label} · ${formatted}`;
}

function parseAboRhFromBlood(bt: string): { abo: typeof ABO_OPTS[number] | ''; rh: 'positif' | 'negatif' } {
  const s = (bt || '').trim().toUpperCase();
  if (s.endsWith('+')) return { abo: (s.slice(0, -1) as (typeof ABO_OPTS)[number]) || '', rh: 'positif' };
  if (s.endsWith('-')) return { abo: (s.slice(0, -1) as (typeof ABO_OPTS)[number]) || '', rh: 'negatif' };
  return { abo: '', rh: 'positif' };
}

function bloodPreview(abo: string, rh: 'positif' | 'negatif'): string {
  if (!abo) return '—';
  return `${abo}${rh === 'positif' ? '+' : '-'}`;
}

function buildPhenotypeDisplay(p: any): string {
  if (!p) return '';
  const f = (v: any, pos: string, neg: string) => v ? pos : neg;
  return f(p.ph_C,'C+','C-') + f(p.ph_c,'c+','c-') +
         f(p.ph_E,'E+','E-') + f(p.ph_e,'e+','e-') +
         f(p.ph_K,'K+','K-');
}

export const PatientsView = ({ 
  currentDoctor 
}: { 
  currentDoctor?: { name: string; role: string; rfiduid?: string; id?: number } | null 
} = {}) => {
  const { dark } = useTheme();
  const inp = useInpClass();
  const [patients,setPatients]=useState<Patient[]>([]);
  const [rooms,setRooms]=useState<Room[]>([]);
  const [sel,setSel]=useState<Patient|null>(null);
  const [search,setSearch]=useState('');
  const [modal,setModal]=useState<'add'|'edit'|null>(null);
  const [saving,setSaving]=useState(false);
  const [saveError,setSaveError]=useState('');
  const [busy,setBusy]=useState(true);
  const [tab,setTab]=useState<'identite'|'constantes'|'traitements'|'ordonnances'|'historique'>('identite');
  const [dischargeModal,setDischargeModal]=useState(false);
  const [admissionSearchModal,setAdmissionSearchModal]=useState(false);
  const [searchDossierResults,setSearchDossierResults]=useState<any[]>([]);
  const [selectedDossier,setSelectedDossier]=useState<any|null>(null);
  const [dischargeForm,setDischargeForm]=useState({
    type_sortie: 'autorisee' as 'autorisee' | 'transfert' | 'scam' | 'deces',
    transfert_destination: '',
    diagnostic_sortie: '',
    resume_clinique: '',
    traitement_sortie: '',
    consignes_parents: '',
    rdv_controle: '',
    medecin_sortie: currentDoctor?.name || '',
    scam_signature: false,
  });
  const [searchForm,setSearchForm]=useState({
    nom: '',
    prenom: '',
    date_naissance: '',
    telephone: '',
  });
  const [vitalsRows, setVitalsRows] = useState<any[]>([]);
  const [treatModal,setTreatModal]=useState<null | { mode: 'add' } | { mode: 'edit'; row: PatientTreatment }>(null);
  const [treatSaving,setTreatSaving]=useState(false);
  const [treatError,setTreatError]=useState('');
  const [treatForm,setTreatForm]=useState({
    med_name: '',
    dose: '',
    frequency: '',
    route: 'Per os',
    start_date: '',
    end_date: '',
    origin: 'Hospitalisation',
    notes: '',
    active: true,
  });
  const [form,setForm]=useState({
    first_name:'',last_name:'',age:'',weight:'',blood_type:'A+',diagnostic:'',room_id:'1',bed:'1',allergies:[] as string[],notes:'',
    date_naissance:'', groupe_sanguin:'', antecedents:'', traitement_en_cours:'',
    groupe_abo: 'A' as string,
    rhesus: 'positif' as 'positif' | 'negatif',
    ph_C:0, ph_c:0, ph_E:0, ph_e:0, ph_K:0, ph_k:0,
    drug_allergies: [] as string[],
    other_allergies: [] as string[],
    taille: '',
    pcranien: '',
    poidsnaissance: '',
    poidsref: '',
    vaccination_status: 'inconnu',
    vaccinations: [] as string[],
  });

  const load=useCallback(async()=>{
    setBusy(true);
    try { 
      const [p,r]=await Promise.all([api('/api/patients'),api('/api/rooms')]); 
      // Normalize patient data - backend already parses JSON fields (allergies, etc)
      const normalized = normalizePatients(p);
      setPatients(normalized); 
      setRooms(r); 
    } catch (error) {
      console.error('Error loading patients/rooms:', error);
      setPatients([]);
      setRooms([]);
    }
    finally { setBusy(false); }
  },[]);
  useEffect(()=>{load();},[load]);

  const filtered=patients.filter(p=>p.full_name?.toLowerCase().includes(search.toLowerCase())||p.diagnostic?.toLowerCase().includes(search.toLowerCase()));
  const loadVitals = useCallback(async (patientId: number) => {
    try {
      const rows = await api(`/api/patients/${patientId}/vitals`);
      setVitalsRows(Array.isArray(rows) ? rows : []);
    } catch {
      setVitalsRows([]);
    }
  }, []);

  const calcSurface = (taille?: number | null, weight?: string | null) => {
    const w = parseFloat(String(weight || '').replace(',', '.'));
    if (!taille || !Number.isFinite(w) || w <= 0) return null;
    return Math.round(Math.sqrt((taille * w) / 3600) * 100) / 100;
  };

  const patientHasAlert = (p: Patient) =>
    (p.allergies?.length ?? 0) > 0 ||
    (p.drug_allergies?.length ?? 0) > 0 ||
    (p.other_allergies?.length ?? 0) > 0;

  const toggleArr = (key: 'drug_allergies' | 'other_allergies', a: string) =>
    setForm((f) => ({
      ...f,
      [key]: (f[key] as string[]).includes(a) ? (f[key] as string[]).filter((x) => x !== a) : [...(f[key] as string[]), a],
    }));

  const save=async()=>{
    setSaving(true);
    const editedId = modal === 'edit' && sel ? sel.id : null;
    const bt = bloodPreview(form.groupe_abo, form.rhesus);
    
    // CHANGE 1: Weight typo guard - check if weight change > 15%
    if (sel?.weight && form.weight) {
      const oldWeight = parseFloat(String(sel.weight).replace(/[^0-9.]/g, ''));
      const newWeight = parseFloat(form.weight);
      if (!isNaN(oldWeight) && !isNaN(newWeight) && oldWeight > 0) {
        const percentChange = Math.abs((newWeight - oldWeight) / oldWeight) * 100;
        if (percentChange > 15) {
          const confirmed = confirm(
            `Changement de poids important détecté: ${oldWeight} kg → ${newWeight} kg (${percentChange.toFixed(1)}%).\n\nConfirmer la modification?`
          );
          if (!confirmed) {
            setSaving(false);
            return;
          }
        }
      }
    }
    
    const body={
      first_name:form.first_name,last_name:form.last_name,age:form.date_naissance ? Math.floor((Date.now() - new Date(`${form.date_naissance}T12:00:00`).getTime()) / (365.25 * 86400000)) : parseInt(form.age || '0', 10),weight:form.weight,blood_type: bt || form.blood_type,
      diagnostic:form.diagnostic,room_id:parseInt(form.room_id,10),bed:parseInt(form.bed,10),allergies:[] as string[],notes:form.notes,
      date_naissance: form.date_naissance || null,
      groupe_sanguin: form.groupe_sanguin || bt,
      antecedents: form.antecedents || null,
      traitement_en_cours: form.traitement_en_cours || null,
      groupe_abo: form.groupe_abo || null,
      rhesus: form.rhesus,
      ph_C: form.ph_C ? 1 : 0,
      ph_c: form.ph_c ? 1 : 0,
      ph_E: form.ph_E ? 1 : 0,
      ph_e: form.ph_e ? 1 : 0,
      ph_K: form.ph_K ? 1 : 0,
      ph_k: form.ph_k ? 1 : 0,
      drug_allergies: form.drug_allergies,
      other_allergies: form.other_allergies,
      taille: form.taille ? parseInt(form.taille, 10) : null,
      pcranien: form.pcranien ? parseFloat(form.pcranien) : null,
      poidsnaissance: form.poidsnaissance ? parseFloat(form.poidsnaissance) : null,
      poidsref: form.poidsref ? parseFloat(form.poidsref) : null,
      vaccination_status: form.vaccination_status,
      vaccinations: form.vaccinations,
    };
    try {
      if(modal==='edit'&&sel) await api(`/api/patients/${sel.id}`,{method:'PUT',body:JSON.stringify(body)});
      else await api('/api/patients',{method:'POST',body:JSON.stringify(body)});
      setModal(null);
      await load();
      if (editedId) {
        try {
          const full = await api(`/api/patients/${editedId}`);
          setSel(normalizePatient(full) as Patient);
        } catch { /* ignore */ }
      }
    } catch(e:any){ setSaveError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };

  const discharge=async()=>{
    if (!sel) return;
    if(!confirm(`Terminer l'hospitalisation pour ${sel.full_name} ?`)) return;
    setSaving(true);
    try {
      await api(`/api/patients/${sel.id}/discharge`,{
        method:'POST',
        body:JSON.stringify({
          ...dischargeForm,
          scam_signature: dischargeForm.scam_signature ? 1 : 0,
        })
      });
      setDischargeModal(false);
      setSel(null);
      await load();
    } catch(e:any){ 
      setSaveError(e instanceof Error ? e.message : String(e)); 
    }
    finally { setSaving(false); }
  };

  const searchDossiers=async()=>{
    try {
      const results = await api(`/api/dossiers/search?nom=${encodeURIComponent(searchForm.nom)}&prenom=${encodeURIComponent(searchForm.prenom)}&date_naissance=${encodeURIComponent(searchForm.date_naissance)}&telephone=${encodeURIComponent(searchForm.telephone)}`);
      setSearchDossierResults(Array.isArray(results) ? results : []);
    } catch(e:any){ 
      setSaveError(e instanceof Error ? e.message : String(e)); 
    }
  };

  const del=async(p:Patient)=>{
    if(!confirm(`Supprimer le dossier de ${p.full_name} ?`)) return;
    await api(`/api/patients/${p.id}`,{method:'DELETE'});
    if(sel?.id===p.id) setSel(null);
    await load();
  };

  const openEdit=(p:Patient)=>{
    const { abo, rh } = parseAboRhFromBlood(p.blood_type_display || p.blood_type || '');
    const parsedDrugAllergies = (() => {
      try {
        const da = p.drug_allergies as unknown as string | string[];
        if (typeof da === 'string' && (da.startsWith('[') || da.startsWith('{'))) {
          return JSON.parse(da);
        }
        return Array.isArray(da) ? da : [];
      } catch {
        return [];
      }
    })();
    const parsedOtherAllergies = (() => {
      try {
        const oa = p.other_allergies as unknown as string | string[];
        if (typeof oa === 'string' && (oa.startsWith('[') || oa.startsWith('{'))) {
          return JSON.parse(oa);
        }
        return Array.isArray(oa) ? oa : [];
      } catch {
        return [];
      }
    })();
    setForm({
      first_name:p.first_name,last_name:p.last_name,age:String(p.age),weight:p.weight,blood_type:p.blood_type,diagnostic:p.diagnostic,
      room_id:String(p.room_id),bed:String(p.bed),
      allergies: [],
      notes:p.notes||'',
      date_naissance: p.date_naissance || '',
      groupe_sanguin: p.groupe_sanguin || p.blood_type || '',
      antecedents: p.antecedents || '',
      traitement_en_cours: p.traitement_en_cours || '',
      groupe_abo: (p.groupe_abo && p.groupe_abo.trim()) ? p.groupe_abo : (abo || 'A'),
      rhesus: (p.rhesus === 'negatif' || p.rhesus === 'positif') ? p.rhesus : rh,
      ph_C: p.ph_C ? 1 : 0,
      ph_c: p.ph_c ? 1 : 0,
      ph_E: p.ph_E ? 1 : 0,
      ph_e: p.ph_e ? 1 : 0,
      ph_K: p.ph_K ? 1 : 0,
      ph_k: p.ph_k ? 1 : 0,
      drug_allergies: parsedDrugAllergies,
      other_allergies: parsedOtherAllergies,
      taille: String((p as any).taille ?? ''),
      pcranien: String((p as any).pcranien ?? ''),
      poidsnaissance: String((p as any).poidsnaissance ?? ''),
      poidsref: String((p as any).poidsref ?? ''),
      vaccination_status: (p as any).vaccination_status || 'inconnu',
      vaccinations: Array.isArray((p as any).vaccinations) ? (p as any).vaccinations : [],
    });
    setModal('edit');
  };

  const selectPatientRow = async (p: Patient) => {
    try {
      const full = await api(`/api/patients/${p.id}`);
      setSel(normalizePatient(full) as Patient);
      await loadVitals(p.id);
    } catch {
      setSel(p);
      await loadVitals(p.id);
    }
    setTab('identite');
  };

  const openTreatAdd = () => {
    setTreatError('');
    setTreatForm({
      med_name: '',
      dose: '',
      frequency: '',
      route: 'Per os',
      start_date: new Date().toISOString().slice(0, 10),
      end_date: '',
      origin: 'Hospitalisation',
      notes: '',
      active: true,
    });
    setTreatModal({ mode: 'add' });
  };

  const openTreatEdit = (row: PatientTreatment) => {
    setTreatError('');
    setTreatForm({
      med_name: row.med_name,
      dose: row.dose || '',
      frequency: row.frequency || '',
      route: row.route || 'Per os',
      start_date: (row.start_date ?? '').slice(0, 10),
      end_date: (row.end_date ?? '').slice(0, 10),
      origin: row.origin || 'Hospitalisation',
      notes: row.notes || '',
      active: row.active !== 0,
    });
    setTreatModal({ mode: 'edit', row });
  };

  const saveTreatment = async () => {
    if (!sel || !treatForm.med_name.trim()) return;
    setTreatSaving(true);
    try {
      const body = {
        med_name: treatForm.med_name.trim(),
        dose: treatForm.dose,
        frequency: treatForm.frequency,
        route: treatForm.route,
        start_date: treatForm.start_date || null,
        end_date: treatForm.end_date || null,
        origin: treatForm.origin,
        notes: treatForm.notes,
        active: treatForm.active,
      };
      if (treatModal?.mode === 'add') {
        await api(`/api/patients/${sel.id}/current-treatments`, { method: 'POST', body: JSON.stringify(body) });
      } else if (treatModal?.mode === 'edit') {
        await api(`/api/patients/${sel.id}/current-treatments/${treatModal.row.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
      }
      setTreatModal(null);
      const full = await api(`/api/patients/${sel.id}`);
      setSel(normalizePatient(full) as Patient);
      await load();
    } catch (e: unknown) {
      setTreatError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setTreatSaving(false);
    }
  };

  const deleteTreatment = async (tid: number) => {
    if (!sel || !confirm('Supprimer ce traitement ?')) return;
    try {
      await api(`/api/patients/${sel.id}/current-treatments/${tid}`, { method: 'DELETE' });
      const full = await api(`/api/patients/${sel.id}`);
      setSel(normalizePatient(full) as Patient);
      await load();
    } catch (e) {
      console.error('Erreur suppression traitement', e);
    }
  };

  const initials=(n?:string)=>n?.split(' ').map((w:string)=>w[0]).join('').slice(0,2)??'??';

  const sidebar=dark?'bg-gray-900 border-gray-700':'bg-gray-50 border-gray-200';
  const card=dark?'bg-gray-800 border-gray-700':'bg-white border-gray-200';
  const tabActive=dark?'bg-gray-700 text-white':'bg-white text-gray-900 shadow-sm';
  const tabInactive=dark?'text-gray-400 hover:text-gray-200':'text-gray-500 hover:text-gray-700';

  return (
    <div className="flex h-full overflow-hidden">
      {/* List */}
      <div className={`w-80 flex-shrink-0 border-r ${sidebar} flex flex-col`}>
        <div className={`p-4 border-b ${dark?'border-gray-700 bg-gray-900':'border-gray-200 bg-white'} space-y-3`}>
          <div className="flex items-center justify-between">
            <h1 className={`text-lg font-black ${dark?'text-white':'text-gray-900'}`}>Patients</h1>
            <button onClick={()=>{setSearchDossierResults([]);setSearchForm({nom:'',prenom:'',date_naissance:'',telephone:''});setAdmissionSearchModal(true);}}
              className="flex items-center gap-1.5 text-sm text-white bg-teal-600 hover:bg-teal-700 px-3 py-1.5 rounded-xl font-bold transition-colors">
              <Plus className="w-3.5 h-3.5"/> Admettre
            </button>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5"/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher..." className={`${inp} pl-9`}/>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {busy?<Spinner/>:filtered.map(p=>(
            <button key={`patient-${p.id}-${p.room_id}-${p.bed}`} type="button" onClick={() => void selectPatientRow(p)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b transition-all
                ${sel?.id===p.id
                  ? dark?'bg-teal-900/50 border-l-2 border-l-teal-400 border-gray-700':'bg-teal-50 border-l-2 border-l-teal-500 border-gray-100'
                  : dark?'bg-gray-900 border-gray-800 hover:bg-gray-800':'bg-white border-gray-100 hover:bg-gray-50'}`}>
              {p.photo ? (
                <img src={p.photo} alt={p.full_name} className="w-9 h-9 rounded-full object-cover flex-shrink-0 border-2 border-white shadow-sm"/>
              ) : (
                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-xs flex-shrink-0 ${dark?'bg-blue-900 text-blue-300':'bg-blue-100 text-blue-700'}`}>{initials(p.full_name)}</div>
              )}
              <div className="flex-1 min-w-0">
                <p className={`font-bold text-sm truncate ${sel?.id===p.id?'text-teal-600 dark:text-teal-400':dark?'text-white':'text-gray-800'}`}>{p.full_name}</p>
                <p className={`text-xs truncate ${dark?'text-gray-500':'text-gray-400'}`}>{p.diagnostic} · Salle {p.room_id}</p>
              </div>
              {patientHasAlert(p) && <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0"/>}
            </button>
          ))}
        </div>
      </div>

      {/* Detail */}
      <div className={`flex-1 overflow-y-auto ${dark?'bg-gray-850 bg-gray-900':'bg-white'}`}>
        {!sel?(
          <div className={`flex flex-col items-center justify-center h-full ${dark?'text-gray-600':'text-gray-300'}`}>
            <Users className="w-14 h-14 mb-4"/>
            <p className={`text-lg font-bold ${dark?'text-gray-500':'text-gray-400'}`}>Sélectionnez un patient</p>
          </div>
        ):(
          <motion.div key={sel.id} initial={{opacity:0,x:10}} animate={{opacity:1,x:0}} className="p-8 space-y-5 max-w-3xl">
            <div className={`flex gap-1 p-1 rounded-xl ${dark?'bg-gray-800':'bg-gray-100'}`}>
              {([
                { id: 'identite' as const, label: 'Identité & contexte' },
                { id: 'constantes' as const, label: 'Constantes' },
                { id: 'traitements' as const, label: 'Traitements en cours' },
                { id: 'ordonnances' as const, label: 'Ordonnances' },
                { id: 'historique' as const, label: 'Historique' },
              ]).map((t) => (
                <button key={t.id} type="button" onClick={() => setTab(t.id)}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${tab === t.id ? tabActive : tabInactive}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'identite' && (
              <div className="space-y-5">
                <EmergencyPanel patientId={sel.id} weight={sel.weight} />
                <div className={`flex items-start gap-4 rounded-2xl p-5 border ${dark ? 'bg-gray-800 border-gray-700' : 'bg-gradient-to-br from-teal-50 to-blue-50 border-teal-100'}`}>
                  <PhotoUpload
                    patientId={sel.id}
                    current={sel.photo || ''}
                    onUpdated={(b64) => {
                      setSel({ ...sel, photo: b64 });
                      setPatients((pts) => pts.map((p) => (p.id === sel.id ? { ...p, photo: b64 } : p)));
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <h2 className={`text-2xl font-black ${dark ? 'text-white' : 'text-gray-900'}`}>{sel.full_name}</h2>
                    <p className={`text-sm mt-1 ${dark ? 'text-gray-300' : 'text-gray-600'}`}>
                      {formatBirthFr(sel.date_naissance, sel.age)}
                    </p>
                    <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                      Poids : <span className="font-bold">{sel.weight}</span> · Salle {sel.room_id} · Lit {sel.bed}
                    </p>
                    <span className={`inline-block mt-2 text-xs font-black px-3 py-1 rounded-full ${dark ? 'bg-teal-900 text-teal-200' : 'bg-teal-600 text-white'}`}>
                      {sel.diagnostic}
                    </span>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button type="button" onClick={() => openEdit(sel)} className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all ${dark?'bg-gray-700 border-gray-600 hover:border-teal-500 text-gray-400 hover:text-teal-400':'bg-white border-gray-200 hover:border-teal-400 text-gray-500 hover:text-teal-600 shadow-sm'}`}><Edit2 className="w-3.5 h-3.5"/></button>
                    <button type="button" onClick={() => setDischargeModal(true)} className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all ${dark?'bg-gray-700 border-gray-600 hover:border-amber-500 text-gray-400 hover:text-amber-400':'bg-white border-gray-200 hover:border-amber-400 text-gray-500 hover:text-amber-600 shadow-sm'}`}><DoorOpen className="w-3.5 h-3.5"/></button>
                  </div>
                </div>

                <div className={`rounded-xl p-4 border space-y-2 ${dark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                  <p className={`text-sm ${dark ? 'text-gray-200' : 'text-gray-800'}`}>
                    <span className="font-bold">Groupe sanguin :</span>{' '}
                    {sel.blood_type_display || sel.groupe_sanguin || sel.blood_type || '—'}
                  </p>
                  {buildPhenotypeDisplay(sel) && (
                    <p className={`text-xs font-mono ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                      <span className="font-semibold text-xs">Phénotype:</span> <span className="text-xs font-mono">{buildPhenotypeDisplay(sel)}</span>
                    </p>
                  )}
                </div>

                <div className={`rounded-xl p-4 border ${dark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-100'}`}>
                  <p className={`text-xs font-bold uppercase mb-2 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Antécédents</p>
                  <p className={`text-sm ${dark ? 'text-gray-200' : 'text-gray-800'}`}>
                    {sel.antecedents?.trim() ? sel.antecedents : 'Aucun antécédent renseigné'}
                  </p>
                </div>

                <div className={`rounded-xl p-4 border space-y-2 ${dark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                  <p className={`text-xs font-bold uppercase mb-2 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Anthropométrie</p>
                  <p className={`text-sm ${dark ? 'text-gray-200' : 'text-gray-800'}`}>Taille: {(sel as any).taille ? `${(sel as any).taille} cm` : '—'}</p>
                  <p className={`text-sm ${dark ? 'text-gray-200' : 'text-gray-800'}`}>SC: {(sel as any).bsa_m2 ? `${(sel as any).bsa_m2} m²` : calcSurface((sel as any).taille, sel.weight) ? `${calcSurface((sel as any).taille, sel.weight)} m²` : '—'}</p>
                  <p className={`text-sm ${dark ? 'text-gray-200' : 'text-gray-800'}`}>PC: {(sel as any).pcranien ? `${(sel as any).pcranien} cm` : '—'}</p>
                  <p className={`text-sm ${dark ? 'text-gray-200' : 'text-gray-800'}`}>Poids de naissance: {(sel as any).poidsnaissance ? `${(sel as any).poidsnaissance} kg` : '—'}</p>
                </div>

                <div className={`rounded-xl p-4 border space-y-2 ${dark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                  <p className={`text-xs font-bold uppercase mb-2 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Vaccination</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {(sel as any).vaccination_status === 'inconnu' && <span className="inline-flex text-[10px] font-black px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 border border-gray-300">🔘 Non vérifié</span>}
                    {(sel as any).vaccination_status === 'incomplet' && <span className="inline-flex text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">🟡 Incomplet</span>}
                    {(sel as any).vaccination_status === 'ajour' && <span className="inline-flex text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300">🟢 À jour</span>}
                    {Array.isArray((sel as any).vaccinations) && (sel as any).vaccinations.length > 0 ? (
                      <span className={`text-sm ${dark ? 'text-gray-200' : 'text-gray-800'}`}>{(sel as any).vaccinations.join(', ')}</span>
                    ) : (
                      <span className={`text-sm ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Aucun vaccin coché</span>
                    )}
                  </div>
                </div>

                <div className={`rounded-xl p-4 border ${dark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                  <p className={`text-xs font-bold uppercase mb-2 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Allergies</p>
                  {(
                    (Array.isArray(sel.drug_allergies) && sel.drug_allergies.length > 0) ||
                    (Array.isArray(sel.other_allergies) && sel.other_allergies.length > 0) ||
                    (Array.isArray(sel.allergies) && sel.allergies.length > 0)
                  ) ? (
                    <div className="space-y-3">
                      {(Array.isArray(sel.drug_allergies) && sel.drug_allergies.length > 0) && (
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <AlertTriangle className="w-4 h-4 text-red-500" />
                            <span className="text-sm font-bold text-red-700">Allergies médicamenteuses</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {sel.drug_allergies.map((a) => (
                              <Badge key={a} text={a} color="red" />
                            ))}
                          </div>
                        </div>
                      )}
                      {(Array.isArray(sel.other_allergies) && sel.other_allergies.length > 0) && (
                        <div>
                          <p className="text-sm font-bold text-amber-800 mb-1">Autres allergies</p>
                          <div className="flex flex-wrap gap-1">
                            {sel.other_allergies.map((a) => (
                              <Badge key={a} text={a} color="amber" />
                            ))}
                          </div>
                        </div>
                      )}
                      {(
                        (!Array.isArray(sel.drug_allergies) || sel.drug_allergies.length === 0) &&
                        (!Array.isArray(sel.other_allergies) || sel.other_allergies.length === 0) &&
                        (Array.isArray(sel.allergies) && sel.allergies.length > 0)
                      ) && (
                        <div className="flex flex-wrap gap-1">
                          {sel.allergies.map((a) => (
                            <Badge key={typeof a === 'string' ? a : a.medication} text={typeof a === 'string' ? a : a.medication} color="red" />
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className={`text-sm ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Aucune allergie connue</p>
                  )}
                </div>

                {sel.notes?.trim() ? (
                  <div className={`rounded-xl p-4 border ${dark ? 'bg-amber-900/20 border-amber-800' : 'bg-amber-50 border-amber-100'}`}>
                    <p className={`text-xs font-bold uppercase mb-1 ${dark ? 'text-amber-200' : 'text-amber-800'}`}>Notes cliniques</p>
                    <p className={`text-sm ${dark ? 'text-gray-200' : 'text-gray-800'}`}>{sel.notes}</p>
                  </div>
                ) : null}

                {(() => {
                  const acc = sel.guardian ?? sel.guardians?.[0];
                  return acc ? (
                    <div className={`rounded-xl p-4 border ${dark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-100'}`}>
                      <p className={`text-xs font-bold uppercase mb-1 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Accompagnateur</p>
                      <p className={`font-bold ${dark ? 'text-white' : 'text-gray-900'}`}>{acc.name}</p>
                      <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
                        {acc.relationship || '—'}
                        {acc.phone ? ` · ${acc.phone}` : ''}
                      </p>
                    </div>
                  ) : null;
                })()}
              </div>
            )}

            {tab === 'constantes' && (
              <div className={`rounded-2xl border overflow-hidden ${dark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                {vitalsRows.length > 0 && (
                  <div className="px-4 pt-4">
                    <PEWSBadge vitals={vitalsRows[0]} dark={dark} />
                  </div>
                )}
                <div className={`grid grid-cols-8 gap-2 px-4 py-3 text-xs font-black uppercase ${dark ? 'bg-gray-900 text-gray-400' : 'bg-gray-50 text-gray-500'}`}>
                  <span>Date</span><span>Shift</span><span>Temp</span><span>FR</span><span>SpO₂</span><span>Diurèse</span><span>Transit</span><span>Glasgow</span>
                </div>
                {vitalsRows.length === 0 ? (
                  <p className={`px-4 py-6 text-sm ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Aucune constante enregistrée.</p>
                ) : (
                  vitalsRows.map((row, idx) => {
                    const temp = row.temperature ?? 0;
                    const spo2 = row.spo2 ?? 100;
                    let rowBg = dark ? 'border-gray-700 text-gray-200' : 'border-gray-100 text-gray-800';
                    if (temp > 38.5 || spo2 < 94) {
                      rowBg = 'bg-red-100 border-red-300 text-red-900';
                    } else if (temp > 37.5 || spo2 < 96) {
                      rowBg = 'bg-amber-100 border-amber-300 text-amber-900';
                    }
                    return (
                    <div key={`vitals-${sel.id}-${row.id}`} className={`grid grid-cols-8 gap-2 px-4 py-3 text-sm border-t ${rowBg}`}>
                      <span>{String(row.timestamp || '').replace('T', ' ').slice(0, 16)}</span>
                      <span>{row.shift || '—'}</span>
                      <span>{row.temperature ?? '—'}</span>
                      <span>{row.respiratory_rate ?? '—'}</span>
                      <span>{row.spo2 ?? '—'}</span>
                      <span>{row.diuresis ?? '—'}</span>
                      <span>{row.transit ?? '—'}</span>
                      <span>{row.glasgow ?? '—'}</span>
                    </div>
                    );
                  })
                )}
              </div>
            )}

            {tab === 'traitements' && (
              <div className="space-y-4">
                <div className="flex justify-end">
                  <button type="button" onClick={openTreatAdd}
                    className="flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-xl bg-teal-600 text-white hover:bg-teal-700 transition-colors">
                    <Plus className="w-4 h-4" /> Ajouter un traitement
                  </button>
                </div>
                {(sel.current_treatments || []).length === 0 ? (
                  <p className={`text-sm text-center py-8 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Aucun traitement en cours enregistré</p>
                ) : (
                  <div className="space-y-3">
                    {(sel.current_treatments || []).map((tr) => (
                      <div key={`treatment-${sel.id}-${tr.id}`} className={`rounded-xl border p-4 ${dark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                        <div className="flex justify-between gap-2">
                          <p className={`font-black ${dark ? 'text-white' : 'text-gray-900'}`}>{tr.med_name}</p>
                          <div className="flex gap-2 flex-shrink-0">
                            <button type="button" onClick={() => openTreatEdit(tr)} className="text-teal-500 font-bold text-sm">Éditer</button>
                            <button type="button" onClick={() => void deleteTreatment(tr.id)} className="text-red-500 font-bold text-sm">Supprimer</button>
                          </div>
                        </div>
                        <p className={`text-sm mt-1 ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
                          {tr.dose || '—'} · {tr.frequency || '—'} · {tr.route || '—'}
                        </p>
                        <p className={`text-xs mt-1 ${dark ? 'text-gray-500' : 'text-gray-500'}`}>
                          {(tr.start_date ?? '').slice(0, 10) || '—'} → {(tr.end_date ?? '') ? (tr.end_date as string).slice(0, 10) : 'en cours'}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                            tr.origin === 'Domicile' ? 'bg-blue-100 text-blue-800' :
                            tr.origin === 'Urgences' ? 'bg-orange-100 text-orange-800' :
                            tr.origin === 'Transfert' ? 'bg-gray-200 text-gray-800' :
                            'bg-teal-100 text-teal-800'
                          }`}>{tr.origin || 'Hospitalisation'}</span>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${tr.active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-600'}`}>
                            {tr.active ? 'Actif' : 'Terminé'}
                          </span>
                        </div>
                        {tr.notes?.trim() ? <p className={`text-xs mt-2 ${dark ? 'text-gray-400' : 'text-gray-600'}`}>{tr.notes}</p> : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === 'ordonnances' && <OrdonnancePanel patient={sel} currentDoctor={currentDoctor || null} />}
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {modal && (
          <Modal title={modal === 'add' ? 'Nouveau patient' : 'Modifier patient'} onClose={() => setModal(null)} width="max-w-xl">
            <div className="space-y-6">
              <div>
                <p className={`text-xs font-black uppercase tracking-wider mb-2 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>1 — Identité</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Prénom" required><input className={inp} value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} placeholder="Yanis" /></Field>
                  <Field label="Nom" required><input className={inp} value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} placeholder="Belkacem" /></Field>
                  <Field label="Date de naissance" required><input className={inp} type="date" value={form.date_naissance} onChange={(e) => setForm((f) => ({ ...f, date_naissance: e.target.value }))} /></Field>
                  {form.date_naissance ? (
                    <div className={`text-xs font-semibold px-3 py-2 rounded-lg ${dark ? 'bg-teal-900/30 text-teal-200 border border-teal-800' : 'bg-teal-50 text-teal-700 border border-teal-200'}`}>
                      Âge pédiatrique : {formatPedAge(form.date_naissance)}
                    </div>
                  ) : (
                    <div className={`text-xs px-3 py-2 rounded-lg ${dark ? 'bg-gray-700 text-gray-400 border border-gray-600' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                      L'âge sera calculé automatiquement à partir de la date de naissance
                    </div>
                  )}
                  <Field label="Poids"><input className={inp} value={form.weight} onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))} placeholder="21kg" /></Field>
                  {form.date_naissance && form.weight && (() => {
                    const birthDate = new Date(`${form.date_naissance}T12:00:00`);
                    const ageMonths = Math.floor((Date.now() - birthDate.getTime()) / (30.4375 * 86400000));
                    const ageYears = ageMonths / 12;
                    const weightNum = parseFloat(form.weight.replace(',', '.'));
                    let warning = false;
                    if (isFinite(weightNum)) {
                      if (ageMonths < 1 && weightNum > 5) warning = true;
                      else if (ageMonths < 3 && weightNum > 8) warning = true;
                      else if (ageMonths < 12 && weightNum > 15) warning = true;
                      else if (ageMonths < 24 && weightNum > 20) warning = true;
                      else if (ageYears >= 2 && weightNum < 8) warning = true;
                      else if (ageYears >= 5 && weightNum < 14) warning = true;
                    }
                    return warning ? (
                      <div className={`text-xs font-semibold px-3 py-2 rounded-lg flex items-center gap-2 ${dark ? 'bg-amber-900/40 text-amber-200 border border-amber-700' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
                        <span>⚠️</span>
                        <span>Poids/âge incompatible ? Vérifiez l'entrée.</span>
                      </div>
                    ) : null;
                  })()}
                  <Field label="Photo"><p className={`text-xs ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Après création, ajoutez la photo depuis le dossier patient.</p></Field>
                </div>
              </div>
              <div>
                <p className={`text-xs font-black uppercase tracking-wider mb-2 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>2 — Hospitalisation</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Salle"><select className={inp} value={form.room_id} onChange={(e) => setForm((f) => ({ ...f, room_id: e.target.value }))}>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
                  <Field label="Lit"><select className={inp} value={form.bed} onChange={(e) => setForm((f) => ({ ...f, bed: e.target.value }))}><option value="1">Lit 1</option><option value="2">Lit 2</option></select></Field>
                </div>
                <Field label="Diagnostic" required><input className={inp} value={form.diagnostic} onChange={(e) => setForm((f) => ({ ...f, diagnostic: e.target.value }))} placeholder="Pneumonie..." /></Field>
              </div>
              <div>
                <p className={`text-xs font-black uppercase tracking-wider mb-2 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>3 — Groupe sanguin &amp; phénotype</p>
                <p className={`text-xs mb-2 ${dark ? 'text-gray-500' : 'text-gray-500'}`}>Groupe ABO</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {ABO_OPTS.map((x) => (
                    <button key={x} type="button" onClick={() => setForm((f) => ({ ...f, groupe_abo: x }))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-all ${form.groupe_abo === x ? 'bg-teal-600 text-white border-teal-600' : dark ? 'border-gray-600 text-gray-300' : 'border-gray-200 text-gray-700'}`}>{x}</button>
                  ))}
                </div>
                <p className={`text-xs mb-2 ${dark ? 'text-gray-500' : 'text-gray-500'}`}>Rhésus</p>
                <div className="flex gap-2 mb-3">
                  {(['positif', 'negatif'] as const).map((r) => (
                    <button key={r} type="button" onClick={() => setForm((f) => ({ ...f, rhesus: r }))}
                      className={`px-4 py-1.5 rounded-lg text-sm font-bold border transition-all ${form.rhesus === r ? 'bg-teal-600 text-white border-teal-600' : dark ? 'border-gray-600 text-gray-300' : 'border-gray-200 text-gray-700'}`}>
                      {r === 'positif' ? 'Positif' : 'Négatif'}
                    </button>
                  ))}
                </div>
                <p className={`text-xs mb-2 ${dark ? 'text-gray-500' : 'text-gray-500'}`}>Phénotype érythrocytaire</p>
                <div className="flex flex-wrap gap-3 items-center">
                  {(['ph_C', 'ph_c', 'ph_E', 'ph_e', 'ph_K', 'ph_k'] as const).map((k) => (
                    <label key={k} className={`flex items-center gap-1 text-sm font-bold cursor-pointer ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
                      <input type="checkbox" className="rounded border-gray-300" checked={!!form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.checked ? 1 : 0 }))} />
                      {k.replace('ph_', '')}
                    </label>
                  ))}
                </div>
                <p className={`text-sm mt-3 font-mono ${dark ? 'text-teal-300' : 'text-teal-800'}`}>
                  Résumé : {bloodPreview(form.groupe_abo, form.rhesus)} | {( ['ph_C', 'ph_c', 'ph_E', 'ph_e', 'ph_K', 'ph_k'] as const).map((k) => `${k.replace('ph_', '')}${form[k] ? '+' : '-'}`).join(' ')}
                </p>
                {(sel && (sel.ph_C || sel.ph_c || sel.ph_E || sel.ph_e || sel.ph_K || sel.ph_k)) && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                    ⚠ Phénotype validé — modification nécessite validation médicale
                  </p>
                )}
              </div>
              <div>
                <p className={`text-xs font-black uppercase tracking-wider mb-2 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>4 — Contexte médical</p>
                <Field label="Antécédents"><textarea className={inp} rows={3} value={form.antecedents} onChange={(e) => setForm((f) => ({ ...f, antecedents: e.target.value }))} placeholder="Asthme, cardiopathie congénitale..." /></Field>
                <Field label="Traitement en cours (admission)"><textarea className={inp} rows={2} value={form.traitement_en_cours} onChange={(e) => setForm((f) => ({ ...f, traitement_en_cours: e.target.value }))} placeholder="Ex. antibiothérapie IV…" /></Field>
                <Field label="Notes cliniques"><textarea className={inp} rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></Field>
              </div>
              <div>
                <p className={`text-xs font-black uppercase tracking-wider mb-2 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>5 — Allergies</p>
                <Field label="Allergies médicamenteuses">
                  <div className="flex flex-wrap gap-2 mt-1">
                    {ALLERGY_DRUG_SUGG.map((a) => (
                      <button key={a} type="button" onClick={() => toggleArr('drug_allergies', a)}
                        className={`text-xs px-3 py-1.5 rounded-full border font-semibold transition-all ${form.drug_allergies.includes(a) ? 'bg-red-100 text-red-700 border-red-300' : 'bg-gray-100 text-gray-600 border-gray-200 hover:border-gray-400'}`}>{a}</button>
                    ))}
                  </div>
                </Field>
                <Field label="Autres allergies">
                  <div className="flex flex-wrap gap-2 mt-1">
                    {ALLERGY_OTHER_SUGG.map((a) => (
                      <button key={a} type="button" onClick={() => toggleArr('other_allergies', a)}
                        className={`text-xs px-3 py-1.5 rounded-full border font-semibold transition-all ${form.other_allergies.includes(a) ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-gray-100 text-gray-600 border-gray-200 hover:border-gray-400'}`}>{a}</button>
                    ))}
                  </div>
                </Field>
              </div>
              <div>
                <p className={`text-xs font-black uppercase tracking-wider mb-2 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>6 — Anthropométrie</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Taille (cm)"><input className={inp} type="number" value={form.taille} onChange={(e) => setForm((f) => ({ ...f, taille: e.target.value }))} /></Field>
                  <Field label="Périmètre Crânien (cm)"><input className={inp} type="number" step="0.1" value={form.pcranien} onChange={(e) => setForm((f) => ({ ...f, pcranien: e.target.value }))} /></Field>
                  <Field label="Poids de naissance (kg)">
                    <input 
                      className={inp} 
                      type="number" 
                      step="0.1" 
                      value={form.poidsnaissance} 
                      disabled={modal === 'edit' && sel?.poidsnaissance ? true : false}
                      onChange={(e) => setForm((f) => ({ ...f, poidsnaissance: e.target.value }))} 
                    />
                    {modal === 'edit' && sel?.poidsnaissance && (
                      <p className="text-xs text-amber-600 mt-1">🔒 Verrouillé après validation initiale</p>
                    )}
                  </Field>
                  <Field label="Poids de référence / sec (kg)"><input className={inp} type="number" step="0.1" value={form.poidsref} onChange={(e) => setForm((f) => ({ ...f, poidsref: e.target.value }))} /></Field>
                </div>
              </div>
              <div>
                <p className={`text-xs font-black uppercase tracking-wider mb-2 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>7 — Vaccination</p>
                <Field label="Statut">
                  <select className={inp} value={form.vaccination_status} onChange={(e) => setForm((f) => ({ ...f, vaccination_status: e.target.value }))}>
                    <option value="a_jour">À jour</option>
                    <option value="incomplet">Incomplet</option>
                    <option value="inconnu">Inconnu</option>
                  </select>
                </Field>
                <div className="flex flex-wrap gap-2">
                  {['BCG','Pentavalent (DTC-HepB-Hib)','VPO','ROR','Hépatite B','Pneumocoque','Rotavirus','Méningocoque'].map((v) => (
                    <button key={v} type="button" onClick={() => setForm((f) => ({ ...f, vaccinations: f.vaccinations.includes(v) ? f.vaccinations.filter((x) => x !== v) : [...f.vaccinations, v] }))}
                      className={`text-xs px-3 py-1.5 rounded-full border font-semibold transition-all ${form.vaccinations.includes(v) ? 'bg-teal-600 text-white border-teal-600' : 'bg-gray-100 text-gray-600 border-gray-200 hover:border-gray-400'}`}>{v}</button>
                  ))}
                </div>
              </div>
              {saveError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 font-semibold">
                  {saveError}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => void save()} disabled={saving || !form.first_name || !form.last_name || !form.date_naissance || !form.diagnostic}
                  className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-black rounded-xl transition-colors flex items-center justify-center gap-2">
                  <Save className="w-4 h-4" /> {saving ? 'Enregistrement...' : 'Enregistrer'}
                </button>
                <button type="button" onClick={() => setModal(null)} className={`px-5 py-3 border rounded-xl font-bold transition-colors ${inp} w-auto`}>Annuler</button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {treatModal && sel && (
          <Modal title={treatModal.mode === 'add' ? 'Nouveau traitement' : 'Modifier traitement'} onClose={() => setTreatModal(null)} width="max-w-lg">
            <div className="space-y-3">
              <Field label="Médicament / traitement" required>
                <input className={inp} value={treatForm.med_name} onChange={(e) => setTreatForm((f) => ({ ...f, med_name: e.target.value }))} placeholder="Nom" />
              </Field>
              <Field label="Posologie / dose">
                <input className={inp} value={treatForm.dose} onChange={(e) => setTreatForm((f) => ({ ...f, dose: e.target.value }))} placeholder="500 mg" />
              </Field>
              <Field label="Fréquence">
                <input className={inp} value={treatForm.frequency} onChange={(e) => setTreatForm((f) => ({ ...f, frequency: e.target.value }))} placeholder="3x/jour, si besoin..." />
              </Field>
              <Field label="Voie d&apos;administration">
                <select className={inp} value={treatForm.route} onChange={(e) => setTreatForm((f) => ({ ...f, route: e.target.value }))}>
                  <option>Per os</option>
                  <option>IV</option>
                  <option>IM</option>
                  <option>SC</option>
                  <option>Nébulisation</option>
                  <option>Autre</option>
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date de début"><input className={inp} type="date" value={treatForm.start_date} onChange={(e) => setTreatForm((f) => ({ ...f, start_date: e.target.value }))} /></Field>
                <Field label="Date de fin (optionnel)"><input className={inp} type="date" value={treatForm.end_date} onChange={(e) => setTreatForm((f) => ({ ...f, end_date: e.target.value }))} /></Field>
              </div>
              <Field label="Origine">
                <select className={inp} value={treatForm.origin} onChange={(e) => setTreatForm((f) => ({ ...f, origin: e.target.value }))}>
                  <option>Hospitalisation</option>
                  <option>Domicile</option>
                  <option>Urgences</option>
                  <option>Transfert</option>
                </select>
              </Field>
              <Field label="Remarque"><textarea className={inp} rows={2} value={treatForm.notes} onChange={(e) => setTreatForm((f) => ({ ...f, notes: e.target.value }))} /></Field>
              <label className={`flex items-center gap-2 text-sm font-bold ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
                <input type="checkbox" checked={treatForm.active} onChange={(e) => setTreatForm((f) => ({ ...f, active: e.target.checked }))} />
                Traitement actif
              </label>
              {treatError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 font-semibold">
                  {treatError}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => void saveTreatment()} disabled={treatSaving || !treatForm.med_name.trim()}
                  className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-200 text-white font-black rounded-xl">{treatSaving ? '...' : 'Enregistrer'}</button>
                <button type="button" onClick={() => setTreatModal(null)} className={`px-5 py-3 border rounded-xl font-bold ${inp}`}>Annuler</button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* DISCHARGE MODAL */}
      <AnimatePresence>
        {dischargeModal && sel && (
          <Modal title="Fin de séjour" onClose={() => setDischargeModal(false)} width="max-w-2xl">
            <div className="space-y-4">
              <div className={`rounded-xl p-4 border ${dark ? 'bg-gray-800 border-gray-700' : 'bg-blue-50 border-blue-200'}`}>
                <p className={`text-sm font-bold ${dark ? 'text-blue-300' : 'text-blue-700'}`}>
                  Terminer l'hospitalisation de <strong>{sel.full_name}</strong>
                </p>
              </div>

              <Field label="Type de sortie" required>
                <div className="space-y-2">
                  {(['autorisee', 'transfert', 'scam', 'deces'] as const).map((type) => (
                    <label key={type} className={`flex items-center gap-2 cursor-pointer p-2 rounded ${dischargeForm.type_sortie === type ? (dark ? 'bg-gray-700' : 'bg-teal-100') : ''}`}>
                      <input
                        type="radio"
                        name="type_sortie"
                        value={type}
                        checked={dischargeForm.type_sortie === type}
                        onChange={(e) => setDischargeForm((f) => ({ ...f, type_sortie: e.target.value as any }))}
                        className="cursor-pointer"
                      />
                      <span className="text-sm font-bold">
                        {type === 'autorisee' && '✅ Sortie autorisée'}
                        {type === 'transfert' && '🏥 Transfert'}
                        {type === 'scam' && '⚠️ SCAM (Contre avis médical)'}
                        {type === 'deces' && '🕊️ Décès'}
                      </span>
                    </label>
                  ))}
                </div>
              </Field>

              {dischargeForm.type_sortie === 'transfert' && (
                <Field label="Destination du transfert" required>
                  <input className={inp} value={dischargeForm.transfert_destination} onChange={(e) => setDischargeForm((f) => ({ ...f, transfert_destination: e.target.value }))} placeholder="Hôpital, service..." />
                </Field>
              )}

              <Field label="Diagnostic final" required>
                <input className={inp} value={dischargeForm.diagnostic_sortie} onChange={(e) => setDischargeForm((f) => ({ ...f, diagnostic_sortie: e.target.value }))} placeholder="Principal diagnostic à la sortie..." />
              </Field>

              <Field label="Résumé clinique">
                <textarea className={inp} rows={3} value={dischargeForm.resume_clinique} onChange={(e) => setDischargeForm((f) => ({ ...f, resume_clinique: e.target.value }))} placeholder="Évolution durant le séjour..." />
              </Field>

              <Field label="Traitement à la sortie">
                <textarea className={inp} rows={2} value={dischargeForm.traitement_sortie} onChange={(e) => setDischargeForm((f) => ({ ...f, traitement_sortie: e.target.value }))} placeholder="Ordonnance de sortie..." />
              </Field>

              <Field label="Consignes pour parents/tuteur">
                <textarea className={inp} rows={2} value={dischargeForm.consignes_parents} onChange={(e) => setDischargeForm((f) => ({ ...f, consignes_parents: e.target.value }))} placeholder="Repos, suivi, restrictions..." />
              </Field>

              <Field label="RDV de contrôle" required>
                <input className={inp} type="date" value={dischargeForm.rdv_controle} onChange={(e) => setDischargeForm((f) => ({ ...f, rdv_controle: e.target.value }))} />
              </Field>

              {dischargeForm.type_sortie === 'scam' && (
                <label className={`flex items-center gap-2 text-sm font-bold p-3 rounded border ${dischargeForm.scam_signature ? (dark ? 'bg-red-900/50 border-red-700' : 'bg-red-50 border-red-200') : (dark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200')} cursor-pointer`}>
                  <input
                    type="checkbox"
                    checked={dischargeForm.scam_signature}
                    onChange={(e) => setDischargeForm((f) => ({ ...f, scam_signature: e.target.checked }))}
                    className="cursor-pointer"
                  />
                  <span>Je confirme que le patient quitte contre avis médical (SCAM)</span>
                </label>
              )}

              {saveError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 font-semibold">
                  {saveError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => void discharge()} disabled={saving || !dischargeForm.diagnostic_sortie.trim()}
                  className="flex-1 py-3 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-200 text-white font-black rounded-xl">{saving ? '...' : 'Terminer séjour'}</button>
                <button type="button" onClick={() => setDischargeModal(false)} className={`px-5 py-3 border rounded-xl font-bold ${inp}`}>Annuler</button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* ADMISSION SEARCH MODAL */}
      <AnimatePresence>
        {admissionSearchModal && (
          <Modal title="Admettre un patient" onClose={() => setAdmissionSearchModal(false)} width="max-w-2xl">
            <div className="space-y-4">
              <div className={`rounded-xl p-3 border ${dark ? 'bg-gray-800 border-gray-700' : 'bg-blue-50 border-blue-200'}`}>
                <p className={`text-sm font-bold ${dark ? 'text-blue-300' : 'text-blue-700'}`}>
                  Recherchez le dossier patient. S'il existe, créez un nouveau séjour. Sinon, créez un nouveau dossier.
                </p>
              </div>

              <Field label="Prénom">
                <input className={inp} value={searchForm.prenom} onChange={(e) => setSearchForm((f) => ({ ...f, prenom: e.target.value }))} placeholder="Yanis..." />
              </Field>

              <Field label="Nom">
                <input className={inp} value={searchForm.nom} onChange={(e) => setSearchForm((f) => ({ ...f, nom: e.target.value }))} placeholder="Leblanc..." />
              </Field>

              <Field label="Date de naissance">
                <input className={inp} type="date" value={searchForm.date_naissance} onChange={(e) => setSearchForm((f) => ({ ...f, date_naissance: e.target.value }))} />
              </Field>

              <Field label="Téléphone">
                <input className={inp} value={searchForm.telephone} onChange={(e) => setSearchForm((f) => ({ ...f, telephone: e.target.value }))} placeholder="+213..." />
              </Field>

              <button type="button" onClick={() => void searchDossiers()}
                className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white font-black rounded-xl">
                Rechercher
              </button>

              {searchDossierResults.length > 0 && (
                <div className="space-y-2">
                  <p className={`text-sm font-bold ${dark ? 'text-gray-300' : 'text-gray-700'}`}>Résultats trouvés:</p>
                  {searchDossierResults.map((dossier) => (
                    <button
                      key={dossier.id}
                      type="button"
                      onClick={() => setSelectedDossier(dossier)}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${
                        selectedDossier?.id === dossier.id
                          ? dark ? 'bg-teal-900/50 border-teal-500' : 'bg-teal-50 border-teal-400'
                          : dark ? 'bg-gray-800 border-gray-700 hover:border-gray-600' : 'bg-white border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <p className="font-bold">{dossier.prenom} {dossier.nom}</p>
                      <p className={`text-xs ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{dossier.date_naissance} · Tél: {dossier.telephone}</p>
                      <p className={`text-xs mt-1 ${dossier.is_currently_admitted ? 'text-red-500' : dark ? 'text-gray-400' : 'text-gray-500'}`}>
                        {dossier.is_currently_admitted ? '🔴 En cours d\'admission' : `Séjours: ${dossier.sejours_count}`}
                      </p>
                    </button>
                  ))}
                </div>
              )}

              {saveError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 font-semibold">
                  {saveError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                {selectedDossier ? (
                  <>
                    <button type="button" onClick={() => {
                      setAdmissionSearchModal(false);
                      // TODO: Navigate to new sejour form for this dossier
                    }}
                      className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white font-black rounded-xl">
                      Nouveau séjour pour {selectedDossier.prenom}
                    </button>
                    <button type="button" onClick={() => setSelectedDossier(null)} className={`px-5 py-3 border rounded-xl font-bold ${inp}`}>Retour</button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => {
                      setAdmissionSearchModal(false);
                      // TODO: Navigate to new patient/dossier form
                      setSaveError('');
                      setForm({first_name:'',last_name:'',age:'',weight:'',blood_type:'A+',diagnostic:'',room_id:'1',bed:'1',allergies:[],notes:'',date_naissance:'',groupe_sanguin:'',antecedents:'',traitement_en_cours:'',groupe_abo:'A',rhesus:'positif',ph_C:0,ph_c:0,ph_E:0,ph_e:0,ph_K:0,ph_k:0,drug_allergies:[],other_allergies:[],taille:'',pcranien:'',poidsnaissance:'',poidsref:'',vaccination_status:'inconnu',vaccinations:[]});
                      setModal('add');
                    }}
                      className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl">
                      Créer nouveau dossier
                    </button>
                    <button type="button" onClick={() => setAdmissionSearchModal(false)} className={`px-5 py-3 border rounded-xl font-bold ${inp}`}>Annuler</button>
                  </>
                )}
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// PENDING REQUESTS VIEW (Staff Registration Approvals)
// ══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════
// ÉQUIPE MÉDICALE (Account + role + access management)
// ══════════════════════════════════════════════════════════════════
type StaffDoctor = {
  id: number;
  name: string;
  username?: string;
  rfid_uid?: string;
  role: string;
  status?: string;
  created_at?: string;
  last_activity?: string | null;
  phone?: string | null;
};

const DoctorsView = ({ currentDoctor }: { currentDoctor?: any }) => {
  const { dark } = useTheme();
  const inp = useInpClass();
  const card = dark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';

  const sanitizeRfid = (value: string) =>
    (value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

  const [rows, setRows] = useState<StaffDoctor[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [tab, setTab] = useState<'staff' | 'requests'>('staff');

  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const [editOpen, setEditOpen] = useState<StaffDoctor | null>(null);
  // Signup flow: pending requests
  const [pending, setPending] = useState<any[]>([]);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [approveOpen, setApproveOpen] = useState<any | null>(null);
  const [approveForm, setApproveForm] = useState({ role: 'MEDECIN_RESIDENT', rfiduid: '', pin: '' });
  const [rejectBusyId, setRejectBusyId] = useState<number | null>(null);

  const [editForm, setEditForm] = useState({
    fullname: '',
    role: '',
    rfiduid: '',
    status: '',
    phone: '',
    pin: '',
  });


  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const list = await api('/api/admin/doctors');
      setRows(Array.isArray(list) ? list : []);
      const [cnt, reqs] = await Promise.all([
        api('/api/admin/pending-count').catch(() => ({ count: 0 })),
        api('/api/admin/pending-requests').catch(() => []),
      ]);
      setPendingCount(Number((cnt as any)?.count || 0));
      setPending(Array.isArray(reqs) ? reqs : []);
    } catch (e: any) {
      setError(e?.message || 'Erreur chargement équipe médicale');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((d) => {
      const matchText =
        !s ||
        (d.name || '').toLowerCase().includes(s) ||
        (d.username || '').toLowerCase().includes(s) ||
        (d.rfid_uid || '').toLowerCase().includes(s);

      const matchRole = roleFilter === 'ALL' ? true : String(d.role || '').toUpperCase() === roleFilter;
      const matchStatus =
        statusFilter === 'ALL' ? true : String(d.status || '').toUpperCase() === statusFilter;

      return matchText && matchRole && matchStatus;
    });
  }, [rows, q, roleFilter, statusFilter]);

  const toast = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 3000);
  };

  const openEdit = (d: StaffDoctor) => {
    setError('');
    setEditOpen(d);
    setEditForm({
      fullname: d.name || '',
      role: d.role || 'MEDECIN_RESIDENT',
      rfiduid: d.rfid_uid || '',
      status: (d.status || 'ACTIVE').toUpperCase(),
      phone: String(d.phone || ''),
      pin: '',
    });
  };

  const onEditSave = async () => {
    if (!editOpen) return;
    setError('');
    setBusy(true);
    try {
      await api(`/api/admin/doctors/${editOpen.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          fullname: editForm.fullname || undefined,
          role: editForm.role || undefined,
          rfiduid: editForm.rfiduid ? sanitizeRfid(editForm.rfiduid) : undefined,
          status: editForm.status || undefined,
          phone: editForm.phone || undefined,
          pin: editForm.pin || undefined,
        }),
      });
      setEditOpen(null);
      toast('Compte mis à jour');
      await load();
    } catch (e: any) {
      setError(e?.message || 'Erreur mise à jour');
    } finally {
      setBusy(false);
    }
  };

  const onSuspendReactivate = async (d: StaffDoctor, next: 'ACTIVE' | 'SUSPENDED') => {
    setError('');
    setBusy(true);
    try {
      await api(`/api/admin/doctors/${d.id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: next }),
      });
      toast(next === 'SUSPENDED' ? 'Compte suspendu' : 'Compte réactivé');
      await load();
    } catch (e: any) {
      setError(e?.message || 'Erreur statut');
    } finally {
      setBusy(false);
    }
  };


  const onDelete = async (d: StaffDoctor) => {
    if (!window.confirm(`Supprimer définitivement ${d.name} ?\n\n⚠️ Recommandé uniquement si le compte n’a jamais été utilisé.`)) return;
    setError('');
    setBusy(true);
    try {
      await api(`/api/doctors/${d.id}`, { method: 'DELETE' });
      toast('Compte supprimé');
      await load();
    } catch (e: any) {
      setError(e?.message || 'Suppression refusée');
    } finally {
      setBusy(false);
    }
  };

  const onApprove = async () => {
    if (!approveOpen) return;
    setError('');
    if (!approveForm.rfiduid.trim()) return setError('RFID requis');
    if (!approveForm.pin.trim()) return setError('PIN requis');
    setBusy(true);
    try {
      await api(`/api/admin/approve/${approveOpen.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          role: approveForm.role,
          rfiduid: sanitizeRfid(approveForm.rfiduid),
          pin: approveForm.pin,
          validatedby: currentDoctor?.name || 'CHEF_SERVICE',
        }),
      });
      setApproveOpen(null);
      setApproveForm({ role: 'MEDECIN_RESIDENT', rfiduid: '', pin: '' });
      toast('Demande approuvée');
      await load();
    } catch (e: any) {
      setError(e?.message || 'Erreur validation');
    } finally {
      setBusy(false);
    }
  };

  const onReject = async (requestId: number) => {
    setError('');
    setRejectBusyId(requestId);
    try {
      await api(`/api/admin/reject/${requestId}`, {
        method: 'PUT',
        body: JSON.stringify({ reason: 'rejected' }),
      });
      toast('Demande rejetée');
      await load();
    } catch (e: any) {
      setError(e?.message || 'Erreur rejet');
    } finally {
      setRejectBusyId(null);
    }
  };

  return (
    <div className="p-8 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-2xl ${dark ? 'bg-teal-900/30 text-teal-400' : 'bg-teal-50 text-teal-600'}`}>
            <Stethoscope className="w-7 h-7" />
          </div>
          <div>
            <h1 className={`text-2xl font-black ${dark ? 'text-white' : 'text-gray-900'}`}>Équipe Médicale</h1>
            <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Gestion des comptes, rôles et accès</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setTab('staff')}
            className={`px-4 py-2 rounded-xl text-sm font-black border ${
              tab === 'staff'
                ? 'bg-teal-600 border-teal-600 text-white'
                : dark ? 'border-gray-700 text-gray-300 hover:bg-gray-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            Équipe ({rows.length})
          </button>
          <button
            onClick={() => setTab('requests')}
            className={`px-4 py-2 rounded-xl text-sm font-black border ${
              tab === 'requests'
                ? 'bg-teal-600 border-teal-600 text-white'
                : dark ? 'border-gray-700 text-gray-300 hover:bg-gray-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
            disabled={!currentDoctor || String(currentDoctor.role).toUpperCase() !== 'CHEF_SERVICE'}
            title={!currentDoctor || String(currentDoctor.role).toUpperCase() !== 'CHEF_SERVICE' ? 'Chef de Service requis' : 'Demandes en attente'}
          >
            Demandes ({pendingCount})
          </button>
        </div>
      </div>

      {(error || success) && (
        <div className={`p-4 rounded-2xl text-sm font-bold border ${
          error
            ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400'
            : 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400'
        }`}>
          {error || success}
        </div>
      )}

      <div className={`${card} border rounded-2xl p-4`}>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[220px]">
            <label className={`block text-xs font-bold mb-1 ${dark ? 'text-gray-400' : 'text-gray-600'}`}>Recherche</label>
            <input className={inp} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, username, RFID..." />
          </div>
          <div className="min-w-[200px]">
            <label className={`block text-xs font-bold mb-1 ${dark ? 'text-gray-400' : 'text-gray-600'}`}>Rôle</label>
            <select className={inp} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="ALL">Tous</option>
              {ROLES.map((r) => (
                <option key={r.slug} value={r.slug}>{r.label}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[170px]">
            <label className={`block text-xs font-bold mb-1 ${dark ? 'text-gray-400' : 'text-gray-600'}`}>Statut</label>
            <select className={inp} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="ALL">Tous</option>
              <option value="ACTIVE">Actif</option>
              <option value="SUSPENDED">Suspendu</option>
            </select>
          </div>
          <button
            onClick={() => void load()}
            className={`px-4 py-2 rounded-xl border font-black text-sm ${dark ? 'border-gray-700 text-gray-300 hover:bg-gray-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}
            disabled={busy}
          >
            <RefreshCw className="w-4 h-4 inline-block mr-2" />
            Actualiser
          </button>
        </div>
      </div>

      {tab === 'staff' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {busy && rows.length === 0 ? (
            <div className={`${card} border rounded-2xl`}><Spinner /></div>
          ) : filtered.length === 0 ? (
            <div className={`${card} border rounded-2xl p-8 text-center font-semibold ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
              Aucun compte trouvé
            </div>
          ) : (
            filtered.map((d) => {
              const st = String(d.status || 'ACTIVE').toUpperCase();
              const initials = (d.name || '?').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
              return (
                <div key={d.id} className={`${card} border rounded-2xl p-5`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black ${dark ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-700'}`}>
                        {initials}
                      </div>
                      <div>
                        <p className={`font-black ${dark ? 'text-white' : 'text-gray-900'}`}>{d.name}</p>
                        <p className={`text-xs font-mono ${dark ? 'text-gray-400' : 'text-gray-500'}`}>@{d.username || '—'}</p>
                      </div>
                    </div>
                    <Badge text={st === 'ACTIVE' ? 'Actif' : 'Suspendu'} color={st === 'ACTIVE' ? 'green' : 'red'} />
                  </div>

                  <div className="mt-4 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className={dark ? 'text-gray-400' : 'text-gray-500'}>Rôle</span>
                      <span className={`font-bold ${dark ? 'text-gray-200' : 'text-gray-800'}`}>{d.role}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={dark ? 'text-gray-400' : 'text-gray-500'}>RFID</span>
                      <span className={`font-mono font-bold ${dark ? 'text-gray-200' : 'text-gray-800'}`}>{d.rfid_uid || '—'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={dark ? 'text-gray-400' : 'text-gray-500'}>Créé</span>
                      <span className={`font-mono ${dark ? 'text-gray-300' : 'text-gray-700'}`}>{d.created_at || '—'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={dark ? 'text-gray-400' : 'text-gray-500'}>Dernière activité</span>
                      <span className={`font-mono ${dark ? 'text-gray-300' : 'text-gray-700'}`}>{d.last_activity || '—'}</span>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button className={`px-3 py-2 rounded-xl border text-xs font-black ${dark ? 'border-gray-700 text-gray-300 hover:bg-gray-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`} onClick={() => openEdit(d)}>
                      <Edit2 className="w-3.5 h-3.5 inline-block mr-1" />
                      Modifier
                    </button>
                    {st === 'ACTIVE' ? (
                      <button className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black" onClick={() => void onSuspendReactivate(d, 'SUSPENDED')}>
                        Suspendre
                      </button>
                    ) : (
                      <button className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black" onClick={() => void onSuspendReactivate(d, 'ACTIVE')}>
                        Réactiver
                      </button>
                    )}
                    <button className="px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black" onClick={() => void onDelete(d)}>
                      <Trash2 className="w-3.5 h-3.5 inline-block mr-1" />
                      Supprimer
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {pending.length === 0 ? (
            <div className={`${card} border rounded-2xl p-8 text-center font-semibold ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
              Aucune demande en attente
            </div>
          ) : (
            pending.map((r) => (
              <div key={r.id} className={`${card} border rounded-2xl p-5`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={`font-black ${dark ? 'text-white' : 'text-gray-900'}`}>{r.fullname}</p>
                    <p className={`text-xs font-mono ${dark ? 'text-gray-400' : 'text-gray-500'}`}>@{r.username}</p>
                  </div>
                  <Badge text="PENDING" color="amber" />
                </div>
                <div className="mt-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className={dark ? 'text-gray-400' : 'text-gray-500'}>Rôle souhaité</span>
                    <span className={`font-bold ${dark ? 'text-gray-200' : 'text-gray-800'}`}>{r.role}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={dark ? 'text-gray-400' : 'text-gray-500'}>Téléphone</span>
                    <span className={`font-mono ${dark ? 'text-gray-300' : 'text-gray-700'}`}>{r.phone || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={dark ? 'text-gray-400' : 'text-gray-500'}>Créée</span>
                    <span className={`font-mono ${dark ? 'text-gray-300' : 'text-gray-700'}`}>{r.createdat || '—'}</span>
                  </div>
                  {r.note ? (
                    <div className={`text-xs ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
                      <span className="font-bold">Note:</span> {r.note}
                    </div>
                  ) : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    className="px-3 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black"
                    onClick={() => { setApproveOpen(r); setApproveForm({ role: r.role || 'MEDECIN_RESIDENT', rfiduid: '', pin: '' }); }}
                  >
                    Approuver
                  </button>
                  <button
                    className={`px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black disabled:opacity-50`}
                    disabled={rejectBusyId === r.id}
                    onClick={() => void onReject(r.id)}
                  >
                    Rejeter
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Edit modal */}
      {editOpen && (
        <Modal title={`Modifier — ${editOpen.name}`} onClose={() => setEditOpen(null)} width="max-w-2xl">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nom complet">
              <input className={inp} value={editForm.fullname} onChange={(e) => setEditForm({ ...editForm, fullname: e.target.value })} />
            </Field>
            <Field label="Rôle">
              <select className={inp} value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}>
                {ROLES.map((r) => (
                  <option key={r.slug} value={r.slug}>{r.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Statut">
              <select className={inp} value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                <option value="ACTIVE">Actif</option>
                <option value="SUSPENDED">Suspendu</option>
              </select>
            </Field>
            <Field label="RFID">
              <input className={`${inp} font-mono`} value={editForm.rfiduid} onChange={(e) => setEditForm({ ...editForm, rfiduid: sanitizeRfid(e.target.value) })} maxLength={8} />
            </Field>
            <Field label="Téléphone">
              <input className={inp} value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
            </Field>
            <Field label="Changer PIN (optionnel)">
              <input className={`${inp} font-mono`} type="password" value={editForm.pin} onChange={(e) => setEditForm({ ...editForm, pin: e.target.value.replace(/[^0-9]/g, '').slice(0, 8) })} />
            </Field>
          </div>
          <div className="flex gap-3 mt-6">
            <button disabled={busy} onClick={() => void onEditSave()} className="flex-1 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black">
              {busy ? '...' : 'Enregistrer'}
            </button>
            <button onClick={() => setEditOpen(null)} className={`px-5 py-3 border rounded-xl font-bold ${inp}`}>Annuler</button>
          </div>
        </Modal>
      )}

      {approveOpen && (
        <Modal title={`Valider — ${approveOpen.fullname}`} onClose={() => setApproveOpen(null)} width="max-w-2xl">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Rôle" required>
              <select className={inp} value={approveForm.role} onChange={(e) => setApproveForm({ ...approveForm, role: e.target.value })}>
                {ROLES.map((r) => (
                  <option key={r.slug} value={r.slug}>{r.label}</option>
                ))}
              </select>
            </Field>
            <Field label="RFID à attribuer" required>
              <input className={`${inp} font-mono`} value={approveForm.rfiduid} onChange={(e) => setApproveForm({ ...approveForm, rfiduid: sanitizeRfid(e.target.value) })} maxLength={8} placeholder="A1B2C3D4" />
            </Field>
            <Field label="PIN" required>
              <input className={`${inp} font-mono`} type="password" value={approveForm.pin} onChange={(e) => setApproveForm({ ...approveForm, pin: e.target.value.replace(/[^0-9]/g, '').slice(0, 8) })} placeholder="••••" />
            </Field>
          </div>
          <div className="flex gap-3 mt-6">
            <button disabled={busy} onClick={() => void onApprove()} className="flex-1 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black">
              {busy ? '...' : 'Valider et créer le compte'}
            </button>
            <button onClick={() => setApproveOpen(null)} className={`px-5 py-3 border rounded-xl font-bold ${inp}`}>Annuler</button>
          </div>
        </Modal>
      )}

    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// TECH VIEW (engineer only — all technical details)
// MERGED with EngineerView content
// ══════════════════════════════════════════════════════════════════
type RobotStatus = { mqtt: string; esp32: string; stm32: string; battery: number | null; rssi: number | null };
type MqttLogLine = { id: string; at: number; topic: string; payload: string };

function topicTagClass(topic: string): string {
  if (topic.includes('status')) return 'text-teal-600 dark:text-teal-400';
  if (topic.includes('ack')) return 'text-amber-600 dark:text-amber-400';
  if (topic.includes('rfid')) return 'text-violet-600 dark:text-violet-400';
  if (topic.includes('cmd')) return 'text-rose-600 dark:text-rose-400';
  if (topic.includes('dispense')) return 'text-emerald-600 dark:text-emerald-400';
  return 'text-gray-600 dark:text-gray-400';
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function parseStm32(raw: unknown): string {
  if (raw === 'ready' || raw === 'busy') return raw;
  if (raw === 'online') return 'ready';
  return 'offline';
}

const TechView = ({ techStatus, onRefresh, currentDoctor }: { techStatus:TechStatus|null; onRefresh:()=>void; currentDoctor?: any }) => {
  const { dark } = useTheme();
  // TechView original state
  const [log,setLog]=useState<LogEntry[]>([]);
  const [fwVersion,setFwVersion]=useState('1.0.0');
  const [fwFile,setFwFile]=useState('firmware.bin');
  const [fwBusy,setFwBusy]=useState(false);
  const [fwError,setFwError]=useState('');
  const [fwHist,setFwHist]=useState<Array<{id:number;version:string;filename:string}>>([]);
  // EngineerView merged state
  const [sysStatus, setSysStatus] = useState<RobotStatus>({
    mqtt: 'offline',
    esp32: 'unknown',
    stm32: 'unknown',
    battery: null,
    rssi: null,
  });
  const [lines, setLines] = useState<MqttLogLine[]>([]);
  const [latencyMs, setLatencyMs] = useState<number[]>([]);
  const [auditRows, setAuditRows] = useState<
    Array<{
      id: number;
      timestamp: string;
      utilisateur_nom: string;
      role: string;
      action: string;
      detail: string;
      ip_address: string;
      statut: string;
    }>
  >([]);
  const [auditAction, setAuditAction] = useState('');
  const [auditUser, setAuditUser] = useState('');
  const [auditDate, setAuditDate] = useState('');
  const [coreTemp, setCoreTemp] = useState<number | null>(null);
  const [cpuPct, setCpuPct] = useState<number | null>(null);
  const [forceDrawer, setForceDrawer] = useState<number>(1);
  const [forceReason, setForceReason] = useState<string>('maintenance');
  const [forceBusy, setForceBusy] = useState(false);
  const [forceResult, setForceResult] = useState<{ ok: boolean; msg: string } | null>(null);
  
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const lastTsRef = useRef<number | null>(null);
  
  useEffect(()=>{ api('/api/log').then(setLog); },[]);
  const loadFwHist=useCallback(()=>{ api('/api/tech/firmware-history').then(setFwHist).catch(()=>setFwHist([])); },[]);
  useEffect(()=>{ loadFwHist(); },[loadFwHist]);
  
  useLayoutEffect(() => {
    const el = terminalRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lines]);

  const loadAudit = useCallback(async () => {
    try {
      const u = new URLSearchParams();
      u.set('limit', '100');
      if (auditAction.trim()) u.set('action', auditAction.trim());
      if (auditUser.trim()) u.set('utilisateur', auditUser.trim());
      if (auditDate.trim()) u.set('date', auditDate.trim());
      const r = await fetch(`/api/audit-log?${u.toString()}`);
      if (!r.ok) return;
      const j = (await r.json()) as typeof auditRows;
      setAuditRows(Array.isArray(j) ? j : []);
    } catch {
      setAuditRows([]);
    }
  }, [auditAction, auditUser, auditDate]);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch('/api/audit-log?limit=100');
        if (!r.ok) return;
        const j = (await r.json()) as typeof auditRows;
        setAuditRows(Array.isArray(j) ? j : []);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    const host = window.location.hostname;
    let c: any;
    try {
      const mqtt = require('mqtt');
      c = mqtt.connect(`ws://${host}:9001`, {
        clientId: 'medibot_tech_' + Math.random().toString(16).slice(2, 10),
        connectTimeout: 5000,
        reconnectPeriod: 3000,
      });

      setSysStatus((s) => ({ ...s, mqtt: 'connecting' }));

      c.on('connect', () => {
        setSysStatus((s) => ({ ...s, mqtt: 'online', esp32: 'unknown', stm32: 'unknown' }));
        c.subscribe('robot/ROBOT001/#');
      });

      c.on('disconnect', () => {
        setSysStatus({ mqtt: 'offline', esp32: 'offline', stm32: 'offline', battery: null, rssi: null });
      });

      c.on('error', () => {
        setSysStatus((s) => ({ ...s, mqtt: 'offline' }));
      });

      c.on('message', (topic: unknown, message: unknown) => {
        const tStr = String(topic);
        const payload =
          message != null && typeof (message as { toString?: () => string }).toString === 'function'
            ? (message as { toString: () => string }).toString()
            : String(message);
        const now = Date.now();
        const id = `${now}-${Math.random().toString(16).slice(2)}`;

        setLines((prev) => {
          const next = [...prev, { id, at: now, topic: tStr, payload }];
          return next.length > 500 ? next.slice(-500) : next;
        });

        const prev = lastTsRef.current;
        if (prev != null) {
          const delta = Math.min(800, Math.max(1, now - prev));
          setLatencyMs((arr) => [...arr.slice(-35), delta]);
        }
        lastTsRef.current = now;

        if (tStr === 'robot/ROBOT001/status') {
          try {
            const data = JSON.parse(payload) as Record<string, unknown>;
            setSysStatus({
              mqtt: 'online',
              esp32: data.esp32 === 'online' ? 'online' : 'offline',
              stm32: parseStm32(data.stm32),
              battery:
                typeof data.bat === 'number'
                  ? data.bat
                  : typeof data.battery === 'number'
                    ? data.battery
                    : null,
              rssi:
                typeof data.rssi === 'number'
                  ? data.rssi
                  : typeof data.wifi_rssi === 'number'
                    ? data.wifi_rssi
                    : null,
            });
            const tRaw = data.core_temp ?? data.temp ?? data.t_cpu;
            if (typeof tRaw === 'number') setCoreTemp(tRaw);
            else if (typeof tRaw === 'string') {
              const n = parseFloat(tRaw);
              if (!Number.isNaN(n)) setCoreTemp(n);
            }
            const cRaw = data.cpu ?? data.cpu_pct;
            if (typeof cRaw === 'number') setCpuPct(Math.round(Math.min(100, Math.max(0, cRaw))));
            else if (typeof cRaw === 'string') {
              const n = parseFloat(cRaw);
              if (!Number.isNaN(n)) setCpuPct(Math.round(Math.min(100, Math.max(0, n))));
            }
          } catch {
            /* ignore */
          }
        }
      });

      return () => {
        try {
          c.end(true);
        } catch {
          /* ignore */
        }
      };
    } catch {
      // mqtt not available
      return undefined;
    }
  }, []);

  const registerFw=async()=>{
    setFwBusy(true);
    setFwError('');
    try {
      await api('/api/tech/firmware',{method:'POST',body:JSON.stringify({version:fwVersion,filename:fwFile})});
      await loadFwHist();
    } catch(e:any){ setFwError(e instanceof Error ? e.message : String(e)); }
    finally { setFwBusy(false); }
  };

  const handleForceOpen=async()=>{
    if (!window.confirm(
      `⚠️ Ouvrir le tiroir ${forceDrawer} de force ?\n` +
      `Raison : ${forceReason}\n\n` +
      `Cette action sera enregistrée dans le journal de dispense.`
    )) return;
    setForceBusy(true);
    setForceResult(null);
    try {
      const r = await api('/api/tech/force-open', {
        method: 'POST',
        body: JSON.stringify({ drawer: forceDrawer, reason: forceReason })
      });
      setForceResult({
        ok: r.ok,
        msg: r.ok
          ? `✅ Tiroir ${forceDrawer} ouvert avec succès (MQTT OK)`
          : `❌ Commande envoyée mais MQTT a échoué`
      });
    } catch {
      setForceResult({ ok: false, msg: '❌ Erreur réseau — backend injoignable' });
    } finally {
      setForceBusy(false);
      setTimeout(() => setForceResult(null), 5000);
    }
  };

  const card=dark?'bg-gray-800 border-gray-700':'bg-white border-gray-200';
  const dot=(v:string)=>v==='online'?'bg-emerald-500 animate-pulse':v==='unknown'?'bg-gray-400':'bg-red-500';
  const label=(v:string)=>v==='online'?'text-emerald-500':v==='unknown'?'text-gray-400':'text-red-500';

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-2xl font-black ${dark?'text-white':'text-gray-900'}`}>🔧 Vue Technique</h1>
          <p className={`text-sm mt-0.5 ${dark?'text-gray-400':'text-gray-500'}`}>Réservé à l'ingénieur système — MediBot ROBOT001</p>
        </div>
        <button onClick={onRefresh} className={`flex items-center gap-2 border px-3 py-2 rounded-xl text-sm transition-all ${dark?'border-gray-700 text-gray-400 hover:text-teal-400':'border-gray-200 text-gray-500 hover:text-teal-600'}`}>
          <RefreshCw className="w-3.5 h-3.5"/> Actualiser
        </button>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* MQTT Status */}
        <div className={`${card} border rounded-2xl p-5`}>
          <h2 className={`font-black mb-4 flex items-center gap-2 ${dark?'text-white':'text-gray-800'}`}><Wifi className="w-4 h-4 text-teal-500"/> Broker MQTT</h2>
          <div className="space-y-3">
            {[
              {label:'Broker TCP :1883',val:techStatus?.mqtt_broker||'unknown'},
              {label:'WebSocket :9001',val:techStatus?.mqtt_ws||'unknown'},
              {label:'Robot ID',val:'ROBOT001',plain:true},
              {label:'Topic CMD',val:'robot/ROBOT001/cmd/dispense',plain:true},
            ].map(s=>(
              <div key={s.label} className={`flex items-center justify-between p-3 rounded-xl border ${dark?'bg-gray-700/50 border-gray-600':'bg-gray-50 border-gray-100'}`}>
                <span className={`text-sm font-semibold ${dark?'text-gray-300':'text-gray-600'}`}>{s.label}</span>
                {s.plain
                  ? <span className={`text-xs font-mono ${dark?'text-gray-400':'text-gray-500'}`}>{s.val}</span>
                  : <div className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${dot(s.val)}`}/><span className={`text-sm font-bold capitalize ${label(s.val)}`}>{s.val}</span></div>
                }
              </div>
            ))}
          </div>
        </div>

        {/* Hardware */}
        <div className={`${card} border rounded-2xl p-5`}>
          <h2 className={`font-black mb-4 flex items-center gap-2 ${dark?'text-white':'text-gray-800'}`}><Cpu className="w-4 h-4 text-blue-500"/> Hardware</h2>
          <div className="space-y-3">
            {[
              {label:'ESP32 (WiFi/MQTT)',val:techStatus?.esp32||'unknown'},
              {label:'STM32F4 (RFID/Tiroirs)',val:techStatus?.stm32||'unknown'},
              {label:'RC522 (SPI1)',val:'PA4/PA5/PA6/PA7',plain:true},
              {label:'UART ESP32↔STM32',val:'PA9/PA10 · 115200',plain:true},
            ].map(s=>(
              <div key={s.label} className={`flex items-center justify-between p-3 rounded-xl border ${dark?'bg-gray-700/50 border-gray-600':'bg-gray-50 border-gray-100'}`}>
                <span className={`text-sm font-semibold ${dark?'text-gray-300':'text-gray-600'}`}>{s.label}</span>
                {s.plain
                  ? <span className={`text-xs font-mono ${dark?'text-gray-400':'text-gray-500'}`}>{s.val}</span>
                  : <div className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${dot(s.val)}`}/><span className={`text-sm font-bold capitalize ${label(s.val)}`}>{s.val}</span></div>
                }
              </div>
            ))}
          </div>
        </div>

        {/* Drawers */}
        <div className={`${card} border rounded-2xl p-5`}>
          <h2 className={`font-black mb-4 flex items-center gap-2 ${dark?'text-white':'text-gray-800'}`}><Package className="w-4 h-4 text-violet-500"/> Tiroirs (6)</h2>
          <div className="grid grid-cols-3 gap-2">
            {Array.from({length:6},(_,i)=>(
              <div key={i} className={`p-3 rounded-xl border text-center ${dark?'bg-gray-700/50 border-gray-600':'bg-gray-50 border-gray-100'}`}>
                <p className={`font-black text-lg ${dark?'text-white':'text-gray-800'}`}>[{i+1}]</p>
                <p className={`text-xs font-mono ${dark?'text-gray-400':'text-gray-400'}`}>PB{[6,7,8,9,4,5][i]}</p>
                <span className={`text-xs font-semibold ${dark?'text-emerald-400':'text-emerald-600'}`}>Prêt</span>
              </div>
            ))}
          </div>
        </div>

        {/* Last activity + config */}
        <div className={`${card} border rounded-2xl p-5`}>
          <h2 className={`font-black mb-4 flex items-center gap-2 ${dark?'text-white':'text-gray-800'}`}><Activity className="w-4 h-4 text-orange-500"/> Configuration</h2>
          <div className="space-y-2">
            {[
              ['Host MQTT','127.0.0.1'],
              ['Port TCP','1883'],
              ['Port WebSocket','9001'],
              ['UART Baud','115200'],
              ['Protocole','JSON / newline'],
              ['Dernière activité', techStatus?.last_activity||'—'],
            ].map(([k,v])=>(
              <div key={k} className="flex items-center justify-between text-sm">
                <span className={dark?'text-gray-400':'text-gray-500'}>{k}</span>
                <span className={`font-mono font-semibold ${dark?'text-gray-200':'text-gray-800'}`}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={`${card} border rounded-2xl p-5`}>
        <h2 className={`font-black mb-4 flex items-center gap-2 ${dark?'text-white':'text-gray-800'}`}><Cpu className="w-4 h-4 text-orange-500"/> OTA — métadonnées firmware</h2>
        <p className={`text-sm mb-4 ${dark?'text-gray-400':'text-gray-500'}`}>Enregistre une version déployée (journal côté serveur). Le binaire réel est géré hors interface.</p>
        <div className="grid grid-cols-2 gap-3 max-w-xl">
          <input className={`border rounded-xl px-3 py-2 text-sm ${dark?'bg-gray-700 border-gray-600 text-white':'bg-white border-gray-200'}`} value={fwVersion} onChange={e=>setFwVersion(e.target.value)} placeholder="Version"/>
          <input className={`border rounded-xl px-3 py-2 text-sm ${dark?'bg-gray-700 border-gray-600 text-white':'bg-white border-gray-200'}`} value={fwFile} onChange={e=>setFwFile(e.target.value)} placeholder="firmware.bin"/>
        </div>
        <button type="button" disabled={fwBusy||!fwVersion} onClick={registerFw} className="mt-3 px-4 py-2 rounded-xl bg-orange-600 text-white font-bold text-sm disabled:opacity-50">
          {fwBusy?'…':'Enregistrer version'}
        </button>
        {fwError && (
          <p className="mt-3 text-sm text-red-600 font-semibold">{fwError}</p>
        )}
        <ul className={`mt-4 text-xs font-mono space-y-1 ${dark?'text-gray-300':'text-gray-600'}`}>
          {fwHist.length===0?<li>—</li>:fwHist.map(h=><li key={h.id}>{h.version} · {h.filename}</li>)}
        </ul>
      </div>

      {/* Force Open Drawer — Tech only */}
      {currentDoctor?.role === 'CHEF_SERVICE' && (
      <div className={`${card} border rounded-2xl p-5`}>
        <h2 className={`font-black text-base mb-1 flex items-center gap-2 ${dark?'text-white':'text-gray-800'}`}>
          <DoorOpen className="w-4 h-4 text-red-500" />
          Ouverture forcée d'un tiroir
        </h2>
        <p className={`text-xs ${dark?'text-gray-400':'text-gray-500'} mb-4`}>
          Envoie une commande MQTT directe sans patient ni médicament associé.
          Chaque action est enregistrée dans le journal de dispense.
        </p>

        <div className="flex flex-wrap gap-3 items-end">
          {/* Drawer number */}
          <div>
            <label className={`block text-xs font-bold mb-1 ${dark?'text-gray-400':'text-gray-600'}`}>
              Numéro du tiroir
            </label>
            <input
              type="number"
              min={1}
              max={20}
              value={forceDrawer}
              onChange={e =>
                setForceDrawer(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))
              }
              className={`w-24 border rounded-xl px-3 py-2 text-sm font-mono
                ${dark?'bg-gray-700 border-gray-600 text-white':'bg-white border-gray-200 text-gray-900'}
                outline-none focus:ring-2 focus:ring-red-400`}
            />
          </div>

          {/* Reason */}
          <div className="flex-1 min-w-[160px]">
            <label className={`block text-xs font-bold mb-1 ${dark?'text-gray-400':'text-gray-600'}`}>
              Raison
            </label>
            <select
              value={forceReason}
              onChange={e => setForceReason(e.target.value)}
              className={`w-full border rounded-xl px-3 py-2 text-sm
                ${dark?'bg-gray-700 border-gray-600 text-white':'bg-white border-gray-200 text-gray-900'}
                outline-none focus:ring-2 focus:ring-red-400`}
            >
              <option value="maintenance">Maintenance</option>
              <option value="urgence">Urgence médicale</option>
              <option value="test">Test système</option>
              <option value="blocage mécanique">Blocage mécanique</option>
              <option value="réapprovisionnement">Réapprovisionnement</option>
            </select>
          </div>

          {/* Submit */}
          <button
            onClick={handleForceOpen}
            disabled={forceBusy}
            className="flex items-center gap-2 px-5 py-2 rounded-xl font-black text-sm
              text-white bg-red-600 hover:bg-red-700
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors shadow-sm"
          >
            <DoorOpen className="w-4 h-4" />
            {forceBusy ? 'Envoi…' : `Ouvrir tiroir ${forceDrawer}`}
          </button>
        </div>

        {/* Result feedback */}
        {forceResult && (
          <p className={`mt-3 text-sm font-bold rounded-xl px-4 py-2 ${
            forceResult.ok
              ? `${dark?'bg-emerald-900/30 text-emerald-300':'bg-emerald-50 text-emerald-700'}`
              : `${dark?'bg-red-900/30 text-red-300':'bg-red-50 text-red-700'}`
          }`}>
            {forceResult.msg}
          </p>
        )}
      </div>
      )}

      {/* Raw dispense log */}
      <div className={`${card} border rounded-2xl p-5`}>
        <h2 className={`font-black mb-4 flex items-center gap-2 ${dark?'text-white':'text-gray-800'}`}><FileText className="w-4 h-4 text-gray-500"/> Journal brut ({log.length} entrées)</h2>
        <div className={`font-mono text-xs rounded-xl p-4 max-h-48 overflow-y-auto ${dark?'bg-gray-900 text-green-400':'bg-gray-900 text-green-400'}`}>
          {log.length===0?<p className="text-gray-500">Aucune entrée</p>:log.slice().reverse().map(e=>(
            <div key={e.id} className="mb-1">
              <span className="text-gray-500">[{e.timestamp}]</span>{' '}
              <span className="text-teal-400">DISPENSE</span>{' '}
              drawer=<span className="text-yellow-400">{e.drawer}</span>{' '}
              med=<span className="text-white">{e.med_name}</span>{' '}
              mqtt=<span className={e.mqtt_sent?'text-emerald-400':'text-red-400'}>{e.mqtt_sent?'OK':'FAIL'}</span>
            </div>
          ))}
        </div>
      </div>

      <hr className={`${dark?'border-gray-700':'border-gray-200'} my-4`} />
      <h2 className={`text-xl font-black ${dark?'text-white':'text-gray-900'} flex items-center gap-2`}>
        <Cpu className="w-5 h-5 text-blue-500" /> Statut Ingénieur — Live MQTT
      </h2>

      {/* Connection status from EngineerView */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={`${card} border rounded-2xl p-5`}>
          <h3 className={`font-black mb-4 flex items-center gap-2 ${dark?'text-white':'text-gray-800'}`}><Wifi className="w-4 h-4 text-teal-500"/> Connexion Live</h3>
          <ul className="space-y-3">
            {[
              ['MQTT broker', sysStatus?.mqtt || 'offline'],
              ['ESP32', sysStatus?.esp32 || 'unknown'],
              ['STM32', sysStatus?.stm32 || 'unknown'],
            ].map(([label, val]) => (
              <li key={String(label)} className={`flex items-center justify-between gap-3 py-2 border-b ${dark?'border-gray-700':'border-gray-100'} last:border-0`}>
                <span className={`text-sm font-semibold ${dark?'text-gray-400':'text-gray-600'}`}>{label}</span>
                <span className={`text-xs font-mono font-bold uppercase ${val === 'online' || val === 'ready' ? 'text-emerald-600 dark:text-emerald-400' : val === 'connecting' || val === 'busy' || val === 'unknown' ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                  {String(val)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Health snapshot from EngineerView */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className={`${card} border rounded-2xl p-5 flex flex-col justify-between`}>
            <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${dark?'text-gray-500':'text-gray-600'}`}>
              <Activity className="w-4 h-4" /> Temp. cœur
            </div>
            <p className={`text-4xl font-black mt-2 ${dark?'text-white':'text-gray-900'}`}>
              {(coreTemp ?? 42).toFixed(1)}
              <span className={`text-lg ml-1 ${dark?'text-gray-500':'text-gray-500'}`}>°C</span>
            </p>
            <p className={`text-[10px] mt-2 font-mono ${dark?'text-gray-500':'text-gray-500'}`}>Télémétrie MQTT</p>
          </div>
          <div className={`${card} border rounded-2xl p-5 flex flex-col justify-between`}>
            <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${dark?'text-gray-500':'text-gray-600'}`}>
              <Cpu className="w-4 h-4 text-sky-500" /> Charge CPU
            </div>
            <p className={`text-4xl font-black mt-2 ${dark?'text-white':'text-gray-900'}`}>
              {cpuPct ?? 18}
              <span className={`text-lg ml-1 ${dark?'text-gray-500':'text-gray-500'}`}>%</span>
            </p>
            <p className={`text-[10px] mt-2 font-mono ${dark?'text-gray-500':'text-gray-500'}`}>Depuis bus MQTT</p>
          </div>
        </div>
      </div>

      {/* Latency chart from EngineerView */}
      <div className={`${card} border rounded-2xl p-5`}>
        <h3 className={`font-black mb-4 flex items-center gap-2 ${dark?'text-white':'text-gray-800'}`}><Activity className="w-4 h-4 text-orange-500"/> Latence MQTT</h3>
        <div className="flex items-end justify-between gap-1 h-36 px-1">
          {latencyMs.length === 0 ? (
            <p className={`text-xs font-mono w-full text-center py-8 ${dark?'text-gray-500':'text-gray-400'}`}>En attente de messages…</p>
          ) : (
            latencyMs.slice(-24).map((v, i) => {
              const maxLat = Math.max(50, ...latencyMs);
              return (
                <div
                  key={i}
                  className="flex-1 min-w-0 rounded-t-sm transition-all duration-300 bg-gradient-to-t from-teal-500 to-teal-400"
                  style={{ height: `${Math.max(6, (v / maxLat) * 100)}%` }}
                />
              );
            })
          )}
        </div>
        <p className={`text-[10px] mt-3 font-mono ${dark?'text-gray-500':'text-gray-500'}`}>Δ entre messages consécutifs (ms)</p>
      </div>

      {/* MQTT Terminal from EngineerView */}
      <div className={`${card} border rounded-2xl overflow-hidden flex flex-col min-h-[280px] max-h-[420px]`}>
        <div className={`flex items-center justify-between px-4 py-3 border-b ${dark?'border-gray-700 bg-gray-700/50':'border-gray-200 bg-gray-50'}`}>
          <h3 className={`font-black flex items-center gap-2 ${dark?'text-white':'text-gray-900'}`}>
            <Terminal className="w-4 h-4" /> Terminal MQTT live
          </h3>
          <span className={`text-[10px] font-mono ${dark?'text-gray-500':'text-gray-500'}`}>{lines.length} lignes</span>
        </div>
        <div
          ref={terminalRef}
          className={`flex-1 overflow-y-auto overflow-x-auto p-4 font-mono text-[11px] leading-relaxed ${dark?'bg-gray-900':'bg-gray-900'}`}
        >
          {lines.length === 0 ? (
            <p className={dark?'text-gray-500':'text-gray-600'}>En attente de trafic sur robot/ROBOT001/# …</p>
          ) : (
            lines.map((line) => (
              <div key={line.id} className={`border-b ${dark?'border-gray-800':'border-gray-800'} py-1.5 whitespace-pre-wrap break-all`}>
                <span className={dark?'text-gray-600':'text-gray-600'}>
                  [{new Date(line.at).toLocaleTimeString('fr-FR', { hour12: false })}]
                </span>{' '}
                <span className={topicTagClass(line.topic)}>{line.topic}</span>
                <span className={dark?'text-gray-700':'text-gray-700'}> → </span>
                <span className={dark?'text-gray-300':'text-gray-300'}>{line.payload}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Audit log from EngineerView */}
      <div className={`${card} border rounded-2xl p-5`}>
        <h3 className={`font-black mb-4 flex items-center gap-2 ${dark?'text-white':'text-gray-800'}`}>
          <AlertTriangle className="w-4 h-4 text-amber-500" /> Journal d'audit
        </h3>
        <div className="flex flex-wrap gap-2 mb-4">
          <input
            value={auditAction}
            onChange={(e) => setAuditAction(e.target.value)}
            placeholder="Action (ex. RFID_SCAN)"
            className={`flex-1 min-w-[140px] px-3 py-2 rounded-xl text-xs border ${dark?'bg-gray-700 border-gray-600 text-white':'bg-white border-gray-200 text-gray-900'}`}
          />
          <input
            value={auditUser}
            onChange={(e) => setAuditUser(e.target.value)}
            placeholder="Utilisateur"
            className={`flex-1 min-w-[120px] px-3 py-2 rounded-xl text-xs border ${dark?'bg-gray-700 border-gray-600 text-white':'bg-white border-gray-200 text-gray-900'}`}
          />
          <input
            type="date"
            value={auditDate}
            onChange={(e) => setAuditDate(e.target.value)}
            className={`px-3 py-2 rounded-xl text-xs border ${dark?'bg-gray-700 border-gray-600 text-white':'bg-white border-gray-200 text-gray-900'}`}
          />
          <button
            type="button"
            onClick={() => void loadAudit()}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700"
          >
            Filtrer
          </button>
        </div>
        <div className={`overflow-x-auto max-h-[360px] rounded-xl border ${dark?'border-gray-700':'border-gray-200'}`}>
          <table className={`w-full text-left text-[11px] font-mono ${dark?'text-gray-300':'text-gray-700'}`}>
            <thead className={`sticky top-0 uppercase tracking-wider ${dark?'bg-gray-700 text-gray-400':'bg-gray-100 text-gray-600'}`}>
              <tr>
                <th className="p-2">Date</th>
                <th className="p-2">Utilisateur</th>
                <th className="p-2">Rôle</th>
                <th className="p-2">Action</th>
                <th className="p-2">Statut</th>
                <th className="p-2">Détail</th>
              </tr>
            </thead>
            <tbody>
              {auditRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`p-4 text-center ${dark?'text-gray-500':'text-gray-400'}`}>
                    Aucune entrée
                  </td>
                </tr>
              ) : (
                auditRows.map((row) => (
                  <tr key={row.id} className={`border-t ${dark?'border-gray-700':'border-gray-200'}`}>
                    <td className={`p-2 whitespace-nowrap ${dark?'text-gray-500':'text-gray-500'}`}>{row.timestamp}</td>
                    <td className="p-2">{row.utilisateur_nom || '—'}</td>
                    <td className="p-2">{row.role || '—'}</td>
                    <td className="p-2 text-amber-600 dark:text-amber-400">{row.action}</td>
                    <td className="p-2">{row.statut}</td>
                    <td className={`p-2 max-w-[280px] truncate ${dark?'text-gray-500':'text-gray-500'}`} title={row.detail}>
                      {row.detail}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// AUDIT LOG VIEW
// ══════════════════════════════════════════════════════════════════
const ACTION_LABELS: Record<string, string> = {
  DISPENSE: 'Distribution médicament',
  CREATE_PATIENT: 'Ajout patient',
  EDIT_PATIENT: 'Modification patient',
  DELETE_PATIENT: 'Suppression patient',
  CREATE_DOCTOR: 'Ajout médecin',
  EDIT_DOCTOR: 'Modification médecin',
  DELETE_DOCTOR: 'Suppression médecin',
  VALIDATE_PRESCRIPTION: 'Validation ordonnance',
  ADMINISTRATION_CONFIRMED: 'Prise médicament confirmée',
  REJECT: 'Rejet ordonnance',
  LOGIN: 'Connexion',
  LOGOUT: 'Déconnexion',
  LOGIN_FAILED: 'Tentative de connexion échouée',
  FORCE_OVERRIDE: 'Forçage sécurité',
  CREATE_STOCK: 'Ajout stock pharmacie',
  EDIT_STOCK: 'Modification stock',
  DELETE_STOCK: 'Suppression stock',
  DISCHARGE: 'Sortie patient',
};

const AuditLogView = () => {
  const { dark } = useTheme();
  const inp = useInpClass();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [busy, setBusy] = useState(true);
  const [filterAction, setFilterAction] = useState<string>('');
  const [searchActor, setSearchActor] = useState<string>('');
  const [searchPatient, setSearchPatient] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [searchMed, setSearchMed] = useState('');
  const [onlyHighRisk, setOnlyHighRisk] = useState(false);
  const [onlyOverride, setOnlyOverride] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const card = dark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';

  const loadAudit = useCallback(async () => {
    setBusy(true);
    try {
      const data = await api('/api/audit-log?days=90');
      setEntries(data || []);
    } catch (e) {
      console.error('Failed to load audit log:', e);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    loadAudit();
    const interval = setInterval(loadAudit, 30000);
    return () => clearInterval(interval);
  }, [loadAudit]);

  const resetFilters = () => {
    setFilterAction('');
    setSearchActor('');
    setSearchPatient('');
    setDateFrom('');
    setDateTo('');
    setSearchMed('');
    setOnlyHighRisk(false);
    setOnlyOverride(false);
    setShowAdvanced(false);
  };

  const setQuickDate = (preset: 'today' | 'yesterday' | '7days' | '30days') => {
    const now = new Date();
    const pad = (d: Date) => d.toISOString().slice(0, 10);
    if (preset === 'today') {
      setDateFrom(pad(now)); setDateTo(pad(now));
    } else if (preset === 'yesterday') {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      setDateFrom(pad(y)); setDateTo(pad(y));
    } else if (preset === '7days') {
      const from = new Date(now); from.setDate(from.getDate() - 6);
      setDateFrom(pad(from)); setDateTo(pad(now));
    } else if (preset === '30days') {
      const from = new Date(now); from.setDate(from.getDate() - 29);
      setDateFrom(pad(from)); setDateTo(pad(now));
    }
  };

  const filtered = entries.filter(e => {
    if (filterAction && (e.action ?? '') !== filterAction) return false;
    if (searchActor && !(e.actor ?? '').toLowerCase().includes(searchActor.toLowerCase())) return false;
    if (searchPatient &&
      !(e.detail ?? '').toLowerCase().includes(searchPatient.toLowerCase()) &&
      !(e.target_type ?? '').toLowerCase().includes('patient')
    ) return false;
    if (searchMed && !(e.detail ?? '').toLowerCase().includes(searchMed.toLowerCase())) return false;
    if (dateFrom && new Date(e.timestamp) < new Date(dateFrom)) return false;
    if (dateTo && new Date(e.timestamp) > new Date(dateTo + 'T23:59:59')) return false;
    if (onlyHighRisk && !(e.action === 'DISPENSE' && ((e.detail ?? '').toLowerCase().includes('haut risque') || (e.detail ?? '').toLowerCase().includes('morphine') || (e.detail ?? '').toLowerCase().includes('codéine')))) return false;
    if (onlyOverride && e.action !== 'FORCE_OVERRIDE') return false;
    return true;
  });

  const allActions = Array.from(new Set(entries.map(e => e.action).filter(Boolean))).sort();

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayEntries = useMemo(() => entries.filter(e => (e.timestamp ?? '').startsWith(todayStr)), [entries, todayStr]);
  
  // KPI 1: Connexions (LOGIN actions - who connected)
  const connectionsCount = useMemo(() =>
    todayEntries.filter(e => e.action === 'LOGIN').length,
    [todayEntries]
  );

  // KPI 2: Médicaments Distribués (DISPENSE actions - medicines given)
  const medicinesCount = useMemo(() =>
    todayEntries.filter(e => e.action === 'DISPENSE').length,
    [todayEntries]
  );

  // KPI 3: Alertes d'Urgence (ALERTE_URGENCE actions - emergency alerts)
  const alertsCount = useMemo(() =>
    todayEntries.filter(e => e.action === 'ALERTE_URGENCE').length,
    [todayEntries]
  );

  // KPI 4: Actions Kiosk/Robot (ORDONNANCE + system operations)
  const kioskRobotCount = useMemo(() =>
    todayEntries.filter(e => 
      e.action === 'ORDONNANCE' || 
      e.action === 'DISTRIBUTION' || 
      e.action === 'ROBOT_ECHEC' ||
      (e.actor ?? '').toLowerCase().includes('robot') ||
      (e.actor ?? '').toLowerCase().includes('kiosk')
    ).length,
    [todayEntries]
  );

  const hasFilters = !!(filterAction || searchActor || searchPatient || dateFrom || dateTo || searchMed || onlyHighRisk || onlyOverride);
  const labelCls = `block text-xs font-bold mb-1 ${dark ? 'text-gray-400' : 'text-gray-600'}`;

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) +
        ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  };

  const getCardBorder = (action: string) => {
    const a = action ?? '';
    if (a === 'DISPENSE' || a.includes('STOCK')) return 'border-l-teal-500';
    if (a.includes('DELETE') || a.includes('REJECT')) return 'border-l-red-500';
    if (a === 'LOGIN' || a === 'LOGOUT') return 'border-l-blue-500';
    if (a.includes('CREATE') || a.includes('ADD') || a === 'ADMINISTRATION_CONFIRMED') return 'border-l-emerald-500';
    return 'border-l-gray-400 dark:border-l-gray-500';
  };

  const getActionIcon = (action: string) => {
    const a = action ?? '';
    if (a === 'DISPENSE') return '💊';
    if (a.includes('DELETE')) return '🗑️';
    if (a === 'LOGIN') return '🔐';
    if (a === 'LOGOUT') return '🚪';
    if (a.includes('CREATE')) return '✅';
    if (a.includes('EDIT') || a.includes('UPDATE')) return '✏️';
    if (a === 'VALIDATE_PRESCRIPTION') return '📋';
    if (a === 'DISCHARGE') return '🏥';
    if (a === 'ADMINISTRATION_CONFIRMED') return '✔️';
    return '📝';
  };

  const getStatusBadges = (entry: AuditEntry) => {
    const badges: Array<{ label: string; shortLabel: string; color: string; textColor: string }> = [];
    if (entry.action === 'FORCE_OVERRIDE') {
      badges.push({ label: '⚠️ Forçage', shortLabel: 'Forçage', color: '#ef4444', textColor: '#fff' });
    }
    if (entry.action === 'DISPENSE' && ((entry.detail ?? '').toLowerCase().includes('haut risque') || (entry.detail ?? '').toLowerCase().includes('morphine') || (entry.detail ?? '').toLowerCase().includes('codéine'))) {
      badges.push({ label: '💊 Haut Risque', shortLabel: 'HR', color: '#f97316', textColor: '#fff' });
    }
    if (entry.action === 'LOGIN_FAILED') {
      badges.push({ label: '🔒 Accès refusé', shortLabel: 'Refusé', color: '#dc2626', textColor: '#fff' });
    }
    if (entry.action?.includes('DELETE')) {
      badges.push({ label: '🗑️ Suppression', shortLabel: 'Supp', color: '#ea580c', textColor: '#fff' });
    }
    return badges;
  };

  const printFilteredReport = () => {
    const categoryLabels: Record<string, string> = {
      all: 'Tous les événements',
      DISPENSE: 'Distribution médicament',
      CREATE_PATIENT: 'Ajout patient',
      EDIT_PATIENT: 'Modification patient',
      DELETE_PATIENT: 'Suppression patient',
      CREATE_DOCTOR: 'Ajout médecin',
      EDIT_DOCTOR: 'Modification médecin',
      DELETE_DOCTOR: 'Suppression médecin',
      VALIDATE_PRESCRIPTION: 'Validation ordonnance',
      ADMINISTRATION_CONFIRMED: 'Prise médicament confirmée',
      REJECT: 'Rejet ordonnance',
      LOGIN: 'Connexion',
      LOGOUT: 'Déconnexion',
      LOGIN_FAILED: 'Tentative de connexion échouée',
      FORCE_OVERRIDE: 'Forçage sécurité',
      CREATE_STOCK: 'Ajout stock pharmacie',
      EDIT_STOCK: 'Modification stock',
      DELETE_STOCK: 'Suppression stock',
      DISCHARGE: 'Sortie patient',
    };

    const actionColors: Record<string, string> = {
      CONNEXION: '#0d9488',
      DISPENSE: '#2563eb',
      ROBOT_ECHEC: '#dc2626',
      ALERTE_URGENCE: '#dc2626',
      AJOUT_PATIENT: '#16a34a',
      MODIF_PATIENT: '#d97706',
      SUPPRESSION_PATIENT: '#dc2626',
      ORDONNANCE: '#7c3aed',
      VALIDATION_ORDONNANCE: '#0d9488',
      LOGIN: '#0d9488',
      CREATE_PATIENT: '#16a34a',
      EDIT_PATIENT: '#d97706',
      DELETE_PATIENT: '#dc2626',
      FORCE_OVERRIDE: '#dc2626',
    };

    const rows = filtered.map(e => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#64748b;white-space:nowrap">
          ${e.timestamp?.replace('T', ' ').slice(0, 16) ?? '—'}
        </td>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;">
          <span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;background:${actionColors[e.action ?? ''] ?? '#64748b'}20;color:${actionColors[e.action ?? ''] ?? '#64748b'}">
            ${e.action ?? '—'}
          </span>
        </td>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;font-weight:600;color:#1e293b">${e.actor ?? '—'}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#475569">${e.actor_role ?? '—'}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#475569">${e.detail ?? '—'}</td>
      </tr>
    `).join('');

    const filterLabel = filterAction ? categoryLabels[filterAction] ?? filterAction : categoryLabels.all;

    const html = `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <title>Rapport Audit — ${filterLabel}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; color: #1e293b; padding: 32px; }
          @media print {
            body { padding: 16px; }
            .no-print { display: none !important; }
            @page { margin: 1.5cm; size: A4 landscape; }
          }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; border-bottom: 2px solid #0d9488; padding-bottom: 16px; }
          .hospital { font-size: 11px; color: #64748b; margin-top: 4px; }
          .title { font-size: 20px; font-weight: 800; color: #0f172a; }
          .subtitle { font-size: 13px; color: #0d9488; font-weight: 600; margin-top: 2px; }
          .meta { text-align: right; font-size: 11px; color: #64748b; line-height: 1.8; }
          .meta strong { color: #1e293b; }
          .badge-count { display: inline-block; background: #f0fdf4; border: 1px solid #bbf7d0; color: #16a34a; font-weight: 700; font-size: 13px; padding: 4px 12px; border-radius: 999px; margin-top: 8px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          thead tr { background: #f8fafc; }
          thead th { padding: 10px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; border-bottom: 2px solid #e2e8f0; }
          tbody tr:hover { background: #f8fafc; }
          .footer { margin-top: 24px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 12px; }
          .print-btn { margin-bottom: 20px; padding: 10px 24px; background: #0d9488; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; }
        </style>
      </head>
      <body>
        <button class="print-btn no-print" onclick="window.print()">🖨️ Imprimer / Sauvegarder PDF</button>
        <div class="header">
          <div>
            <div class="title">📋 Journal d'Audit</div>
            <div class="subtitle">${filterLabel}</div>
            <div class="hospital">Hôpital de Rouiba — Service Pédiatrie — MediBot</div>
            <div class="badge-count">${filtered.length} événement${filtered.length > 1 ? 's' : ''}</div>
          </div>
          <div class="meta">
            <strong>Date d'impression</strong><br/>
            ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}<br/>
            ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}<br/>
            <strong>Généré par</strong> MediBot Admin
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date / Heure</th>
              <th>Action</th>
              <th>Acteur</th>
              <th>Rôle</th>
              <th>Détail</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="footer">
          Document confidentiel — Usage interne uniquement — MediBot v1.0 — Hôpital de Rouiba
        </div>
      </body>
      </html>
    `;

    const win = window.open('', '_blank', 'width=1100,height=750');
    if (!win) return;
    win.document.write(html);
    win.document.close();
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl print:p-0 print:space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className={`text-2xl font-black mb-0.5 flex items-center gap-2 ${dark ? 'text-white' : 'text-gray-900'}`}>
            <ClipboardCheck className="w-7 h-7 text-teal-500" /> Traçabilité des actes
          </h1>
          <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
            Historique complet des actions réalisées dans MediBot
          </p>
        </div>
        <button
          onClick={printFilteredReport}
          className="print:hidden flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-bold transition-all
            dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700
            border-gray-300 text-gray-700 hover:bg-gray-100"
        >
          🖨️ Imprimer le rapport filtré
        </button>
      </div>

      {/* Today summary cards — 4 KPI dashboard */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:hidden">
        {/* Card 1: Connexions (who connected) */}
        <div className={`rounded-xl border p-3 ${dark ? 'bg-blue-900/30 border-blue-700/40' : 'bg-blue-50 border-blue-200'}`}>
          <p className="text-2xl font-black text-blue-600 dark:text-blue-400">{connectionsCount}</p>
          <p className={`text-xs font-semibold mt-0.5 ${dark ? 'text-blue-300' : 'text-blue-700'}`}>👤 Connexions</p>
        </div>

        {/* Card 2: Médicaments Distribués (medicines given) */}
        <div className={`rounded-xl border p-3 ${dark ? 'bg-teal-900/30 border-teal-700/40' : 'bg-teal-50 border-teal-200'}`}>
          <p className="text-2xl font-black text-teal-600 dark:text-teal-400">{medicinesCount}</p>
          <p className={`text-xs font-semibold mt-0.5 ${dark ? 'text-teal-300' : 'text-teal-700'}`}>💊 Médicaments</p>
        </div>

        {/* Card 3: Alertes d'Urgence (emergency alerts) */}
        <div className={`rounded-xl border p-3 ${dark ? 'bg-orange-900/30 border-orange-700/40' : 'bg-orange-50 border-orange-200'}`}>
          <p className="text-2xl font-black text-orange-600 dark:text-orange-400">{alertsCount}</p>
          <p className={`text-xs font-semibold mt-0.5 ${dark ? 'text-orange-300' : 'text-orange-700'}`}>🚨 Alertes</p>
        </div>

        {/* Card 4: Actions Kiosk/Robot (operational actions) */}
        <div className={`rounded-xl border p-3 ${dark ? 'bg-purple-900/30 border-purple-700/40' : 'bg-purple-50 border-purple-200'}`}>
          <p className="text-2xl font-black text-purple-600 dark:text-purple-400">{kioskRobotCount}</p>
          <p className={`text-xs font-semibold mt-0.5 ${dark ? 'text-purple-300' : 'text-purple-700'}`}>⚙️ Opérations</p>
        </div>
      </div>

      {/* Filters */}
      <div className={`print:hidden rounded-2xl border p-4 space-y-3 ${card}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-bold ${dark ? 'text-gray-400' : 'text-gray-600'}`}>Période rapide :</span>
          {(['today', 'yesterday', '7days', '30days'] as const).map((preset, idx) => (
            <button
              key={preset}
              onClick={() => setQuickDate(preset)}
              className="px-3 py-1 rounded-lg text-xs font-bold border transition-all
                dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700
                border-gray-300 text-gray-600 hover:bg-gray-100"
            >
              {["Aujourd'hui", 'Hier', '7 jours', '30 jours'][idx]}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Du</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inp} />
          </div>
          <div>
            <label className={labelCls}>Au</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inp} />
          </div>
          <div>
            <label className={labelCls}>Type d'action</label>
            <select value={filterAction} onChange={e => setFilterAction(e.target.value)} className={`${inp} appearance-none cursor-pointer`}>
              <option value="">Toutes les actions</option>
              {allActions.map(action => (
                <option key={action} value={action}>{ACTION_LABELS[action] || action}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Rechercher un médecin</label>
            <input type="text" placeholder="Nom du docteur..." value={searchActor} onChange={e => setSearchActor(e.target.value)} className={inp} />
          </div>
          <div>
            <label className={labelCls}>Rechercher un patient</label>
            <input type="text" placeholder="Nom du patient... ex: Yanis" value={searchPatient} onChange={e => setSearchPatient(e.target.value)} className={inp} />
          </div>
        </div>

        {/* Advanced filters toggle */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={`flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-lg border transition-all
            ${showAdvanced ? 'dark:bg-gray-700 bg-gray-100 border-gray-400' : 'border-gray-300 dark:border-gray-600 dark:text-gray-400'}`}
        >
          {showAdvanced ? '▾' : '▸'} Filtres avancés
        </button>

        {/* Advanced filters panel */}
        {showAdvanced && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-gray-300 dark:border-gray-600">
            <div>
              <label className={labelCls}>Rechercher un médicament</label>
              <input type="text" placeholder="Nom du méd..." value={searchMed} onChange={e => setSearchMed(e.target.value)} className={inp} />
            </div>
            <div className="flex items-end gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={onlyHighRisk} onChange={e => setOnlyHighRisk(e.target.checked)} className="w-4 h-4" />
                <span className="text-xs font-bold dark:text-gray-300">{dark ? '💊' : ''} Haut risque</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={onlyOverride} onChange={e => setOnlyOverride(e.target.checked)} className="w-4 h-4" />
                <span className="text-xs font-bold dark:text-gray-300">{dark ? '⚡' : ''} Forçages</span>
              </label>
            </div>
          </div>
        )}

        {hasFilters && (
          <button
            onClick={resetFilters}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-bold rounded-lg transition-colors text-sm"
          >
            ✕ Effacer les filtres
          </button>
        )}
      </div>

      {/* Count + reset hint */}
      <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
        <span className="font-bold">{filtered.length}</span> acte{filtered.length > 1 ? 's' : ''} trouvé{filtered.length > 1 ? 's' : ''}
        {filtered.length < entries.length && (
          <button onClick={resetFilters} className="text-teal-500 underline text-xs ml-2">
            Voir tout ({entries.length})
          </button>
        )}
      </p>

      {busy ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <div className={`text-center py-16 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
          <ClipboardCheck className="w-14 h-14 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-bold">Aucune activité enregistrée</p>
          {hasFilters && (
            <p className="text-sm mt-2">
              Essayez d'élargir la période ou de{' '}
              <button onClick={resetFilters} className="text-teal-500 underline">réinitialiser les filtres</button>.
            </p>
          )}
        </div>
      ) : (
        <div className={`rounded-2xl border overflow-hidden print:border-0 print:rounded-none ${card}`}>
          {/* Table header */}
          <div className={`hidden print:grid print:grid-cols-5 print:gap-2 print:p-3 print:border-b print:border-gray-300 print:bg-gray-50 print:text-xs print:font-bold print:text-gray-700`}>
            <div>Heure</div>
            <div>Utilisateur</div>
            <div>Action</div>
            <div>Détail</div>
            <div>Statut</div>
          </div>

          <div className="divide-y dark:divide-gray-700">
            {(showAll ? filtered : filtered.slice(0, 100)).map((entry, idx) => {
              const isExpanded = expandedId === entry.id;
              const isHighRisk = entry.action === 'DISPENSE' && ((entry.detail ?? '').toLowerCase().includes('haut risque') || (entry.detail ?? '').toLowerCase().includes('morphine') || (entry.detail ?? '').toLowerCase().includes('codéine'));
              const isOverridden = entry.action === 'FORCE_OVERRIDE';
              const rowBg = isOverridden ? (dark ? 'bg-red-900/10' : 'bg-red-50') :
                            isHighRisk ? (dark ? 'bg-orange-900/10' : 'bg-orange-50') :
                            idx % 2 === 0 ? (dark ? 'bg-gray-800' : 'bg-white') : (dark ? 'bg-gray-750' : 'bg-gray-50');

              return (
                <div key={entry.id} className={`${rowBg} transition-colors print:page-break-inside-avoid`}>
                  {/* Row header — clickable to expand */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                    className={`w-full px-4 py-3 text-left hover:opacity-75 transition-opacity print:hidden`}
                  >
                    <div className="flex items-center gap-3 justify-between flex-wrap">
                      <div className="flex items-center gap-2 flex-1">
                        <span className="text-lg">{isExpanded ? '▾' : '▸'}</span>
                        <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                          {formatDate(entry.timestamp ?? '')}
                        </span>
                        <span className={`text-xs font-semibold ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
                          {entry.actor}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadges(entry).map((badge, i) => (
                          <span key={i} className="text-xs font-bold px-2 py-0.5 rounded-full" style={{
                            backgroundColor: badge.color,
                            color: badge.textColor
                          }}>
                            {badge.label}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span>{getActionIcon(entry.action ?? '')}</span>
                      <span className="font-bold text-sm">{ACTION_LABELS[entry.action ?? ''] || (entry.action ?? '—')}</span>
                    </div>
                  </button>

                  {/* Print-only table row */}
                  <div className={`hidden print:grid print:grid-cols-5 print:gap-2 print:p-3 print:text-xs print:border-b print:border-gray-200`}>
                    <div>{formatDate(entry.timestamp ?? '')}</div>
                    <div>{entry.actor}</div>
                    <div>{ACTION_LABELS[entry.action ?? ''] || (entry.action ?? '—')}</div>
                    <div className="line-clamp-2">{entry.detail || '—'}</div>
                    <div>{getStatusBadges(entry).map(b => b.shortLabel).join(', ') || '—'}</div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className={`px-4 py-3 border-t ${dark ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-gray-100/50'}`}>
                      <div className="space-y-2 text-xs">
                        <div>
                          <span className={`font-bold ${dark ? 'text-gray-400' : 'text-gray-600'}`}>Détail complet :</span>
                          <p className={`mt-0.5 ${dark ? 'text-gray-300' : 'text-gray-800'}`}>{entry.detail || '—'}</p>
                        </div>
                        {entry.oldvalue && (
                          <div>
                            <span className={`font-bold ${dark ? 'text-gray-400' : 'text-gray-600'}`}>Avant :</span>
                            <p className={`mt-0.5 font-mono ${dark ? 'text-gray-400' : 'text-gray-700'}`}>{entry.oldvalue}</p>
                          </div>
                        )}
                        {entry.newvalue && (
                          <div>
                            <span className={`font-bold ${dark ? 'text-gray-400' : 'text-gray-600'}`}>Après :</span>
                            <p className={`mt-0.5 font-mono ${dark ? 'text-gray-400' : 'text-gray-700'}`}>{entry.newvalue}</p>
                          </div>
                        )}
                        {entry.target_type && (
                          <div>
                            <span className={`font-bold ${dark ? 'text-gray-400' : 'text-gray-600'}`}>Type :</span>
                            <p className={`mt-0.5 ${dark ? 'text-gray-300' : 'text-gray-800'}`}>{entry.target_type}</p>
                          </div>
                        )}
                        {entry.actor_role && (
                          <div>
                            <span className={`font-bold ${dark ? 'text-gray-400' : 'text-gray-600'}`}>Rôle :</span>
                            <p className={`mt-0.5 ${dark ? 'text-gray-300' : 'text-gray-800'}`}>{entry.actor_role}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {!showAll && filtered.length > 100 && (
            <button
              onClick={() => setShowAll(true)}
              className={`w-full py-3 text-sm font-bold transition-colors print:hidden
                ${dark ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
            >
              Voir les {filtered.length - 100} entrées suivantes
            </button>
          )}
        </div>
      )}

      {/* Print-only footer */}
      <div className="hidden print:block text-xs text-gray-500 pt-4 border-t border-gray-200">
        Rapport généré le {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} — MediBot · Hôpital de Rouiba
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// ADMIN SHELL
// ══════════════════════════════════════════════════════════════════
export const AdminShell = ({ onSwitchToKiosk, currentDoctor, onLogout }: { onSwitchToKiosk:()=>void; currentDoctor: Doctor | null; onLogout:()=>void }) => {
  const { dark } = useTheme();
  const [view,setView]=useState<AdminView>('dashboard');
  const [techStatus,setTechStatus]=useState<TechStatus|null>(null);

  const loadTech=useCallback(async()=>{ try { setTechStatus(await api('/api/tech/status')); } catch{} },[]);
  useEffect(()=>{ loadTech(); const t=setInterval(loadTech,15000); return ()=>clearInterval(t); },[loadTech]);

  const allNav = [
    { id: 'dashboard' as AdminView, label: 'Tableau de bord', icon: LayoutDashboard },
    { id: 'rooms' as AdminView, label: 'Salles', icon: DoorOpen },
    { id: 'patients' as AdminView, label: 'Patients', icon: Users },
    { id: 'pharmacy' as AdminView, label: 'Pharmacie', icon: FlaskConical },
    { id: 'validation' as AdminView, label: 'Validation ordonnances', icon: ClipboardCheck },
    { id: 'interactions' as AdminView, label: 'Interactions', icon: Shield },
    { id: 'analytics' as AdminView, label: 'Analytique', icon: BarChart3 },
    { id: 'shift' as AdminView, label: 'Rapport relève', icon: FileText },
    { id: 'doctors' as AdminView, label: 'Équipe médicale', icon: Stethoscope },
    { id: 'audit' as AdminView, label: "Journal d'audit", icon: Shield },
    { id: 'tech' as AdminView, label: 'Vue Technique', icon: Wrench },
  ];

  const nav = allNav.filter(item => {
    if (isSuperAdmin(currentDoctor?.role)) return true; // Super admin can access everything
    const allowed = PAGE_ACCESS[item.id as keyof typeof PAGE_ACCESS] || [];
    return currentDoctor && allowed.includes(currentDoctor.role);
  });

  const sb=dark?'bg-gray-900 border-gray-800':'bg-white border-gray-200';
  const navActive=dark?'bg-gray-800 text-white border border-gray-700':'bg-teal-50 text-teal-700 border border-teal-100';
  const navInactive=dark?'text-gray-400 hover:text-white hover:bg-gray-800':'text-gray-500 hover:text-gray-900 hover:bg-gray-50';
  const main=dark?'bg-gray-900':'bg-gray-50';

  return (
    <div className={`flex h-screen overflow-hidden ${dark?'bg-gray-900':'bg-gray-100'}`}>
      <aside className={`w-60 flex-shrink-0 border-r ${sb} flex flex-col shadow-sm`}>
        {/* Logo */}
        <div className={`flex items-center gap-3 px-5 py-5 border-b ${dark?'border-gray-800':'border-gray-100'}`}>
          <div className="w-9 h-9 bg-teal-600 rounded-xl flex items-center justify-center shadow-sm">
            <Bot className="w-5 h-5 text-white"/>
          </div>
          <div>
            <p className={`font-black text-base leading-none ${dark?'text-white':'text-gray-900'}`}>MediBot</p>
            <p className="text-teal-500 text-xs font-semibold">Administration</p>
          </div>
          <div className="ml-auto"><ThemeToggle/></div>
        </div>

        {/* Doctor info */}
        {currentDoctor && (
          <div className={`px-4 py-3 border-b ${dark?'border-gray-800 bg-gray-800/50':'border-gray-100 bg-gray-50'}`}>
            <p className={`text-xs font-bold ${dark?'text-gray-400':'text-gray-500'}`}>Connecté en tant que</p>
            <p className={`font-bold text-sm mt-1 ${dark?'text-white':'text-gray-900'}`}>{currentDoctor.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">@{currentDoctor.username}</p>
            <button
              onClick={onLogout}
              className={`w-full flex items-center justify-center gap-2 mt-3 py-2 rounded-lg border text-xs font-bold transition-all ${dark?'border-gray-600 text-red-400 hover:bg-red-900/20':'border-red-200 text-red-600 hover:bg-red-50'}`}
            >
              <LogOut className="w-3.5 h-3.5"/> Déconnexion
            </button>
          </div>
        )}

        {/* Nav — doctor pages */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map(item=>(
            <button key={item.id} onClick={()=>setView(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left font-semibold text-sm
                ${view===item.id?navActive:navInactive}`}>
              <item.icon className={`w-4 h-4 ${view===item.id?'text-teal-600':''}`}/>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Bottom: system status + kiosk */}
        <div className={`px-4 py-4 border-t ${dark?'border-gray-800':'border-gray-100'} space-y-2`}>
          <SystemStatusPill techStatus={techStatus}/>
          <button onClick={onSwitchToKiosk}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white transition-colors text-xs font-black">
            <Bot className="w-3.5 h-3.5"/> Mode Kiosk
          </button>
        </div>
      </aside>

      <main className={`flex-1 min-h-0 overflow-hidden flex flex-col ${main}`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="h-full overflow-auto"
          >
            {view === 'dashboard' && <DashboardView techStatus={techStatus} />}
            {view === 'rooms' && <RoomsView />}
            {view === 'patients' && <PatientsView currentDoctor={currentDoctor} />}
            {view === 'pharmacy' && <PharmacyView />}
            {view === 'validation' && <PharmacistValidationView dark={dark} />}
            {view === 'interactions' && <DrugInteractionsAdminView dark={dark} />}
            {view === 'analytics' && <AnalyticsDashboardView dark={dark} />}
            {view === 'shift' && <ShiftReportView dark={dark} />}
            {view === 'doctors' && <DoctorsView currentDoctor={currentDoctor} />}
            {view === 'audit' && <AuditLogView />}
            {view === 'tech' && <TechView techStatus={techStatus} onRefresh={loadTech} currentDoctor={currentDoctor} />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
};

