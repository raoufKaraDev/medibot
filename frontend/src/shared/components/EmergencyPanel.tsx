import React, { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';

import { useTheme } from '@/shared/context/ThemeContext';
import { api } from '@/shared/lib/api';
import type { EmergencyDoseLine, EmergencyDosePayload } from '@/shared/types/domain';

export default function EmergencyPanel({ patientId, weight }: { patientId: number; weight?: number | string | null }) {
  const { dark } = useTheme();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<EmergencyDosePayload | null>(null);

  useEffect(() => {
    let mounted = true;
    setBusy(true);
    api(`/api/patients/${patientId}/emergency-doses`)
      .then((res) => {
        if (mounted) setData(res as EmergencyDosePayload);
      })
      .catch(() => {
        if (mounted) setData(null);
      })
      .finally(() => {
        if (mounted) setBusy(false);
      });
    return () => {
      mounted = false;
    };
  }, [patientId]);

  const subtitle = data?.weight_kg ?? (typeof weight === 'number' ? weight : weight ?? '�');
  const items: Array<[string, EmergencyDoseLine | undefined]> = [
    ['Adrenaline', data?.adrenaline],
    ['Diazapam', data?.diazepam],
    ['Atropine', data?.atropine],
    ['Hydrocortisone', data?.hydrocortisone],
  ];

  return (
    <div className={`rounded-2xl border ${dark ? 'bg-red-950/30 border-red-900' : 'bg-red-50 border-red-200'}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${dark ? 'bg-red-900 text-red-200' : 'bg-red-100 text-red-600'}`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <p className={`font-black ${dark ? 'text-red-100' : 'text-red-800'}`}>Doses d'Urgence</p>
            <p className={`text-xs ${dark ? 'text-red-300' : 'text-red-600'}`}>Basé sur {subtitle}kg</p>
          </div>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-red-500" /> : <ChevronRight className="w-4 h-4 text-red-500" />}
      </button>
      {open && (
        <div className="px-4 pb-4">
          {busy ? (
            <p className={`text-sm ${dark ? 'text-red-200' : 'text-red-700'}`}>Chargement...</p>
          ) : !data ? (
            <p className={`text-sm ${dark ? 'text-red-200' : 'text-red-700'}`}>Calcul indisponible.</p>
          ) : (
            <div className="space-y-2">
              {items.map(([name, line]) => (
                <div key={name} className={`grid grid-cols-4 gap-2 rounded-xl border px-3 py-2 text-sm ${dark ? 'border-red-900 bg-red-950/20 text-red-100' : 'border-red-100 bg-white/70 text-red-900'}`}>
                  <span className="font-bold">{name}</span>
                  <span>{line?.formula}</span>
                  <span>{line?.dose_mg ?? '�'} mg</span>
                  <span>{line?.volume_ml == null ? '� ml' : `${line.volume_ml} ml`}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
