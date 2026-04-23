/** dose_ml = (dose_mg * volume_ampoule_ml) / dose_ampoule_mg */
export function calcDoseMl(
  doseMg: number | null | undefined,
  volumeMl: number | null | undefined,
  doseAmpouleMg: number | null | undefined,
): number | null {
  if (doseMg == null || volumeMl == null || doseAmpouleMg == null) return null;
  if (doseAmpouleMg <= 0 || volumeMl <= 0) return null;
  return Math.round(((doseMg * volumeMl) / doseAmpouleMg) * 1000) / 1000;
}
