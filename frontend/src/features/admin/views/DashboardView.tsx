import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Pill,
  RefreshCw,
  Stethoscope,
  Users,
  X,
} from 'lucide-react';

import { Badge, Spinner, SystemStatusPill } from '@/shared/components/ui';
import { useTheme } from '@/shared/context/ThemeContext';
import { api } from '@/shared/lib/api';
import type { LogEntry, Room, Stats, TechStatus } from '@/shared/types/domain';

export function DashboardView({ techStatus }: { techStatus: TechStatus | null }) {
  const { dark } = useTheme();
  const [stats, setStats] = useState<Stats | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [s, l, r] = await Promise.all([api('/api/stats'), api('/api/log'), api('/api/rooms')]);
      setStats(s);
      setLog(l);
      setRooms(r);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      setStats(null);
      setLog([]);
      setRooms([]);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  if (busy && !stats) return <Spinner />;

  const card = dark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const kpis = stats
    ? [
        {
          label: 'Patients',
          value: stats.total_patients,
          icon: Users,
          color: 'text-blue-500',
          bg: dark ? 'bg-blue-900/30' : 'bg-blue-50',
          border: dark ? 'border-blue-800' : 'border-blue-100',
        },
        {
          label: 'Alertes allergies',
          value: stats.alert_patients,
          icon: AlertTriangle,
          color: 'text-red-500',
          bg: dark ? 'bg-red-900/30' : 'bg-red-50',
          border: dark ? 'border-red-800' : 'border-red-100',
        },
        {
          label: 'Médecins',
          value: stats.total_doctors,
          icon: Stethoscope,
          color: 'text-violet-500',
          bg: dark ? 'bg-violet-900/30' : 'bg-violet-50',
          border: dark ? 'border-violet-800' : 'border-violet-100',
        },
        {
          label: "Distributions aujourd'hui",
          value: stats.dispenses_today,
          icon: Pill,
          color: 'text-teal-500',
          bg: dark ? 'bg-teal-900/30' : 'bg-teal-50',
          border: dark ? 'border-teal-800' : 'border-teal-100',
        },
        {
          label: 'Total distributions',
          value: stats.total_dispenses ?? 0,
          icon: Activity,
          color: 'text-rose-500',
          bg: dark ? 'bg-rose-900/30' : 'bg-rose-50',
          border: dark ? 'border-rose-800' : 'border-rose-100',
        },
      ]
    : [];

  return (
    <div className="p-8 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-2xl font-black ${dark ? 'text-white' : 'text-gray-900'}`}>Tableau de bord</h1>
          <p className={`text-sm mt-0.5 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
            Service de Pédiatrie — Hôpital de Rouiba
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SystemStatusPill techStatus={techStatus} />
          <button
            onClick={load}
            className={`flex items-center gap-2 border px-3 py-2 rounded-xl text-sm transition-all ${
              dark
                ? 'border-gray-700 text-gray-400 hover:text-teal-400'
                : 'border-gray-200 text-gray-500 hover:text-teal-600'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} /> Actualiser
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className={`${k.bg} border ${k.border} rounded-2xl p-5`}>
            <div className="flex items-center justify-between mb-3">
              <span className={`text-sm font-semibold ${dark ? 'text-gray-300' : 'text-gray-500'}`}>{k.label}</span>
              <k.icon className={`w-5 h-5 ${k.color}`} />
            </div>
            <p className={`text-4xl font-black ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className={`${card} border rounded-2xl p-5 shadow-sm`}>
          <h2 className={`text-base font-black mb-4 ${dark ? 'text-white' : 'text-gray-800'}`}>⚠️ Salles en alerte</h2>
          {rooms.filter((r) => r.has_alert).length === 0 ? (
            <div className="text-center py-6">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-400" />
              <p className={`text-sm font-bold ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Aucune alerte</p>
            </div>
          ) : (
            rooms
              .filter((r) => r.has_alert)
              .map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between bg-red-50 border border-red-100 rounded-xl p-3 mb-2"
                >
                  <span className="font-bold text-red-700">{r.name}</span>
                  <Badge text="Allergie" color="red" />
                </div>
              ))
          )}
        </div>

        <div className={`${card} border rounded-2xl p-5 shadow-sm`}>
          <h2 className={`text-base font-black mb-4 ${dark ? 'text-white' : 'text-gray-800'}`}>🏥 Occupation des salles</h2>
          <div className="space-y-2.5">
            {rooms.map((r) => (
              <div key={r.id} className="flex items-center gap-3">
                <span className={`text-xs font-bold w-16 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{r.name}</span>
                <div className={`flex-1 rounded-full h-2 ${dark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                  <div className="bg-teal-500 h-2 rounded-full" style={{ width: `${(r.occupied / r.capacity) * 100}%` }} />
                </div>
                <span className={`text-xs font-bold w-8 text-right ${dark ? 'text-gray-300' : 'text-gray-600'}`}>
                  {r.occupied}/{r.capacity}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className={`${card} border rounded-2xl p-5 shadow-sm`}>
          <h2 className={`text-base font-black mb-4 ${dark ? 'text-white' : 'text-gray-800'}`}>📦 Dernières distributions</h2>
          <div className="space-y-2">
            {log.slice(0, 5).map((e, i) => (
              <div key={`log-${e.id}-${i}`} className={`flex items-center gap-3 p-2 rounded-xl ${dark ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                <Pill className="w-4 h-4 text-teal-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold truncate ${dark ? 'text-white' : 'text-gray-800'}`}>{e.med_name}</p>
                  <p className={`text-xs ${dark ? 'text-gray-400' : 'text-gray-400'}`}>{e.timestamp}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {e.dose_status === 'prise_confirmee' && (
                    <span className="text-[10px] font-black text-emerald-600" title={e.prise_confirmed_by || ''}>
                      Prise ✓
                    </span>
                  )}
                  {e.mqtt_sent ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <X className="w-4 h-4 text-red-400" />
                  )}
                </div>
              </div>
            ))}
            {log.length === 0 && (
              <p className={`text-sm text-center py-4 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Aucune distribution</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
