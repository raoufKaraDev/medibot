import type { TechStatus } from '@/shared/types/domain';

export const SystemStatusPill = ({ techStatus }: { techStatus: TechStatus | null }) => {
  const ok = techStatus?.mqtt_broker === 'online';
  const partial = !ok && techStatus !== null;
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold ${
        ok
          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
          : partial
            ? 'bg-amber-50 border-amber-200 text-amber-700'
            : 'bg-gray-50 border-gray-200 text-gray-400'
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full ${
          ok ? 'bg-emerald-500 animate-pulse' : partial ? 'bg-amber-500' : 'bg-gray-300'
        }`}
      />
      {ok ? 'Robot opérationnel' : partial ? 'Vérification...' : 'Hors ligne'}
    </div>
  );
};
