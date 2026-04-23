export function formatPedAge(iso?: string | null, fallbackAge?: number): string {
  if (!iso) {
    if (fallbackAge !== undefined) return `${fallbackAge} ans`;
    return '—';
  }
  const birth = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(birth.getTime())) {
    return fallbackAge !== undefined ? `${fallbackAge} ans` : '—';
  }
  const now = new Date();
  const totalDays = Math.floor((now.getTime() - birth.getTime()) / 86400000);
  if (totalDays < 30) {
    return `${totalDays} jour${totalDays > 1 ? 's' : ''}`;
  }
  const totalMonths = Math.floor(totalDays / 30.4375);
  if (totalMonths < 24) {
    return `${totalMonths} mois`;
  }
  const yrs = Math.floor(totalMonths / 12);
  const mths = totalMonths % 12;
  if (yrs < 6) {
    return mths > 0 ? `${yrs} ans, ${mths} mois` : `${yrs} ans`;
  }
  return `${yrs} ans`;
}

export function formatBirthFr(iso: string | undefined | null, fallbackAge: number): string {
  if (!iso) return `${fallbackAge} ans`;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return `${fallbackAge} ans`;
  const label = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const formatted = formatPedAge(iso, fallbackAge);
  return `${label} · ${formatted}`;
}
