import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, DoorOpen, Edit2, Trash2, Users, AlertTriangle, Search,
  Download, Pause, Play
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTheme } from '@/shared/context/ThemeContext';
import { api, normalizePatients, normalizePatient } from '@/shared/lib/api';
import type { Patient, Room, PatientTreatment } from '@/shared/types/domain';

// Import helper functions and components (assuming they exist)
const Field = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => {
  const { dark } = useTheme();
  return (
    <div className="space-y-1">
      <label className={`text-sm font-bold block ${dark ? 'text-gray-200' : 'text-gray-700'}`}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
};

const Modal = ({ title, onClose, children, width = 'max-w-lg' }: { title: string; onClose: () => void; children: React.ReactNode; width?: string }) => {
  const { dark } = useTheme();
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className={`${width} w-full mx-4 rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto ${dark ? 'bg-gray-800' : 'bg-white'}`}>
        <div className={`flex items-center justify-between p-6 border-b ${dark ? 'border-gray-700' : 'border-gray-200'}`}>
          <h2 className={`text-lg font-black ${dark ? 'text-white' : 'text-gray-900'}`}>{title}</h2>
          <button onClick={onClose} className={`p-2 rounded ${dark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}>
            ✕
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
};

const Spinner = () => (
  <div className="flex items-center justify-center p-8">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
  </div>
);

export const PatientsView = ({ 
  currentDoctor 
}: { 
  currentDoctor?: { name: string; role: string; rfiduid?: string; id?: number } | null 
} = {}) => {
  const { dark } = useTheme();
  const inp = `w-full px-3 py-2 rounded-lg border ${dark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-200'} font-semibold`;
  
  const [patients, setPatients] = useState<Patient[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [sel, setSel] = useState<Patient | null>(null);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'add' | 'edit' | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [busy, setBusy] = useState(true);
  const [tab, setTab] = useState<'identite' | 'constantes' | 'traitements' | 'ordonnances' | 'historique'>('identite');
  const [dischargeModal, setDischargeModal] = useState(false);
  const [admissionSearchModal, setAdmissionSearchModal] = useState(false);
  const [searchDossierResults, setSearchDossierResults] = useState<any[]>([]);
  const [selectedDossier, setSelectedDossier] = useState<any | null>(null);
  const [dischargeForm, setDischargeForm] = useState({
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
  const [searchForm, setSearchForm] = useState({
    nom: '',
    prenom: '',
    date_naissance: '',
    telephone: '',
  });

  const [form, setForm] = useState({
    first_name: '', last_name: '', age: '', weight: '', blood_type: 'A+', diagnostic: '',
    room_id: '1', bed: '1', allergies: [] as string[], notes: '',
    date_naissance: '', groupe_sanguin: '', antecedents: '', traitement_en_cours: '',
    groupe_abo: 'A' as string, rhesus: 'positif' as 'positif' | 'negatif',
    ph_C: 0, ph_c: 0, ph_E: 0, ph_e: 0, ph_K: 0, ph_k: 0,
    drug_allergies: [] as string[], other_allergies: [] as string[],
    taille: '', pcranien: '', poidsnaissance: '', poidsref: '',
    vaccination_status: 'inconnu', vaccinations: [] as string[],
  });

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [p, r] = await Promise.all([api('/api/patients'), api('/api/rooms')]);
      const normalized = normalizePatients(p);
      setPatients(normalized);
      setRooms(r);
    } catch (error) {
      console.error('Error loading patients/rooms:', error);
      setPatients([]);
      setRooms([]);
    }
    finally { setBusy(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = patients.filter(p => !p.is_archived && (p.full_name?.toLowerCase().includes(search.toLowerCase()) || p.diagnostic?.toLowerCase().includes(search.toLowerCase())));

  const discharge = async () => {
    if (!sel) return;
    if (!confirm(`Terminer l'hospitalisation pour ${sel.full_name} ?`)) return;
    setSaving(true);
    try {
      await api(`/api/patients/${sel.id}/discharge`, {
        method: 'POST',
        body: JSON.stringify({
          ...dischargeForm,
          scam_signature: dischargeForm.scam_signature ? 1 : 0,
        })
      });
      setDischargeModal(false);
      setSel(null);
      await load();
    } catch (e: any) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
    finally { setSaving(false); }
  };

  const searchDossiers = async () => {
    try {
      const results = await api(`/api/dossiers/search?nom=${encodeURIComponent(searchForm.nom)}&prenom=${encodeURIComponent(searchForm.prenom)}&date_naissance=${encodeURIComponent(searchForm.date_naissance)}&telephone=${encodeURIComponent(searchForm.telephone)}`);
      setSearchDossierResults(Array.isArray(results) ? results : []);
    } catch (e: any) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  };

  const initials = (n?: string) => n?.split(' ').map((w: string) => w[0]).join('').slice(0, 2) ?? '??';

  return (
    <div className="flex h-full overflow-hidden">
      {/* LIST */}
      <div className={`w-80 flex-shrink-0 border-r ${dark ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'} flex flex-col`}>
        <div className={`p-4 border-b ${dark ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'} space-y-3`}>
          <div className="flex items-center justify-between">
            <h1 className={`text-lg font-black ${dark ? 'text-white' : 'text-gray-900'}`}>Patients</h1>
            <button onClick={() => { setSearchDossierResults([]); setSearchForm({ nom: '', prenom: '', date_naissance: '', telephone: '' }); setAdmissionSearchModal(true); }}
              className="flex items-center gap-1.5 text-sm text-white bg-teal-600 hover:bg-teal-700 px-3 py-1.5 rounded-xl font-bold transition-colors">
              <Plus className="w-3.5 h-3.5" /> Admettre
            </button>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..." className={`${inp} pl-9`} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {busy ? <Spinner /> : filtered.map(p => (
            <button key={`patient-${p.id}`} type="button" onClick={() => setSel(p)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b transition-all
                ${sel?.id === p.id
                  ? dark ? 'bg-teal-900/50 border-l-2 border-l-teal-400 border-gray-700' : 'bg-teal-50 border-l-2 border-l-teal-500 border-gray-100'
                  : dark ? 'bg-gray-900 border-gray-800 hover:bg-gray-800' : 'bg-white border-gray-100 hover:bg-gray-50'}`}>
              {p.photo ? (
                <img src={p.photo} alt={p.full_name} className="w-9 h-9 rounded-full object-cover flex-shrink-0 border-2 border-white shadow-sm" />
              ) : (
                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-xs flex-shrink-0 ${dark ? 'bg-blue-900 text-blue-300' : 'bg-blue-100 text-blue-700'}`}>{initials(p.full_name)}</div>
              )}
              <div className="flex-1 min-w-0">
                <p className={`font-bold text-sm truncate ${sel?.id === p.id ? 'text-teal-600 dark:text-teal-400' : dark ? 'text-white' : 'text-gray-800'}`}>{p.full_name}</p>
                <p className={`text-xs truncate ${dark ? 'text-gray-500' : 'text-gray-400'}`}>{p.diagnostic} · Salle {p.room_id}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* DETAIL */}
      <div className={`flex-1 overflow-y-auto ${dark ? 'bg-gray-900' : 'bg-white'}`}>
        {!sel ? (
          <div className={`flex flex-col items-center justify-center h-full ${dark ? 'text-gray-600' : 'text-gray-300'}`}>
            <Users className="w-14 h-14 mb-4" />
            <p className={`text-lg font-bold ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Sélectionnez un patient</p>
          </div>
        ) : (
          <motion.div key={sel.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="p-8 space-y-5 max-w-3xl">
            <div className={`flex gap-1 p-1 rounded-xl ${dark ? 'bg-gray-800' : 'bg-gray-100'}`}>
              {([
                { id: 'identite' as const, label: 'Identité' },
                { id: 'constantes' as const, label: 'Constantes' },
                { id: 'traitements' as const, label: 'Traitements' },
                { id: 'ordonnances' as const, label: 'Ordonnances' },
                { id: 'historique' as const, label: 'Historique' },
              ]).map((t) => (
                <button key={t.id} type="button" onClick={() => setTab(t.id)}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${tab === t.id ? (dark ? 'bg-gray-700 text-white' : 'bg-white text-gray-900 shadow-sm') : (dark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700')}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'identite' && (
              <div className="space-y-4">
                <div className={`rounded-xl p-4 border ${dark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                  <h2 className={`text-xl font-black ${dark ? 'text-white' : 'text-gray-900'}`}>{sel.full_name}</h2>
                  <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Salle {sel.room_id} · Lit {sel.bed}</p>
                  <div className="flex gap-2 mt-4">
                    <button type="button" onClick={() => setModal('edit')} className={`px-3 py-2 rounded-lg ${dark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'}`}>✎ Modifier</button>
                    <button type="button" onClick={() => setDischargeModal(true)} className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white">🚪 Fin séjour</button>
                  </div>
                </div>
              </div>
            )}

            {tab === 'historique' && (
              <div className="space-y-4">
                <div className={`rounded-xl p-4 border ${dark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                  <h3 className="font-bold mb-2">Historique du patient</h3>
                  <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Dossier permanent · {sel.is_archived ? '🔴 Archivé' : '🟢 Actif'}</p>
                  {sel.is_archived && sel.type_sortie && (
                    <p className="text-sm mt-2">Type de sortie: {sel.type_sortie}</p>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>

      {/* MODALS */}
      <AnimatePresence>
        {dischargeModal && sel && (
          <Modal title="Fin de séjour" onClose={() => setDischargeModal(false)} width="max-w-2xl">
            <div className="space-y-4">
              <Field label="Type de sortie" required>
                <div className="space-y-2">
                  {(['autorisee', 'transfert', 'scam', 'deces'] as const).map((type) => (
                    <label key={type} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="type_sortie"
                        value={type}
                        checked={dischargeForm.type_sortie === type}
                        onChange={(e) => setDischargeForm((f) => ({ ...f, type_sortie: e.target.value as any }))}
                      />
                      <span className="text-sm font-bold">
                        {type === 'autorisee' && '✅ Autorised'}
                        {type === 'transfert' && '🏥 Transfer'}
                        {type === 'scam' && '⚠️ SCAM'}
                        {type === 'deces' && '🕊️ Death'}
                      </span>
                    </label>
                  ))}
                </div>
              </Field>
              <Field label="Final Diagnosis" required>
                <input className={inp} value={dischargeForm.diagnostic_sortie} onChange={(e) => setDischargeForm((f) => ({ ...f, diagnostic_sortie: e.target.value }))} placeholder="..." />
              </Field>
              {saveError && <div className="bg-red-100 text-red-700 p-3 rounded">{saveError}</div>}
              <div className="flex gap-3">
                <button type="button" onClick={() => void discharge()} disabled={saving} className="flex-1 py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl">{saving ? '...' : 'End Stay'}</button>
                <button type="button" onClick={() => setDischargeModal(false)} className={`px-5 py-3 border rounded-xl font-bold`}>Cancel</button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {admissionSearchModal && (
          <Modal title="Admit Patient" onClose={() => setAdmissionSearchModal(false)} width="max-w-2xl">
            <div className="space-y-4">
              <Field label="First Name">
                <input className={inp} value={searchForm.prenom} onChange={(e) => setSearchForm((f) => ({ ...f, prenom: e.target.value }))} />
              </Field>
              <Field label="Last Name">
                <input className={inp} value={searchForm.nom} onChange={(e) => setSearchForm((f) => ({ ...f, nom: e.target.value }))} />
              </Field>
              <button type="button" onClick={() => void searchDossiers()} className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl">Search</button>
              {searchDossierResults.length > 0 && (
                <div className="space-y-2">
                  {searchDossierResults.map((dossier) => (
                    <div key={dossier.id} className={`p-3 rounded-lg border cursor-pointer ${selectedDossier?.id === dossier.id ? 'bg-teal-100 border-teal-400' : 'bg-gray-50 border-gray-200'}`} onClick={() => setSelectedDossier(dossier)}>
                      <p className="font-bold">{dossier.prenom} {dossier.nom}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-3">
                <button type="button" onClick={() => setAdmissionSearchModal(false)} className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl">New Admission</button>
                <button type="button" onClick={() => setAdmissionSearchModal(false)} className="px-5 py-3 border rounded-xl font-bold">Cancel</button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
};
