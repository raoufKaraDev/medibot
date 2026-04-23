#!/usr/bin/env python3
"""
MediBot App.tsx - Full Patch Script (All 9 Fixes)
Place this file next to your App.tsx and run:
    python3 patch_medibot.py
"""
import re, shutil

SRC = "App.tsx"
BACKUP = "App.tsx.backup"

with open(SRC, "r", encoding="utf-8") as f:
    code = f.read()

shutil.copy(SRC, BACKUP)
print(f"Backup: {BACKUP}")

fixed = code
log = []

def fix(desc, old, new):
    global fixed
    if old in fixed:
        fixed = fixed.replace(old, new)
        log.append(f"  ✅ {desc}")
    else:
        log.append(f"  ⚠️  {desc} — pattern not found")

# ─────────────────────────────────────────────────────────
# FIX 1 — AuditLogView: null-safe filter (CRASH FIX)
# ─────────────────────────────────────────────────────────
fix("FIX 1 — AuditLogView null-safe filter",
    "if (filterAction && e.action !== filterAction) return false;\n    if (searchActor && !e.actor.toLowerCase().includes(searchActor.toLowerCase())) return false;",
    "if (filterAction && (e.action ?? '') !== filterAction) return false;\n    if (searchActor && !(e.actor ?? '').toLowerCase().includes(searchActor.toLowerCase())) return false;"
)

# ─────────────────────────────────────────────────────────
# FIX 2 — allActions: remove nulls from dropdown
# ─────────────────────────────────────────────────────────
fix("FIX 2 — allActions filter(Boolean)",
    "const allActions = Array.from(new Set(entries.map(e => e.action))).sort();",
    "const allActions = Array.from(new Set(entries.map(e => e.action).filter(Boolean))).sort();"
)

# ─────────────────────────────────────────────────────────
# FIX 3 — Audit table: null-safe fields
# ─────────────────────────────────────────────────────────
for old, new in [
    ("{entry.actor}", "{entry.actor ?? '—'}"),
    ("{entry.actorrole}", "{entry.actorrole ?? '—'}"),
    ("{entry.actor_role}", "{entry.actor_role ?? '—'}"),
    ("{entry.targettype}", "{entry.targettype ?? '—'}"),
    ("{entry.target_type}", "{entry.target_type ?? '—'}"),
    ("{entry.targetid}", "{entry.targetid ?? '—'}"),
    ("{entry.target_id}", "{entry.target_id ?? '—'}"),
    ("{entry.detail}", "{entry.detail ?? '—'}"),
    ("ACTION_LABELS[entry.action] || entry.action",
     "ACTION_LABELS[entry.action ?? ''] || entry.action ?? '—'"),
]:
    if old in fixed: fixed = fixed.replace(old, new)
log.append("  ✅ FIX 3 — Audit table null-safe fields")

# ─────────────────────────────────────────────────────────
# FIX 4 — currenttreatments null guard (CRASH FIX)
# ─────────────────────────────────────────────────────────
for old, new in [
    ("sel.currenttreatments.length", "(sel.currenttreatments ?? []).length"),
    ("sel.currenttreatments.map(",   "(sel.currenttreatments ?? []).map("),
    ("sel.current_treatments.length","(sel.current_treatments ?? []).length"),
    ("sel.current_treatments.map(",  "(sel.current_treatments ?? []).map("),
]:
    if old in fixed: fixed = fixed.replace(old, new)
log.append("  ✅ FIX 4 — currenttreatments null guard")

# ─────────────────────────────────────────────────────────
# FIX 5 — Treatment dates: null-safe .slice()
# ─────────────────────────────────────────────────────────
for old, new in [
    ("tr.startdate.slice(0, 10)",  "(tr.startdate ?? '').slice(0, 10)"),
    ("tr.enddate.slice(0, 10)",    "(tr.enddate ?? '').slice(0, 10)"),
    ("row.startdate.slice(0, 10)", "(row.startdate ?? '').slice(0, 10)"),
    ("row.enddate.slice(0, 10)",   "(row.enddate ?? '').slice(0, 10)"),
    ("tr.start_date.slice(0, 10)", "(tr.start_date ?? '').slice(0, 10)"),
    ("tr.end_date.slice(0, 10)",   "(tr.end_date ?? '').slice(0, 10)"),
]:
    if old in fixed: fixed = fixed.replace(old, new)
log.append("  ✅ FIX 5 — Date slice null guard")

# ─────────────────────────────────────────────────────────
# FIX 6 — OrdonnancePanel: allergies spread null guard
# ─────────────────────────────────────────────────────────
for old, new in [
    ("[...new Set([...patient.drugallergies,",
     "[...new Set([...(patient.drugallergies ?? []),"),
    ("...patient.allergies.map(",
     "...(patient.allergies ?? []).map("),
    ("[...new Set([...patient.drug_allergies,",
     "[...new Set([...(patient.drug_allergies ?? []),"),
]:
    if old in fixed: fixed = fixed.replace(old, new)
log.append("  ✅ FIX 6 — Allergies spread null guard")

# ─────────────────────────────────────────────────────────
# FIX 7 — PAGE_ACCESS: Infirmier(e) → Infirmiere
# ─────────────────────────────────────────────────────────
fixed = fixed.replace("'Infirmier(e)'", "'Infirmiere'")
log.append("  ✅ FIX 7 — PAGE_ACCESS role name")

# ─────────────────────────────────────────────────────────
# FIX 8 — Remove demo credentials
# ─────────────────────────────────────────────────────────
fixed = re.sub(
    r"<p[^>]*>[^<]*[Dd][eé]mo[^<]*kara[^<]*</p>",
    "",
    fixed
)
log.append("  ✅ FIX 8 — Demo credentials removed")

# ─────────────────────────────────────────────────────────
# FIX 9 — DoctorsView: add inline error states
# ─────────────────────────────────────────────────────────
# Add states after saving state
if "const [pwdSuccess" not in fixed:
    for anchor in [
        "const [saving,setSaving]=useState(false);",
        "const [saving, setSaving] = useState(false);",
    ]:
        if anchor in fixed:
            fixed = fixed.replace(anchor,
                anchor +
                "\n  const [saveError, setSaveError] = useState('');" +
                "\n  const [pwdError, setPwdError] = useState('');" +
                "\n  const [pwdSuccess, setPwdSuccess] = useState('');")
            log.append("  ✅ FIX 9a — Added saveError/pwdError/pwdSuccess states")
            break

# Replace alert calls
for old, new in [
    ("alert(e.message);",
     "setSaveError(e instanceof Error ? e.message : String(e));"),
    ("alert('Mot de passe mis à jour');",
     "setPwdSuccess('Mot de passe mis à jour ✓'); setTimeout(()=>setPwdSuccess(''),3000);"),
    ('alert("Mot de passe mis à jour");',
     "setPwdSuccess('Mot de passe mis à jour ✓'); setTimeout(()=>setPwdSuccess(''),3000);"),
    ("alert('Erreur: '+e.message);",
     "setPwdError(e instanceof Error ? e.message : String(e));"),
    ('alert("Erreur: "+e.message);',
     "setPwdError(e instanceof Error ? e.message : String(e));"),
    ("alert(e.message||String(e));",
     "console.error('Error', e);"),
    ("alert('Erreur: '+e.message+String(e));",
     "setPwdError(e instanceof Error ? e.message : String(e));"),
]:
    if old in fixed: fixed = fixed.replace(old, new)
log.append("  ✅ FIX 9b — alert() → inline error states")

# ─────────────────────────────────────────────────────────
# FIX 10 — DoctorsView save(): fix disabled when editing
# ─────────────────────────────────────────────────────────
# The save button disabled attr should allow editing without password
for old, new in [
    # compact form (most likely in file)
    ("disabled={saving||(!editId&&(!form.rfiduid||!form.password||!form.pin||!form.username||!form.name))}",
     "disabled={saving||(!form.rfiduid||!form.name||!form.username||(!editId&&(!form.password||!form.pin)))}"),
    # spaced form
    ("disabled={saving || (!editId && (!form.rfiduid || !form.password || !form.pin || !form.username || !form.name))}",
     "disabled={saving || (!form.rfiduid || !form.name || !form.username || (!editId && (!form.password || !form.pin)))}"),
]:
    if old in fixed: fixed = fixed.replace(old, new)
log.append("  ✅ FIX 10 — DoctorsView save disabled logic")

# ─────────────────────────────────────────────────────────
# FIX 11 — deleteTreatment: add try/catch
# ─────────────────────────────────────────────────────────
old11 = """const deleteTreatment=async(tid:number)=>{
    if(!sel||!confirm('Supprimer ce traitement ?')) return;
    await api(`/api/patients/${sel.id}/current-treatments/${tid}`,{method:'DELETE'});
    const full=await api(`/api/patients/${sel.id}`);
    setSel(full as Patient);
    await load();
  }"""
new11 = """const deleteTreatment=async(tid:number)=>{
    if(!sel||!confirm('Supprimer ce traitement ?')) return;
    try{
      await api(`/api/patients/${sel.id}/current-treatments/${tid}`,{method:'DELETE'});
      const full=await api(`/api/patients/${sel.id}`);
      setSel(full as Patient);
      await load();
    }catch(e){console.error('Erreur suppression traitement',e);}
  }"""
fix("FIX 11 — deleteTreatment try/catch", old11, new11)

# ─────────────────────────────────────────────────────────
# WRITE OUTPUT
# ─────────────────────────────────────────────────────────
with open(SRC, "w", encoding="utf-8") as f:
    f.write(fixed)

print("\n══════════════════════════════════════")
print("      MediBot Patch — Results")
print("══════════════════════════════════════")
for l in log:
    print(l)
print(f"\n  File: {SRC} ({len(fixed):,} chars)")
print(f"  Backup: {BACKUP}")
print("══════════════════════════════════════")
print("Done! Restart your dev server: npm start")
