import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '@/shared/context/ThemeContext';
import KioskView from '@/features/kiosk/KioskView';
import AdminShell, { LoginView } from '@/features/admin/AdminShell';
import type { Doctor } from '@/shared/types';

export default function App() {
  const [currentDoctor, setCurrentDoctor] = useState<Doctor | null>(null);

  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/kiosk" replace />} />
          <Route
            path="/kiosk"
            element={(
              <AnimatePresence mode="wait">
                <motion.div key="kiosk" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <KioskView />
                </motion.div>
              </AnimatePresence>
            )}
          />
          <Route
            path="/admin"
            element={(
              <AnimatePresence mode="wait">
                {!currentDoctor ? (
                  <motion.div key="login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <LoginView onLoginSuccess={(doc) => setCurrentDoctor(doc)} />
                  </motion.div>
                ) : (
                  <motion.div key="admin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-screen">
                    <AdminShell
                      onSwitchToKiosk={() => { window.location.href = '/kiosk'; }}
                      currentDoctor={currentDoctor}
                      onLogout={() => setCurrentDoctor(null)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          />
          <Route path="*" element={<Navigate to="/kiosk" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
