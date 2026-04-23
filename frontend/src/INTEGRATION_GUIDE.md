# MediBot Patient Lifecycle Integration Guide

## Components Created

You now have two new component files:
- `src/features/admin/components/AdmissionWizard.tsx` - 2-step admission modal (search → new/returning patient form)
- `src/features/admin/components/DischargeModal.tsx` - Discharge modal (end of stay)

## Integration Steps

### Step 1: Add Imports to AdminShell.tsx

At the top of `src/features/admin/AdminShell.tsx`, add these imports:

```typescript
import { AdmissionWizard } from './components/AdmissionWizard';
import { DischargeModal } from './components/DischargeModal';
```

### Step 2: Update PatientsView Component State

In the `PatientsView` component, add these state variables to the component:

```typescript
// After existing state declarations
const [admissionWizardOpen, setAdmissionWizardOpen] = useState(false);
const [dischargeModal, setDischargeModal] = useState<Patient | null>(null);
const [showArchived, setShowArchived] = useState(false);
```

### Step 3: Replace the "Ajouter" Button

Find the button that currently opens the add patient modal (look for `Ajouter`):

**OLD CODE:**
```typescript
<button onClick={()=>{setSaveError('');setForm({...});setModal('add');}}
  className="flex items-center gap-1.5 text-sm text-white bg-teal-600 hover:bg-teal-700 px-3 py-1.5 rounded-xl font-bold transition-colors">
  <Plus className="w-3.5 h-3.5"/> Ajouter
</button>
```

**NEW CODE:**
```typescript
<button onClick={() => setAdmissionWizardOpen(true)}
  className="flex items-center gap-1.5 text-sm text-white bg-teal-600 hover:bg-teal-700 px-3 py-1.5 rounded-xl font-bold transition-colors">
  <Plus className="w-3.5 h-3.5"/> Admission
</button>
```

### Step 4: Add Patients/Archived Tabs

Find the patient list section. Add tabs above the list to toggle between active and archived:

```typescript
{/* Tab bar */}
<div className={`flex gap-2 mb-4 border-b ${dark ? 'border-gray-700' : 'border-gray-100'}`}>
  <button
    onClick={() => setShowArchived(false)}
    className={`px-4 py-2 font-bold text-sm transition-colors ${
      !showArchived
        ? dark ? 'text-teal-400 border-b-2 border-teal-400' : 'text-teal-600 border-b-2 border-teal-600'
        : dark ? 'text-gray-400' : 'text-gray-500'
    }`}
  >
    👥 Patients actifs ({patients.filter(p => !p.is_archived).length})
  </button>
  <button
    onClick={() => setShowArchived(true)}
    className={`px-4 py-2 font-bold text-sm transition-colors ${
      showArchived
        ? dark ? 'text-teal-400 border-b-2 border-teal-400' : 'text-teal-600 border-b-2 border-teal-600'
        : dark ? 'text-gray-400' : 'text-gray-500'
    }`}
  >
    📁 Patients archivés ({patients.filter(p => p.is_archived).length})
  </button>
</div>
```

### Step 5: Update Patient List Filtering

Update the `filtered` variable to respect the archived filter:

**OLD CODE:**
```typescript
const filtered=patients.filter(p=>p.full_name?.toLowerCase().includes(search.toLowerCase())||p.diagnostic?.toLowerCase().includes(search.toLowerCase()));
```

**NEW CODE:**
```typescript
const filtered = patients.filter(p => {
  const matchesSearch = p.full_name?.toLowerCase().includes(search.toLowerCase()) || p.diagnostic?.toLowerCase().includes(search.toLowerCase());
  const isArchived = p.is_archived || p.is_archived === 1;
  return matchesSearch && (showArchived ? isArchived : !isArchived);
});
```

### Step 6: Replace Delete Button with Discharge Button

Find the delete button in the patient detail panel (look for `Trash2`):

**OLD CODE:**
```typescript
<button type="button" onClick={() => del(sel)} className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all ${dark?'bg-gray-700 border-gray-600 hover:border-red-500 text-gray-400 hover:text-red-400':'bg-white border-gray-200 hover:border-red-400 text-gray-500 hover:text-red-500 shadow-sm'}`}>
  <Trash2 className="w-3.5 h-3.5"/>
</button>
```

**NEW CODE:**
```typescript
<button 
  type="button" 
  onClick={() => setDischargeModal(sel)} 
  className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all ${dark?'bg-gray-700 border-gray-600 hover:border-amber-500 text-gray-400 hover:text-amber-400':'bg-white border-gray-200 hover:border-amber-400 text-gray-500 hover:text-amber-500 shadow-sm'}`}
  title="Clôturer le séjour"
>
  <DoorOpen className="w-3.5 h-3.5"/>
</button>
```

Also add `DoorOpen` to the lucide-react imports at the top.

### Step 7: Add Admission Wizard Modal

At the end of the `PatientsView` return statement (before the closing `</div>`), add:

```typescript
<AnimatePresence>
  {admissionWizardOpen && (
    <AdmissionWizard
      open={admissionWizardOpen}
      onClose={() => setAdmissionWizardOpen(false)}
      onAdmit={async () => {
        await load();
        setSearch('');
      }}
      rooms={rooms}
    />
  )}
</AnimatePresence>
```

### Step 8: Add Discharge Modal

Also add this before the closing `</div>`:

```typescript
<AnimatePresence>
  {dischargeModal && (
    <DischargeModal
      open={!!dischargeModal}
      patient={dischargeModal}
      onClose={() => setDischargeModal(null)}
      onDischarge={async (data) => {
        await api(`/api/patients/${dischargeModal.id}/discharge`, {
          method: 'POST',
          body: JSON.stringify(data),
        });
        await load();
        setSel(null);
      }}
    />
  )}
</AnimatePresence>
```

### Step 9: Add History Tab (Optional)

In the detail panel tabs, add a 'history' tab to the tab list:

```typescript
{ id: 'historique' as const, label: 'Historique & séjours' },
```

Then add the history tab content after the other tab contents:

```typescript
{tab === 'historique' && (
  <div className="space-y-4">
    {/* Allergies alert */}
    {sel.allergies && sel.allergies.length > 0 && (
      <div className={`p-4 rounded-xl border-2 flex items-start gap-3 ${
        dark
          ? 'bg-red-900/20 border-red-700'
          : 'bg-red-50 border-red-300'
      }`}>
        <AlertTriangle className={`w-5 h-5 flex-shrink-0 ${dark ? 'text-red-400' : 'text-red-600'}`} />
        <div>
          <p className={`font-bold ${dark ? 'text-red-200' : 'text-red-800'}`}>
            🚨 ALLERGIES PERMANENTES (tous séjours)
          </p>
          <p className={`text-sm mt-1 ${dark ? 'text-red-300' : 'text-red-700'}`}>
            {Array.isArray(sel.allergies)
              ? sel.allergies.map(a => typeof a === 'string' ? a : a.medication).join(', ')
              : 'N/A'}
          </p>
        </div>
      </div>
    )}

    {/* Séjours timeline */}
    <p className={`text-sm font-bold ${dark ? 'text-gray-300' : 'text-gray-700'}`}>Historique des séjours</p>
    <div className="space-y-3">
      <p className={`text-sm ${dark ? 'text-gray-500' : 'text-gray-500'}`}>
        Cette fonctionnalité sera disponible une fois les séjours intégrés au patient.
      </p>
    </div>
  </div>
)}
```

### Step 10: Remove Old Delete Endpoint

The `del` function should be updated or removed if you're only using discharge now. If you want to keep it for admin purposes only (deleting duplicate records), update it to use the new DELETE endpoint with reason:

```typescript
const del = async (p: Patient) => {
  if (!confirm(`Supprimer le dossier de ${p.full_name} ? (Cette action est définitive)`)) return;
  const reason = prompt('Raison de la suppression (doublons, erreur, etc.):');
  if (!reason) return;
  
  try {
    await api(`/api/patients/${p.id}`, {
      method: 'DELETE',
      body: JSON.stringify({
        reason,
        actor: currentDoctor?.name || 'inconnu',
      }),
    });
    if (sel?.id === p.id) setSel(null);
    await load();
  } catch (e) {
    alert(`Erreur: ${e instanceof Error ? e.message : String(e)}`);
  }
};
```

## Key Features

✅ **Admission Wizard**
- Step 1: Search for existing dossier (or create new)
- Step 2A: Create new patient (Dossier + Sejour)
- Step 2B: Add new stay for returning patient

✅ **Discharge Modal**
- Type: Authorized discharge, Transfer, SCAM, Deceased
- Conditional fields based on type
- Print CRS (Compte-Rendu de Sortie)
- Special confirmations for SCAM and deceased

✅ **Patient List**
- Active/Archived tabs
- Immediate bed release on discharge
- Discharge badges showing exit type

✅ **Bed Management**
- Beds automatically freed when patient is discharged
- Update happens in real-time without page refresh

## API Endpoints Used

The components will call these backend endpoints:
- `GET /api/dossiers/search` - Search for existing patient files
- `POST /api/dossiers` - Create permanent patient file  
- `POST /api/dossiers/{dossier_id}/sejours` - Open new hospitalization
- `POST /api/patients/{patient_id}/discharge` - Discharge patient
- `GET /api/patients?actifs_seulement=true` - List active patients only

## Testing Checklist

- [ ] Admission wizard opens and allows search
- [ ] Search returns matching dossiers with allergy alerts
- [ ] New patient form works for first admission
- [ ] Returning patient form pre-fills correctly
- [ ] Discharge modal appears when clicking DoorOpen button
- [ ] Discharge updates patient status to archived
- [ ] Archived patients appear in "Patients archivés" tab
- [ ] Delete button is gone (replaced with discharge)
- [ ] All changes persist across page refresh
- [ ] Bed status updates immediately on discharge
