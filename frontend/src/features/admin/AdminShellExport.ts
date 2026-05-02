// Re-export barrel — App.tsx imports `AdminShell` (default) and `LoginView` (named)
// AdminShell.tsx uses `export const LoginView` and `export default function AdminShell`
// This file is a safety net; the real fix is the default export in AdminShell.tsx itself.
export { default, LoginView } from './AdminShell';
