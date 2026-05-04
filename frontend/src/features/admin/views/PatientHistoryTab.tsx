import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Clock, Pill, CheckCircle2, XCircle, AlertTriangle,
  HelpCircle, ChevronLeft, ChevronRight, Download, RefreshCw,
  User, Inbox,
} from 'lucide-react';
import { useTheme } from '@/shared/context/ThemeContext';

// ── Types ────────────────────────────────────────────────────────
interface HistoryEntry {
  id: number;
  timestamp: string;
  med_name: string;
  drawer: number;
  doctor?: string | null;
  mqtt_sent: number;
  note?: string | null;
  waste_reason?: string | null;
  waste_detail?: string | null;
  dose_status?: string | null;
  prise_confirmed_at?: string | null;
  prise_confirmed_by?: string | null;
  patient_name?: string | null;
  dosage?: string | null;
  unit?: string | null;
}

interface PatientHistoryTabProps {
  patientId: number;
  patientName: string;
  canExport?: boolean; // true for CHEF_SERVICE
}

// ── Dose status config ──────────────────────────────────────────
type StatusKey = 'prise_confirmee' | 'refuse' | 'vomi' | 'manquant' | 'pending';

const STATUS_CONFIG: Record<StatusKey, { label: string; icon: React.ReactNode; bg: string; text: string; border: string }> = {
  prise_confirmee: {
    label: 'Pris ✓',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-300 dark:border-emerald-700',
  },
  refuse: {
    label: 'Refusé',
    icon: <XCircle className="w-3.5 h-3.5" />,
    bg: 'bg-red-100 dark:bg-red-900/30',
    text: 'text-red-700 dark:text-red-300',
    border: 'border-red-300 dark:border-red-700',
  },
  vomi: {
    label: 'Vomi',
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
    bg: 'bg-orange-100 dark:bg-orange-900/30',
    text: 'text-orange-700 dark:text-orange-300',
    border: 'border-orange-300 dark:border-orange-700',
  },
  manquant: {
    label: 'Manquant',
    icon: <HelpCircle className="w-3.5 h-3.5" />,
    bg: 'bg-yellow-100 dark:bg-yellow-900/30',
    text: 'text-yellow-700 dark:text-yellow-300',
    border: 'border-yellow-300 dark:border-yellow-700',
  },
  pending: {
    label: 'En attente',
    icon: <Clock className="w-3.5 h-3.5" />,
    bg: 'bg-gray-100 dark:bg-gray-800',
    text: 'text-gray-500 dark:text-gray-400',
    border: 'border-gray-300 dark:border-gray-600',
  },
};

function getStatusKey(entry: HistoryEntry): StatusKey {
  const s = entry.dose_status?.toLowerCase() ?? '';
  if (s === 'prise_confirmee' || s === 'prise confirmée') return 'prise_confirmee';
  if (s.includes('refus')) return 'refuse';
  if (s.includes('vomi')) return 'vomi';
  if (s.includes('manquant') || entry.waste_reason) return 'manquant';
  return 'pending';
}

function StatusBadge({ entry }: { entry: HistoryEntry }) {
  const key = getStatusKey(entry);
  const cfg = STATUS_CONFIG[key];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-bold ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function formatDate(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return ts;
  }
}

const PAGE_SIZE = 15;

// ── Main Component ───────────────────────────────────────────────
export const PatientHistoryTab: React.FC<PatientHistoryTabProps> = ({
  patientId,
  patientName,
  canExport = false,
}) => {
  const { dark } = useTheme();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const offset = p * PAGE_SIZE;
      const res = await fetch(`/api/patients/${patientId}/history?limit=${PAGE_SIZE}&offset=${offset}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setEntries(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (e: any) {
      setError(String(e?.message ?? 'Erreur de chargement'));
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    setPage(0);
    load(0);
  }, [patientId, load]);

  const goTo = (p: number) => {
    const clamped = Math.max(0, Math.min(p, totalPages - 1));
    setPage(clamped);
    load(clamped);
  };

  // ── CSV Export ─────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true);
    try {
      // Fetch all records for this patient (up to 1000)
      const res = await fetch(`/api/patients/${patientId}/history?limit=1000&offset=0`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const all: HistoryEntry[] = data.items ?? [];

      const headers = ['Date/Heure', 'Médicament', 'Dosage', 'Tiroir', 'Statut Dose', 'Confirmé par', 'Confirmé le', 'Note', 'Raison Déchet'];
      const rows = all.map((e) => [
        formatDate(e.timestamp),
        e.med_name,
        e.dosage ? `${e.dosage} ${e.unit ?? ''}`.trim() : '',
        e.drawer,
        STATUS_CONFIG[getStatusKey(e)].label,
        e.prise_confirmed_by ?? '',
        e.prise_confirmed_at ? formatDate(e.prise_confirmed_at) : '',
        e.note ?? '',
        e.waste_reason ?? '',
      ]);

      const csv = [headers, ...rows]
        .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
        .join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `historique_${patientName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert('Export échoué: ' + String(e?.message));
    } finally {
      setExporting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────
  const cardBg = dark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const rowHover = dark ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50';
  const textMain = dark ? 'text-white' : 'text-gray-900';
  const textMuted = dark ? 'text-gray-400' : 'text-gray-500';
  const headBg = dark ? 'bg-gray-900/60' : 'bg-gray-50';
  const divider = dark ? 'divide-gray-700' : 'divide-gray-100';

  return (
    <div className="flex flex-col gap-4 py-2">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-teal-500" />
          <span className={`text-sm font-bold ${textMain}`}>
            Historique des dispensations
          </span>
          {total > 0 && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${dark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
              {total} entrée{total > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load(page)}
            disabled={loading}
            className={`p-1.5 rounded-lg transition-colors ${
              dark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
            } disabled:opacity-50`}
            title="Actualiser"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {canExport && (
            <button
              onClick={handleExport}
              disabled={exporting || total === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              {exporting ? 'Export…' : 'CSV'}
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Table */}
      <div className={`rounded-xl border overflow-hidden ${cardBg}`}>
        {/* Table header */}
        <div className={`grid grid-cols-[1fr_1fr_auto_auto_1fr] gap-0 px-4 py-2.5 text-xs font-bold uppercase tracking-wide ${textMuted} ${headBg} border-b ${
          dark ? 'border-gray-700' : 'border-gray-200'
        }`}>
          <span>Date / Heure</span>
          <span>Médicament</span>
          <span className="text-center">Tiroir</span>
          <span className="text-center">Statut</span>
          <span>Confirmé par</span>
        </div>

        {/* Table body */}
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center py-12"
            >
              <RefreshCw className="w-5 h-5 animate-spin text-teal-500" />
              <span className={`ml-2 text-sm ${textMuted}`}>Chargement…</span>
            </motion.div>
          ) : entries.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-14 gap-3"
            >
              <Inbox className={`w-10 h-10 ${textMuted}`} />
              <p className={`text-sm font-semibold ${textMuted}`}>Aucun antécédent de dispensation</p>
              <p className={`text-xs ${textMuted}`}>Les dispensations apparaîtront ici automatiquement.</p>
            </motion.div>
          ) : (
            <motion.div
              key={`page-${page}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`divide-y ${divider}`}
            >
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className={`grid grid-cols-[1fr_1fr_auto_auto_1fr] gap-0 px-4 py-3 items-center transition-colors ${rowHover}`}
                >
                  {/* Date */}
                  <div className="flex items-center gap-1.5">
                    <Clock className={`w-3.5 h-3.5 shrink-0 ${textMuted}`} />
                    <span className={`text-xs font-mono ${textMuted}`}>
                      {formatDate(entry.timestamp)}
                    </span>
                  </div>

                  {/* Med name */}
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className={`text-sm font-bold truncate ${textMain}`}>
                      {entry.med_name}
                    </span>
                    {entry.dosage && (
                      <span className={`text-xs ${textMuted}`}>
                        {entry.dosage} {entry.unit ?? ''}
                      </span>
                    )}
                  </div>

                  {/* Drawer */}
                  <div className="flex justify-center">
                    <span className={`text-xs font-mono px-2 py-0.5 rounded-md font-bold ${
                      dark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
                    }`}>
                      T{entry.drawer}
                    </span>
                  </div>

                  {/* Status */}
                  <div className="flex justify-center">
                    <StatusBadge entry={entry} />
                  </div>

                  {/* Confirmed by */}
                  <div className="flex flex-col gap-0.5 min-w-0 pl-2">
                    {entry.prise_confirmed_by ? (
                      <>
                        <span className={`flex items-center gap-1 text-xs font-semibold truncate ${textMain}`}>
                          <User className="w-3 h-3 shrink-0" />
                          {entry.prise_confirmed_by}
                        </span>
                        {entry.prise_confirmed_at && (
                          <span className={`text-[11px] font-mono ${textMuted}`}>
                            {formatDate(entry.prise_confirmed_at)}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className={`text-xs italic ${textMuted}`}>—</span>
                    )}
                    {entry.note && (
                      <span className={`text-[11px] italic truncate ${textMuted}`} title={entry.note}>
                        💬 {entry.note}
                      </span>
                    )}
                    {entry.waste_reason && (
                      <span className={`text-[11px] font-semibold text-orange-500`} title={entry.waste_detail ?? ''}>
                        ⚠ {entry.waste_reason}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className={`text-xs ${textMuted}`}>
            Page {page + 1} / {totalPages} — {total} entrée{total > 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => goTo(page - 1)}
              disabled={page === 0 || loading}
              className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                dark ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'
              }`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(0, Math.min(page - 2, totalPages - 5));
              const p = start + i;
              return (
                <button
                  key={p}
                  onClick={() => goTo(p)}
                  disabled={loading}
                  className={`w-7 h-7 text-xs font-bold rounded-lg transition-colors ${
                    p === page
                      ? 'bg-teal-600 text-white'
                      : dark
                        ? 'hover:bg-gray-700 text-gray-400'
                        : 'hover:bg-gray-100 text-gray-600'
                  }`}
                >
                  {p + 1}
                </button>
              );
            })}
            <button
              onClick={() => goTo(page + 1)}
              disabled={page >= totalPages - 1 || loading}
              className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                dark ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'
              }`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PatientHistoryTab;
