/** Theme-aware Tailwind class helper (admin extras, legacy views). */
export const tc = (light: string, dark: string, isDark: boolean) => (isDark ? dark : light);
