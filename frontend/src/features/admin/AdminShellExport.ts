// Barrel re-export for AdminShell.
// AdminShell.tsx exports LoginView as named but has no `export default`.
// We import everything as a namespace and expose the main shell component as default.
import * as M from './AdminShell';

export const LoginView = M.LoginView;

// Find the AdminShell component: try explicit name, then `default`, then the
// first exported function that is not LoginView.
const shell: React.ComponentType<any> =
  (M as any).AdminShell ??
  (M as any).default ??
  (Object.values(M).find(
    (v) => typeof v === 'function' && v !== M.LoginView
  ) as React.ComponentType<any>);

export { shell as AdminShell };
export default shell;

import React from 'react';
