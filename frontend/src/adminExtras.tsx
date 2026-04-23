import React, { useState, useEffect, useCallback } from 'react';
import {
  Pill, AlertTriangle, CheckCircle2, XCircle, MessageSquare,
  BarChart3, Activity, RefreshCw,
} from 'lucide-react';

import { api } from '@/shared/lib/api';
import { tc } from '@/shared/lib/themeClasses';

// ── Validation pharmacie (file d'attente) ─────────────────────────────
interface QueueItem {
  patient_id: number;
  full_name: string;
  status: string;
  reviewer?: string;
  med_count: number;
  medications: Array<{ name: string; dosage: string; drawer: number; is_high_risk: number }>;
}

export function PharmacistValidationView({ dark }: { dark: boolean }) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [sel, setSel] = useState<QueueItem | null>(null);
  const [busy, setBusy] = useState(true);
  const [reviewer, setReviewer] = useState('Pharmacien');

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const q = await api('/api/pharmacy/prescription-queue');
      setQueue(q);
      setSel((s) => (s ? q.find((x: QueueItem) => x.patient_id === s.patient_id) || null : q[0] || null));
    } catch {
      setQueue([]);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (status: 'approved' | 'rejected' | 'pending', note?: string) => {
    if (!sel) return;
    await api(`/api/patients/${sel.patient_id}/prescription-validation`, {
      method: 'PUT',
      body: JSON.stringify({ status, reviewer, note: note || '' }),
    });
    await load();
  };

  const card = tc('bg-white border-gray-200', 'bg-gray-800 border-gray-700', dark);

  const statusLabel =
    sel?.status === 'rejected' ? 'Rejetée' : sel?.status === 'approved' ? 'Approuvée' : 'En attente';

  return (
    <div className="p-8 max-w-6xl flex gap-6 h-full min-h-0">
      <div className={`w-80 flex-shrink-0 border rounded-2xl overflow-hidden flex flex-col ${card}`}>
        <div className={`px-4 py-3 border-b font-black ${dark ? 'border-gray-700 text-white' : 'border-gray-100 text-gray-900'}`}>
          File de validation
        </div>
        <div className="flex-1 overflow-y-auto">
          {busy ? (
            <p className="p-4 text-sm text-gray-500">Chargement…</p>
          ) : queue.length === 0 ? (
            <p className="p-4 text-sm text-emerald-600 font-bold">Aucune ordonnance en attente</p>
          ) : (
            queue.map((q) => (
              <button
                key={q.patient_id}
                type="button"
                onClick={() => setSel(q)}
                className={`w-full text-left px-4 py-3 border-b transition-colors ${dark ? 'border-gray-700 hover:bg-gray-700/50' : 'border-gray-100 hover:bg-gray-50'} ${sel?.patient_id === q.patient_id ? (dark ? 'bg-teal-900/30' : 'bg-teal-50') : ''}`}
              >
                <p className={`font-bold ${dark ? 'text-white' : 'text-gray-900'}`}>{q.full_name}</p>
                <p className="text-xs text-gray-500">{q.med_count} médicament(s)</p>
                {(q.medications || []).some((m) => m.is_high_risk) && (
                  <span className="mt-1 inline-block text-[10px] font-black px-2 py-0.5 rounded-full bg-red-600 text-white">URGENT</span>
                )}
              </button>
            ))
          )}
        </div>
        <button
          type="button"
          onClick={load}
          className={`flex items-center justify-center gap-2 py-3 text-sm font-bold border-t ${dark ? 'border-gray-700 text-gray-300' : 'border-gray-100 text-gray-600'}`}
        >
          <RefreshCw className="w-4 h-4" /> Actualiser
        </button>
      </div>

      <div className={`flex-1 border rounded-2xl p-6 overflow-y-auto ${card}`}>
        {!sel ? (
          <p className={`text-center py-20 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Sélectionnez un patient</p>
        ) : (
          <>
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className={`text-2xl font-black ${dark ? 'text-white' : 'text-gray-900'}`}>{sel.full_name}</h2>
                <p className="text-sm text-gray-500">Patient #{sel.patient_id}</p>
              </div>
              <span
                className={`text-xs font-black px-3 py-1 rounded-full ${
                  sel.status === 'rejected'
                    ? 'bg-red-600 text-white'
                    : sel.status === 'approved'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-amber-500 text-black'
                }`}
              >
                {statusLabel}
              </span>
            </div>

            <p className={`text-sm font-bold mb-2 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>Médicaments</p>
            <div className="space-y-2 mb-8">
              {sel.medications.map((m) => (
                <div
                  key={`${m.drawer}-${m.name}`}
                  className={`flex items-center justify-between p-3 rounded-xl border ${dark ? 'border-gray-600 bg-gray-900/40' : 'border-gray-200 bg-gray-50'}`}
                >
                  <div>
                    <p className={`font-bold ${dark ? 'text-white' : 'text-gray-900'}`}>{m.name}</p>
                    <p className="text-xs text-gray-500">{m.dosage} · Tiroir [{m.drawer}]</p>
                  </div>
                  <div className="flex gap-2">
                    {m.is_high_risk ? (
                      <span className="text-xs font-black text-red-600 dark:text-red-400">Haut risque</span>
                    ) : null}
                    <AlertTriangle className="w-4 h-4 text-amber-500 opacity-50" />
                  </div>
                </div>
              ))}
            </div>

            <label className={`block text-xs font-bold mb-1 ${dark ? 'text-gray-400' : 'text-gray-600'}`}>Validateur</label>
            <input
              value={reviewer}
              onChange={(e) => setReviewer(e.target.value)}
              className={`w-full mb-6 px-3 py-2 rounded-xl border ${dark ? 'bg-gray-900 border-gray-600 text-white' : 'bg-white border-gray-200'}`}
            />

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => decide('approved')}
                className="min-h-[48px] px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black flex items-center gap-2"
              >
                <CheckCircle2 className="w-5 h-5" /> Approuver
              </button>
              <button
                type="button"
                onClick={() => decide('rejected')}
                className="min-h-[48px] px-6 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black flex items-center gap-2"
              >
                <XCircle className="w-5 h-5" /> Rejeter
              </button>
              <button
                type="button"
                onClick={() => decide('pending', 'Demande de clarification')}
                className="min-h-[48px] px-6 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white font-bold flex items-center gap-2"
              >
                <MessageSquare className="w-5 h-5" /> Demander clarification
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Interactions médicamenteuses (admin) ────────────────────────────
interface DiRow {
  id: number;
  drug_a: string;
  drug_b: string;
  severity: string;
  consequence: string;
}

const sevLabel = (s: string) => {
  if (s === 'contre_indiquee') return 'CONTRE-INDIQUÉE';
  if (s === 'deconseillee') return 'DÉCONSEILLÉE';
  return 'PRÉCAUTION';
};

export function DrugInteractionsAdminView({ dark }: { dark: boolean }) {
  const [rows, setRows] = useState<DiRow[]>([]);
  const [form, setForm] = useState({ drug_a: '', drug_b: '', severity: 'precaution', consequence: '' });
  const [editId, setEditId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api('/api/drug-interactions'));
    } catch {
      setRows([]);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!form.drug_a || !form.drug_b) return;
    if (editId) {
      await api(`/api/drug-interactions/${editId}`, {
        method: 'PUT',
        body: JSON.stringify(form),
      });
    } else {
      await api('/api/drug-interactions', { method: 'POST', body: JSON.stringify(form) });
    }
    setForm({ drug_a: '', drug_b: '', severity: 'precaution', consequence: '' });
    setEditId(null);
    await load();
  };

  const del = async (id: number) => {
    if (!confirm('Supprimer cette interaction ?')) return;
    await api(`/api/drug-interactions/${id}`, { method: 'DELETE' });
    await load();
  };

  const inp = dark
    ? 'bg-gray-900 border-gray-600 text-white rounded-lg px-3 py-2 w-full'
    : 'bg-white border-gray-200 rounded-lg px-3 py-2 w-full';

  return (
    <div className={`p-8 max-w-5xl ${dark ? 'text-white' : ''}`}>
      <h1 className="text-2xl font-black mb-6 flex items-center gap-2">
        <Pill className="w-7 h-7 text-teal-500" /> Base interactions médicamenteuses
      </h1>

      <div className={`border rounded-2xl p-4 mb-6 ${dark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
        <p className="font-bold mb-3">{editId ? `Modifier #${editId}` : 'Nouvelle paire'}</p>
        <div className="grid grid-cols-2 gap-3">
          <input className={inp} placeholder="Médicament A" value={form.drug_a} onChange={(e) => setForm((f) => ({ ...f, drug_a: e.target.value }))} />
          <input className={inp} placeholder="Médicament B" value={form.drug_b} onChange={(e) => setForm((f) => ({ ...f, drug_b: e.target.value }))} />
          <select className={inp} value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}>
            <option value="contre_indiquee">Contre-indiquée</option>
            <option value="deconseillee">Déconseillée</option>
            <option value="precaution">Précaution</option>
          </select>
          <input className={inp} placeholder="Conséquence" value={form.consequence} onChange={(e) => setForm((f) => ({ ...f, consequence: e.target.value }))} />
        </div>
        <div className="flex gap-2 mt-3">
          <button type="button" onClick={save} className="px-4 py-2 rounded-xl bg-teal-600 text-white font-bold">
            {editId ? 'Mettre à jour' : 'Ajouter'}
          </button>
          {editId && (
            <button
              type="button"
              onClick={() => {
                setEditId(null);
                setForm({ drug_a: '', drug_b: '', severity: 'precaution', consequence: '' });
              }}
              className="px-4 py-2 rounded-xl border border-gray-400 font-bold"
            >
              Annuler
            </button>
          )}
        </div>
      </div>

      <div className={`border rounded-2xl overflow-hidden ${dark ? 'border-gray-700' : 'border-gray-200'}`}>
        <table className="w-full text-sm">
          <thead className={dark ? 'bg-gray-900' : 'bg-gray-50'}>
            <tr>
              <th className="text-left p-3">A</th>
              <th className="text-left p-3">B</th>
              <th className="text-left p-3">Sévérité</th>
              <th className="text-left p-3">Conséquence</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={dark ? 'border-t border-gray-700' : 'border-t border-gray-100'}>
                <td className="p-3 font-bold">{r.drug_a}</td>
                <td className="p-3 font-bold">{r.drug_b}</td>
                <td className="p-3">{sevLabel(r.severity)}</td>
                <td className="p-3">{r.consequence}</td>
                <td className="p-3 flex gap-2">
                  <button
                    type="button"
                    className="text-teal-500 font-bold"
                    onClick={() => {
                      setEditId(r.id);
                      setForm({ drug_a: r.drug_a, drug_b: r.drug_b, severity: r.severity, consequence: r.consequence });
                    }}
                  >
                    Éditer
                  </button>
                  <button type="button" className="text-red-500 font-bold" onClick={() => del(r.id)}>
                    Suppr
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Analytics (graphiques CSS) ───────────────────────────────────────
export function AnalyticsDashboardView({ dark }: { dark: boolean }) {
  const [days, setDays] = useState(14);
  const [data, setData] = useState<{
    dispenses_by_day: Array<{ d: string; c: number }>;
    top_medications: Array<{ med_name: string; c: number }>;
    mqtt_success_pct: number;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api(`/api/analytics?days=${days}`));
    } catch {
      setData(null);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const maxBar = Math.max(1, ...(data?.dispenses_by_day.map((x) => x.c) || [1]));

  return (
    <div className={`p-8 max-w-6xl ${dark ? 'text-white' : ''}`}>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-black flex items-center gap-2">
          <BarChart3 className="w-7 h-7 text-teal-500" /> Analytique
        </h1>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className={`rounded-xl px-3 py-2 border ${dark ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'}`}
        >
          {[7, 14, 30].map((d) => (
            <option key={d} value={d}>
              {d} jours
            </option>
          ))}
        </select>
      </div>

      {!data ? (
        <p>Chargement…</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className={`border rounded-2xl p-5 ${dark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
            <p className="font-bold mb-4">Distributions / jour</p>
            <div className="flex items-end gap-1 h-48">
              {data.dispenses_by_day.map((x) => (
                <div key={x.d} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full bg-teal-500 rounded-t transition-all min-h-[4px]"
                    style={{ height: `${(x.c / maxBar) * 100}%` }}
                    title={`${x.d}: ${x.c}`}
                  />
                  <span className="text-[9px] text-gray-500 truncate w-full text-center">{x.d.slice(5)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={`border rounded-2xl p-5 ${dark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
            <p className="font-bold mb-4">Top médicaments</p>
            <ul className="space-y-2">
              {data.top_medications.map((m) => (
                <li key={m.med_name} className="flex justify-between">
                  <span>{m.med_name}</span>
                  <span className="font-mono font-bold text-teal-500">{m.c}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-500" />
              <span className="text-sm">MQTT OK :</span>
              <span className="font-black text-emerald-500">{data.mqtt_success_pct}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Rapport de relève ───────────────────────────────────────────────
export function ShiftReportView({ dark }: { dark: boolean }) {
  const [shift, setShift] = useState('Matin');
  const [rep, setRep] = useState<{
    shift: string;
    date: string;
    distributions_today: number;
    patients_snapshot?: unknown[];
    log_today?: unknown[];
  } | null>(null);

  useEffect(() => {
    fetch(`/api/shift-report?shift=${encodeURIComponent(shift)}`)
      .then((r) => r.json())
      .then(setRep)
      .catch(() => setRep(null));
  }, [shift]);

  return (
    <div className={`p-8 max-w-4xl ${dark ? 'text-white' : ''}`}>
      <h1 className="text-2xl font-black mb-4">Rapport de relève</h1>
      <select
        value={shift}
        onChange={(e) => setShift(e.target.value)}
        className={`mb-6 rounded-xl px-3 py-2 border ${dark ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'}`}
      >
        {['Matin', 'Après-midi', 'Nuit'].map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {rep && (
        <div className={`border rounded-2xl p-6 ${dark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
          <p className="text-lg font-bold">Distributions aujourd&apos;hui : {rep.distributions_today}</p>
          <p className="text-sm text-gray-500 mt-2">Date : {rep.date}</p>
          <p className="text-sm text-gray-500">Équipe : {rep.shift}</p>
          <button
            type="button"
            onClick={() => window.print()}
            className="mt-4 px-4 py-2 rounded-xl bg-teal-600 text-white font-bold"
          >
            Imprimer / PDF
          </button>
        </div>
      )}
    </div>
  );
}
