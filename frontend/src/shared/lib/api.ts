import appConfig from './config';

/** Typed JSON fetch helper used across admin views and extras. */
export const api = async (path: string, opts?: RequestInit) => {
  const r = await fetch(`${appConfig.apiBaseUrl}${path}`, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};

/**
 * Parse weight from string (e.g., '21 kg', '21.5', '12.3kg') to number.
 */
function parseWeightToNumber(weight: any): number {
  if (typeof weight === 'number') return weight;
  if (!weight) return 0;
  const match = String(weight).match(/([\d.]+)/);
  return match ? parseFloat(match[1]) : 0;
}

/**
 * Normalize patient data from backend field names to frontend field names.
 * Backend: first_name, last_name, weight_kg, room_id, bed, date_naissance, drug_allergies, etc.
 * Frontend: nom, prenom, poids, chambre_id, lit, ddn, allergie_medicaments, etc.
 */
export function normalizePatient(p: any) {
  if (!p) return p;
  const weightNum = parseWeightToNumber(p.weight_kg ?? p.poids ?? p.weight ?? 0);
  return {
    ...p,
    // Map backend names to frontend names (with fallback to existing names)
    nom: p.last_name ?? p.nom ?? '',
    prenom: p.first_name ?? p.prenom ?? '',
    poids: weightNum,
    ddn: p.date_naissance ?? p.ddn ?? '',
    chambre_id: p.room_id ?? p.chambre_id ?? null,
    lit: p.bed ?? p.lit ?? null,
    allergie_medicaments: p.drug_allergies ?? p.allergie_medicaments ?? [],
    autres_allergies: p.other_allergies ?? p.autres_allergies ?? [],
    vaccinations: Array.isArray(p.vaccinations) ? p.vaccinations : [],
    tuteur: p.guardian ?? p.tuteur ?? null,
    // Keep original fields as well for compatibility
    first_name: p.first_name ?? p.prenom ?? '',
    last_name: p.last_name ?? p.nom ?? '',
    weight_kg: weightNum,
    room_id: p.room_id ?? p.chambre_id ?? null,
    bed: p.bed ?? p.lit ?? null,
    date_naissance: p.date_naissance ?? p.ddn ?? '',
    drug_allergies: p.drug_allergies ?? p.allergie_medicaments ?? [],
    other_allergies: p.other_allergies ?? p.autres_allergies ?? [],
    guardian: p.guardian ?? p.tuteur ?? null,
  };
}

/**
 * Normalize an array of patients.
 */
export function normalizePatients(patients: any[]) {
  return (patients || []).map(normalizePatient);
}
