// AdminShell.tsx has no `export default`.
// We import everything from it and re-export AdminShell as the default.
import * as AdminShellModule from './AdminShell';

// LoginView is a named export — pass it through
export const LoginView = AdminShellModule.LoginView;

// AdminShell is the main component — it must be exported as named too,
// so App.tsx can import it. We expose it as both named and default.
export const AdminShell = (AdminShellModule as any).AdminShell
  ?? (AdminShellModule as any).default
  ?? Object.values(AdminShellModule).find(
      (v) => typeof v === 'function' && v !== AdminShellModule.LoginView
    );

export default AdminShell;
