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
import appConfig from '@/shared/lib/config';
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

// ── API — always uses appConfig.apiBaseUrl so it works on Netlify ──
const api = async (path: string, opts?: RequestInit) => {
  const base = appConfig.apiBaseUrl.replace(/\/$/, '');
  const r = await fetch(`${base}${path}`, { headers: { 'Content-Type': 'application/json' }, ...opts });
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
  // Define isInterne to prevent ReferenceError
  const isInterne = currentDoctor?.role === 'INTERNE';

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
                    disabled={!prescriber || newItems.length === 0}
                    className={`flex-1 px-4 py-2 font-bold rounded-lg text-white transition-all ${
                      !prescriber || newItems.length === 0
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-teal-600 hover:bg-teal-700'
                    }`}
                  >
                    {getSaveButtonLabel()}
                  </button>
                  <button
                    onClick={() => { 
                      setCreatingNew(false); 
                      setNewItems([]);
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
