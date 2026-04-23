import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTheme } from '@/shared/context/ThemeContext';
import type { PharmaMed, PharmacyAlerts } from '@/shared/types/domain';
import { pharmacyApi } from './pharmacyApi';
import { tc, Modal, Field, Spinner, useInpClass } from './pharmacyUi';

const PHARM_THERAPEUTIC_CLASSES = [
  'Antibiotique — Pénicillines',
  'Antibiotique — Céphalosporines',
  'Antibiotique — Aminosides',
  'Antibiotique — Carbapénèmes',
  'Antibiotique — Polymyxines',
  'Antibiotique — Nitroimidazolés',
  'Antibiotique — Fluoroquinolones',
  'Antibiotique — Antituberculeux',
  'Antalgique / Antipyrétique',
  'Anti-inflammatoire (AINS)',
  'Corticoïde',
  'Bronchodilatateur',
  'Antihistaminique',
  'Psychotrope / Anticonvulsivant',
  'Psychotrope / Stupéfiant',
  'Antiviral',
  'Immunoglobulines IV',
  'Albumine humaine',
  'Anticoagulant',
  'Hémostatique / Vitamine K',
  'Soluté de perfusion',
  'Correcteur électrolytique',
  'Antiseptique',
  'Pansement / Dispositif médical',
  'Gastro-entérologie',
  'Anesthésique local',
  'Anticancéreux / Immunosuppresseur',
  'Enzymothérapie substitutive',
  'Vaccin / Diagnostique',
] as const;

const PHARM_DOSAGE_FORMS = [
  'Solution injectable',
  'Poudre injectable (à reconstituer)',
  'Solution pour perfusion',
  'Comprimé',
  'Gélule',
  'Solution buvable',
  'Sirop',
  'Suspension buvable',
  'Crème / Pommade',
  'Solution dermique',
  'Aérosol',
  'Gouttes',
  'Patch',
  'Dispositif médical',
  'Autre',
] as const;

const PHARM_STORAGE_OPTS = [
  'Température ambiante (< 30°C)',
  'Température ambiante contrôlée (15–25°C)',
  'Température ambiante contrôlée (20–25°C)',
  "À l'abri de la lumière",
  'Réfrigéré (2–8°C)',
  'Congelé (< -15°C)',
] as const;

const PharmacyAlertSection = ({
  title,
  count,
  items,
  onRestock,
}: {
  title: string;
  count: number;
  items: PharmaMed[];
  onRestock: (m: PharmaMed) => void;
}) => {
  const { dark } = useTheme();
  const t = (light: string, dk: string) => tc(light, dk, dark);
  const [open, setOpen] = useState(true);
  return (
    <div className={t('rounded-lg border border-gray-200 overflow-hidden', 'rounded-lg border border-gray-700 overflow-hidden')}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={t(
          'w-full flex items-center justify-between px-4 py-3 font-semibold text-sm bg-gray-100 hover:bg-gray-200 text-gray-900',
          'w-full flex items-center justify-between px-4 py-3 font-semibold text-sm bg-gray-800 hover:bg-gray-700 text-white',
        )}
      >
        <span>{title}</span>
        <span className="flex items-center gap-2">
          <span className={t('text-xs px-2 py-0.5 rounded-full bg-gray-200', 'text-xs px-2 py-0.5 rounded-full bg-gray-700')}>
            {count}
          </span>
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        <table className="w-full text-sm">
          <thead>
            <tr className={t('text-xs text-gray-500 border-b border-gray-200', 'text-xs text-gray-400 border-b border-gray-700')}>
              <th className="px-3 py-2 text-left">Médicament</th>
              <th className="px-3 py-2 text-left">Classe</th>
              <th className="px-3 py-2 text-right">Stock</th>
              <th className="px-3 py-2 text-left">Lot</th>
              <th className="px-3 py-2 text-left">Péremption</th>
              <th className="px-3 py-2 text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.id} className={t('border-b border-gray-100', 'border-b border-gray-700/50')}>
                <td className="px-3 py-2 font-medium">{m.name}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{m.therapeutic_class || '—'}</td>
                <td className="px-3 py-2 text-right font-mono text-red-400">{m.quantity}</td>
                <td className="px-3 py-2">
                  <code className="text-xs">{m.lot_number || '—'}</code>
                </td>
                <td className="px-3 py-2 text-xs text-orange-400">{m.expiry_date || '—'}</td>
                <td className="px-3 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => onRestock(m)}
                    className="px-2 py-1 text-xs bg-green-700 hover:bg-green-600 text-white rounded"
                  >
                    + Réappro
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export function PharmacyView() {
  const { dark } = useTheme();
  const inp = useInpClass();
  const t = (light: string, dk: string) => tc(light, dk, dark);

  const [stock, setStock] = useState<PharmaMed[]>([]);
  const [alerts, setAlerts] = useState<PharmacyAlerts | null>(null);
  const [tab, setTab] = useState<'stock' | 'alertes' | 'psychotropes'>('stock');
  const [search, setSearch] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<PharmaMed | null>(null);
  const [restockTarget, setRestockTarget] = useState<PharmaMed | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [restockQty, setRestockQty] = useState(1);
  const [restockLot, setRestockLot] = useState('');
  const [restockExpiry, setRestockExpiry] = useState('');
  const [restockSupplier, setRestockSupplier] = useState('');
  const [restockDate, setRestockDate] = useState(() => new Date().toISOString().split('T')[0]);

  const [pharmForm, setPharmForm] = useState({
    name: '',
    commercial_name: '',
    therapeutic_class: '',
    dosage_form: 'Solution injectable',
    dosage: '',
    unit: '',
    barcode: '',
    supplier: '',
    quantity: '0',
    min_stock: '10',
    max_stock: '0',
    drawer: '',
    lot_number: '',
    expiry_date: '',
    reception_date: '',
    location: 'Pharmacie',
    storage_condition: PHARM_STORAGE_OPTS[0],
    requires_preparation: false,
    is_psychotropic: false,
    is_cold_chain: false,
    is_restricted_pediatric: false,
    is_high_risk: false,
    pediatric_mg_per_kg: '',
    notes: '',
  });

  const resetPharmForm = () =>
    setPharmForm({
      name: '',
      commercial_name: '',
      therapeutic_class: '',
      dosage_form: 'Solution injectable',
      dosage: '',
      unit: '',
      barcode: '',
      supplier: '',
      quantity: '0',
      min_stock: '10',
      max_stock: '0',
      drawer: '',
      lot_number: '',
      expiry_date: '',
      reception_date: '',
      location: 'Pharmacie',
      storage_condition: PHARM_STORAGE_OPTS[0],
      requires_preparation: false,
      is_psychotropic: false,
      is_cold_chain: false,
      is_restricted_pediatric: false,
      is_high_risk: false,
      pediatric_mg_per_kg: '',
      notes: '',
    });

  const fillPharmForm = (m: PharmaMed) =>
    setPharmForm({
      name: m.name || '',
      commercial_name: m.commercial_name || '',
      therapeutic_class: m.therapeutic_class || '',
      dosage_form:
        m.dosage_form && (PHARM_DOSAGE_FORMS as readonly string[]).includes(m.dosage_form)
          ? m.dosage_form
          : 'Solution injectable',
      dosage: m.dosage || '',
      unit: m.unit || '',
      barcode: m.barcode || '',
      supplier: m.supplier || '',
      quantity: String(m.quantity ?? 0),
      min_stock: String(m.min_stock ?? 10),
      max_stock: String(m.max_stock ?? 0),
      drawer: m.drawer != null ? String(m.drawer) : '',
      lot_number: m.lot_number || '',
      expiry_date: m.expiry_date || '',
      reception_date: m.reception_date || '',
      location: m.location || 'Pharmacie',
      storage_condition:
        m.storage_condition && (PHARM_STORAGE_OPTS as readonly string[]).includes(m.storage_condition)
          ? m.storage_condition
          : PHARM_STORAGE_OPTS[0],
      requires_preparation: m.requires_preparation === 1,
      is_psychotropic: m.is_psychotropic === 1,
      is_cold_chain: m.is_cold_chain === 1,
      is_restricted_pediatric: m.is_restricted_pediatric === 1,
      is_high_risk: m.is_high_risk === 1,
      pediatric_mg_per_kg: m.pediatric_mg_per_kg != null ? String(m.pediatric_mg_per_kg) : '',
      notes: m.notes || '',
    });

  async function loadData() {
    setLoading(true);
    try {
      const [s, a] = await Promise.all([pharmacyApi('/api/pharmacy'), pharmacyApi('/api/pharmacy/alerts')]);
      const list = s as PharmaMed[];
      setStock(list);
      setAlerts(a as PharmacyAlerts);
      const groups = new Set<string>(list.map((m) => m.therapeutic_class || 'Non classé'));
      setExpandedGroups(groups);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (restockTarget) {
      setRestockQty(1);
      setRestockLot('');
      setRestockExpiry(restockTarget.expiry_date || '');
      setRestockSupplier(restockTarget.supplier || '');
      setRestockDate(new Date().toISOString().split('T')[0]);
    }
  }, [restockTarget]);

  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
  const in7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  const filteredStock = stock.filter((m) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      [m.name, m.commercial_name, m.lot_number, m.barcode].some((v) => (v || '').toLowerCase().includes(q));
    const matchClass = !filterClass || (m.therapeutic_class || 'Non classé') === filterClass;
    const matchStatus =
      !filterStatus ||
      (() => {
        if (filterStatus === 'rupture') return m.quantity === 0;
        if (filterStatus === 'critique') return m.quantity < m.min_stock;
        if (filterStatus === 'peremption') return !!(m.expiry_date && m.expiry_date <= in30);
        if (filterStatus === 'froid') return m.is_cold_chain === 1;
        if (filterStatus === 'psychotrope') return m.is_psychotropic === 1;
        return true;
      })();
    return matchSearch && matchClass && matchStatus;
  });

  const groups = filteredStock.reduce(
    (acc, m) => {
      const cls = m.therapeutic_class || 'Non classé';
      if (!acc[cls]) acc[cls] = [];
      acc[cls].push(m);
      return acc;
    },
    {} as Record<string, PharmaMed[]>,
  );

  const sortedGroupKeys = Object.keys(groups).sort((a, b) =>
    a === 'Non classé' ? 1 : b === 'Non classé' ? -1 : a.localeCompare(b, 'fr'),
  );

  const submitPharm = async () => {
    if (!pharmForm.name.trim() || !pharmForm.therapeutic_class.trim() || !pharmForm.dosage_form.trim()) {
      alert('Nom DCI, classe thérapeutique et forme galénique sont obligatoires.');
      return;
    }
    if (!pharmForm.dosage.trim() || !pharmForm.unit.trim()) {
      alert('Dosage unitaire et unité sont obligatoires.');
      return;
    }
    const pedRaw = pharmForm.pediatric_mg_per_kg.trim();
    const pedParsed = pedRaw === '' ? NaN : parseFloat(pedRaw.replace(',', '.'));
    const pediatric_mg_per_kg = Number.isFinite(pedParsed) ? pedParsed : null;
    const body: Record<string, unknown> = {
      name: pharmForm.name.trim(),
      commercial_name: pharmForm.commercial_name.trim() || undefined,
      therapeutic_class: pharmForm.therapeutic_class.trim(),
      dosage_form: pharmForm.dosage_form.trim(),
      dosage: pharmForm.dosage.trim(),
      unit: pharmForm.unit.trim(),
      barcode: pharmForm.barcode.trim() || undefined,
      supplier: pharmForm.supplier.trim() || undefined,
      quantity: parseInt(pharmForm.quantity, 10) || 0,
      min_stock: parseInt(pharmForm.min_stock, 10) || 10,
      max_stock: parseInt(pharmForm.max_stock, 10) || 0,
      drawer: pharmForm.drawer.trim() === '' ? null : parseInt(pharmForm.drawer, 10),
      lot_number: pharmForm.lot_number.trim() || undefined,
      expiry_date: pharmForm.expiry_date || null,
      reception_date: pharmForm.reception_date || undefined,
      location: pharmForm.location.trim() || 'Pharmacie',
      storage_condition: pharmForm.storage_condition,
      requires_preparation: pharmForm.requires_preparation ? 1 : 0,
      is_psychotropic: pharmForm.is_psychotropic ? 1 : 0,
      is_cold_chain: pharmForm.is_cold_chain ? 1 : 0,
      is_restricted_pediatric: pharmForm.is_restricted_pediatric ? 1 : 0,
      is_high_risk: pharmForm.is_high_risk ? 1 : 0,
      pediatric_mg_per_kg,
      notes: pharmForm.notes.trim() || undefined,
    };
    setSaving(true);
    try {
      if (editing) {
        await pharmacyApi(`/api/pharmacy/stock/${editing.id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await pharmacyApi('/api/pharmacy/stock', { method: 'POST', body: JSON.stringify(body) });
      }
      setShowModal(false);
      setEditing(null);
      await loadData();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const alertTabBadge =
    ((alerts?.counts.ruptures ?? 0) + (alerts?.counts.stock_critique ?? 0) + (alerts?.counts.peremption_7j ?? 0) > 0
      ? '🔴'
      : '');

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="p-6 md:p-8 max-w-[100rem] mx-auto">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-4">
        <div>
          <h1 className={t('text-2xl font-black text-gray-900', 'text-2xl font-black text-white')}>Pharmacie — stocks</h1>
          <p className={t('text-sm mt-1 text-gray-600', 'text-sm mt-1 text-gray-400')}>
            Identité produit et stock uniquement (pas de posologie ici).
          </p>
        </div>
      </div>

      {alerts && (
        <div className="flex flex-wrap gap-2 mb-4">
          {alerts.counts.ruptures > 0 && (
            <button
              type="button"
              onClick={() => setTab('alertes')}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-semibold bg-red-600 text-white hover:bg-red-700"
            >
              🔴 {alerts.counts.ruptures} rupture(s)
            </button>
          )}
          {alerts.counts.stock_critique > 0 && (
            <button
              type="button"
              onClick={() => setTab('alertes')}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-semibold bg-orange-500 text-white hover:bg-orange-600"
            >
              🟠 {alerts.counts.stock_critique} stock critique
            </button>
          )}
          {alerts.counts.peremption_7j > 0 && (
            <button
              type="button"
              onClick={() => setTab('alertes')}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-semibold bg-yellow-500 text-white hover:bg-yellow-600"
            >
              🟡 {alerts.counts.peremption_7j} péremption {'<'}7j
            </button>
          )}
          {alerts.counts.peremption_30j > 0 && (
            <button
              type="button"
              onClick={() => setTab('alertes')}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-semibold bg-blue-500 text-white hover:bg-blue-600"
            >
              🔵 {alerts.counts.peremption_30j} péremption {'<'}30j
            </button>
          )}
          {alerts.counts.ruptures === 0 &&
            alerts.counts.stock_critique === 0 &&
            alerts.counts.peremption_7j === 0 &&
            alerts.counts.peremption_30j === 0 && (
              <div className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-semibold bg-green-600 text-white">
                ✓ Stock en ordre
              </div>
            )}
        </div>
      )}

      <div className="flex gap-1 mb-4 border-b border-gray-200 dark:border-gray-700">
        {(
          [
            { key: 'stock' as const, label: '📦 Stock' },
            { key: 'alertes' as const, label: `⚠ Alertes ${alertTabBadge}` },
            { key: 'psychotropes' as const, label: '🔒 Psychotropes' },
          ] as const
        ).map((tb) => (
          <button
            key={tb.key}
            type="button"
            onClick={() => setTab(tb.key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              tab === tb.key
                ? 'bg-blue-600 text-white'
                : t('text-gray-600 hover:text-gray-900 hover:bg-gray-100', 'text-gray-400 hover:text-white hover:bg-gray-700')
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <>
          {tab === 'stock' && (
            <>
              <div className="flex flex-wrap gap-2 mb-4">
                <input
                  placeholder="🔍 Rechercher médicament, lot, code-barres..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={t(
                    'flex-1 min-w-[200px] px-3 py-2 rounded-lg text-sm border border-gray-200 bg-white text-gray-900',
                    'flex-1 min-w-[200px] px-3 py-2 rounded-lg text-sm border border-gray-600 bg-gray-800 text-white',
                  )}
                />
                <select
                  value={filterClass}
                  onChange={(e) => setFilterClass(e.target.value)}
                  className={t(
                    'px-3 py-2 rounded-lg text-sm border border-gray-200 bg-white',
                    'px-3 py-2 rounded-lg text-sm border border-gray-600 bg-gray-800 text-white',
                  )}
                >
                  <option value="">Toutes les classes</option>
                  {[...new Set(stock.map((m) => m.therapeutic_class || 'Non classé'))]
                    .sort((a, b) => a.localeCompare(b, 'fr'))
                    .map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                </select>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className={t(
                    'px-3 py-2 rounded-lg text-sm border border-gray-200 bg-white',
                    'px-3 py-2 rounded-lg text-sm border border-gray-600 bg-gray-800 text-white',
                  )}
                >
                  <option value="">Tous les statuts</option>
                  <option value="rupture">Rupture</option>
                  <option value="critique">Stock critique</option>
                  <option value="peremption">Péremption proche</option>
                  <option value="froid">Chaîne du froid</option>
                  <option value="psychotrope">Psychotropes</option>
                </select>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    resetPharmForm();
                    setShowModal(true);
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
                >
                  + Nouveau médicament
                </button>
              </div>

              {sortedGroupKeys.map((cls) => (
                <div key={cls} className="mb-3">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedGroups((prev) => {
                        const next = new Set(prev);
                        if (next.has(cls)) next.delete(cls);
                        else next.add(cls);
                        return next;
                      })
                    }
                    className={t(
                      'w-full flex items-center justify-between px-4 py-2.5 rounded-lg font-semibold text-sm cursor-pointer bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-900',
                      'w-full flex items-center justify-between px-4 py-2.5 rounded-lg font-semibold text-sm cursor-pointer bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span>{expandedGroups.has(cls) ? '▼' : '▶'}</span>
                      <span>{cls}</span>
                      {groups[cls].some((m) => m.is_cold_chain === 1) && (
                        <span className="text-xs px-1.5 py-0.5 bg-blue-900 text-blue-300 rounded">❄ Froid</span>
                      )}
                      {groups[cls].some((m) => m.is_psychotropic === 1) && (
                        <span className="text-xs px-1.5 py-0.5 bg-purple-900 text-purple-300 rounded">🔒</span>
                      )}
                    </span>
                    <span className={t('text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-700', 'text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-300')}>
                      {groups[cls].length} article{groups[cls].length > 1 ? 's' : ''}
                    </span>
                  </button>

                  {expandedGroups.has(cls) && (
                    <div className="overflow-x-auto mt-1 rounded-b-lg border border-gray-200 dark:border-gray-700 border-t-0">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className={t('text-xs text-gray-500 border-b border-gray-200', 'text-xs text-gray-400 border-b border-gray-700')}>
                            <th className="px-3 py-2 text-left">Médicament</th>
                            <th className="px-3 py-2 text-left">Forme</th>
                            <th className="px-3 py-2 text-left">Dosage</th>
                            <th className="px-3 py-2 text-left">Unité</th>
                            <th className="px-3 py-2 text-left">Lot</th>
                            <th className="px-3 py-2 text-left">Péremption</th>
                            <th className="px-3 py-2 text-right">Stock</th>
                            <th className="px-3 py-2 text-left">Statut</th>
                            <th className="px-3 py-2 text-left">Stockage</th>
                            <th className="px-3 py-2 text-left">Flags</th>
                            <th className="px-3 py-2 text-center">Tiroir</th>
                            <th className="px-3 py-2 text-center">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {groups[cls].map((m) => {
                            const isExpiringSoon = !!(m.expiry_date && m.expiry_date <= in30);
                            const isExpiring7 = !!(m.expiry_date && m.expiry_date <= in7);
                            const stockColor =
                              m.quantity === 0
                                ? 'text-red-400 font-bold'
                                : m.quantity < m.min_stock
                                  ? 'text-orange-400 font-semibold'
                                  : 'text-green-400';
                            const statusBadge =
                              m.quantity === 0
                                ? 'bg-red-900 text-red-300'
                                : m.quantity < m.min_stock
                                  ? 'bg-orange-900 text-orange-300'
                                  : m.quantity < m.min_stock * 2
                                    ? 'bg-yellow-900 text-yellow-300'
                                    : 'bg-green-900 text-green-300';
                            const statusLabel =
                              m.quantity === 0
                                ? 'Rupture'
                                : m.quantity < m.min_stock
                                  ? 'Critique'
                                  : m.quantity < m.min_stock * 2
                                    ? 'Faible'
                                    : 'OK';

                            return (
                              <tr key={m.id} className={t('border-b border-gray-100 hover:bg-gray-50', 'border-b border-gray-700/50 hover:bg-gray-800/50')}>
                                <td className="px-3 py-2">
                                  <div className={t('font-medium text-gray-900', 'font-medium text-white')}>{m.name}</div>
                                  {m.commercial_name && (
                                    <div className="text-xs text-gray-500">{m.commercial_name}</div>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  <span className={t('text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-700', 'text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-300')}>
                                    {m.dosage_form || '—'}
                                  </span>
                                </td>
                                <td className={t('px-3 py-2 text-gray-700', 'px-3 py-2 text-gray-300')}>{m.dosage}</td>
                                <td className="px-3 py-2 text-gray-500 text-xs">{m.unit}</td>
                                <td className="px-3 py-2">
                                  {m.lot_number ? (
                                    <code className={t('text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-800', 'text-xs bg-gray-700 px-1.5 py-0.5 rounded text-gray-300')}>
                                      {m.lot_number}
                                    </code>
                                  ) : (
                                    <span className="text-gray-500">—</span>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  <span className={isExpiring7 ? 'text-red-400 font-semibold' : isExpiringSoon ? 'text-orange-400' : t('text-gray-800', 'text-gray-300')}>
                                    {m.expiry_date || '—'}
                                    {isExpiring7 && <span className="ml-1 text-xs">⚠</span>}
                                  </span>
                                </td>
                                <td className={`px-3 py-2 text-right font-mono ${stockColor}`}>{m.quantity}</td>
                                <td className="px-3 py-2">
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge}`}>{statusLabel}</span>
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-500">
                                  {m.is_cold_chain === 1 ? (
                                    <span className="text-blue-400 font-medium">❄ 2–8°C</span>
                                  ) : m.is_psychotropic === 1 ? (
                                    <span className="text-purple-400">🔒 Sécurisé</span>
                                  ) : (
                                    <span>{(m.storage_condition || '').replace('Température ', 'T° ')}</span>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex gap-1">
                                    {m.is_high_risk === 1 && <span title="Haute vigilance">🔴</span>}
                                    {m.requires_preparation === 1 && <span title="Poudre à reconstituer">⚗</span>}
                                    {m.is_restricted_pediatric === 1 && <span title="Usage restreint pédiatrie">⚠</span>}
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-center text-gray-500 text-xs">{m.drawer ? `[${m.drawer}]` : '—'}</td>
                                <td className="px-3 py-2">
                                  <div className="flex gap-1 justify-center">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditing(m);
                                        fillPharmForm(m);
                                        setShowModal(true);
                                      }}
                                      className="px-2 py-1 text-xs bg-blue-700 hover:bg-blue-600 text-white rounded"
                                    >
                                      ✏
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setRestockTarget(m)}
                                      className="px-2 py-1 text-xs bg-green-700 hover:bg-green-600 text-white rounded"
                                    >
                                      +
                                    </button>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        if (!confirm(`Supprimer ${m.name} ?`)) return;
                                        await pharmacyApi(`/api/pharmacy/${m.id}`, { method: 'DELETE' });
                                        loadData();
                                      }}
                                      className="px-2 py-1 text-xs bg-red-800 hover:bg-red-700 text-white rounded"
                                    >
                                      🗑
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}

              <div
                className={t(
                  'mt-6 p-3 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-600',
                  'mt-6 p-3 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-400',
                )}
              >
                <div className={t('font-semibold text-gray-800 mb-1', 'font-semibold text-gray-300 mb-1')}>Légende des indicateurs</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <span>🔴 Haute vigilance — double validation</span>
                  <span>🔒 Psychotrope / Stupéfiant — armoire sécurisée</span>
                  <span>⚗ Poudre à reconstituer avant injection</span>
                  <span>❄ Chaîne du froid 2–8°C obligatoire</span>
                  <span>⚠ Usage restreint en pédiatrie</span>
                </div>
              </div>
            </>
          )}

          {tab === 'alertes' && alerts && (
            <div className="space-y-4">
              {alerts.counts.ruptures === 0 &&
              alerts.counts.stock_critique === 0 &&
              alerts.counts.peremption_7j === 0 &&
              alerts.counts.peremption_30j === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-green-400">
                  <div className="text-5xl mb-3">✓</div>
                  <div className="text-xl font-semibold">Aucune alerte — stock en ordre</div>
                </div>
              ) : (
                <>
                  {alerts.ruptures.length > 0 && (
                    <PharmacyAlertSection title="🔴 Ruptures de stock" count={alerts.ruptures.length} items={alerts.ruptures} onRestock={setRestockTarget} />
                  )}
                  {alerts.stock_critique.length > 0 && (
                    <PharmacyAlertSection title="🟠 Stock critique" count={alerts.stock_critique.length} items={alerts.stock_critique} onRestock={setRestockTarget} />
                  )}
                  {alerts.peremption_7j.length > 0 && (
                    <PharmacyAlertSection title="🟡 Péremption dans 7 jours" count={alerts.peremption_7j.length} items={alerts.peremption_7j} onRestock={setRestockTarget} />
                  )}
                  {alerts.peremption_30j.length > 0 && (
                    <PharmacyAlertSection
                      title="🔵 Péremption dans 30 jours"
                      count={alerts.peremption_30j.length}
                      items={alerts.peremption_30j}
                      onRestock={setRestockTarget}
                    />
                  )}
                </>
              )}
            </div>
          )}

          {tab === 'psychotropes' && (
            <div>
              <div className="mb-4 p-3 rounded-lg bg-amber-900/30 border border-amber-700 text-amber-300 text-sm">
                🔒 Médicaments psychotropes — dispensation sous double validation obligatoire. Toute distribution est enregistrée automatiquement dans le journal de
                dispensation.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {stock.filter((m) => m.is_psychotropic === 1).length === 0 && (
                  <p className={t('text-gray-600 col-span-full', 'text-gray-400 col-span-full')}>Aucun psychotrope en stock.</p>
                )}
                {stock
                  .filter((m) => m.is_psychotropic === 1)
                  .map((m) => {
                    const isLow = m.quantity < m.min_stock;
                    return (
                      <div
                        key={m.id}
                        className={t(
                          `rounded-xl border p-4 ${isLow ? 'border-red-600 bg-red-50' : 'border-purple-300 bg-white'}`,
                          `rounded-xl border p-4 ${isLow ? 'border-red-600 bg-red-950/30' : 'border-purple-800 bg-gray-800'}`,
                        )}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <div className={t('font-semibold text-gray-900', 'font-semibold text-white')}>{m.name}</div>
                            <div className="text-xs text-gray-500">
                              {m.dosage} · {m.unit}
                            </div>
                          </div>
                          <span className="text-2xl">🔒</span>
                        </div>
                        <div className={`text-3xl font-bold mb-1 ${isLow ? 'text-red-400' : 'text-purple-300'}`}>
                          {m.quantity} <span className="text-sm font-normal text-gray-400">{m.unit}</span>
                        </div>
                        <div className="text-xs text-gray-500 space-y-0.5 mb-3">
                          <div>
                            Lot : <code>{m.lot_number || '—'}</code>
                          </div>
                          <div>Péremption : {m.expiry_date || '—'}</div>
                          <div>Tiroir : {m.drawer ? `[${m.drawer}]` : '—'}</div>
                          <div>Seuil min : {m.min_stock}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setRestockTarget(m)}
                          className="w-full py-1.5 text-xs bg-purple-700 hover:bg-purple-600 text-white rounded-lg"
                        >
                          + Réapprovisionnement
                        </button>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {showModal && (
          <Modal title={editing ? 'Modifier article' : 'Nouveau médicament'} onClose={() => setShowModal(false)} width="max-w-2xl">
            <div className="max-h-[80vh] overflow-y-auto space-y-6 pr-1">
              <div>
                <h4 className={t('text-sm font-black text-gray-800 mb-2', 'text-sm font-black text-gray-200 mb-2')}>🔬 Identification</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="Nom DCI" required>
                    <input className={inp} value={pharmForm.name} onChange={(e) => setPharmForm((f) => ({ ...f, name: e.target.value }))} placeholder="Amoxicilline" />
                  </Field>
                  <Field label="Nom commercial">
                    <input
                      className={inp}
                      value={pharmForm.commercial_name}
                      onChange={(e) => setPharmForm((f) => ({ ...f, commercial_name: e.target.value }))}
                      placeholder="ex: Doliprane®"
                    />
                  </Field>
                  <Field label="Classe thérapeutique" required>
                    <input
                      className={inp}
                      list="classes-list"
                      value={pharmForm.therapeutic_class}
                      onChange={(e) => setPharmForm((f) => ({ ...f, therapeutic_class: e.target.value }))}
                      placeholder="Antibiotique — Pénicillines"
                    />
                    <datalist id="classes-list">
                      {PHARM_THERAPEUTIC_CLASSES.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </Field>
                  <Field label="Forme galénique" required>
                    <select
                      className={inp}
                      value={pharmForm.dosage_form}
                      onChange={(e) => setPharmForm((f) => ({ ...f, dosage_form: e.target.value }))}
                    >
                      {PHARM_DOSAGE_FORMS.map((df) => (
                        <option key={df} value={df}>
                          {df}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Dosage unitaire" required>
                    <input
                      className={inp}
                      value={pharmForm.dosage}
                      onChange={(e) => setPharmForm((f) => ({ ...f, dosage: e.target.value }))}
                      placeholder="500mg, 4mg/2ml..."
                    />
                  </Field>
                  <Field label="Unité" required>
                    <input className={inp} value={pharmForm.unit} onChange={(e) => setPharmForm((f) => ({ ...f, unit: e.target.value }))} placeholder="ampoule, comprimé..." />
                  </Field>
                  <Field label="Code-barres">
                    <input className={inp} value={pharmForm.barcode} onChange={(e) => setPharmForm((f) => ({ ...f, barcode: e.target.value }))} placeholder="EAN / GS1" />
                  </Field>
                  <Field label="Fournisseur">
                    <input
                      className={inp}
                      value={pharmForm.supplier}
                      onChange={(e) => setPharmForm((f) => ({ ...f, supplier: e.target.value }))}
                      placeholder="Saidal, LFB Pharma..."
                    />
                  </Field>
                </div>
              </div>

              <div>
                <h4 className={t('text-sm font-black text-gray-800 mb-2', 'text-sm font-black text-gray-200 mb-2')}>📦 Stock &amp; Emplacement</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="Quantité" required>
                    <input
                      className={inp}
                      type="number"
                      min={0}
                      value={pharmForm.quantity}
                      onChange={(e) => setPharmForm((f) => ({ ...f, quantity: e.target.value }))}
                    />
                  </Field>
                  <Field label="Stock minimum" required>
                    <input
                      className={inp}
                      type="number"
                      min={0}
                      value={pharmForm.min_stock}
                      onChange={(e) => setPharmForm((f) => ({ ...f, min_stock: e.target.value }))}
                    />
                  </Field>
                  <Field label="Stock maximum">
                    <input
                      className={inp}
                      type="number"
                      min={0}
                      value={pharmForm.max_stock}
                      onChange={(e) => setPharmForm((f) => ({ ...f, max_stock: e.target.value }))}
                    />
                  </Field>
                  <Field label="Tiroir robot">
                    <input className={inp} type="number" min={0} value={pharmForm.drawer} onChange={(e) => setPharmForm((f) => ({ ...f, drawer: e.target.value }))} />
                  </Field>
                  <Field label="Numéro de lot">
                    <input
                      className={inp}
                      value={pharmForm.lot_number}
                      onChange={(e) => setPharmForm((f) => ({ ...f, lot_number: e.target.value }))}
                      placeholder="LOT-XXX-AAAA-NN"
                    />
                  </Field>
                  <Field label="Date de péremption">
                    <input className={inp} type="date" value={pharmForm.expiry_date} onChange={(e) => setPharmForm((f) => ({ ...f, expiry_date: e.target.value }))} />
                  </Field>
                  <Field label="Date de réception">
                    <input className={inp} type="date" value={pharmForm.reception_date} onChange={(e) => setPharmForm((f) => ({ ...f, reception_date: e.target.value }))} />
                  </Field>
                  <Field label="Emplacement">
                    <input
                      className={inp}
                      value={pharmForm.location}
                      onChange={(e) => setPharmForm((f) => ({ ...f, location: e.target.value }))}
                      placeholder="Tiroir 1, Réfrigérateur..."
                    />
                  </Field>
                </div>
              </div>

              <div>
                <h4 className={t('text-sm font-black text-gray-800 mb-2', 'text-sm font-black text-gray-200 mb-2')}>🛡 Sécurité &amp; Conservation</h4>
                <Field label="Conditions de conservation">
                  <select
                    className={inp}
                    value={pharmForm.storage_condition}
                    onChange={(e) => setPharmForm((f) => ({ ...f, storage_condition: e.target.value }))}
                  >
                    {PHARM_STORAGE_OPTS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="mt-3 space-y-2 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pharmForm.requires_preparation}
                      onChange={(e) => setPharmForm((f) => ({ ...f, requires_preparation: e.target.checked }))}
                    />
                    Poudre à reconstituer avant administration
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={pharmForm.is_psychotropic} onChange={(e) => setPharmForm((f) => ({ ...f, is_psychotropic: e.target.checked }))} />
                    Psychotrope / Stupéfiant (armoire sécurisée)
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={pharmForm.is_cold_chain} onChange={(e) => setPharmForm((f) => ({ ...f, is_cold_chain: e.target.checked }))} />
                    Chaîne du froid obligatoire (2–8°C)
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pharmForm.is_restricted_pediatric}
                      onChange={(e) => setPharmForm((f) => ({ ...f, is_restricted_pediatric: e.target.checked }))}
                    />
                    Usage restreint en pédiatrie
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={pharmForm.is_high_risk} onChange={(e) => setPharmForm((f) => ({ ...f, is_high_risk: e.target.checked }))} />
                    Haute vigilance (double validation dispensation)
                  </label>
                </div>
                <div className="mt-4">
                  <Field label="Dose pédiatrique indicative (mg/kg)">
                    <input
                      className={inp}
                      type="text"
                      inputMode="decimal"
                      value={pharmForm.pediatric_mg_per_kg}
                      onChange={(e) => setPharmForm((f) => ({ ...f, pediatric_mg_per_kg: e.target.value }))}
                    />
                    <p className="text-xs mt-1 text-gray-500">Valeur indicative — la dose réelle est définie par l&apos;ordonnance</p>
                  </Field>
                </div>
                <div className="mt-3">
                  <Field label="Notes internes">
                    <textarea className={inp} rows={3} value={pharmForm.notes} onChange={(e) => setPharmForm((f) => ({ ...f, notes: e.target.value }))} />
                  </Field>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className={t('flex-1 py-2 rounded-lg border border-gray-300', 'flex-1 py-2 rounded-lg border border-gray-600')}>
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => void submitPharm()}
                  disabled={saving}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50"
                >
                  {saving ? '…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {restockTarget && (
          <Modal title={`Réapprovisionner — ${restockTarget.name}`} onClose={() => setRestockTarget(null)}>
            <div className="space-y-3">
              <Field label="Quantité à ajouter" required>
                <input className={inp} type="number" min={1} required value={restockQty} onChange={(e) => setRestockQty(+e.target.value)} />
              </Field>
              <Field label="Numéro de lot">
                <input className={inp} type="text" placeholder="LOT-XXX-AAAA-NN" value={restockLot} onChange={(e) => setRestockLot(e.target.value)} />
              </Field>
              <Field label="Date de péremption">
                <input className={inp} type="date" value={restockExpiry} onChange={(e) => setRestockExpiry(e.target.value)} />
              </Field>
              <Field label="Fournisseur">
                <input className={inp} type="text" value={restockSupplier} onChange={(e) => setRestockSupplier(e.target.value)} />
              </Field>
              <Field label="Date de réception">
                <input className={inp} type="date" value={restockDate} onChange={(e) => setRestockDate(e.target.value)} />
              </Field>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setRestockTarget(null)} className={t('flex-1 py-2 rounded-lg border border-gray-300', 'flex-1 py-2 rounded-lg border border-gray-600')}>
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await pharmacyApi(`/api/pharmacy/stock/${restockTarget.id}/restock`, {
                      method: 'POST',
                      body: JSON.stringify({
                        quantity: restockQty,
                        lot_number: restockLot || undefined,
                        expiry_date: restockExpiry || undefined,
                        supplier: restockSupplier || undefined,
                        reception_date: restockDate || undefined,
                      }),
                    });
                    setRestockTarget(null);
                    loadData();
                  }}
                  className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium"
                >
                  Enregistrer
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
