/**
 * DISCHARGE MODAL — End of stay (Fin de séjour)
 * Replaces the delete button with a proper discharge workflow
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, AlertTriangle, Printer } from 'lucide-react';
import { useTheme } from '@/shared/context/ThemeContext';

interface DischargeModalProps {
  open: boolean;
  patient: { id: number; full_name: string; weight?: string };
  onClose: () => void;
  onDischarge: (data: any) => Promise<void>;
}

export const DischargeModal: React.FC<DischargeModalProps> = ({ open, patient, onClose, onDischarge }) => {
  const { dark } = useTheme();
  const inp = `w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 transition-all ${
    dark
      ? 'bg-gray-800 border-gray-600 text-white focus:border-teal-400 focus:ring-teal-900 placeholder-gray-500'
      : 'bg-white border-gray-200 text-gray-900 focus:border-teal-400 focus:ring-teal-100'
  }`;

  const [form, setForm] = useState({
    type_sortie: 'autorisee' as 'autorisee' | 'transfert' | 'scam' | 'deces',
    transfert_destination: '',
    diagnostic_sortie: '',
    resume_clinique: '',
    traitement_sortie: '',
    consignes_parents: '',
    rdv_controle: '',
    medecin_sortie: '',
    scam_signature: false,
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deceasedConfirm, setDeceasedConfirm] = useState(false);

  const handleDischarge = async () => {
    if (!form.diagnostic_sortie || !form.medecin_sortie) {
      setError('Le diagnostic final et le médecin sont requis');
      return;
    }

    if (form.type_sortie === 'transfert' && !form.transfert_destination) {
      setError('Veuillez indiquer la destination du transfert');
      return;
    }

    if (form.type_sortie === 'scam' && !form.scam_signature) {
      setError('Veuillez confirmer l\'avertissement SCAM');
      return;
    }

    if (form.type_sortie === 'deces' && !deceasedConfirm) {
      setError('Veuillez confirmer l\'enregistrement du décès');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await onDischarge({
        type_sortie: form.type_sortie,
        transfert_destination: form.transfert_destination || undefined,
        diagnostic_sortie: form.diagnostic_sortie,
        resume_clinique: form.resume_clinique,
        traitement_sortie: form.traitement_sortie,
        consignes_parents: form.consignes_parents,
        rdv_controle: form.rdv_controle || undefined,
        medecin_sortie: form.medecin_sortie,
        scam_signature: form.scam_signature,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la sortie');
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    const content = `
COMPTE-RENDU DE SORTIE
═════════════════════════

Patient: ${patient.full_name}
Diagnostic final: ${form.diagnostic_sortie}
Type de sortie: ${form.type_sortie}
Médecin: ${form.medecin_sortie}

Résumé clinique:
${form.resume_clinique}

Traitement de sortie:
${form.traitement_sortie}

Consignes aux parents:
${form.consignes_parents}

RDV de contrôle:
${form.rdv_controle || '—'}

Date: ${new Date().toLocaleDateString('fr-FR')}
    `;
    const win = window.open('', '', 'width=800,height=600');
    if (win) {
      win.document.write(`<pre style="font-family: monospace; white-space: pre-wrap;">${content}</pre>`);
      win.document.close();
      win.print();
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className={`rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto ${
            dark ? 'bg-gray-900 border border-gray-700' : 'bg-white'
          }`}
        >
          {/* Header */}
          <div
            className={`flex items-center justify-between px-6 py-4 border-b ${
              dark ? 'border-gray-700' : 'border-gray-100'
            }`}
          >
            <h3 className={`font-black text-lg ${dark ? 'text-white' : 'text-gray-900'}`}>
              Fin de séjour — {patient.full_name}
            </h3>
            <button
              onClick={onClose}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                dark
                  ? 'bg-gray-800 hover:bg-gray-700 text-gray-400'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-500'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-6 space-y-5">
            {/* TYPE DE SORTIE */}
            <div>
              <label className={`block text-sm font-bold mb-3 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
                Type de sortie *
              </label>
              <div className="space-y-2">
                {[
                  { value: 'autorisee', label: '🏠 Sortie autorisée (guéri / amélioration)', desc: 'Le patient retourne à domicile' },
                  {
                    value: 'transfert',
                    label: '🏥 Transfert vers un autre établissement',
                    desc: 'Transfert vers un autre service ou hôpital',
                  },
                  { value: 'scam', label: '⚠️ SCAM (Contre-avis médical)', desc: 'Les parents partent contre avis médical' },
                  { value: 'deces', label: '🕊️ Décès', desc: 'Décès pendant l\'hospitalization' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setForm(f => ({ ...f, type_sortie: opt.value as any }))}
                    className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                      form.type_sortie === opt.value
                        ? dark
                          ? 'bg-teal-900/40 border-teal-600 border-2'
                          : 'bg-teal-50 border-teal-400'
                        : dark
                          ? 'bg-gray-800 border-gray-700'
                          : 'bg-white border-gray-200'
                    }`}
                  >
                    <p className={`font-bold ${form.type_sortie === opt.value ? (dark ? 'text-teal-200' : 'text-teal-700') : dark ? 'text-white' : 'text-gray-900'}`}>
                      {opt.label}
                    </p>
                    <p className={`text-xs mt-0.5 ${form.type_sortie === opt.value ? (dark ? 'text-teal-300' : 'text-teal-600') : dark ? 'text-gray-400' : 'text-gray-600'}`}>
                      {opt.desc}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* TRANSFERT DESTINATION */}
            {form.type_sortie === 'transfert' && (
              <div>
                <label className={`block text-sm font-bold mb-1.5 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Destination du transfert *
                </label>
                <input
                  className={inp}
                  value={form.transfert_destination}
                  onChange={e => setForm(f => ({ ...f, transfert_destination: e.target.value }))}
                  placeholder="Service de pédiatrie, CHU de Blida, etc."
                />
              </div>
            )}

            {/* DIAGNOSTIC FINAL */}
            <div>
              <label className={`block text-sm font-bold mb-1.5 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
                Diagnostic final *
              </label>
              <input
                className={inp}
                value={form.diagnostic_sortie}
                onChange={e => setForm(f => ({ ...f, diagnostic_sortie: e.target.value }))}
                placeholder="Ex. Pneumonie communautaire résolutive"
              />
            </div>

            {/* RESUME CLINIQUE */}
            <div>
              <label className={`block text-sm font-bold mb-1.5 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
                Résumé clinique du séjour
              </label>
              <textarea
                className={inp}
                rows={3}
                value={form.resume_clinique}
                onChange={e => setForm(f => ({ ...f, resume_clinique: e.target.value }))}
                placeholder="Évolution de l'état du patient..."
              />
            </div>

            {/* TRAITEMENT DE SORTIE */}
            <div>
              <label className={`block text-sm font-bold mb-1.5 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
                Traitement de sortie (ordonnance)
              </label>
              <textarea
                className={inp}
                rows={2}
                value={form.traitement_sortie}
                onChange={e => setForm(f => ({ ...f, traitement_sortie: e.target.value }))}
                placeholder="Médicaments à continuer à domicile..."
              />
            </div>

            {/* CONSIGNES */}
            <div>
              <label className={`block text-sm font-bold mb-1.5 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
                Consignes aux parents
              </label>
              <textarea
                className={inp}
                rows={2}
                value={form.consignes_parents}
                onChange={e => setForm(f => ({ ...f, consignes_parents: e.target.value }))}
                placeholder="Hygiène, alimentation, activité, surveiller..."
              />
            </div>

            {/* RDV CONTROLE */}
            <div>
              <label className={`block text-sm font-bold mb-1.5 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
                Rendez-vous de contrôle (optionnel)
              </label>
              <input
                className={inp}
                value={form.rdv_controle}
                onChange={e => setForm(f => ({ ...f, rdv_controle: e.target.value }))}
                placeholder="Ex. Pédiatrie — 2 semaines"
              />
            </div>

            {/* MEDECIN SORTIE */}
            <div>
              <label className={`block text-sm font-bold mb-1.5 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
                Médecin rédacteur du CRS *
              </label>
              <input
                className={inp}
                value={form.medecin_sortie}
                onChange={e => setForm(f => ({ ...f, medecin_sortie: e.target.value }))}
                placeholder="Nom et prénom du médecin"
              />
            </div>

            {/* SCAM CONFIRMATION */}
            {form.type_sortie === 'scam' && (
              <div
                className={`p-4 rounded-xl border-2 flex items-start gap-3 ${
                  dark
                    ? 'bg-amber-900/20 border-amber-700'
                    : 'bg-amber-50 border-amber-300'
                }`}
              >
                <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${dark ? 'text-amber-400' : 'text-amber-600'}`} />
                <label className="flex items-start gap-3 cursor-pointer flex-1">
                  <input
                    type="checkbox"
                    checked={form.scam_signature}
                    onChange={e => setForm(f => ({ ...f, scam_signature: e.target.checked }))}
                    className="mt-1 rounded border-gray-300"
                  />
                  <span className={`text-sm font-semibold ${dark ? 'text-amber-200' : 'text-amber-800'}`}>
                    Les parents ont été informés des risques liés au départ contre avis médical et ont signé la décharge
                  </span>
                </label>
              </div>
            )}

            {/* DECEASED CONFIRMATION */}
            {form.type_sortie === 'deces' && (
              <div
                className={`p-4 rounded-xl border-2 flex items-start gap-3 ${
                  dark
                    ? 'bg-red-900/20 border-red-700'
                    : 'bg-red-50 border-red-300'
                }`}
              >
                <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${dark ? 'text-red-400' : 'text-red-600'}`} />
                <label className="flex items-start gap-3 cursor-pointer flex-1">
                  <input
                    type="checkbox"
                    checked={deceasedConfirm}
                    onChange={e => setDeceasedConfirm(e.target.checked)}
                    className="mt-1 rounded border-gray-300"
                  />
                  <span className={`text-sm font-semibold ${dark ? 'text-red-200' : 'text-red-800'}`}>
                    Vous êtes sur le point d'enregistrer le décès de {patient.full_name}. Cette action est irréversible.
                  </span>
                </label>
              </div>
            )}

            {error && (
              <div
                className={`p-3 rounded-xl text-sm font-semibold ${
                  dark
                    ? 'bg-red-900/30 border border-red-700 text-red-400'
                    : 'bg-red-50 border border-red-200 text-red-700'
                }`}
              >
                {error}
              </div>
            )}

            {/* BUTTONS */}
            <div className="flex gap-3 pt-4 border-t border-gray-700">
              <button
                onClick={onClose}
                disabled={saving}
                className={`px-4 py-2.5 border rounded-xl font-semibold text-sm transition-colors ${
                  dark
                    ? 'border-gray-600 text-gray-300 hover:bg-gray-800 disabled:opacity-50'
                    : 'border-gray-200 text-gray-700 hover:bg-gray-100 disabled:opacity-50'
                }`}
              >
                Annuler
              </button>

              <button
                onClick={handlePrint}
                disabled={saving}
                className={`px-4 py-2.5 border rounded-xl font-semibold text-sm flex items-center gap-2 transition-colors ${
                  dark
                    ? 'border-blue-600 text-blue-400 hover:bg-blue-900/20 disabled:opacity-50'
                    : 'border-blue-300 text-blue-600 hover:bg-blue-50 disabled:opacity-50'
                }`}
              >
                <Printer className="w-4 h-4" /> Imprimer CRS
              </button>

              <button
                onClick={handleDischarge}
                disabled={saving || (form.type_sortie === 'deces' && !deceasedConfirm)}
                className="flex-1 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold rounded-xl transition-colors"
              >
                {saving ? 'Enregistrement...' : '✅ Valider la sortie'}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
