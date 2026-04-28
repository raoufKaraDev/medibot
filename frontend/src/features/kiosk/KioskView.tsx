import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bot, Clock, AlertTriangle,
  CheckCircle2, Loader2, ChevronRight, ArrowLeft, LogOut,
  Bed, User, Pill, X, ShieldAlert,
  Sun, Moon, BatteryWarning, Camera, ImagePlus,
} from 'lucide-react';
import { connectMQTT, disconnectMQTT, updateMQTTCallbacks, type RobotStatus } from '@/shared/lib/mqtt';
import { formatPedAge } from '@lib/pedAge';
import EmergencyPanel from '@components/EmergencyPanel';

// ── Types ──────────────────────────────────────────────────────────────
interface Doctor {
  uid: string;
  name: string;
  role: string;
  photo?: string | null;
  role_code?: string;
  can_prescribe?: boolean;
}
interface Room     { id: number; name: string; occupied: number; capacity: number; has_alert: boolean }
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

interface Patient  {
  id: number; full_name: string; age: number; weight: string; blood_type: string;
  diagnostic: string; allergies: Array<string | { medication: string }>; bed: number; photo?: string;
  guardian?: { name: string; phone: string; relationship: string };
  date_naissance?: string | null;
  groupe_sanguin?: string | null;
  antecedents?: string | null;
  traitement_en_cours?: string | null;
  drug_allergies?: string[];
  other_allergies?: string[];
  blood_type_display?: string;
  phenotype_display?: string;
  current_treatments?: PatientTreatment[];
}
interface Medication {
  id: number;
  name: string;
  dosage: string;
  schedule: string;
  drawer: number;
  time: string;
  is_high_risk?: number;
  pediatric_mg_per_kg?: number | null;
  pediatric_dose_mg?: number | null;
  pediatric_dose_hint?: string | null;
  patient_weight_kg_used?: number | null;
  ligne_id?: number;
  dose_mg?: number | null;
  dose_ml?: number | null;
  numero_lot?: string | null;
  medicament_libre?: string | null;
  distributed_by_robot?: number;
}
interface ApiDrugIxRow { drug_a: string; drug_b: string; severity: string; consequence: string }
type KioskState = 'idle' | 'doctor_in' | 'room_selected' | 'prescription' | 'post_notes';
type MedStatus  = 'idle' | 'sending' | 'waiting_ack' | 'done' | 'timeout';

// ── Constants ──────────────────────────────────────────────────────────
const CYCLE_CONFIG: Record<string, { bg: string; border: string; text: string; badge: string; icon: string; label: string }> = {
  Matin:  { bg: 'bg-amber-500/10',  border: 'border-amber-500/60',  text: 'text-amber-600',  badge: 'bg-amber-100 text-amber-700',  icon: '🌅', label: 'Matin' },
  Midi:   { bg: 'bg-orange-500/10', border: 'border-orange-500/60', text: 'text-orange-600', badge: 'bg-orange-100 text-orange-700', icon: '☀️', label: 'Midi' },
  Soir:   { bg: 'bg-blue-500/10',   border: 'border-blue-500/60',   text: 'text-blue-600',   badge: 'bg-blue-100 text-blue-700',    icon: '🌆', label: 'Soir' },
  Nuit:   { bg: 'bg-purple-500/10', border: 'border-purple-500/60', text: 'text-purple-600', badge: 'bg-purple-100 text-purple-700', icon: '🌙', label: 'Nuit' },
  PRN:    { bg: 'bg-gray-100',      border: 'border-gray-300',      text: 'text-gray-500',   badge: 'bg-gray-100 text-gray-600',    icon: '⚡', label: 'Si besoin' },
};

const BLOOD_TYPE_COLORS: Record<string, string> = {
  'A+':  'bg-red-100 text-red-700',
  'A-':  'bg-red-50 text-red-600',
  'B+':  'bg-blue-100 text-blue-700',
  'B-':  'bg-blue-50 text-blue-600',
  'AB+': 'bg-purple-100 text-purple-700',
  'AB-': 'bg-purple-50 text-purple-600',
  'O+':  'bg-amber-100 text-amber-700',
  'O-':  'bg-amber-50 text-amber-600',
};

const QUICK_NOTES = [
  { id: 'ok',      icon: '😊', label: 'Pris normalement' },
  { id: 'vomit',   icon: '🤢', label: 'Patient a vomi' },
  { id: 'reduced', icon: '✂️', label: 'Dose réduite' },
  { id: 'refused', icon: '✋', label: 'Patient a refusé' },
  { id: 'missing', icon: '📦', label: 'Médicament manquant' },
  { id: 'free',    icon: '💬', label: 'Note libre...' },
];

// Drug interaction database
const DRUG_INTERACTIONS: Array<{
  drugA: string;
  drugB: string;
  severity: 'CRITIQUE' | 'MODÉRÉE' | 'FAIBLE';
  consequence: string;
  color: string;
}> = [
  {
    drugA: 'Amoxicilline',
    drugB: 'Warfarine',
    severity: 'CRITIQUE',
    consequence: 'Risque hémorragique augmenté',
    color: 'bg-red-100 border-red-300 text-red-700 dark:bg-red-950/80 dark:border-red-500 dark:text-red-50',
  },
  {
    drugA: 'Paracétamol',
    drugB: 'Morphine',
    severity: 'MODÉRÉE',
    consequence: 'Dépression du système nerveux central',
    color: 'bg-orange-100 border-orange-300 text-orange-900 dark:bg-orange-950/80 dark:border-orange-500 dark:text-orange-50',
  },
  {
    drugA: 'Ibuprofène',
    drugB: 'Aspirine',
    severity: 'MODÉRÉE',
    consequence: 'Augmentation du risque gastrique',
    color: 'bg-orange-100 border-orange-300 text-orange-900 dark:bg-orange-950/80 dark:border-orange-500 dark:text-orange-50',
  },
  {
    drugA: 'Insuline',
    drugB: 'Metformine',
    severity: 'FAIBLE',
    consequence: 'Risque d\'hypoglycémie',
    color: 'bg-yellow-100 border-yellow-300 text-yellow-900 dark:bg-yellow-950/70 dark:border-yellow-500 dark:text-yellow-50',
  },
];

const DISPENSE_ROLES = ['Médecin Chef Pédiatrie', 'Médecin', 'Pédiatre', 'Infirmier(e)'];
const ACK_TIMEOUT_MS = 10000;
const WARN_MS  = 60000;
const LOGOUT_MS = 90000;
const NOTES_AUTOCLOSE_MS = 12000;

// ── Helpers ────────────────────────────────────────────────────────────
function getCycle(): string {
  const h = new Date().getHours();
  if (h >= 6 && h < 12)  return 'Matin';
  if (h >= 12 && h < 14) return 'Midi';
  if (h >= 14 && h < 20) return 'Soir';
  return 'Nuit';
}
function isActiveNow(schedule: string): boolean {
  const cycle = getCycle();
  const s = schedule.toLowerCase();
  if (s.includes('si besoin') || s.includes('prn'))     return true;
  if (s.includes('toutes les') || s.includes('6h'))     return true;
  if (s.includes('3x') || s.includes('3 x'))            return ['Matin','Midi','Soir'].includes(cycle);
  if (s.includes('2x') || s.includes('2 x'))            return ['Matin','Soir'].includes(cycle);
  return s.includes(cycle.toLowerCase());
}
function getMedCycle(schedule: string): string {
  const s = schedule.toLowerCase();
  if (s.includes('si besoin') || s.includes('prn'))  return 'PRN';
  if (s.includes('toutes les') || s.includes('6h'))  return getCycle();
  if (s.includes('matin'))  return 'Matin';
  if (s.includes('midi'))   return 'Midi';
  if (s.includes('soir'))   return 'Soir';
  if (s.includes('nuit'))   return 'Nuit';
  return 'PRN';
}
function canDispense(role: string): boolean {
  return DISPENSE_ROLES.includes(role);
}

function allergyLabel(a: string | { medication: string }): string {
  if (typeof a === 'string') return a;
  return a.medication || '';
}

function formatKioskBirth(iso: string | null | undefined, ageYears: number): string {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const lab = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const formatted = formatPedAge(iso, ageYears);
  return `${lab} · ${formatted}`;
}

function truncateLine(s: string, max = 96): string {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function patientKioskAllergies(p: Patient): string[] {
  const out: string[] = [];
  for (const a of p.allergies || []) out.push(allergyLabel(a));
  for (const d of p.drug_allergies || []) if (d && !out.includes(d)) out.push(d);
  for (const o of p.other_allergies || []) if (o && !out.includes(o)) out.push(o);
  return out;
}

function patientKioskHasAllergyAlert(p: Patient): boolean {
  return patientKioskAllergies(p).length > 0;
}

function serverIxToUi(row: ApiDrugIxRow) {
  const sev: 'CRITIQUE' | 'MODÉRÉE' | 'FAIBLE' =
    row.severity === 'contre_indiquee' ? 'CRITIQUE' : row.severity === 'deconseillee' ? 'MODÉRÉE' : 'FAIBLE';
  const color =
    sev === 'CRITIQUE'
      ? 'bg-red-100 border-red-300 text-red-700 dark:bg-red-950/80 dark:border-red-500 dark:text-red-50'
      : sev === 'MODÉRÉE'
        ? 'bg-orange-100 border-orange-300 text-orange-900 dark:bg-orange-950/80 dark:border-orange-500 dark:text-orange-50'
        : 'bg-yellow-100 border-yellow-300 text-yellow-900 dark:bg-yellow-950/70 dark:border-yellow-500 dark:text-yellow-50';
  return { drugA: row.drug_a, drugB: row.drug_b, severity: sev, consequence: row.consequence, color };
}

function pairKey(a: string, b: string) {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? `${x}|${y}` : `${y}|${x}`;
}

// Interactions locales + base serveur (/api/drug-interactions)
function checkDrugInteractions(medications: Medication[], serverRows: ApiDrugIxRow[]): Array<{
  drugA: string;
  drugB: string;
  severity: 'CRITIQUE' | 'MODÉRÉE' | 'FAIBLE';
  consequence: string;
  color: string;
}> {
  const interactions: Array<{
    drugA: string;
    drugB: string;
    severity: 'CRITIQUE' | 'MODÉRÉE' | 'FAIBLE';
    consequence: string;
    color: string;
  }> = [];
  const seen = new Set<string>();
  const medNames = medications.map(m => m.name);

  const pushIx = (ix: { drugA: string; drugB: string; severity: 'CRITIQUE' | 'MODÉRÉE' | 'FAIBLE'; consequence: string; color: string }) => {
    const k = pairKey(ix.drugA, ix.drugB);
    if (seen.has(k)) return;
    seen.add(k);
    interactions.push(ix);
  };

  for (let i = 0; i < medNames.length; i++) {
    for (let j = i + 1; j < medNames.length; j++) {
      const interaction = DRUG_INTERACTIONS.find(
        (inter) =>
          (inter.drugA.toLowerCase().includes(medNames[i].toLowerCase()) &&
            inter.drugB.toLowerCase().includes(medNames[j].toLowerCase())) ||
          (inter.drugA.toLowerCase().includes(medNames[j].toLowerCase()) &&
            inter.drugB.toLowerCase().includes(medNames[i].toLowerCase()))
      );
      if (interaction) pushIx(interaction);
    }
  }

  const nameHitsDrug = (medName: string, drug: string) => {
    const mn = medName.toLowerCase();
    const d = drug.toLowerCase();
    return mn.includes(d) || d.includes(mn);
  };
  for (const row of serverRows) {
    for (let i = 0; i < medNames.length; i++) {
      for (let j = i + 1; j < medNames.length; j++) {
        const da = row.drug_a;
        const db = row.drug_b;
        const hit =
          (nameHitsDrug(medNames[i], da) && nameHitsDrug(medNames[j], db)) ||
          (nameHitsDrug(medNames[i], db) && nameHitsDrug(medNames[j], da));
        if (hit) pushIx(serverIxToUi(row));
      }
    }
  }
  return interactions;
}

// ── StatusDot ──────────────────────────────────────────────────────────
const StatusDot = ({ label, value }: { label: string; value: string }) => {
  const color =
    value === 'online' || value === 'ready' ? 'bg-emerald-400' :
    value === 'busy'   || value === 'reconnecting' ? 'bg-amber-400 animate-pulse' :
    value === 'unknown' ? 'bg-gray-300' : 'bg-red-500 animate-pulse';
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-xs text-gray-500 font-mono">{label}</span>
    </div>
  );
};

// ── DrugInteractionModal (bloquant — Feature 1) ────────────────────────
function severityBadgeClasses(sev: 'CRITIQUE' | 'MODÉRÉE' | 'FAIBLE') {
  if (sev === 'CRITIQUE') {
    return 'bg-red-600 text-white border border-red-800 dark:bg-red-700 dark:text-white dark:border-red-500';
  }
  if (sev === 'MODÉRÉE') {
    return 'bg-orange-600 text-white border border-orange-700 dark:bg-orange-600 dark:text-white dark:border-orange-400';
  }
  return 'bg-amber-400 text-gray-900 border border-amber-600 dark:bg-amber-500 dark:text-gray-950 dark:border-amber-300';
}

function severityLabel(sev: 'CRITIQUE' | 'MODÉRÉE' | 'FAIBLE') {
  if (sev === 'CRITIQUE') return 'CRITIQUE 🔴';
  if (sev === 'MODÉRÉE') return 'MODÉRÉE 🟠';
  return 'FAIBLE 🟡';
}

const DrugInteractionModal = ({
  interactions,
  onConfirm,
  onCancel,
  currentDoctor,
  secondValidator,
  onSecondRFIDScan,
  onBackFromRfid,
}: {
  interactions: Array<any>;
  onConfirm: () => void;
  onCancel: () => void;
  currentDoctor: Doctor | null;
  secondValidator: Doctor | null;
  onSecondRFIDScan: (uid: string) => void;
  onBackFromRfid: () => void;
}) => {
  const [step, setStep] = useState<'warning' | 'second_rfid'>('warning');

  const handleSimulateSecondScan = () => {
    onSecondRFIDScan('RFID_OVERRIDE_DEMO');
  };

  if (step === 'second_rfid') {
    return (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 dark:bg-black/80 backdrop-blur-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="interaction-rfid-title"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md rounded-2xl border-4 border-amber-500 dark:border-amber-400 bg-white dark:bg-slate-900 shadow-2xl p-8 text-center"
        >
          <h2 id="interaction-rfid-title" className="text-xl font-black text-gray-900 dark:text-white mb-2">
            Validation du médecin responsable
          </h2>
          <p className="text-gray-700 dark:text-slate-200 font-semibold mb-6">
            Faites scanner le badge d&apos;un(e) second(e) soignant(e) pour confirmer le contournement.
          </p>

          {currentDoctor && (
            <div className="mb-6 p-4 rounded-xl bg-teal-50 dark:bg-teal-950/50 border-2 border-teal-200 dark:border-teal-700 text-left">
              <p className="text-xs font-bold uppercase text-teal-800 dark:text-teal-200 mb-1">Premier prescripteur</p>
              <p className="font-bold text-gray-900 dark:text-white">{currentDoctor.name}</p>
              <p className="text-sm text-gray-600 dark:text-slate-300">{currentDoctor.role}</p>
            </div>
          )}

          <div className="flex items-center justify-center mb-8">
            <motion.div
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="relative w-24 h-24 rounded-full border-4 border-amber-500 dark:border-amber-400 flex items-center justify-center"
            >
              <motion.div
                animate={{ scale: [1.4, 2.2], opacity: [0.8, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="absolute inset-0 rounded-full border-4 border-amber-400 dark:border-amber-300"
              />
              <User className="w-10 h-10 text-amber-600 dark:text-amber-300 relative z-10" />
            </motion.div>
          </div>

          <button
            type="button"
            onClick={handleSimulateSecondScan}
            className="w-full min-h-[48px] rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-base shadow-lg active:scale-[0.99] transition-all mb-3"
          >
            Simuler scan RFID (démo)
          </button>

          {secondValidator && (
            <div className="mb-4 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border-2 border-emerald-400 dark:border-emerald-600 text-left">
              <p className="text-xs font-bold uppercase text-emerald-900 dark:text-emerald-100 mb-1">Second badge reconnu</p>
              <p className="font-bold text-gray-900 dark:text-white">{secondValidator.name}</p>
              <p className="text-sm text-gray-700 dark:text-slate-200">{secondValidator.role}</p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {secondValidator && (
              <button
                type="button"
                onClick={onConfirm}
                className="w-full min-h-[48px] rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-black text-lg shadow-lg active:scale-[0.99]"
              >
                Continuer la distribution
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                onBackFromRfid();
                setStep('warning');
              }}
              className="w-full min-h-[48px] rounded-xl border-2 border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 font-bold hover:bg-gray-100 dark:hover:bg-slate-800"
            >
              Retour
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-black/75 dark:bg-black/85 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="interaction-block-title"
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-3xl max-h-[min(100dvh,900px)] flex flex-col rounded-2xl border-4 border-red-600 dark:border-red-500 shadow-[0_0_0_1px_rgba(220,38,38,0.3)] overflow-hidden bg-white dark:bg-slate-900"
      >
        <div className="flex-shrink-0 px-5 sm:px-8 py-5 flex items-start gap-3 bg-red-600 dark:bg-red-800 border-b-4 border-red-700 dark:border-red-600">
          <AlertTriangle className="w-10 h-10 text-white flex-shrink-0 mt-0.5" aria-hidden />
          <h2 id="interaction-block-title" className="text-xl sm:text-2xl font-black text-white leading-tight">
            ⚠️ Interaction médicamenteuse détectée
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto px-5 sm:px-8 py-6 space-y-4">
          <p className="font-bold text-gray-900 dark:text-white text-base sm:text-lg">
            La prescription contient au moins une interaction connue entre deux médicaments. La distribution est bloquée jusqu&apos;à décision.
          </p>

          <div className="overflow-x-auto rounded-xl border-2 border-red-200 dark:border-red-800 bg-red-50/80 dark:bg-red-950/40">
            <table className="w-full text-left text-sm sm:text-base">
              <thead>
                <tr className="border-b-2 border-red-200 dark:border-red-800 bg-red-100 dark:bg-red-950/80">
                  <th className="p-3 sm:p-4 font-black text-red-950 dark:text-red-100">Paire</th>
                  <th className="p-3 sm:p-4 font-black text-red-950 dark:text-red-100 whitespace-nowrap">Sévérité</th>
                  <th className="p-3 sm:p-4 font-black text-red-950 dark:text-red-100">Risque</th>
                </tr>
              </thead>
              <tbody>
                {interactions.map((inter, idx) => (
                  <tr
                    key={idx}
                    className="border-b border-red-200/80 dark:border-red-900/80 bg-white/90 dark:bg-slate-900/80"
                  >
                    <td className="p-3 sm:p-4 align-top font-bold text-gray-900 dark:text-white">
                      {inter.drugA} ↔ {inter.drugB}
                    </td>
                    <td className="p-3 sm:p-4 align-top">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-black whitespace-nowrap ${severityBadgeClasses(inter.severity)}`}
                      >
                        {severityLabel(inter.severity)}
                      </span>
                    </td>
                    <td className="p-3 sm:p-4 align-top text-gray-900 dark:text-slate-100 font-semibold">
                      {inter.consequence}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex-shrink-0 px-5 sm:px-8 py-5 flex flex-col gap-4 bg-gray-100 dark:bg-slate-950 border-t-2 border-red-200 dark:border-red-900/60">
          <button
            type="button"
            onClick={onCancel}
            className="w-full min-h-[48px] rounded-xl bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600 text-white font-black text-lg shadow-lg active:scale-[0.99] transition-colors"
          >
            Annuler la distribution
          </button>
          <button
            type="button"
            onClick={() => setStep('second_rfid')}
            className="self-center min-h-[48px] px-6 rounded-xl bg-gray-300 hover:bg-gray-400 dark:bg-slate-600 dark:hover:bg-slate-500 text-gray-900 dark:text-white font-bold text-sm border-2 border-gray-400 dark:border-slate-500"
          >
            Confirmer — Médecin responsable
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ── Haut risque : double validation (2e badge) ───────────────────────
const HighRiskMedModal = ({
  med,
  currentDoctor,
  secondValidator,
  onSecondRFIDScan,
  onConfirm,
  onCancel,
}: {
  med: Medication;
  currentDoctor: Doctor | null;
  secondValidator: Doctor | null;
  onSecondRFIDScan: (uid: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) => (
  <div
    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
    role="dialog"
    aria-modal="true"
  >
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-lg rounded-2xl border-4 border-red-500 bg-white dark:bg-slate-900 shadow-2xl p-6"
    >
      <h2 className="text-xl font-black text-red-700 dark:text-red-400 mb-2">Médicament à haut risque</h2>
      <p className="text-gray-700 dark:text-slate-200 font-semibold mb-4">
        <span className="font-black">{med.name}</span> nécessite une seconde validation (soignant différent).
      </p>
      {currentDoctor && (
        <p className="text-xs text-gray-500 mb-4">
          Prescripteur : {currentDoctor.name} ({currentDoctor.role})
        </p>
      )}
      <button
        type="button"
        onClick={() => onSecondRFIDScan('RFID_HIGHRISK_DEMO')}
        className="w-full min-h-[48px] rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black mb-4"
      >
        Simuler 2e scan RFID (démo)
      </button>
      {secondValidator && (
        <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-400 text-left">
          <p className="text-xs font-bold text-emerald-800 dark:text-emerald-200">Validateur</p>
          <p className="font-bold text-gray-900 dark:text-white">{secondValidator.name}</p>
        </div>
      )}
      <div className="flex flex-col gap-2">
        {secondValidator && (
          <button
            type="button"
            onClick={onConfirm}
            className="w-full min-h-[48px] rounded-xl bg-teal-600 text-white font-black"
          >
            Continuer la distribution
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="w-full min-h-[48px] rounded-xl border-2 border-gray-300 dark:border-slate-600 font-bold text-gray-700 dark:text-slate-200"
        >
          Annuler
        </button>
      </div>
    </motion.div>
  </div>
);

// ── MedCard ────────────────────────────────────────────────────────────
const MedCard = ({
  med, isDone, isActive, isDispensing, medStatus, allergyWarn, allergyConfirming,
  canAct, onDispense, isHighRisk, pediatricHint, onContinueAnyway,
  onValidatePrise, showValidatePrise,
}: {
  med: Medication; isDone: boolean; isActive: boolean; isDispensing: boolean;
  medStatus: MedStatus; allergyWarn: boolean; allergyConfirming: boolean;
  canAct: boolean; onDispense: () => void;
  isHighRisk?: boolean;
  pediatricHint?: string | null;
  /** Shown when medStatus === 'timeout' (prescription sequential flow). */
  onContinueAnyway?: () => void;
  onValidatePrise?: () => void;
  showValidatePrise?: boolean;
}) => {
  const cycle = getMedCycle(med.schedule);
  const cc = CYCLE_CONFIG[cycle] || CYCLE_CONFIG.PRN;

  if (isDone) return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200 opacity-70">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-600 text-lg">{med.name}</p>
          <p className="text-sm text-gray-400">{med.dosage} · {med.schedule}</p>
          {(med.dose_mg != null || med.dose_ml != null) && (
            <p className="text-sm font-semibold text-gray-700 mt-1">
              {med.dose_mg != null ? `${med.dose_mg} mg` : ''}
              {med.dose_mg != null && med.dose_ml != null ? ' · ' : ''}
              {med.dose_ml != null ? `${med.dose_ml} ml` : ''}
            </p>
          )}
          {med.numero_lot && (
            <p className="text-xs text-gray-500 mt-0.5">Lot n° {med.numero_lot}</p>
          )}
          {pediatricHint && (
            <p className="text-xs font-semibold text-violet-700 mt-1">{pediatricHint}</p>
          )}
        </div>
        <span className="text-xs text-emerald-700 font-bold bg-emerald-100 px-3 py-1 rounded-full border border-emerald-200">
          Distribué ✓
        </span>
      </div>
      {showValidatePrise && onValidatePrise && (
        <button
          type="button"
          onClick={onValidatePrise}
          className="self-end px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-black"
        >
          Valider la prise ✓
        </button>
      )}
    </motion.div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border-2 overflow-hidden transition-all duration-200
        ${isActive ? `${cc.bg} ${cc.border} shadow-lg` : 'bg-gray-50 border-gray-200 opacity-70'}`}>

      {allergyWarn && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-100 border-b border-red-300">
          <ShieldAlert className="w-4 h-4 text-red-600 flex-shrink-0" />
          <span className="text-sm text-red-700 font-bold">ALLERGIE — vérifier avant administration</span>
        </div>
      )}

      <div className="flex items-center gap-4 p-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-xl
          ${isActive ? cc.bg + ' border ' + cc.border : 'bg-gray-100'}`}>
          {cc.icon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`font-black text-xl ${isActive ? 'text-gray-900' : 'text-gray-500'}`}>{med.name}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${cc.badge}`}>{cc.label}</span>
            {isHighRisk && (
              <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-red-600 text-white">Haut risque</span>
            )}
            {isActive && (
              <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-teal-100 text-teal-700">Maintenant</span>
            )}
          </div>
          <p className="text-gray-500 text-base mt-0.5">
            {med.dosage} · Tiroir <span className="font-mono font-black text-gray-700">[{med.drawer}]</span>
            {med.time && <span className="ml-2 text-gray-400">· {med.time}</span>}
          </p>
          {(med.dose_mg != null || med.dose_ml != null) && (
            <p className="text-sm font-bold text-gray-800 mt-1">
              {med.dose_mg != null ? `${med.dose_mg} mg` : ''}
              {med.dose_mg != null && med.dose_ml != null ? ' · ' : ''}
              {med.dose_ml != null ? `${med.dose_ml} ml` : ''}
            </p>
          )}
          {med.numero_lot && (
            <p className="text-xs text-gray-500 mt-0.5">Lot n° {med.numero_lot}</p>
          )}
          {pediatricHint && (
            <p className="text-sm font-bold text-violet-700 dark:text-violet-300 mt-2 bg-violet-50 dark:bg-violet-950/50 border border-violet-200 dark:border-violet-700 rounded-lg px-3 py-2">
              {pediatricHint}
            </p>
          )}
        </div>

        {canAct && (
          <button onClick={onDispense} disabled={isDispensing}
            className={`flex items-center gap-2 px-5 py-3 rounded-full font-black text-base
              transition-all duration-150 active:scale-95 disabled:opacity-50 flex-shrink-0
              ${allergyConfirming
                ? 'bg-red-500 text-white animate-pulse shadow-red-500/40 shadow-lg'
                : allergyWarn
                ? 'bg-red-50 text-red-700 border-2 border-red-400 hover:bg-red-500 hover:text-white'
                : isActive
                ? 'bg-teal-500 text-white hover:bg-teal-400 shadow-teal-500/30 shadow-md'
                : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}>
            {isDispensing ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> En cours...</>
            ) : allergyConfirming ? (
              <><ShieldAlert className="w-5 h-5" /> Confirmer ⚠️</>
            ) : allergyWarn ? (
              <><ShieldAlert className="w-5 h-5" /> Distribuer</>
            ) : (
              <>Distribuer <ChevronRight className="w-5 h-5" /></>
            )}
          </button>
        )}
      </div>

      {medStatus === 'waiting_ack' && (
        <div className="px-4 pb-3 flex items-center gap-2 text-amber-600 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Attente confirmation robot...</span>
        </div>
      )}
      {medStatus === 'timeout' && (
        <div className="px-4 pb-3 space-y-2">
          <div className="flex items-center gap-2 text-amber-700 text-sm font-bold">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>Pas de réponse du robot — vérifiez le tiroir manuellement.</span>
          </div>
          {onContinueAnyway && (
            <button
              type="button"
              onClick={onContinueAnyway}
              className="w-full py-2.5 rounded-xl border-2 border-amber-500 bg-amber-50 text-amber-900 font-black text-sm hover:bg-amber-100 active:scale-[0.99] transition-all"
            >
              Continuer quand même
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
};

function getSquareCropParams(
  img: HTMLImageElement,
  zoom: number,
  panH: number,
  panV: number,
): { sx: number; sy: number; side: number } | null {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (!iw || !ih) return null;
  if (Math.min(iw, ih) < 8) return null;
  const z = Math.max(1, Math.min(3, zoom));
  const side = Math.min(iw, ih) / z;
  const cx = (iw - side) / 2 + panH * (iw - side) / 2;
  const cy = (ih - side) / 2 + panV * (ih - side) / 2;
  const sx = Math.max(0, Math.min(iw - side, cx));
  const sy = Math.max(0, Math.min(ih - side, cy));
  return { sx, sy, side };
}

/** Recadrage carré (zoom + déplacement), export JPEG base64. */
function cropSquareImageDataUrl(
  img: HTMLImageElement,
  zoom: number,
  panH: number,
  panV: number,
  outSize = 512,
): string {
  const p = getSquareCropParams(img, zoom, panH, panV);
  if (!p) return '';
  const canvas = document.createElement('canvas');
  canvas.width = outSize;
  canvas.height = outSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(img, p.sx, p.sy, p.side, p.side, 0, 0, outSize, outSize);
  return canvas.toDataURL('image/jpeg', 0.9);
}

// ── PatientPhotoModal (kiosk — caméra / fichier + ajustement) ───────────
const PatientPhotoModal = ({
  patient,
  onClose,
  onSaved,
}: {
  patient: Patient;
  onClose: () => void;
  onSaved: (b64: string) => void;
}) => {
  const [step, setStep] = useState<'pick' | 'edit'>('pick');
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1.2);
  const [panH, setPanH] = useState(0);
  const [panV, setPanV] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const [imgLoaded, setImgLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    const img = imgRef.current;
    const canvas = previewCanvasRef.current;
    if (!img || !canvas || !imgLoaded || !dataUrl) return;
    const p = getSquareCropParams(img, zoom, panH, panV);
    if (!p || p.side <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const s = 280;
    canvas.width = s;
    canvas.height = s;
    ctx.drawImage(img, p.sx, p.sy, p.side, p.side, 0, 0, s, s);
  }, [dataUrl, imgLoaded, zoom, panH, panV]);

  const loadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErr('Veuillez choisir un fichier image.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setDataUrl(String(reader.result));
      setStep('edit');
      setZoom(1.2);
      setPanH(0);
      setPanV(0);
      setImgLoaded(false);
      setErr('');
    };
    reader.readAsDataURL(file);
  };

  const save = async () => {
    const el = imgRef.current;
    if (!el || !imgLoaded) return;
    setUploading(true);
    setErr('');
    try {
      const b64 = cropSquareImageDataUrl(el, zoom, panH, panV);
      const res = await fetch(`/api/patients/${patient.id}/photo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo: b64 }),
      });
      if (!res.ok) throw new Error('fail');
      onSaved(b64);
      onClose();
    } catch {
      setErr('Enregistrement impossible. Réessayez.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto border-2 border-teal-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-lg font-black text-gray-900">Photo — {patient.full_name}</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === 'pick' && (
          <div className="p-6 space-y-4">
            <p className="text-sm text-gray-600 font-semibold">
              Choisissez la caméra (téléphone ou webcam) ou un fichier existant, puis ajustez le cadrage.
            </p>
            <div className="grid gap-3">
              <button
                type="button"
                onClick={() => camRef.current?.click()}
                className="flex items-center justify-center gap-3 w-full py-4 rounded-xl border-2 border-teal-400 bg-teal-50 text-teal-900 font-black hover:bg-teal-100 transition-colors"
              >
                <Camera className="w-6 h-6" />
                Prendre une photo (caméra)
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex items-center justify-center gap-3 w-full py-4 rounded-xl border-2 border-gray-300 bg-gray-50 text-gray-900 font-black hover:bg-gray-100 transition-colors"
              >
                <ImagePlus className="w-6 h-6" />
                Importer une image (fichiers)
              </button>
            </div>
            <input
              ref={camRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={loadFile}
            />
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={loadFile} />
            {err && <p className="text-sm text-red-600 font-bold">{err}</p>}
          </div>
        )}

        {step === 'edit' && dataUrl && (
          <div className="p-6 space-y-4">
            <p className="text-sm text-gray-600 font-semibold">Ajustez le zoom et le cadrage — l&apos;aperçu correspond à la photo enregistrée.</p>
            <img
              ref={imgRef}
              src={dataUrl}
              alt=""
              className="hidden"
              onLoad={() => setImgLoaded(true)}
            />
            <div className="relative w-full max-w-[280px] mx-auto rounded-2xl overflow-hidden bg-gray-200 border-2 border-gray-300 aspect-square">
              <canvas ref={previewCanvasRef} className="w-full h-full object-cover" width={280} height={280} />
            </div>
            <div className="space-y-3">
              <label className="block text-xs font-black text-gray-500 uppercase tracking-wide">
                Zoom
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.05}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full mt-1 accent-teal-600"
                />
              </label>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-wide">
                Déplacer horizontal
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.02}
                  value={panH}
                  onChange={(e) => setPanH(Number(e.target.value))}
                  className="w-full mt-1 accent-teal-600"
                />
              </label>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-wide">
                Déplacer vertical
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.02}
                  value={panV}
                  onChange={(e) => setPanV(Number(e.target.value))}
                  className="w-full mt-1 accent-teal-600"
                />
              </label>
            </div>
            {err && <p className="text-sm text-red-600 font-bold">{err}</p>}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setStep('pick');
                  setDataUrl(null);
                  setImgLoaded(false);
                }}
                className="flex-1 py-3 rounded-xl border-2 border-gray-300 font-bold text-gray-700 hover:bg-gray-50"
              >
                Retour
              </button>
              <button
                type="button"
                disabled={!imgLoaded || uploading}
                onClick={save}
                className="flex-1 py-3 rounded-xl bg-teal-600 text-white font-black hover:bg-teal-500 disabled:opacity-50"
              >
                {uploading ? 'Envoi…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

// ── PostNotesSheet ─────────────────────────────────────────────────────
const PostNotesSheet = ({
  medName, dispensedSummary, wrapUp, countdown, onNote, onClose,
}: {
  medName: string;
  /** Fin de visite : suggestions + récap (peut être vide). */
  wrapUp?: boolean;
  /** Médicaments distribués cette session (affichés si wrapUp). */
  dispensedSummary?: string[];
  countdown: number;
  onNote: (note: string) => void;
  onClose: () => void;
}) => {
  const [freeText, setFreeText] = useState('');
  const [showInput, setShowInput] = useState(false);
  const list = dispensedSummary ?? [];
  const sessionMode = Boolean(wrapUp);

  return (
    <motion.div
      initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 400 }}
      className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t-2 border-teal-500/50 rounded-t-3xl shadow-2xl max-h-[85vh] overflow-y-auto"
    >
      <div className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="font-black text-gray-900 text-lg">
                {sessionMode ? medName : `${medName} distribuée`}
              </p>
              {sessionMode && (
                list.length > 0 ? (
                  <ul className="mt-2 text-sm text-gray-700 font-semibold space-y-1 max-h-36 overflow-y-auto list-disc list-inside">
                    {list.map((n, i) => (
                      <li key={`${i}-${n}`}>{n}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-gray-500 font-semibold">
                    Aucune distribution enregistrée cette session.
                  </p>
                )
              )}
              <p className="text-gray-500 text-sm mt-1">Note rapide — fermeture auto dans {countdown}s</p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-900 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!showInput ? (
          <div className="grid grid-cols-3 gap-3">
            {QUICK_NOTES.map(n => (
              <button key={n.id} onClick={() => {
                if (n.id === 'free') { setShowInput(true); return; }
                onNote(n.label);
              }}
                className="flex flex-col items-center gap-2 p-4 bg-gray-50 rounded-2xl
                  hover:bg-gray-100 active:scale-95 transition-all border border-gray-200 hover:border-teal-400">
                <span className="text-2xl">{n.icon}</span>
                <span className="text-gray-600 text-sm font-semibold text-center leading-tight">{n.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <textarea
              autoFocus value={freeText} onChange={e => setFreeText(e.target.value)}
              placeholder="Saisir une note libre..." rows={3}
              className="w-full bg-gray-50 border border-gray-300 rounded-xl px-4 py-3 text-gray-900 text-base outline-none focus:border-teal-500 resize-none"
            />
            <div className="flex gap-3">
              <button onClick={() => setShowInput(false)}
                className="flex-1 py-3 rounded-full border border-gray-300 text-gray-600 font-bold hover:bg-gray-100 transition-colors">
                Retour
              </button>
              <button onClick={() => onNote(freeText || 'Note libre')}
                className="flex-1 py-3 rounded-full bg-teal-500 text-white font-black hover:bg-teal-400 active:scale-95 transition-all">
                Enregistrer
              </button>
            </div>
          </div>
        )}

        {!showInput && (
          <button onClick={onClose}
            className="w-full mt-4 py-4 rounded-2xl bg-gray-100 text-gray-600 font-bold text-lg
              hover:bg-gray-200 hover:text-gray-900 active:scale-95 transition-all border border-gray-200">
            {sessionMode ? 'Passer — sans note' : 'Terminer — pas de note'}
          </button>
        )}
      </div>
    </motion.div>
  );
};

// ── LogoutWarning ──────────────────────────────────────────────────────
const LogoutWarning = ({ countdown, onStay }: { countdown: number; onStay: () => void }) => (
  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
    className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-amber-50 border border-amber-300 rounded-2xl px-8 py-4 flex items-center gap-4 shadow-xl z-40">
    <Clock className="w-5 h-5 text-amber-500" />
    <span className="text-amber-700 font-bold">Session expire dans {countdown}s</span>
    <button onClick={onStay}
      className="px-4 py-2 bg-amber-500 text-white rounded-full font-black text-sm hover:bg-amber-400 transition-colors">
      Rester connecté
    </button>
  </motion.div>
);

// ══════════════════════════════════════════════════════════════════════
// MAIN KIOSK VIEW
// ══════════════════════════════════════════════════════════════════════
interface Props { onSwitchToAdmin?: () => void }

export default function KioskView({ onSwitchToAdmin }: Props) {
  const [state,           setState]           = useState<KioskState>('idle');
  const [isDark,          setIsDark]          = useState(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('medibot-theme') : null;
    if (saved === 'dark' || saved === 'light') {
      document.documentElement.setAttribute('data-theme', saved);
      return saved === 'dark';
    }
    return document.documentElement.getAttribute('data-theme') === 'dark';
  });
  const [doctor,          setDoctor]          = useState<Doctor | null>(null);
  const [rooms,           setRooms]           = useState<Room[]>([]);
  const [selectedRoom,    setSelectedRoom]    = useState<Room | null>(null);
  const [patients,        setPatients]        = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [medications,     setMedications]     = useState<Medication[]>([]);
  const [sysStatus,       setSysStatus]       = useState<RobotStatus>({
    mqtt: 'offline', esp32: 'unknown', stm32: 'unknown', battery: null, rssi: null,
  });

  const [apiDrugInteractions, setApiDrugInteractions] = useState<ApiDrugIxRow[]>([]);
  const [splashPhoto, setSplashPhoto] = useState<string | null>(null);
  const [validationGate, setValidationGate] = useState<{ patient: Patient; status: string; note?: string | null } | null>(null);
  const [missedByPatient, setMissedByPatient] = useState<Record<number, number>>({});
  const [highRiskModalMed, setHighRiskModalMed] = useState<Medication | null>(null);
  const [highRiskSecond, setHighRiskSecond] = useState<Doctor | null>(null);

  const [dispensedMeds,  setDispensedMeds]  = useState<Set<number>>(new Set());
  const [dispensingId,   setDispensingId]   = useState<number | null>(null);
  const [medStatuses,    setMedStatuses]    = useState<Record<number, MedStatus>>({});
  const [allergyConfId,  setAllergyConfId]  = useState<number | null>(null);
  const allergyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drug interaction modal state
  const [showInteractionModal, setShowInteractionModal] = useState(false);
  const [pendingMedication, setPendingMedication] = useState<Medication | null>(null);
  const [interactions, setInteractions] = useState<Array<any>>([]);
  const [interactionConfirmed, setInteractionConfirmed] = useState(false);
  const [secondValidationNurse, setSecondValidationNurse] = useState<Doctor | null>(null);

  const [showNotes,     setShowNotes]     = useState(false);
  const [noteMedName,   setNoteMedName]   = useState('');
  const [noteLogId,     setNoteLogId]     = useState<number | null>(null);
  const [noteCountdown, setNoteCountdown] = useState(NOTES_AUTOCLOSE_MS / 1000);
  const [showEmergencyConfirm, setShowEmergencyConfirm] = useState(false);
  const [showEmergencyFlash, setShowEmergencyFlash] = useState(false);
  const [showVitalsModal, setShowVitalsModal] = useState(false);
  const [pendingCloseLogId, setPendingCloseLogId] = useState<number | null>(null);
  const [vitalsAlert, setVitalsAlert] = useState('');
  const [vitalsForm, setVitalsForm] = useState({
    temperature: '',
    respiratory_rate: '',
    spo2: '',
    diuresis: 'bonne',
    transit: 'normal',
    glasgow: '',
  });
  /** Fin de visite : récap des médicaments distribués (peut être vide). */
  const [postNotesDispensedSummary, setPostNotesDispensedSummary] = useState<string[]>([]);
  const [postNotesWrapUp, setPostNotesWrapUp] = useState(false);
  const noteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteCountRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionLogIdsRef = useRef<number[]>([]);
  const medLogIdsRef = useRef<Record<number, number>>({});
  const [validatedLogIds, setValidatedLogIds] = useState<Set<number>>(new Set());
  /** Set when opening « Terminer avec ce patient » sheet; used on close to return to room list + highlight. */
  const visitEndPatientIdRef = useRef<number | null>(null);
  /** Patient row highlighted in green after a completed visit (notes sheet closed). */
  const [lastServedPatientId, setLastServedPatientId] = useState<number | null>(null);
  // Persist green state in sessionStorage so it survives logout within same session
  const servedSetKey = `medibot-served-${selectedRoom?.id ?? 0}`;
  const [photoModalPatient, setPhotoModalPatient] = useState<Patient | null>(null);

  const [showLogoutWarn,  setShowLogoutWarn]  = useState(false);
  const [logoutCountdown, setLogoutCountdown] = useState(30);
  const warnTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutCountRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    fetch('/api/drug-interactions')
      .then((r) => r.json())
      .then((rows: ApiDrugIxRow[]) => setApiDrugInteractions(Array.isArray(rows) ? rows : []))
      .catch(() => setApiDrugInteractions([]));
  }, []);

  // B2 — Restore dispensedMeds across refresh: re-check today's log when patient+meds are ready
  useEffect(() => {
    if (!selectedPatient || medications.length === 0) return;
    (async () => {
      try {
        const logs: any[] = await (await fetch('/api/log')).json();
        const today = new Date().toISOString().slice(0, 10);
        const alreadyGiven = new Set<number>();
        medications.forEach(m => {
          const found = logs.find(l =>
            l.patient_id === selectedPatient.id &&
            l.med_name === m.name &&
            (l.timestamp ?? '').startsWith(today)
          );
          if (found) alreadyGiven.add(m.id);
        });
        if (alreadyGiven.size > 0) {
          setDispensedMeds(prev => new Set([...prev, ...alreadyGiven]));
          setMedStatuses(prev => {
            const next = { ...prev };
            alreadyGiven.forEach(id => { next[id] = 'done'; });
            return next;
          });
        }
      } catch { /* ignore */ }
    })();
  }, [selectedPatient?.id, medications.length]);

  useEffect(() => {
    if (!splashPhoto) return;
    const t = setTimeout(() => setSplashPhoto(null), 1500);
    return () => clearTimeout(t);
  }, [splashPhoto]);

  const toggleDark = () => {
    setIsDark(prev => {
      const next = !prev;
      document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
      localStorage.setItem('medibot-theme', next ? 'dark' : 'light');
      return next;
    });
  };

  // ── MQTT ─────────────────────────────────────────────────────────
  useEffect(() => {
    connectMQTT(
      (s) => setSysStatus(s),
      (uid) => handleRfidScan(uid),
      (drawer, ackStatus) => handleAck(drawer, ackStatus)
    );
    return () => disconnectMQTT();
  }, []);

  useEffect(() => {
    updateMQTTCallbacks(
      (s) => setSysStatus(s),
      (uid) => handleRfidScan(uid),
      (drawer, ackStatus) => handleAck(drawer, ackStatus)
    );
  });

  const handleRfidScan = useCallback(async (uid: string) => {
    if (state !== 'idle') return;
    try {
      const res  = await fetch('/api/rfid', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid }) });
      const data = await res.json();
      if (data.access) {
        setDoctor({
          uid,
          name: data.name,
          role: data.role,
          photo: data.photo ?? null,
          role_code: typeof data.role_code === 'string' ? data.role_code : undefined,
          can_prescribe: typeof data.can_prescribe === 'boolean' ? data.can_prescribe : true,
        });
        if (data.photo) setSplashPhoto(String(data.photo));
        const roomsRes = await fetch('/api/rooms');
        setRooms(await roomsRes.json());
        setState('doctor_in');
        startIdleTimer();
      }
    } catch (err) { console.error('[Kiosk] RFID error', err); }
  }, [state]);

  const handleAck = useCallback((drawer: number, ackStatus: string) => {
    setMedications(meds => {
      const med = meds.find(m => m.drawer === drawer);
      if (!med) return meds;
      if (ackStatus === 'done') {
        setDispensedMeds(prev => new Set(prev).add(med.id));
        setMedStatuses(prev => ({ ...prev, [med.id]: 'done' }));
        setDispensingId(null);
      }
      return meds;
    });
  }, []);

  // ── Timers ───────────────────────────────────────────────────────
  const clearIdleTimers = () => {
    if (warnTimerRef.current)   clearTimeout(warnTimerRef.current);
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    if (logoutCountRef.current) clearInterval(logoutCountRef.current);
  };

  const startIdleTimer = useCallback(() => {
    clearIdleTimers();
    setShowLogoutWarn(false);
    warnTimerRef.current = setTimeout(() => {
      setShowLogoutWarn(true);
      setLogoutCountdown(30);
      logoutCountRef.current = setInterval(() => setLogoutCountdown(c => c > 0 ? c - 1 : 0), 1000);
      logoutTimerRef.current = setTimeout(handleLogout, LOGOUT_MS - WARN_MS);
    }, WARN_MS);
  }, []);

  const resetIdleTimer = () => {
    if (state !== 'idle') startIdleTimer();
    setShowLogoutWarn(false);
    if (logoutCountRef.current) clearInterval(logoutCountRef.current);
  };

  const resetPrescriptionSession = useCallback(() => {
    sessionLogIdsRef.current = [];
    setPostNotesDispensedSummary([]);
    setPostNotesWrapUp(false);
  }, []);

  const handleLogout = useCallback(() => {
    clearIdleTimers();
    setShowLogoutWarn(false);
    visitEndPatientIdRef.current = null;
    setLastServedPatientId(null);
    setDoctor(null); setSelectedRoom(null); setSelectedPatient(null);
    setMedications([]); setDispensedMeds(new Set()); setMedStatuses({});
    setDispensingId(null); setShowNotes(false); setState('idle');
    resetPrescriptionSession();
    setInteractionConfirmed(false);
    setSecondValidationNurse(null);
    setSplashPhoto(null);
    setValidationGate(null);
    setMissedByPatient({});
    setHighRiskModalMed(null);
    setHighRiskSecond(null);
  }, [resetPrescriptionSession]);

  // ── Navigation ───────────────────────────────────────────────────
  const selectRoom = async (room: Room) => {
    resetIdleTimer();
    // Do NOT reset — instead restore from sessionStorage
    try {
      const stored: number[] = JSON.parse(
        sessionStorage.getItem(`medibot-served-${room.id}`) || '[]'
      );
      setLastServedPatientId(stored[stored.length - 1] ?? null);
    } catch {
      setLastServedPatientId(null);
    }
    setSelectedRoom(room);
    try {
      const pts: Patient[] = await (await fetch(`/api/rooms/${room.id}/patients`)).json();
      setPatients(pts);
      const missed: Record<number, number> = {};
      await Promise.all(
        pts.map(async (p) => {
          try {
            const j = await (await fetch(`/api/patients/${p.id}/missed-doses`)).json();
            missed[p.id] = j.count ?? 0;
          } catch {
            missed[p.id] = 0;
          }
        })
      );
      setMissedByPatient(missed);
      setState('room_selected');
    } catch { /* ignore */ }
  };

  const selectPatient = async (patient: Patient) => {
    resetIdleTimer();
    visitEndPatientIdRef.current = null;
    setLastServedPatientId(null);
    resetPrescriptionSession();
    medLogIdsRef.current = {};
    setValidatedLogIds(new Set());
    setDispensedMeds(new Set()); setMedStatuses({});
    setInteractionConfirmed(false);
    setSecondValidationNurse(null);
    setHighRiskModalMed(null);
    setHighRiskSecond(null);
    try {
      const v = await (await fetch(`/api/patients/${patient.id}/prescription-validation`)).json();
      if (v.status !== 'approved') {
        setValidationGate({ patient, status: v.status, note: v.note });
        return;
      }
      let fullPatient: Patient = patient;
      try {
        const pr = await fetch(`/api/patients/${patient.id}`);
        if (pr.ok) fullPatient = (await pr.json()) as Patient;
      } catch { /* garder l’objet liste */ }
      setSelectedPatient(fullPatient);
      const ordRes = await (await fetch(`/api/patients/${patient.id}/ordonnance-lignes`)).json();
      const lignes = ordRes?.lignes as Array<Record<string, unknown>> | undefined;
      if (lignes && lignes.length > 0) {
        const mapped: Medication[] = lignes.map((l) => {
          const lid = Number(l.ligne_id ?? l.medicament_id ?? 0);
          const name = String(l.display_name ?? l.med_name ?? l.medicament_libre ?? '—');
          return {
            id: lid,
            ligne_id: Number(l.ligne_id),
            name,
            dosage: String(l.dosage ?? ''),
            schedule: String(l.schedule ?? '—'),
            drawer: Number(l.drawer ?? 0),
            time: String(l.time ?? ''),
            is_high_risk: Number(l.is_high_risk ?? 0),
            pediatric_mg_per_kg: null,
            pediatric_dose_mg: null,
            pediatric_dose_hint: null,
            patient_weight_kg_used: null,
            dose_mg: typeof l.dose_mg === 'number' ? l.dose_mg : null,
            dose_ml: typeof l.dose_ml === 'number' ? l.dose_ml : null,
            numero_lot: l.numero_lot != null ? String(l.numero_lot) : null,
            medicament_libre: l.medicament_libre != null ? String(l.medicament_libre) : null,
            distributed_by_robot: Number(l.distributed_by_robot ?? 1),
          };
        });
        setMedications(mapped);
      } else {
        setMedications(await (await fetch(`/api/patients/${patient.id}/medications`)).json());
      }
      setState('prescription');
    } catch { /* ignore */ }
  };

  // ── Dispense ─────────────────────────────────────────────────────
  const handleDispense = async (med: Medication) => {
    if (!selectedPatient || !doctor) return;
    resetIdleTimer();

    const foundInteractions = checkDrugInteractions(medications, apiDrugInteractions);
    if (foundInteractions.length > 0) {
      setSecondValidationNurse(null);
      setInteractions(foundInteractions);
      setPendingMedication(med);
      setShowInteractionModal(true);
      return;
    }

    if ((med.is_high_risk ?? 0) === 1) {
      setHighRiskModalMed(med);
      setHighRiskSecond(null);
      return;
    }

    await performDispense(med);
  };

  const handleHighRiskSecondScan = (uid: string) => {
    setHighRiskSecond({
      uid,
      name: 'Infirmier(e) validateur(trice)',
      role: 'Infirmier(e)',
    });
  };

  const handleHighRiskConfirm = async () => {
    if (!highRiskModalMed) return;
    const med = highRiskModalMed;
    setHighRiskModalMed(null);
    setHighRiskSecond(null);
    await performDispense(med);
  };

  const performDispense = async (med: Medication) => {
    if (!selectedPatient || !doctor) return;
    if ((med.distributed_by_robot ?? 1) === 0) return;

    const hasAllergyConflict = checkAllergyConflict(med);
    if (hasAllergyConflict && !canDispense(doctor.role)) return;
    if (hasAllergyConflict) {
      if (allergyConfId !== med.id) {
        setAllergyConfId(med.id);
        if (allergyTimerRef.current) clearTimeout(allergyTimerRef.current);
        allergyTimerRef.current = setTimeout(() => setAllergyConfId(null), 3000);
        return;
      }
      setAllergyConfId(null);
    }

    setDispensingId(med.id);
    setMedStatuses(prev => ({ ...prev, [med.id]: 'sending' }));

    try {
      const res  = await fetch('/api/dispense', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          drawer: med.drawer,
          patient: selectedPatient.full_name,
          med: med.name,
          doctor: doctor?.name ?? 'Kiosk',
          doctorrole: doctor?.role ?? '',
        })
      });
      const data = await res.json();
      const logId = data.log_id ?? null;

      setMedStatuses(prev => ({ ...prev, [med.id]: 'waiting_ack' }));
      setNoteLogId(logId);
      if (logId != null) {
        sessionLogIdsRef.current = [...sessionLogIdsRef.current, logId];
        medLogIdsRef.current[med.id] = logId;
      }

      setTimeout(() => {
        setMedStatuses(prev => {
          if (prev[med.id] === 'waiting_ack') { setDispensingId(null); return { ...prev, [med.id]: 'timeout' }; }
          return prev;
        });
      }, ACK_TIMEOUT_MS);
    } catch {
      setMedStatuses(prev => ({ ...prev, [med.id]: 'timeout' }));
      setDispensingId(null);
    }
  };

  const validerPriseMed = async (med: Medication) => {
    const logId = medLogIdsRef.current[med.id];
    if (!logId || !doctor) return;
    try {
      const res = await fetch('/api/prises/valider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ log_id: logId, confirmed_by: doctor.name }),
      });
      if (res.ok) setValidatedLogIds((prev) => new Set(prev).add(logId));
    } catch {
      /* ignore */
    }
  };

  const checkAllergyConflict = (med: Medication): boolean => {
    if (!selectedPatient) return false;
    const names = patientKioskAllergies(selectedPatient).map((x) => x.toLowerCase()).filter(Boolean);
    if (names.length === 0) return false;
    const name = med.name.toLowerCase();
    return names.some((al) => {
      if (!al) return false;
      if (al === 'pénicilline' && (name.includes('amoxicillin') || name.includes('ampicillin') || name.includes('penicillin'))) return true;
      return name.includes(al);
    });
  };

  const startNoteTimer = (_medId: number, logId: number | null) => {
    if (noteTimerRef.current)  clearTimeout(noteTimerRef.current);
    if (noteCountRef.current)  clearInterval(noteCountRef.current);
    setNoteCountdown(NOTES_AUTOCLOSE_MS / 1000);
    noteCountRef.current = setInterval(() => setNoteCountdown(c => c > 0 ? c - 1 : 0), 1000);
    noteTimerRef.current = setTimeout(() => closeNotes(logId), NOTES_AUTOCLOSE_MS);
  };

  const saveNote = async (note: string) => {
    if (noteLogId) {
      try { await fetch(`/api/log/${noteLogId}/note`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }) }); } catch {}
    }
    closeNotes(noteLogId);
  };

  const finalizeCloseNotes = (_logId: number | null) => {
    if (noteTimerRef.current)    clearTimeout(noteTimerRef.current);
    if (noteCountRef.current)    clearInterval(noteCountRef.current);
    setShowNotes(false);
    setPostNotesDispensedSummary([]);
    setPostNotesWrapUp(false);
    const endPid = visitEndPatientIdRef.current;
    visitEndPatientIdRef.current = null;
    if (endPid != null) {
      setLastServedPatientId(endPid);
      try {
        const stored = JSON.parse(sessionStorage.getItem(servedSetKey) || '[]');
        if (!stored.includes(endPid)) stored.push(endPid);
        sessionStorage.setItem(servedSetKey, JSON.stringify(stored));
      } catch {}
      setSelectedPatient(null);
      setMedications([]);
      setDispensedMeds(new Set());
      setMedStatuses({});
      resetPrescriptionSession();
      setHighRiskModalMed(null);
      setHighRiskSecond(null);
      setShowInteractionModal(false);
      setPendingMedication(null);
      setState('room_selected');
    }
  };

  const closeNotes = (_logId: number | null) => {
    if (selectedPatient && doctor && !postNotesWrapUp) {
      setPendingCloseLogId(_logId);
      setShowVitalsModal(true);
      return;
    }
    finalizeCloseNotes(_logId);
  };

  const resetVitalsForm = () =>
    setVitalsForm({
      temperature: '',
      respiratory_rate: '',
      spo2: '',
      diuresis: 'bonne',
      transit: 'normal',
      glasgow: '',
    });

  const submitVitals = async () => {
    if (!selectedPatient || !doctor) {
      setShowVitalsModal(false);
      finalizeCloseNotes(pendingCloseLogId);
      return;
    }
    try {
      const payload = {
        temperature: vitalsForm.temperature ? Number(vitalsForm.temperature) : null,
        respiratory_rate: vitalsForm.respiratory_rate ? Number(vitalsForm.respiratory_rate) : null,
        spo2: vitalsForm.spo2 ? Number(vitalsForm.spo2) : null,
        diuresis: vitalsForm.diuresis || null,
        transit: vitalsForm.transit || null,
        glasgow: vitalsForm.glasgow ? Number(vitalsForm.glasgow) : null,
        recorded_by: doctor.name,
        shift: currentCycle,
      };
      const res = await fetch(`/api/patients/${selectedPatient.id}/vitals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.hyperthermie || data.desaturation) {
        const parts = [];
        if (data.hyperthermie) parts.push(`Hyperthermie ${payload.temperature}°C`);
        if (data.desaturation) parts.push(`Désaturation SpO₂ ${payload.spo2}%`);
        setVitalsAlert(`⚠️ ALERTE: ${parts.join(' / ')}. Informez le médecin immédiatement.`);
        setTimeout(() => setVitalsAlert(''), 8000);
      }
    } catch {
      /* ignore */
    } finally {
      setShowVitalsModal(false);
      resetVitalsForm();
      finalizeCloseNotes(pendingCloseLogId);
      setPendingCloseLogId(null);
    }
  };

  const skipVitals = () => {
    setShowVitalsModal(false);
    resetVitalsForm();
    finalizeCloseNotes(pendingCloseLogId);
    setPendingCloseLogId(null);
  };

  const handleEmergencyDispense = async () => {
    if (!selectedPatient || !doctor) return;
    try {
      await fetch('/api/dispense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          drawer: 99,
          patient: selectedPatient.full_name,
          med: 'URGENCE CHARIOT',
          doctor: doctor.name,
          doctorrole: doctor.role,
        }),
      });
      setShowEmergencyConfirm(false);
      setShowEmergencyFlash(true);
      setTimeout(() => setShowEmergencyFlash(false), 2000);
    } catch {
      setShowEmergencyConfirm(false);
    }
  };

  const handleManualCycleComplete = useCallback((med: Medication) => {
    setDispensedMeds((prev) => new Set(prev).add(med.id));
    setMedStatuses((prev) => ({ ...prev, [med.id]: 'done' }));
    setDispensingId(null);
  }, []);

  const handleTerminerAvecPatient = useCallback(() => {
    if (!selectedPatient) return;
    visitEndPatientIdRef.current = selectedPatient.id;
    const summary = medications.filter((m) => dispensedMeds.has(m.id)).map((m) => m.name);
    const ids = sessionLogIdsRef.current.filter((x) => x != null);
    const lastLogId = ids.length ? ids[ids.length - 1]! : null;
    setNoteMedName(`Fin de visite — ${selectedPatient.full_name}`);
    setPostNotesDispensedSummary(summary);
    setPostNotesWrapUp(true);
    setNoteLogId(lastLogId);
    setShowNotes(true);
    startNoteTimer(0, lastLogId);
  }, [selectedPatient, dispensedMeds, medications]);

  const handleInteractionConfirm = () => {
    if (pendingMedication && secondValidationNurse) {
      const med = pendingMedication;
      setShowInteractionModal(false);
      setInteractionConfirmed(true);
      setSecondValidationNurse(null);
      setPendingMedication(null);
      if ((med.is_high_risk ?? 0) === 1) {
        setHighRiskModalMed(med);
        setHighRiskSecond(null);
      } else {
        performDispense(med);
      }
    }
  };

  const handleSecondRFIDScan = (uid: string) => {
    // Simulate second validation
    const mockNurse: Doctor = {
      uid,
      name: 'Infirmière Marie',
      role: 'Infirmier(e)',
    };
    setSecondValidationNurse(mockNurse);
  };

  useEffect(() => () => {
    clearIdleTimers();
    if (noteTimerRef.current)    clearTimeout(noteTimerRef.current);
    if (noteCountRef.current)    clearInterval(noteCountRef.current);
    if (allergyTimerRef.current) clearTimeout(allergyTimerRef.current);
  }, []);

  const formatDate = (d: Date) => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const formatTime = (d: Date) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const initials   = (name: string) => name.split(' ').filter(w => w !== 'Dr.').slice(0, 2).map(w => w[0]).join('');
  const currentCycle = getCycle();
  const parseWeightKg = (w: string): number | null => {
    const m = String(w).replace(',', '.').match(/([\d.]+)/);
    if (!m) return null;
    const n = parseFloat(m[1]);
    return Number.isFinite(n) ? n : null;
  };

  const SplashOverlay = () =>
    splashPhoto ? (
      <div className="fixed inset-0 z-[250] flex flex-col items-center justify-center bg-black/88 p-6">
        <motion.img
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          src={splashPhoto}
          alt=""
          className="max-w-lg max-h-[75vh] rounded-3xl object-contain shadow-2xl border-4 border-white/20"
        />
        <p className="mt-6 text-white font-bold text-lg">Bienvenue</p>
      </div>
    ) : null;

  // ══════════════════════════════════════════════════════════════════
  // IDLE SCREEN
  // ══════════════════════════════════════════════════════════════════
  if (state === 'idle') return (
    <div className="min-h-screen flex flex-col"
      style={{ background: 'linear-gradient(180deg, rgba(20,184,166,0.10) 0%, #ffffff 35%)' }}>
      <div className="flex items-center justify-between px-8 pt-6">
        <div className="flex items-center gap-6 flex-wrap">
          <StatusDot label="MQTT"  value={sysStatus.mqtt} />
          <StatusDot label="ESP32" value={sysStatus.esp32} />
          <StatusDot label="STM32" value={sysStatus.stm32} />
          {sysStatus.battery !== null && (
            <div className="flex items-center gap-2 text-xs font-bold text-gray-600">
              <BatteryWarning className={`w-4 h-4 ${sysStatus.battery < 20 ? 'text-red-500' : 'text-teal-600'}`} />
              {sysStatus.battery}%
              {sysStatus.rssi != null && <span className="text-gray-400 font-mono">RSSI {sysStatus.rssi}</span>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleDark} aria-label="Changer de thème"
            className="w-9 h-9 rounded-lg flex items-center justify-center border border-gray-200 text-gray-500 hover:text-teal-600 hover:border-teal-400 transition-all">
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          {onSwitchToAdmin && (
            <button onClick={onSwitchToAdmin}
              className="text-xs text-gray-500 hover:text-gray-700 transition-colors px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-400">
              Administration
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-8">
        {/* Branding */}
        <div className="flex items-center gap-4 mb-2">
          <div className="w-16 h-16 bg-teal-500 rounded-2xl flex items-center justify-center shadow-lg shadow-teal-500/25">
            <Bot className="w-9 h-9 text-white" />
          </div>
          <div>
            <h1 className="text-5xl font-black text-gray-900 tracking-tight">MediBot</h1>
            <p className="text-teal-600 text-lg font-semibold">Hôpital de Rouiba · Service de Pédiatrie</p>
          </div>
        </div>

        {/* Pulsing rings */}
        <div className="relative flex items-center justify-center my-4">
          {[1, 2, 3].map(i => (
            <motion.div key={i}
              className="absolute rounded-full border-2 border-teal-400/30"
              initial={{ width: 80, height: 80, opacity: 0.6 }}
              animate={{ width: 80 + i * 70, height: 80 + i * 70, opacity: 0 }}
              transition={{ duration: 2.5, delay: i * 0.6, repeat: Infinity, ease: 'easeOut' }}
            />
          ))}
          <div className="w-28 h-28 rounded-full border-2 border-teal-400 bg-teal-50 flex items-center justify-center shadow-lg">
            <User className="w-12 h-12 text-teal-500" />
          </div>
        </div>

        <div className="text-center">
          <p className="text-2xl font-bold text-gray-700">Approchez votre badge RFID</p>
          <p className="text-gray-500 text-base mt-1">ou contactez l'administration pour accès</p>
        </div>

        <div className="text-center mt-4">
          <p className="text-7xl font-black text-gray-900 font-mono tracking-wider">{formatTime(now)}</p>
          <p className="text-gray-500 text-xl mt-2 capitalize">{formatDate(now)}</p>
        </div>
      </div>
      <SplashOverlay />
    </div>
  );

  // ── SHARED DoctorBar ──────────────────────────────────────────────
  const DoctorBar = () => (
    <div className="bg-white border-b border-gray-200 shadow-sm">
      <div className="flex items-center justify-between px-8 py-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-teal-100 border border-teal-300 flex items-center justify-center text-teal-700 font-black text-sm overflow-hidden">
            {doctor?.photo ? (
              <img src={doctor.photo} alt="" className="w-full h-full object-cover" />
            ) : (
              (doctor ? initials(doctor.name) : '?')
            )}
          </div>
          <div>
            <p className="font-black text-gray-900 text-base leading-tight">{doctor?.name}</p>
            <p className="text-teal-600 text-xs font-semibold">{doctor?.role}</p>
          </div>
          {state !== 'doctor_in' && (
            <div className="flex items-center gap-1 text-gray-400 text-sm ml-4">
              {selectedRoom    && <span className="text-gray-700 font-bold">{selectedRoom.name}</span>}
              {selectedPatient && <><ChevronRight className="w-3 h-3" /><span className="text-gray-700 font-bold">{selectedPatient.full_name}</span></>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-4 mr-4">
            <StatusDot label="MQTT"  value={sysStatus.mqtt} />
            <StatusDot label="ESP32" value={sysStatus.esp32} />
            <StatusDot label="STM32" value={sysStatus.stm32} />
          </div>
          {selectedPatient && (
            <button
              onClick={() => setShowEmergencyConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-red-600 hover:bg-red-700 text-white transition-all text-sm font-black"
            >
              🚨 URGENCE CHARIOT
            </button>
          )}
          {state !== 'doctor_in' && (
            <button onClick={() => {
              resetIdleTimer();
              if (state === 'prescription') {
                visitEndPatientIdRef.current = null;
                if (showNotes) {
                  if (noteTimerRef.current) clearTimeout(noteTimerRef.current);
                  if (noteCountRef.current) clearInterval(noteCountRef.current);
                  setShowNotes(false);
                  setPostNotesDispensedSummary([]);
                  setPostNotesWrapUp(false);
                }
                resetPrescriptionSession();
                setState('room_selected');
                setSelectedPatient(null);
                setMedications([]);
                setDispensedMeds(new Set());
                setMedStatuses({});
              }
              else if (state === 'room_selected') { setState('doctor_in'); setSelectedRoom(null); }
            }}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-gray-600 hover:text-gray-900 border border-gray-300 hover:border-gray-400 transition-all text-sm font-bold">
              <ArrowLeft className="w-4 h-4" /> Retour
            </button>
          )}
          <button onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-gray-500 hover:text-red-600 border border-gray-300 hover:border-red-400 transition-all text-sm font-bold">
            <LogOut className="w-4 h-4" /> Déconnecter
          </button>
        </div>
      </div>
      {sysStatus.battery !== null && (
        <div className={`px-8 pb-3 flex items-center gap-3 text-xs border-t border-gray-100 ${sysStatus.battery < 20 ? 'bg-red-50' : ''}`}>
          <BatteryWarning className={`w-4 h-4 flex-shrink-0 ${sysStatus.battery < 20 ? 'text-red-600' : 'text-teal-600'}`} />
          <span className={`font-bold ${sysStatus.battery < 20 ? 'text-red-700' : 'text-gray-600'}`}>Batterie robot {sysStatus.battery}%</span>
          <div className="flex-1 h-2 bg-gray-200 rounded-full max-w-xs overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${sysStatus.battery < 20 ? 'bg-red-500' : 'bg-teal-500'}`}
              style={{ width: `${Math.min(100, sysStatus.battery)}%` }}
            />
          </div>
          {sysStatus.rssi != null && <span className="text-gray-500 font-mono">WiFi {sysStatus.rssi} dBm</span>}
        </div>
      )}
    </div>
  );

  // ══════════════════════════════════════════════════════════════════
  // ROOM GRID
  // ══════════════════════════════════════════════════════════════════
  if (state === 'doctor_in') return (
    <div className="min-h-screen bg-gray-50 flex flex-col" onPointerDown={resetIdleTimer}>
      <SplashOverlay />
      <DoctorBar />
      <div className="flex-1 p-8">
        <div className="mb-8">
          <h2 className="text-3xl font-black text-gray-900">Sélectionnez une salle</h2>
          <p className="text-gray-500 mt-1">Cycle actuel : <span className="font-bold text-gray-700">{currentCycle} {CYCLE_CONFIG[currentCycle]?.icon}</span></p>
        </div>
        <div className="grid grid-cols-5 gap-4">
          {rooms.map(room => {
            const pct = room.capacity > 0 ? room.occupied / room.capacity : 0;
            const cardClass =
              room.occupied === 0
              ? 'border-gray-200 bg-gray-100 opacity-50 cursor-not-allowed'
              : room.has_alert
              ? 'border-red-400 bg-red-50 hover:border-red-500 hover:bg-red-100'
              : 'border-green-400 bg-green-50 hover:border-green-500 hover:bg-green-100';

            const barColor =
              room.occupied === 0
              ? 'bg-gray-300'
              : room.has_alert
              ? 'bg-red-500'
              : 'bg-green-400';
            return (
              <motion.button key={room.id} whileTap={{ scale: 0.96 }}
                onClick={() => selectRoom(room)}
                className={`relative flex flex-col items-start p-5 rounded-2xl border-2 transition-all min-h-[140px] shadow-sm ${cardClass}`}
                disabled={room.occupied === 0}>
                {room.has_alert && (
                  <div className="absolute top-3 right-3">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                  </div>
                )}
                <p className="text-2xl font-black text-gray-900 mb-auto">{room.name}</p>
                <div className="w-full mt-3">
                  <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className={`h-2 rounded-full transition-all ${barColor}`} style={{ width: `${pct * 100}%` }} />
                  </div>
                  <p className="text-gray-500 text-xs mt-1.5 font-semibold">
                    {room.occupied}/{room.capacity} patient{room.occupied !== 1 ? 's' : ''}
                  </p>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      <AnimatePresence>
        {showLogoutWarn && <LogoutWarning countdown={logoutCountdown} onStay={resetIdleTimer} />}
      </AnimatePresence>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════
  // PATIENT LIST
  // ══════════════════════════════════════════════════════════════════
  if (state === 'room_selected') return (
    <div className="min-h-screen bg-gray-50 flex flex-col" onPointerDown={resetIdleTimer}>
      <SplashOverlay />
      <DoctorBar />
      <div className="flex-1 p-8 max-w-4xl mx-auto w-full">
        <h2 className="text-3xl font-black text-gray-900 mb-6">{selectedRoom?.name} — Patients</h2>
        {patients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <Bed className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-xl font-bold text-gray-500">Salle vide</p>
          </div>
        ) : (
          <div className="space-y-4">
            {patients.map(p => {
              const servedIds: number[] = (() => {
                try { return JSON.parse(sessionStorage.getItem(servedSetKey) || '[]'); }
                catch { return []; }
              })();
              const served = servedIds.includes(p.id) || lastServedPatientId === p.id;
              return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                className={`w-full flex items-stretch rounded-2xl border-2 min-h-[120px] overflow-hidden transition-all shadow-sm
                  ${served
                    ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-300/70 shadow-emerald-200/40'
                    : 'border-gray-200 bg-white hover:border-teal-400 hover:shadow-md'
                  }`}
              >
                <button
                  type="button"
                  title={p.photo ? 'Modifier la photo' : 'Ajouter une photo'}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPhotoModalPatient(p);
                  }}
                  className={`flex-shrink-0 flex flex-col items-center justify-center gap-1 pl-5 pr-3 py-5 transition-colors
                    ${served ? 'bg-emerald-100/80' : 'bg-white hover:bg-gray-50'}`}
                >
                  <div className="relative w-24 h-24 rounded-2xl overflow-hidden border-2 border-gray-200 shadow-sm bg-blue-50 group/photo">
                    {p.photo ? (
                      <>
                        <img src={p.photo} alt="" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/30 transition-colors opacity-0 hover:opacity-100">
                          <Camera className="w-9 h-9 text-white drop-shadow-md" aria-hidden />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-full h-full flex items-center justify-center text-blue-700 font-black text-2xl">
                          {p.full_name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center bg-black/25 hover:bg-black/35 transition-colors">
                          <Camera className="w-10 h-10 text-white drop-shadow-md" aria-hidden />
                        </div>
                      </>
                    )}
                    {!p.photo && (
                      <span className="sr-only">Ouvrir pour prendre ou importer une photo</span>
                    )}
                  </div>
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide max-w-[5.5rem] text-center leading-tight">
                    {p.photo ? 'Photo' : 'Ajouter photo'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => selectPatient(p)}
                  className="flex-1 flex items-center gap-4 py-5 pr-5 text-left min-w-0 group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap mb-1">
                      <p className={`text-2xl font-black ${served ? 'text-emerald-900' : 'text-gray-900'}`}>{p.full_name}</p>
                      {served && (
                        <span className="text-xs font-black px-2.5 py-1 rounded-full bg-emerald-200 text-emerald-900 border border-emerald-400">
                          Dernière visite
                        </span>
                      )}
                      {(missedByPatient[p.id] ?? 0) > 0 && (
                        <span className="text-xs font-black px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                          Prise(s) manquée(s) : {missedByPatient[p.id]}
                        </span>
                      )}
                      <span className="text-sm bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full font-semibold">Lit {p.bed}</span>
                      <span className={`text-sm font-mono font-bold px-2.5 py-0.5 rounded-full ${BLOOD_TYPE_COLORS[p.blood_type_display || p.blood_type] || BLOOD_TYPE_COLORS[p.blood_type] || 'bg-gray-100 text-gray-600'}`}>
                        {p.blood_type_display || p.blood_type}
                      </span>
                    </div>
                    <p className="text-gray-600 text-base">{formatPedAge(p.date_naissance ?? null, p.age)}{p.weight ? ` · ${p.weight}` : ''}</p>
                    <p className="text-teal-600 text-sm font-semibold mt-0.5">{p.diagnostic}</p>
                    {patientKioskHasAllergyAlert(p) && (
                      <div className="flex items-center gap-2 mt-2">
                        <span className="flex items-center gap-1.5 text-xs text-red-700 bg-red-100 border border-red-200 px-2.5 py-1 rounded-full font-bold">
                          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                          Allergies : {patientKioskAllergies(p).join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                  <ChevronRight className={`w-6 h-6 flex-shrink-0 transition-colors ${served ? 'text-emerald-600' : 'text-gray-400 group-hover:text-teal-500'}`} />
                </button>
              </motion.div>
            );})}
          </div>
        )}
      </div>

      <AnimatePresence>
        {validationGate && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/50">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl shadow-2xl max-w-md p-6 border-2 border-amber-400"
            >
              <h3 className="text-lg font-black text-gray-900 mb-2">Ordonnance non validée</h3>
              <p className="text-gray-700 font-semibold mb-2">
                {validationGate.patient.full_name} — statut : <span className="text-amber-700">{validationGate.status}</span>
              </p>
              {validationGate.note && <p className="text-sm text-gray-500 mb-4">{validationGate.note}</p>}
              <p className="text-sm text-gray-600 mb-4">La pharmacie doit approuver l&apos;ordonnance avant distribution au kiosk.</p>
              <button
                type="button"
                onClick={() => setValidationGate(null)}
                className="w-full py-3 rounded-xl bg-teal-600 text-white font-black"
              >
                Retour à la liste
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {photoModalPatient && (
          <PatientPhotoModal
            key={photoModalPatient.id}
            patient={photoModalPatient}
            onClose={() => setPhotoModalPatient(null)}
            onSaved={(b64) => {
              const id = photoModalPatient.id;
              setPatients((prev) => prev.map((x) => (x.id === id ? { ...x, photo: b64 } : x)));
              setPhotoModalPatient(null);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLogoutWarn && <LogoutWarning countdown={logoutCountdown} onStay={resetIdleTimer} />}
      </AnimatePresence>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════
  // PRESCRIPTION
  // ══════════════════════════════════════════════════════════════════
  const robotBusy  = sysStatus.stm32 === 'busy';
  const hasPerms   = !!doctor;
  const robotMeds  = medications.filter((m) => (m.distributed_by_robot ?? 1) === 1);
  const parentMeds = medications.filter((m) => (m.distributed_by_robot ?? 1) === 0);

  const renderMedCard = (med: Medication) => {
    const done = dispensedMeds.has(med.id);
    const lid = medLogIdsRef.current[med.id];
    return (
      <MedCard
        key={med.id}
        med={med}
        isDone={done}
        isActive={!done && isActiveNow(med.schedule)}
        isDispensing={dispensingId === med.id}
        medStatus={done ? 'done' : medStatuses[med.id] || 'idle'}
        allergyWarn={!done && checkAllergyConflict(med)}
        allergyConfirming={allergyConfId === med.id}
        canAct={
          hasPerms &&
          !robotBusy &&
          dispensingId === null &&
          !done &&
          (med.distributed_by_robot ?? 1) === 1
        }
        isHighRisk={(med.is_high_risk ?? 0) === 1}
        pediatricHint={med.pediatric_dose_hint}
        onDispense={() => handleDispense(med)}
        onContinueAnyway={
          !done && medStatuses[med.id] === 'timeout'
            ? () => handleManualCycleComplete(med)
            : undefined
        }
        showValidatePrise={Boolean(done && lid != null && !validatedLogIds.has(lid))}
        onValidatePrise={() => validerPriseMed(med)}
      />
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" onPointerDown={resetIdleTimer}>
      <SplashOverlay />
      <DoctorBar />

      <div className="flex flex-1 flex-col min-h-0 max-w-5xl mx-auto w-full px-8">
      <div className="flex-1 overflow-y-auto py-8 pb-4">

        {vitalsAlert && (
          <div className="mb-5 p-4 bg-red-50 border-2 border-red-300 rounded-xl text-red-800 font-bold">
            {vitalsAlert}
          </div>
        )}

        {/* Patient header */}
        <div className="flex items-start gap-5 mb-6 p-5 bg-white rounded-2xl border border-gray-200 shadow-sm">
          {selectedPatient?.photo ? (
            <img src={selectedPatient.photo} alt={selectedPatient.full_name}
              className="w-24 h-24 rounded-2xl object-cover flex-shrink-0 border-2 border-gray-100 shadow-sm" />
          ) : (
            <div className="w-24 h-24 rounded-2xl bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-700 font-black text-2xl flex-shrink-0">
              {selectedPatient?.full_name.split(' ').map(w => w[0]).join('').slice(0, 2)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-black text-gray-900">{selectedPatient?.full_name}</h2>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="text-sm bg-gray-100 text-gray-700 px-3 py-1 rounded-full font-semibold">{formatPedAge(selectedPatient?.date_naissance ?? null, selectedPatient?.age)}</span>
              {selectedPatient?.weight && <span className="text-sm bg-gray-100 text-gray-700 px-3 py-1 rounded-full font-semibold">{selectedPatient.weight}</span>}
              <span className={`text-sm px-3 py-1 rounded-full font-bold ${BLOOD_TYPE_COLORS[selectedPatient?.blood_type_display || selectedPatient?.blood_type || ''] || 'bg-gray-100 text-gray-700'}`}>
                {selectedPatient?.blood_type_display || selectedPatient?.blood_type}
              </span>
              {selectedPatient?.phenotype_display ? (
                <span className="text-xs font-mono bg-slate-100 text-slate-800 px-3 py-1 rounded-full font-semibold border border-slate-200" title={selectedPatient.phenotype_display}>
                  Phénotype : {selectedPatient.phenotype_display}
                </span>
              ) : null}
              <span className="text-sm bg-teal-100 text-teal-700 px-3 py-1 rounded-full font-semibold">Lit {selectedPatient?.bed}</span>
              <span className="text-sm bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-semibold">{selectedPatient?.diagnostic}</span>
              {formatKioskBirth(selectedPatient?.date_naissance ?? undefined, selectedPatient?.age ?? 0) && (
                <span className="text-sm bg-gray-100 text-gray-700 px-3 py-1 rounded-full font-semibold">
                  {formatKioskBirth(selectedPatient?.date_naissance ?? undefined, selectedPatient?.age ?? 0)}
                </span>
              )}
            </div>
            {selectedPatient?.antecedents?.trim() ? (
              <p className="text-gray-500 text-sm mt-2 truncate" title={selectedPatient.antecedents}>
                <span className="font-bold text-gray-600">Antécédents :</span> {truncateLine(selectedPatient.antecedents, 120)}
              </p>
            ) : null}
            {selectedPatient?.current_treatments && selectedPatient.current_treatments.filter((t) => t.active).length > 0 && (
              <p
                className="text-xs font-bold text-amber-800 bg-amber-100 border border-amber-200 inline-flex mt-2 px-3 py-1 rounded-full"
                title={selectedPatient.current_treatments
                  .filter((t) => t.active)
                  .map((t) => `${t.med_name} (${t.dose || '—'})`)
                  .join(' · ')}
              >
                ⚕ {selectedPatient.current_treatments.filter((t) => t.active).length} traitement(s) en cours
              </p>
            )}
            {selectedPatient?.traitement_en_cours && (
              <p className="text-gray-600 text-sm mt-1"><span className="font-bold">Traitement à l&apos;admission :</span> {selectedPatient.traitement_en_cours}</p>
            )}
            {selectedPatient?.guardian && (
              <p className="text-gray-400 text-sm mt-2">
                Accompagnateur : {selectedPatient.guardian.name} ({selectedPatient.guardian.relationship})
                {selectedPatient.guardian.phone && ` · ${selectedPatient.guardian.phone}`}
              </p>
            )}
          </div>
          <div className="text-right text-sm text-gray-400 flex-shrink-0">
            <p className="font-bold text-gray-600">{currentCycle} {CYCLE_CONFIG[currentCycle]?.icon}</p>
            <p>{formatTime(now)}</p>
          </div>
        </div>

        {selectedPatient && (
          <div className="mb-5">
            <EmergencyPanel patientId={selectedPatient.id} weight={parseWeightKg(selectedPatient.weight || '')} />
          </div>
        )}

        {/* Allergy banner */}
        {selectedPatient && patientKioskHasAllergyAlert(selectedPatient) && (
          <div className="space-y-2 mb-5">
            {((selectedPatient.drug_allergies?.length || 0) > 0 || (selectedPatient.allergies?.length || 0) > 0) && (
              <div className="flex items-center gap-3 p-4 bg-red-50 border-2 border-red-300 rounded-xl">
                <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0" />
                <div>
                  <span className="font-black text-red-700 text-base">⚠️ Allergies médicamenteuses : </span>
                  <span className="text-red-700 font-semibold">
                    {[...new Set([...(selectedPatient.drug_allergies || []), ...selectedPatient.allergies.map(allergyLabel)])].filter(Boolean).join(', ')}
                  </span>
                </div>
              </div>
            )}
            {(selectedPatient.other_allergies?.length || 0) > 0 && (
              <div className="flex items-center gap-3 p-4 bg-amber-50 border-2 border-amber-200 rounded-xl">
                <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0" />
                <div>
                  <span className="font-black text-amber-900 text-base">Autres allergies : </span>
                  <span className="text-amber-900 font-semibold">{selectedPatient.other_allergies!.join(', ')}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {selectedPatient && selectedPatient.age < 18 && (
          <div className="p-4 bg-violet-50 border border-violet-200 rounded-xl mb-5">
            <p className="font-black text-violet-900">Pédiatrie — posologie au poids</p>
            {parseWeightKg(selectedPatient.weight || '') != null && (
              <p className="text-sm text-violet-800 mt-1">
                Poids dossier : {parseWeightKg(selectedPatient.weight || '')} kg — les doses mg/kg issues du stock pharmacie sont calculées sous chaque médicament.
              </p>
            )}
            <p className="text-xs text-violet-600 mt-2">Indicatif — validation médicale obligatoire.</p>
            <p className="text-xs text-gray-500 mt-2 italic">Astuce : confirmez le nom du patient à voix haute avec l&apos;équipe.</p>
          </div>
        )}

        {/* Robot busy banner */}
        {robotBusy && (
          <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-300 rounded-xl mb-5">
            <Loader2 className="w-5 h-5 text-amber-600 animate-spin flex-shrink-0" />
            <span className="font-bold text-amber-700">Robot occupé — veuillez patienter</span>
          </div>
        )}

        {/* Ordonnance — robot vs parents */}
        {medications.length > 0 && (
          <div className="mb-6 space-y-8">
            {robotMeds.length > 0 && (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-xl font-black text-gray-900">Médicaments distribués par le robot</h3>
                    <p className="text-sm text-gray-500 mt-1 font-semibold">
                      Indice cycle :{' '}
                      <span className="text-teal-700">
                        {CYCLE_CONFIG[currentCycle]?.icon} {currentCycle}
                      </span>
                    </p>
                  </div>
                  <span className="text-xs font-bold bg-teal-100 text-teal-800 px-3 py-1.5 rounded-full">
                    {robotMeds.length} ligne{robotMeds.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="space-y-3">{robotMeds.map((med) => renderMedCard(med))}</div>
              </div>
            )}

            {parentMeds.length > 0 && (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-xl font-black text-gray-900">Médicaments administrés par les parents</h3>
                    <p className="text-sm text-gray-500 mt-1 font-semibold">
                      Distribution robot désactivée — suivi manuel
                    </p>
                  </div>
                  <span className="text-xs font-bold bg-gray-200 text-gray-600 px-3 py-1.5 rounded-full">
                    {parentMeds.length} ligne{parentMeds.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="space-y-3">{parentMeds.map((med) => renderMedCard(med))}</div>
              </div>
            )}
          </div>
        )}

        {medications.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <Pill className="w-14 h-14 mb-4 opacity-30" />
            <p className="text-xl font-bold">Aucun médicament prescrit</p>
            <p className="text-sm mt-1">Vérifiez l'ordonnance avec le médecin responsable</p>
          </div>
        )}
      </div>

      {/* Pied d’écran : fin de visite */}
      <div className="shrink-0 sticky bottom-0 border-t border-gray-200 bg-gray-50/95 backdrop-blur-md py-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.06)]">
        <motion.button
          type="button"
          onClick={handleTerminerAvecPatient}
          disabled={showNotes}
          whileTap={{ scale: showNotes ? 1 : 0.99 }}
          className="w-full py-5 rounded-2xl font-black text-lg sm:text-xl transition-all flex items-center justify-center gap-2
            bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/25 border-2 border-emerald-700
            hover:from-emerald-400 hover:to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <CheckCircle2 className="w-6 h-6 shrink-0" />
          Terminer avec ce patient — {selectedPatient?.full_name}
        </motion.button>
        <p className="text-center text-xs text-gray-500 mt-2 font-semibold">
          Ouvre le panneau de notes (suggestions ou passer)
        </p>
      </div>
      </div>

      {/* Drug Interaction Modal */}
      <AnimatePresence>
        {showInteractionModal && (
          <DrugInteractionModal
            interactions={interactions}
            onConfirm={handleInteractionConfirm}
            onCancel={() => {
              setShowInteractionModal(false);
              setPendingMedication(null);
              setSecondValidationNurse(null);
            }}
            currentDoctor={doctor}
            secondValidator={secondValidationNurse}
            onSecondRFIDScan={handleSecondRFIDScan}
            onBackFromRfid={() => setSecondValidationNurse(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {highRiskModalMed && (
          <HighRiskMedModal
            med={highRiskModalMed}
            currentDoctor={doctor}
            secondValidator={highRiskSecond}
            onSecondRFIDScan={handleHighRiskSecondScan}
            onConfirm={handleHighRiskConfirm}
            onCancel={() => {
              setHighRiskModalMed(null);
              setHighRiskSecond(null);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showNotes && (
          <PostNotesSheet
            medName={noteMedName}
            wrapUp={postNotesWrapUp}
            dispensedSummary={postNotesWrapUp ? postNotesDispensedSummary : undefined}
            countdown={noteCountdown}
            onNote={saveNote}
            onClose={() => closeNotes(noteLogId)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLogoutWarn && !showNotes && (
          <LogoutWarning countdown={logoutCountdown} onStay={resetIdleTimer} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showEmergencyConfirm && selectedPatient && (
          <motion.div className="fixed inset-0 z-[260] bg-black/50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }} className="w-full max-w-md rounded-2xl bg-white border border-red-200 shadow-2xl p-6">
              <h3 className="text-xl font-black text-red-700">Déverrouillage urgence</h3>
              <p className="mt-3 text-gray-700">Déverrouiller les tiroirs d'urgence pour {selectedPatient.full_name} ?</p>
              <div className="mt-5 flex gap-3">
                <button type="button" onClick={handleEmergencyDispense} className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black">Confirmer</button>
                <button type="button" onClick={() => setShowEmergencyConfirm(false)} className="flex-1 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold">Annuler</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showVitalsModal && selectedPatient && (
          <motion.div className="fixed inset-0 z-[260] bg-black/50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }} className="w-full max-w-lg rounded-2xl bg-white border border-gray-200 shadow-2xl p-6">
              <h3 className="text-xl font-black text-gray-900">Constantes vitales — {selectedPatient.full_name}</h3>
              <p className="text-sm text-gray-500 mt-1">Optionnel — passez si non disponibles</p>
              <div className="grid grid-cols-2 gap-3 mt-5">
                <label className="text-sm font-bold text-gray-700">Température<input className="mt-1 w-full border rounded-xl px-3 py-2" value={vitalsForm.temperature} onChange={(e) => setVitalsForm((v) => ({ ...v, temperature: e.target.value }))} placeholder="°C" /></label>
                <label className="text-sm font-bold text-gray-700">Fréq. Resp.<input className="mt-1 w-full border rounded-xl px-3 py-2" value={vitalsForm.respiratory_rate} onChange={(e) => setVitalsForm((v) => ({ ...v, respiratory_rate: e.target.value }))} placeholder="/min" /></label>
                <label className="text-sm font-bold text-gray-700">SpO₂<input className="mt-1 w-full border rounded-xl px-3 py-2" value={vitalsForm.spo2} onChange={(e) => setVitalsForm((v) => ({ ...v, spo2: e.target.value }))} placeholder="%" /></label>
                <label className="text-sm font-bold text-gray-700">Glasgow<input className="mt-1 w-full border rounded-xl px-3 py-2" value={vitalsForm.glasgow} onChange={(e) => setVitalsForm((v) => ({ ...v, glasgow: e.target.value }))} placeholder="laisser vide" /></label>
                <label className="text-sm font-bold text-gray-700">Diurèse<select className="mt-1 w-full border rounded-xl px-3 py-2" value={vitalsForm.diuresis} onChange={(e) => setVitalsForm((v) => ({ ...v, diuresis: e.target.value }))}><option value="bonne">Bonne</option><option value="reduite">Réduite</option><option value="absente">Absente</option></select></label>
                <label className="text-sm font-bold text-gray-700">Transit<select className="mt-1 w-full border rounded-xl px-3 py-2" value={vitalsForm.transit} onChange={(e) => setVitalsForm((v) => ({ ...v, transit: e.target.value }))}><option value="normal">Normal</option><option value="diarrhee">Diarrhée</option><option value="constipation">Constipation</option></select></label>
              </div>
              <div className="mt-5 flex gap-3">
                <button type="button" onClick={submitVitals} className="flex-1 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black">Enregistrer</button>
                <button type="button" onClick={skipVitals} className="flex-1 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold">Passer</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showEmergencyFlash && (
          <motion.div className="fixed inset-0 z-[270] bg-red-600" initial={{ opacity: 0 }} animate={{ opacity: 0.85 }} exit={{ opacity: 0 }} />
        )}
      </AnimatePresence>
    </div>
  );
}