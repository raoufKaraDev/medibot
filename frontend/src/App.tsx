import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '@/shared/context/ThemeContext';
import KioskView from '@/features/kiosk/KioskView';
import { AdminShell, LoginView } from '@/features/admin/AdminShell';
import type { Doctor } from '@/shared/types';

const STORAGE_KEY = 'medibot_doctor';

function loadStoredDoctor(): Doctor | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Doctor) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [currentDoctor, setCurrentDoctor] = useState<Doctor | null>(loadStoredDoctor);

  const handleLoginSuccess = (doc: Doctor) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
    } catch {
      // storage unavailable — still works in-memory
    }
    setCurrentDoctor(doc);
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
    setCurrentDoctor(null);
  };

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
                    <LoginView onLoginSuccess={handleLoginSuccess} />
                  </motion.div>
                ) : (
                  <motion.div key="admin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-screen">
                    <AdminShell
                      onSwitchToKiosk={() => { window.location.href = '/kiosk'; }}
                      currentDoctor={currentDoctor}
                      onLogout={handleLogout}
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
