/**
 * ADMISSION WIZARD — 2-step modal for new hospitalizations
 * Step 1: Search for existing dossier or create new
 * Step 2A: New patient form (DossierCreate + SejourCreate)
 * Step 2B: Returning patient (pre-filled Dossier + SejourCreate only)
 */
import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Search, X, AlertTriangle, ChevronDown } from 'lucide-react';
import { useTheme } from '@/shared/context/ThemeContext';

interface DossierSearchResult {
  id: number;
  nom: string;
  prenom: string;
  date_naissance?: string;
  sexe?: string;
  telephone?: string;
  groupe_sanguin?: string;
  allergies_permanentes?: string;
  antecedents_chroniques?: string;
  sejours_count: number;
  dernier_sejour?: { date_entree: string; diagnostic_entree: string; etat: string };
  is_currently_admitted: boolean;
}

interface AdmissionWizardProps {
  open: boolean;
  onClose: () => void;
  onAdmit: (data: any) => Promise<void>;
  rooms: Array<{ id: number; name: string }>;
}

const api = async (path: string, opts?: RequestInit) => {
  const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};

export const AdmissionWizard: React.FC<AdmissionWizardProps> = ({ open, onClose, onAdmit, rooms }) => {
  const { dark } = useTheme();
  const inp = `w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 transition-all ${
    dark
      ? 'bg-gray-800 border-gray-600 text-white focus:border-teal-400 focus:ring-teal-900 placeholder-gray-500'
      : 'bg-white border-gray-200 text-gray-900 focus:border-teal-400 focus:ring-teal-100'
  }`;

  const [step, setStep] = useState<'search' | 'newPatient' | 'returningPatient'>('search');
  const [searchForm, setSearchForm] = useState({ prenom: '', nom: '', date_naissance: '', telephone: '' });
  const [searchResults, setSearchResults] = useState<DossierSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedDossier, setSelectedDossier] = useState<DossierSearchResult | null>(null);

  const [newPatientForm, setNewPatientForm] = useState({
    nom: '', prenom: '', date_naissance: '', sexe: 'M',
    nom_pere: '', nom_mere: '', telephone: '',
    groupe_sanguin: 'A', rhesus: 'positif', groupe_abo: 'A',
    allergies_permanentes: [] as string[],
    antecedents_chroniques: '',
    vaccinations: [] as string[],
    notes_permanentes: '',
    // Sejour fields
    diagnostic_entree: '',
    roomid: rooms[0]?.id || 1,
    bed: '1',
    poids_admission: '',
    taille_admission: '',
    pc_cranien: '',
    tuteur_nom: '',
    tuteur_telephone: '',
    tuteur_relation: 'Parent',
  });

  const [sejourForm, setSejourForm] = useState({
    diagnostic_entree: '',
    roomid: rooms[0]?.id || 1,
    bed: '1',
    poids_admission: '',
    taille_admission: '',
    pc_cranien: '',
    tuteur_nom: '',
    tuteur_telephone: '',
    tuteur_relation: 'Parent',
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!searchForm.prenom && !searchForm.nom && !searchForm.date_naissance && !searchForm.telephone) {
      setError('Veuillez remplir au moins un critère de recherche');
      return;
    }
    setSearching(true);
    setError('');
    try {
      const results = await api('/api/dossiers/search', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }).then(async () => {
        const params = new URLSearchParams();
        if (searchForm.prenom) params.append('prenom', searchForm.prenom);
        if (searchForm.nom) params.append('nom', searchForm.nom);
        if (searchForm.date_naissance) params.append('date_naissance', searchForm.date_naissance);
        if (searchForm.telephone) params.append('telephone', searchForm.telephone);
        return api(`/api/dossiers/search?${params}`);
      });
      setSearchResults(results);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de recherche');
    } finally {
      setSearching(false);
    }
  };

  const handleSelectDossier = (dossier: DossierSearchResult) => {
    setSelectedDossier(dossier);
    setStep('returningPatient');
    // Pre-fill sejour form
    setSejourForm(f => ({
      ...f,
      roomid: rooms[0]?.id || 1,
      bed: '1',
    }));
  };

  const handleCreateNew = () => {
    setStep('newPatient');
  };

  const handleCreateDossierAndSejour = async () => {
    if (!newPatientForm.nom || !newPatientForm.prenom || !newPatientForm.date_naissance) {
      setError('Veuillez remplir les champs requis du dossier');
      return;
    }
    if (!newPatientForm.diagnostic_entree) {
      setError('Le diagnostic d\'entrée est requis');
      return;
    }

    setSaving(true);
    setError('');
    try {
      // 1. Create dossier
      const dossier = await api('/api/dossiers', {
        method: 'POST',
        body: JSON.stringify({
          nom: newPatientForm.nom,
          prenom: newPatientForm.prenom,
          date_naissance: newPatientForm.date_naissance,
          sexe: newPatientForm.sexe,
          nom_pere: newPatientForm.nom_pere,
          nom_mere: newPatientForm.nom_mere,
          telephone: newPatientForm.telephone,
          groupe_sanguin: newPatientForm.groupe_sanguin,
          rhesus: newPatientForm.rhesus,
          groupe_abo: newPatientForm.groupe_abo,
          allergies_permanentes: newPatientForm.allergies_permanentes,
          antecedents_chroniques: newPatientForm.antecedents_chroniques,
          vaccinations: newPatientForm.vaccinations,
          notes_permanentes: newPatientForm.notes_permanentes,
          created_by: 'système',
        }),
      });

      // 2. Create sejour
      await api(`/api/dossiers/${dossier.id}/sejours`, {
        method: 'POST',
        body: JSON.stringify({
          diagnostic_entree: newPatientForm.diagnostic_entree,
          roomid: parseInt(newPatientForm.roomid, 10),
          bed: parseInt(newPatientForm.bed, 10),
          poids_admission: newPatientForm.poids_admission,
          taille_admission: newPatientForm.taille_admission ? parseFloat(newPatientForm.taille_admission) : undefined,
          pc_cranien: newPatientForm.pc_cranien ? parseFloat(newPatientForm.pc_cranien) : undefined,
          tuteur_nom: newPatientForm.tuteur_nom,
          tuteur_telephone: newPatientForm.tuteur_telephone,
          tuteur_relation: newPatientForm.tuteur_relation,
          created_by: 'système',
        }),
      });

      await onAdmit({ dossier_id: dossier.id });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de l\'admission');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateSejourOnly = async () => {
    if (!selectedDossier) return;
    if (!sejourForm.diagnostic_entree) {
      setError('Le diagnostic d\'entrée est requis');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await api(`/api/dossiers/${selectedDossier.id}/sejours`, {
        method: 'POST',
        body: JSON.stringify({
          diagnostic_entree: sejourForm.diagnostic_entree,
          roomid: parseInt(sejourForm.roomid, 10),
          bed: parseInt(sejourForm.bed, 10),
          poids_admission: sejourForm.poids_admission,
          taille_admission: sejourForm.taille_admission ? parseFloat(sejourForm.taille_admission) : undefined,
          pc_cranien: sejourForm.pc_cranien ? parseFloat(sejourForm.pc_cranien) : undefined,
          tuteur_nom: sejourForm.tuteur_nom,
          tuteur_telephone: sejourForm.tuteur_telephone,
          tuteur_relation: sejourForm.tuteur_relation,
          created_by: 'système',
        }),
      });

      await onAdmit({ dossier_id: selectedDossier.id });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de l\'admission');
    } finally {
      setSaving(false);
    }
  };

  const allergyPills = ['Pénicilline', 'Amoxicilline', 'Céphalosporine', 'Sulfamides'];
  const vaccinations = ['BCG', 'Pentavalent', 'VPO', 'ROR', 'Hépatite B'];

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
              {step === 'search' && '🔍 Admission d\'un patient'}
              {step === 'newPatient' && '📝 Nouveau dossier patient'}
              {step === 'returningPatient' && `👤 Nouveau séjour — ${selectedDossier?.prenom} ${selectedDossier?.nom}`}
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

          <div className="p-6 space-y-4">
            {/* STEP 1 — SEARCH */}
            {step === 'search' && (
              <div className="space-y-4">
                <p
                  className={`text-sm font-semibold ${
                    dark ? 'text-gray-300' : 'text-gray-700'
                  }`}
                >
                  Recherchez un dossier existant ou créez un nouveau patient:
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`block text-sm font-bold mb-1.5 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
                      Prénom
                    </label>
                    <input
                      className={inp}
                      value={searchForm.prenom}
                      onChange={e => setSearchForm(f => ({ ...f, prenom: e.target.value }))}
                      placeholder="Yanis"
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-bold mb-1.5 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
                      Nom
                    </label>
                    <input
                      className={inp}
                      value={searchForm.nom}
                      onChange={e => setSearchForm(f => ({ ...f, nom: e.target.value }))}
                      placeholder="Belkacem"
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-bold mb-1.5 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
                      Né(e) le
                    </label>
                    <input
                      type="date"
                      className={inp}
                      value={searchForm.date_naissance}
                      onChange={e => setSearchForm(f => ({ ...f, date_naissance: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-bold mb-1.5 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
                      Tél. parent
                    </label>
                    <input
                      type="tel"
                      className={inp}
                      value={searchForm.telephone}
                      onChange={e => setSearchForm(f => ({ ...f, telephone: e.target.value }))}
                      placeholder="+213 5XX..."
                    />
                  </div>
                </div>

                {error && (
                  <div className={`p-3 rounded-xl text-sm font-semibold ${
                    dark
                      ? 'bg-red-900/30 border border-red-700 text-red-400'
                      : 'bg-red-50 border border-red-200 text-red-700'
                  }`}>
                    {error}
                  </div>
                )}

                <button
                  onClick={handleSearch}
                  disabled={searching}
                  className="w-full px-4 py-3 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <Search className="w-4 h-4" /> {searching ? 'Recherche...' : 'Rechercher'}
                </button>

                {/* Search results */}
                {searchResults.length > 0 && (
                  <div className="space-y-2">
                    <p className={`text-xs font-bold uppercase ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                      {searchResults.length} résultat(s) trouvé(s)
                    </p>
                    {searchResults.map(dossier => (
                      <button
                        key={dossier.id}
                        onClick={() => handleSelectDossier(dossier)}
                        className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                          dark
                            ? 'bg-gray-800 border-gray-700 hover:border-teal-600 hover:bg-gray-750'
                            : 'bg-white border-gray-200 hover:border-teal-400 hover:bg-teal-50'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className={`font-bold text-lg ${dark ? 'text-white' : 'text-gray-900'}`}>
                              {dossier.prenom} {dossier.nom}
                            </p>
                            <p className={`text-sm mt-1 ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
                              Né(e): {dossier.date_naissance} • Tel: {dossier.telephone || '—'}
                            </p>
                            {dossier.allergies_permanentes && (
                              <p className={`text-sm mt-1 flex items-center gap-1 ${dark ? 'text-red-400' : 'text-red-600'}`}>
                                <AlertTriangle className="w-4 h-4" /> Allergies: {dossier.allergies_permanentes}
                              </p>
                            )}
                            <p className={`text-xs mt-2 ${dark ? 'text-gray-500' : 'text-gray-500'}`}>
                              {dossier.sejours_count} séjour(s) — Dernier: {dossier.dernier_sejour?.diagnostic_entree || '—'}
                            </p>
                          </div>
                          <span className={`text-sm font-bold px-3 py-1 rounded-full whitespace-nowrap ${
                            dossier.is_currently_admitted
                              ? dark
                                ? 'bg-amber-900 text-amber-200'
                                : 'bg-amber-100 text-amber-800'
                              : dark
                                ? 'bg-emerald-900/30 text-emerald-200'
                                : 'bg-emerald-50 text-emerald-800'
                          }`}>
                            {dossier.is_currently_admitted ? 'Actuellement admis' : 'Nouveau séjour'}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {searchResults.length === 0 && (
                  <div className={`p-4 rounded-xl border ${
                    dark
                      ? 'bg-gray-800 border-gray-700'
                      : 'bg-gray-50 border-gray-200'
                  }`}>
                    <p className={`text-sm font-semibold ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
                      Aucun dossier trouvé
                    </p>
                    <p className={`text-xs mt-1 ${dark ? 'text-gray-500' : 'text-gray-500'}`}>
                      Ce patient n'a jamais été hospitalisé ici.
                    </p>
                  </div>
                )}

                <button
                  onClick={handleCreateNew}
                  className={`w-full px-4 py-3 border-2 font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
                    dark
                      ? 'border-teal-600 text-teal-300 hover:bg-teal-900/20'
                      : 'border-teal-400 text-teal-600 hover:bg-teal-50'
                  }`}
                >
                  <Plus className="w-4 h-4" /> Créer un nouveau dossier
                </button>
              </div>
            )}

            {/* STEP 2A — NEW PATIENT */}
            {step === 'newPatient' && (
              <div className="space-y-4">
                <div>
                  <h4 className={`text-sm font-bold mb-3 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
                    Identité du patient
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={`block text-xs font-bold mb-1 ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
                        Prénom *
                      </label>
                      <input
                        className={inp}
                        value={newPatientForm.prenom}
                        onChange={e => setNewPatientForm(f => ({ ...f, prenom: e.target.value }))}
                        placeholder="Yanis"
                      />
                    </div>
                    <div>
                      <label className={`block text-xs font-bold mb-1 ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
                        Nom *
                      </label>
                      <input
                        className={inp}
                        value={newPatientForm.nom}
                        onChange={e => setNewPatientForm(f => ({ ...f, nom: e.target.value }))}
                        placeholder="Belkacem"
                      />
                    </div>
                    <div>
                      <label className={`block text-xs font-bold mb-1 ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
                        Date de naissance *
                      </label>
                      <input
                        type="date"
                        className={inp}
                        value={newPatientForm.date_naissance}
                        onChange={e => setNewPatientForm(f => ({ ...f, date_naissance: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className={`block text-xs font-bold mb-1 ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
                        Sexe
                      </label>
                      <select
                        className={inp}
                        value={newPatientForm.sexe}
                        onChange={e => setNewPatientForm(f => ({ ...f, sexe: e.target.value }))}
                      >
                        <option value="M">Masculin</option>
                        <option value="F">Féminin</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className={`text-sm font-bold mb-3 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
                    Groupe sanguin
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {['A', 'B', 'AB', 'O'].map(abo => (
                      <button
                        key={abo}
                        onClick={() => setNewPatientForm(f => ({ ...f, groupe_abo: abo }))}
                        className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-all ${
                          newPatientForm.groupe_abo === abo
                            ? 'bg-teal-600 text-white border-teal-600'
                            : dark
                              ? 'border-gray-600 text-gray-300'
                              : 'border-gray-200 text-gray-700'
                        }`}
                      >
                        {abo}
                      </button>
                    ))}
                    {['positif', 'negatif'].map(rh => (
                      <button
                        key={rh}
                        onClick={() => setNewPatientForm(f => ({ ...f, rhesus: rh }))}
                        className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-all ${
                          newPatientForm.rhesus === rh
                            ? 'bg-teal-600 text-white border-teal-600'
                            : dark
                              ? 'border-gray-600 text-gray-300'
                              : 'border-gray-200 text-gray-700'
                        }`}
                      >
                        {rh === 'positif' ? '+' : '−'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className={`text-sm font-bold mb-3 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
                    Allergie permanentes
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {allergyPills.map(allergy => (
                      <button
                        key={allergy}
                        onClick={() =>
                          setNewPatientForm(f => ({
                            ...f,
                            allergies_permanentes: f.allergies_permanentes.includes(allergy)
                              ? f.allergies_permanentes.filter(a => a !== allergy)
                              : [...f.allergies_permanentes, allergy],
                          }))
                        }
                        className={`text-xs px-3 py-1.5 rounded-full border font-semibold transition-all ${
                          newPatientForm.allergies_permanentes.includes(allergy)
                            ? dark
                              ? 'bg-red-900/40 text-red-300 border-red-600'
                              : 'bg-red-100 text-red-800 border-red-300'
                            : dark
                              ? 'border-gray-600 text-gray-400'
                              : 'border-gray-200 text-gray-600'
                        }`}
                      >
                        {allergy}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className={`text-sm font-bold mb-3 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
                    Ce séjour — Diagnostic et lieu
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={`block text-xs font-bold mb-1 ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
                        Diagnostic d'entrée *
                      </label>
                      <input
                        className={inp}
                        value={newPatientForm.diagnostic_entree}
                        onChange={e => setNewPatientForm(f => ({ ...f, diagnostic_entree: e.target.value }))}
                        placeholder="Pneumonie"
                      />
                    </div>
                    <div>
                      <label className={`block text-xs font-bold mb-1 ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
                        Poids actuel *
                      </label>
                      <input
                        className={inp}
                        value={newPatientForm.poids_admission}
                        onChange={e => setNewPatientForm(f => ({ ...f, poids_admission: e.target.value }))}
                        placeholder="21kg"
                      />
                    </div>
                    <div>
                      <label className={`block text-xs font-bold mb-1 ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
                        Salle *
                      </label>
                      <select
                        className={inp}
                        value={newPatientForm.roomid}
                        onChange={e => setNewPatientForm(f => ({ ...f, roomid: parseInt(e.target.value, 10) }))}
                      >
                        {rooms.map(r => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={`block text-xs font-bold mb-1 ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
                        Lit *
                      </label>
                      <select
                        className={inp}
                        value={newPatientForm.bed}
                        onChange={e => setNewPatientForm(f => ({ ...f, bed: e.target.value }))}
                      >
                        <option value="1">Lit 1</option>
                        <option value="2">Lit 2</option>
                      </select>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className={`p-3 rounded-xl text-sm font-semibold ${
                    dark
                      ? 'bg-red-900/30 border border-red-700 text-red-400'
                      : 'bg-red-50 border border-red-200 text-red-700'
                  }`}>
                    {error}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setStep('search')}
                    className={`px-4 py-2.5 border rounded-xl font-semibold text-sm transition-colors ${
                      dark
                        ? 'border-gray-600 text-gray-300 hover:bg-gray-800'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    Retour
                  </button>
                  <button
                    onClick={handleCreateDossierAndSejour}
                    disabled={saving}
                    className="flex-1 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold rounded-xl transition-colors"
                  >
                    {saving ? 'Admission...' : '✅ Admettre le patient'}
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2B — RETURNING PATIENT */}
            {step === 'returningPatient' && selectedDossier && (
              <div className="space-y-4">
                <div className={`p-4 rounded-xl border-2 ${
                  dark
                    ? 'bg-teal-900/20 border-teal-800'
                    : 'bg-teal-50 border-teal-200'
                }`}>
                  <p className={`text-sm font-bold ${dark ? 'text-teal-200' : 'text-teal-700'}`}>
                    Dossier existant
                  </p>
                  <p className={`text-lg font-black mt-1 ${dark ? 'text-white' : 'text-gray-900'}`}>
                    {selectedDossier.prenom} {selectedDossier.nom}
                  </p>
                  <p className={`text-sm mt-2 ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
                    Né(e): {selectedDossier.date_naissance} | {selectedDossier.sejours_count} séjour(s) antérieur(s)
                  </p>
                  {selectedDossier.allergies_permanentes && (
                    <div className={`mt-3 p-2 rounded-lg flex items-center gap-2 ${
                      dark
                        ? 'bg-red-900/40 text-red-300'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      <AlertTriangle className="w-4 h-4" />
                      <span className="text-xs font-bold">Allergies: {selectedDossier.allergies_permanentes}</span>
                    </div>
                  )}
                </div>

                <div>
                  <h4 className={`text-sm font-bold mb-3 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
                    Nouveau séjour
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <label className={`block text-xs font-bold mb-1 ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
                        Diagnostic d'entrée *
                      </label>
                      <input
                        className={inp}
                        value={sejourForm.diagnostic_entree}
                        onChange={e => setSejourForm(f => ({ ...f, diagnostic_entree: e.target.value }))}
                        placeholder="Pneumonie"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={`block text-xs font-bold mb-1 ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
                          Poids actuel *
                        </label>
                        <input
                          className={inp}
                          value={sejourForm.poids_admission}
                          onChange={e => setSejourForm(f => ({ ...f, poids_admission: e.target.value }))}
                          placeholder="21kg"
                        />
                      </div>
                      <div>
                        <label className={`block text-xs font-bold mb-1 ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
                          Taille (cm)
                        </label>
                        <input
                          className={inp}
                          value={sejourForm.taille_admission}
                          onChange={e => setSejourForm(f => ({ ...f, taille_admission: e.target.value }))}
                          placeholder="112"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={`block text-xs font-bold mb-1 ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
                          Salle *
                        </label>
                        <select
                          className={inp}
                          value={sejourForm.roomid}
                          onChange={e => setSejourForm(f => ({ ...f, roomid: parseInt(e.target.value, 10) }))}
                        >
                          {rooms.map(r => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={`block text-xs font-bold mb-1 ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
                          Lit *
                        </label>
                        <select
                          className={inp}
                          value={sejourForm.bed}
                          onChange={e => setSejourForm(f => ({ ...f, bed: e.target.value }))}
                        >
                          <option value="1">Lit 1</option>
                          <option value="2">Lit 2</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className={`p-3 rounded-xl text-sm font-semibold ${
                    dark
                      ? 'bg-red-900/30 border border-red-700 text-red-400'
                      : 'bg-red-50 border border-red-200 text-red-700'
                  }`}>
                    {error}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => { setStep('search'); setSelectedDossier(null); }}
                    className={`px-4 py-2.5 border rounded-xl font-semibold text-sm transition-colors ${
                      dark
                        ? 'border-gray-600 text-gray-300 hover:bg-gray-800'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    Retour
                  </button>
                  <button
                    onClick={handleCreateSejourOnly}
                    disabled={saving}
                    className="flex-1 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold rounded-xl transition-colors"
                  >
                    {saving ? 'Admission...' : '✅ Admettre le patient'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
