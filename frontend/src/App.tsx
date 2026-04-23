import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ThemeProvider } from '@/shared/context/ThemeContext';
import KioskView from '@/features/kiosk/KioskView';
import { AdminShell, LoginView } from '@/features/admin/AdminShell';
import type { AppMode, Doctor } from '@/shared/types';

export default function App() {
  const [mode, setMode] = useState<AppMode>('kiosk');
  const [currentDoctor, setCurrentDoctor] = useState<Doctor | null>(null);

  return (
    <ThemeProvider>
      <AnimatePresence mode="wait">
        {!currentDoctor && mode === 'admin' ? (
          <motion.div key="login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <LoginView onLoginSuccess={(doc) => setCurrentDoctor(doc)} />
          </motion.div>
        ) : mode === 'kiosk' ? (
          <motion.div key="kiosk" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <KioskView onSwitchToAdmin={() => setMode('admin')} />
          </motion.div>
        ) : (
          <motion.div key="admin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-screen">
            <AdminShell onSwitchToKiosk={() => setMode('kiosk')} currentDoctor={currentDoctor} onLogout={() => setCurrentDoctor(null)} />
          </motion.div>
        )}
      </AnimatePresence>
    </ThemeProvider>
  );
}
