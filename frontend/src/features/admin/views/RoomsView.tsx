import { useEffect, useState } from 'react';
import { AlertTriangle, Bed, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { Badge, Spinner } from '@/shared/components/ui';
import { useTheme } from '@/shared/context/ThemeContext';
import { api, normalizePatients } from '@/shared/lib/api';
import type { Patient, Room } from '@/shared/types/domain';

export function RoomsView() {
  const { dark } = useTheme();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [sel, setSel] = useState<Room | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [busy, setBusy] = useState(true);
  const [loadingP, setLoadingP] = useState(false);
  const [loadError, setLoadError] = useState<string>('');

  useEffect(() => {
    api('/api/rooms')
      .then(setRooms)
      .catch((error) => {
        console.error('Error loading rooms:', error);
        setRooms([]);
      })
      .finally(() => setBusy(false));
  }, []);

  const selectRoom = async (r: Room) => {
    setLoadError('');
    setLoadingP(true);
    try {
      const patientsData = await api(`/api/rooms/${r.id}/patients`);
      // Normalize patient data - backend already parses JSON fields (allergies, etc)
      const normalized = normalizePatients(patientsData);
      setPatients(normalized);
      setSel(r);
    } catch (error) {
      console.error('Error loading room patients:', error);
      setLoadError('Impossible de charger les patients de cette salle.');
      setSel(r);
      setPatients([]);
    } finally {
      setLoadingP(false);
    }
  };

  const card = dark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';

  if (busy) return <Spinner />;
  return (
    <div className="p-8">
      <h1 className={`text-2xl font-black mb-1 ${dark ? 'text-white' : 'text-gray-900'}`}>Salles d&apos;hospitalisation</h1>
      <p className={`text-sm mb-6 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Cliquez sur une salle pour voir les patients</p>
      <div className="grid grid-cols-5 gap-3 mb-8">
        {rooms.map((r) => (
          <button
            key={r.id}
            onClick={() => selectRoom(r)}
            className={`relative p-4 rounded-2xl border-2 text-left transition-all shadow-sm
              ${
                sel?.id === r.id
                  ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/30'
                  : r.has_alert
                    ? 'border-red-200 bg-red-50 hover:border-red-400'
                    : dark
                      ? 'border-gray-700 bg-gray-800 hover:border-gray-500'
                      : 'border-gray-200 bg-white hover:shadow'
              }`}
          >
            {r.has_alert && <AlertTriangle className="w-3.5 h-3.5 text-red-500 absolute top-2.5 right-2.5" />}
            <p className={`font-black text-lg ${sel?.id === r.id ? 'text-teal-700' : dark ? 'text-white' : 'text-gray-900'}`}>
              {r.name}
            </p>
            <div className="flex gap-1 mt-2">
              {Array.from({ length: r.capacity }).map((_, i) => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-full ${i < r.occupied ? 'bg-teal-400' : dark ? 'bg-gray-600' : 'bg-gray-200'}`}
                />
              ))}
            </div>
            <p className={`text-xs mt-1 ${dark ? 'text-gray-400' : 'text-gray-400'}`}>
              {r.occupied}/{r.capacity} lits
            </p>
          </button>
        ))}
      </div>
      <AnimatePresence>
        {sel && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`${card} border rounded-2xl p-6 shadow-sm`}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className={`text-lg font-black ${dark ? 'text-white' : 'text-gray-900'}`}>{sel.name} — Patients</h2>
              <button
                onClick={() => {
                  setSel(null);
                  setPatients([]);
                }}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                  dark ? 'bg-gray-700 text-gray-400 hover:bg-gray-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {loadError && (
              <div className={`p-4 rounded-lg border flex items-center gap-3 ${
                dark ? 'bg-red-900/20 border-red-700 text-red-200' : 'bg-red-50 border-red-200 text-red-700'
              }`}>
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                <p className="font-semibold">{loadError}</p>
              </div>
            )}
            {loadingP ? (
              <Spinner />
            ) : !loadError && patients.length === 0 ? (
              <div className={`text-center py-10 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
                <Bed className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="font-bold">Salle vide</p>
              </div>
            ) : !loadError ? (
              <div className="grid grid-cols-2 gap-4">
                {patients.map((p) => (
                  <div
                    key={`room-${p.room_id}-bed-${p.bed}-patient-${p.id}`}
                    className={`rounded-xl p-4 border flex items-start gap-3 ${
                      dark ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-100'
                    }`}
                  >
                    {p.photo ? (
                      <img
                        src={p.photo}
                        alt={p.full_name ?? 'Patient'}
                        className="w-12 h-12 rounded-xl object-cover flex-shrink-0 border-2 border-white shadow-sm"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-700 font-black text-sm flex-shrink-0">
                        {(p.full_name ?? '—')
                          ?.split(' ')
                          .map((w: string) => w[0])
                          .join('')
                          .slice(0, 2)}
                      </div>
                    )}
                    <div className="flex-1">
                      <p className={`font-black ${dark ? 'text-white' : 'text-gray-900'}`}>{p.full_name ?? '—'}</p>
                      <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                        {p.age ?? '—'} ans · {p.weight ?? '—'} · <span className="font-mono font-bold">{p.blood_type ?? '—'}</span>
                      </p>
                      <p className={`text-sm ${dark ? 'text-gray-300' : 'text-gray-600'}`}>{p.diagnostic ?? '—'}</p>
                      {p.allergies && Array.isArray(p.allergies) && p.allergies.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {p.allergies.map((a: any, i: number) => {
                            const allergyText = typeof a === 'string' ? a : (a?.medication || '—');
                            return <Badge key={`allergy-${p.id}-${allergyText}-${i}`} text={allergyText} color="red" />;
                          })}
                        </div>
                      )}
                    </div>
                    <span
                      className={`text-xs px-2 py-1 rounded-lg font-bold border ${
                        dark ? 'bg-gray-700 border-gray-600 text-gray-300' : 'bg-white border-gray-200 text-gray-500'
                      }`}
                    >
                      Lit {p.bed ?? '—'}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
