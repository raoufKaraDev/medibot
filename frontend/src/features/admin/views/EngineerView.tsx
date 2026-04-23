import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Activity,
  Bell,
  Bot,
  ChevronRight,
  Cpu,
  LayoutDashboard,
  Menu,
  OctagonAlert,
  Radio,
  Settings,
  Terminal,
  ThermometerSun,
  User,
  Wifi,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import mqtt from 'mqtt';

import type { RobotStatus } from '@/shared/lib/mqtt';

const BG = '#040e1e';
const ACCENT = '#73f1e4';

type MqttLogLine = {
  id: string;
  at: number;
  topic: string;
  payload: string;
};

function topicTagClass(topic: string): string {
  if (topic.includes('status')) return 'text-[#73f1e4]';
  if (topic.includes('ack')) return 'text-amber-400';
  if (topic.includes('rfid')) return 'text-violet-400';
  if (topic.includes('cmd')) return 'text-rose-400';
  if (topic.includes('dispense')) return 'text-emerald-400';
  return 'text-slate-400';
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/** Same parsing idea as mqtt.ts (read-only duplicate for live engineer view — separate WebSocket client). */
function parseStm32(raw: unknown): RobotStatus['stm32'] {
  if (raw === 'ready' || raw === 'busy') return raw;
  if (raw === 'online') return 'ready';
  return 'offline';
}

export function EngineerView({ onAdminNav }: { onAdminNav?: (view: string) => void }) {
  const [sysStatus, setSysStatus] = useState<RobotStatus>({
    mqtt: 'offline',
    esp32: 'unknown',
    stm32: 'unknown',
    battery: null,
    rssi: null,
  });
  const [lines, setLines] = useState<MqttLogLine[]>([]);
  const [latencyMs, setLatencyMs] = useState<number[]>([]);
  const [auditRows, setAuditRows] = useState<
    Array<{
      id: number;
      timestamp: string;
      utilisateur_nom: string;
      role: string;
      action: string;
      detail: string;
      ip_address: string;
      statut: string;
    }>
  >([]);
  const [auditAction, setAuditAction] = useState('');
  const [auditUser, setAuditUser] = useState('');
  const [auditDate, setAuditDate] = useState('');
  const [coreTemp, setCoreTemp] = useState<number | null>(null);
  const [cpuPct, setCpuPct] = useState<number | null>(null);
  const [uptimeSec, setUptimeSec] = useState(0);
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const mountRef = useRef(Date.now());

  useEffect(() => {
    const t = setInterval(() => setUptimeSec(Math.floor((Date.now() - mountRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const loadAudit = useCallback(async () => {
    try {
      const u = new URLSearchParams();
      u.set('limit', '100');
      if (auditAction.trim()) u.set('action', auditAction.trim());
      if (auditUser.trim()) u.set('utilisateur', auditUser.trim());
      if (auditDate.trim()) u.set('date', auditDate.trim());
      const r = await fetch(`/api/audit-log?${u.toString()}`);
      if (!r.ok) return;
      const j = (await r.json()) as typeof auditRows;
      setAuditRows(Array.isArray(j) ? j : []);
    } catch {
      setAuditRows([]);
    }
  }, [auditAction, auditUser, auditDate]);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch('/api/audit-log?limit=100');
        if (!r.ok) return;
        const j = (await r.json()) as typeof auditRows;
        setAuditRows(Array.isArray(j) ? j : []);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useLayoutEffect(() => {
    const el = terminalRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lines]);

  useEffect(() => {
    const host = window.location.hostname;
    const c = mqtt.connect(`ws://${host}:9001`, {
      clientId: 'medibot_engineer_' + Math.random().toString(16).slice(2, 10),
      connectTimeout: 5000,
      reconnectPeriod: 3000,
    });

    setSysStatus((s) => ({ ...s, mqtt: 'connecting' }));

    c.on('connect', () => {
      setSysStatus((s) => ({ ...s, mqtt: 'online', esp32: 'unknown', stm32: 'unknown' }));
      c.subscribe('robot/ROBOT001/#');
    });

    c.on('disconnect', () => {
      setSysStatus({ mqtt: 'offline', esp32: 'offline', stm32: 'offline', battery: null, rssi: null });
    });

    c.on('error', () => {
      setSysStatus((s) => ({ ...s, mqtt: 'offline' }));
    });

    c.on('message', (topic: unknown, message: unknown) => {
      const tStr = String(topic);
      const payload =
        message != null && typeof (message as { toString?: () => string }).toString === 'function'
          ? (message as { toString: () => string }).toString()
          : String(message);
      const now = Date.now();
      const id = `${now}-${Math.random().toString(16).slice(2)}`;

      setLines((prev) => {
        const next = [...prev, { id, at: now, topic: tStr, payload }];
        return next.length > 500 ? next.slice(-500) : next;
      });

      const prev = lastTsRef.current;
      if (prev != null) {
        const delta = Math.min(800, Math.max(1, now - prev));
        setLatencyMs((arr) => [...arr.slice(-35), delta]);
      }
      lastTsRef.current = now;

      if (tStr === 'robot/ROBOT001/status') {
        try {
          const data = JSON.parse(payload) as Record<string, unknown>;
          setSysStatus({
            mqtt: 'online',
            esp32: data.esp32 === 'online' ? 'online' : 'offline',
            stm32: parseStm32(data.stm32),
            battery:
              typeof data.bat === 'number'
                ? data.bat
                : typeof data.battery === 'number'
                  ? data.battery
                  : null,
            rssi:
              typeof data.rssi === 'number'
                ? data.rssi
                : typeof data.wifi_rssi === 'number'
                  ? data.wifi_rssi
                  : null,
          });
          const tRaw = data.core_temp ?? data.temp ?? data.t_cpu;
          if (typeof tRaw === 'number') setCoreTemp(tRaw);
          else if (typeof tRaw === 'string') {
            const n = parseFloat(tRaw);
            if (!Number.isNaN(n)) setCoreTemp(n);
          }
          const cRaw = data.cpu ?? data.cpu_pct;
          if (typeof cRaw === 'number') setCpuPct(Math.round(Math.min(100, Math.max(0, cRaw))));
          else if (typeof cRaw === 'string') {
            const n = parseFloat(cRaw);
            if (!Number.isNaN(n)) setCpuPct(Math.round(Math.min(100, Math.max(0, n))));
          }
        } catch {
          /* ignore */
        }
      }
    });

    return () => {
      try {
        c.end(true);
      } catch {
        /* ignore */
      }
    };
  }, []);

  const go = useCallback(
    (id: string) => {
      onAdminNav?.(id);
    },
    [onAdminNav],
  );

  const wifiPct = sysStatus.rssi != null ? Math.min(100, Math.max(8, 100 + sysStatus.rssi)) : 72;
  const displayTemp = coreTemp ?? 42;
  const displayCpu = cpuPct ?? 18;

  const maxLat = Math.max(50, ...latencyMs, 1);
  const bars = latencyMs.slice(-24);

  return (
    <div
      className="h-full min-h-0 flex flex-col text-slate-200 overflow-hidden"
      style={{
        backgroundColor: BG,
        fontFamily: '"Plus Jakarta Sans", "Be Vietnam Pro", system-ui, sans-serif',
      }}
    >
      {/* matrix grid */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.35] z-0"
        style={{
          backgroundImage: `linear-gradient(rgba(115,241,228,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(115,241,228,0.06) 1px, transparent 1px)`,
          backgroundSize: '28px 28px',
        }}
      />
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: `radial-gradient(ellipse 80% 50% at 50% -20%, ${ACCENT}22, transparent 55%)`,
        }}
      />

      {/* Top navbar */}
      <header
        className="relative z-20 flex-shrink-0 flex items-center justify-between gap-4 px-4 md:px-6 py-3 border-b border-white/10 backdrop-blur-md bg-[#040e1e]/85"
        style={{ boxShadow: `0 0 40px ${ACCENT}12` }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            className="md:hidden p-2 rounded-xl border border-white/10 text-slate-300 hover:bg-white/5"
            aria-label="Menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${ACCENT}33, transparent)`, border: `1px solid ${ACCENT}44` }}
            >
              <Bot className="w-6 h-6" style={{ color: ACCENT }} />
            </div>
            <div className="min-w-0">
              <p className="font-extrabold text-sm md:text-base tracking-tight text-white truncate">MediBot</p>
              <p className="text-[10px] md:text-xs font-semibold uppercase tracking-widest" style={{ color: ACCENT }}>
                Ingénieur
              </p>
            </div>
          </div>
        </div>

        <nav className="hidden lg:flex items-center gap-1">
          {([
            ['Tableau de bord', 'dashboard'],
            ['Salles', 'rooms'],
            ['Patients', 'patients'],
            ['Analytique', 'analytics'],
          ] as Array<[string, string]>).map(([label, id]) => (
            <button
              key={id}
              type="button"
              onClick={() => go(id)}
              className="px-3 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="hidden sm:flex p-2 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
          </button>
          <button
            type="button"
            className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full border border-white/10 bg-white/5 hover:bg-white/10"
          >
            <span className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-400/40 to-slate-600 flex items-center justify-center">
              <User className="w-4 h-4 text-slate-200" />
            </span>
            <span className="hidden sm:inline text-xs font-bold text-slate-300">Ingénieur</span>
          </button>
        </div>
      </header>

      <div className="relative z-10 flex flex-1 min-h-0">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex w-56 flex-shrink-0 flex-col border-r border-white/10 bg-[#061525]/95 backdrop-blur-sm">
          <nav className="flex-1 p-3 space-y-1">
            {([
              ['Vue live', 'engineer', Radio],
              ['Tableau de bord', 'dashboard', LayoutDashboard],
              ['Salles', 'rooms', Zap],
              ['Vue technique', 'tech', Settings],
            ] as Array<[string, string, LucideIcon]>).map(([label, id, Icon]) => (
              <button
                key={String(id)}
                type="button"
                onClick={() => go(String(id))}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm font-bold transition-colors ${
                  id === 'engineer' ? 'text-[#040e1e] shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
                style={id === 'engineer' ? { background: ACCENT, boxShadow: `0 0 24px ${ACCENT}44` } : undefined}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
                <ChevronRight className="w-3 h-3 ml-auto opacity-50" />
              </button>
            ))}
          </nav>
          <div className="p-3 border-t border-white/10">
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Déclencher un arrêt d’urgence logiciel ? (Simulation)')) {
                  window.alert('Signal d’arrêt envoyé (simulation).');
                }
              }}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-black text-xs uppercase tracking-wide text-white bg-red-600 hover:bg-red-500 border border-red-400/50 shadow-lg shadow-red-900/40"
            >
              <OctagonAlert className="w-4 h-4" />
              Arrêt d’urgence
            </button>
          </div>
        </aside>

        {/* Main — 12-col grid */}
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-4 md:p-6 pb-24 md:pb-6">
          <div className="max-w-7xl mx-auto grid grid-cols-12 gap-4 md:gap-5">
            {/* Header row */}
            <div className="col-span-12 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
              <div>
                <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">Statut Live Ingénieur</h1>
                <p className="text-sm text-slate-500 mt-1 font-medium">Surveillance MQTT · ROBOT001</p>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs font-mono" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                <div
                  className="px-3 py-2 rounded-xl border border-white/10 bg-black/30"
                  style={{ boxShadow: `inset 0 0 20px ${ACCENT}0d` }}
                >
                  <span className="text-slate-500">UPTIME </span>
                  <span style={{ color: ACCENT }}>{formatUptime(uptimeSec)}</span>
                </div>
                <div className="px-3 py-2 rounded-xl border border-white/10 bg-black/30">
                  <span className="text-slate-500">IP </span>
                  <span className="text-slate-200">{window.location.hostname}</span>
                </div>
              </div>
            </div>

            {/* Connection status */}
            <section className="col-span-12 lg:col-span-5 rounded-2xl border border-white/10 bg-black/25 backdrop-blur-sm p-5" style={{ boxShadow: `0 0 48px ${ACCENT}0a` }}>
              <h2 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-widest text-slate-400 mb-4">
                <Wifi className="w-4 h-4" style={{ color: ACCENT }} />
                Connexion
              </h2>
              <ul className="space-y-3">
                {[
                  ['MQTT broker', sysStatus.mqtt],
                  ['ESP32', sysStatus.esp32],
                  ['STM32', sysStatus.stm32],
                ].map(([label, val]) => (
                  <li
                    key={String(label)}
                    className="flex items-center justify-between gap-3 py-2 border-b border-white/5 last:border-0"
                  >
                    <span className="text-sm font-semibold text-slate-400">{label}</span>
                    <span
                      className={`text-xs font-mono font-bold uppercase ${
                        val === 'online' || val === 'ready'
                          ? 'text-emerald-400'
                          : val === 'connecting' || val === 'busy' || val === 'unknown'
                            ? 'text-amber-400'
                            : 'text-red-400'
                      }`}
                    >
                      {String(val)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 pt-4 border-t border-white/10">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2">
                  <span>Wi‑Fi (indicatif)</span>
                  <span className="font-mono text-slate-300">{sysStatus.rssi != null ? `${sysStatus.rssi} dBm` : '—'}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${wifiPct}%`,
                      background: `linear-gradient(90deg, ${ACCENT}, #22c55e)`,
                      boxShadow: `0 0 12px ${ACCENT}66`,
                    }}
                  />
                </div>
              </div>
            </section>

            {/* Health snapshot */}
            <section className="col-span-12 lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div
                className="rounded-2xl border border-white/10 p-5 flex flex-col justify-between min-h-[140px]"
                style={{
                  background: `linear-gradient(145deg, rgba(115,241,228,0.08), transparent)`,
                  boxShadow: `0 0 40px ${ACCENT}12`,
                }}
              >
                <div className="flex items-center gap-2 text-slate-400 text-xs font-extrabold uppercase tracking-widest">
                  <ThermometerSun className="w-4 h-4" style={{ color: ACCENT }} />
                  Temp. cœur
                </div>
                <p className="text-4xl font-black text-white mt-2">
                  {displayTemp.toFixed(1)}
                  <span className="text-lg text-slate-500 ml-1">°C</span>
                </p>
                <p className="text-[10px] text-slate-500 mt-2 font-mono">Télémétrie MQTT si disponible · sinon valeur de référence</p>
              </div>
              <div className="rounded-2xl border border-white/10 p-5 bg-black/20 flex flex-col justify-between min-h-[140px]">
                <div className="flex items-center gap-2 text-slate-400 text-xs font-extrabold uppercase tracking-widest">
                  <Cpu className="w-4 h-4 text-sky-400" />
                  Charge CPU
                </div>
                <p className="text-4xl font-black text-white mt-2">
                  {displayCpu}
                  <span className="text-lg text-slate-500 ml-1">%</span>
                </p>
                <p className="text-[10px] text-slate-500 mt-2 font-mono">Estimé depuis le bus · défaut 18%</p>
              </div>
            </section>

            {/* Latency chart */}
            <section className="col-span-12 lg:col-span-5 rounded-2xl border border-white/10 bg-black/20 p-5">
              <h2 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-widest text-slate-400 mb-4">
                <Activity className="w-4 h-4" style={{ color: ACCENT }} />
                Latence MQTT
              </h2>
              <div className="flex items-end justify-between gap-1 h-36 px-1">
                {bars.length === 0 ? (
                  <p className="text-xs text-slate-500 font-mono w-full text-center py-8">En attente de messages…</p>
                ) : (
                  bars.map((v, i) => (
                    <div
                      key={i}
                      className="flex-1 min-w-0 rounded-t-sm transition-all duration-300"
                      style={{
                        height: `${Math.max(6, (v / maxLat) * 100)}%`,
                        background: `linear-gradient(180deg, ${ACCENT}, ${ACCENT}44)`,
                        boxShadow: i === bars.length - 1 ? `0 0 16px ${ACCENT}55` : undefined,
                      }}
                    />
                  ))
                )}
              </div>
              <p className="text-[10px] text-slate-500 mt-3 font-mono">Δ entre messages consécutifs (ms) · max {Math.round(maxLat)} ms affiché</p>
            </section>

            {/* MQTT Terminal */}
            <section className="col-span-12 lg:col-span-7 rounded-2xl border border-white/10 overflow-hidden flex flex-col min-h-[280px] max-h-[420px] lg:max-h-none lg:min-h-[360px] bg-[#020810]">
              <div
                className="flex items-center justify-between px-4 py-3 border-b border-white/10"
                style={{ background: `linear-gradient(90deg, ${ACCENT}14, transparent)` }}
              >
                <h2 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-widest text-slate-300">
                  <Terminal className="w-4 h-4" style={{ color: ACCENT }} />
                  Terminal MQTT live
                </h2>
                <span className="text-[10px] font-mono text-slate-500">{lines.length} lignes</span>
              </div>
              <div
                ref={terminalRef}
                className="flex-1 overflow-y-auto overflow-x-auto p-4 font-mono text-[11px] leading-relaxed"
                style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace' }}
              >
                {lines.length === 0 ? (
                  <p className="text-slate-500">En attente de trafic sur robot/ROBOT001/# …</p>
                ) : (
                  lines.map((line) => (
                    <div key={line.id} className="border-b border-white/5 py-1.5 whitespace-pre-wrap break-all">
                      <span className="text-slate-500">
                        [{new Date(line.at).toLocaleTimeString('fr-FR', { hour12: false })}]
                      </span>{' '}
                      <span className={topicTagClass(line.topic)}>{line.topic}</span>
                      <span className="text-slate-600"> → </span>
                      <span className="text-slate-300">{line.payload}</span>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="col-span-12 rounded-2xl border border-amber-500/20 bg-black/30 p-5">
              <h2 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-widest text-amber-200/90 mb-4">
                <OctagonAlert className="w-4 h-4 text-amber-400" />
                Journal d&apos;audit
              </h2>
              <div className="flex flex-wrap gap-2 mb-4">
                <input
                  value={auditAction}
                  onChange={(e) => setAuditAction(e.target.value)}
                  placeholder="Action (ex. RFID_SCAN)"
                  className="flex-1 min-w-[140px] px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-slate-200 placeholder:text-slate-600"
                />
                <input
                  value={auditUser}
                  onChange={(e) => setAuditUser(e.target.value)}
                  placeholder="Utilisateur"
                  className="flex-1 min-w-[120px] px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-slate-200 placeholder:text-slate-600"
                />
                <input
                  type="date"
                  value={auditDate}
                  onChange={(e) => setAuditDate(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-slate-200"
                />
                <button
                  type="button"
                  onClick={() => loadAudit()}
                  className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wide text-black bg-amber-400 hover:bg-amber-300"
                >
                  Filtrer
                </button>
              </div>
              <div className="overflow-x-auto max-h-[360px] rounded-xl border border-white/10">
                <table className="w-full text-left text-[11px] font-mono">
                  <thead className="sticky top-0 bg-[#0a1624] text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="p-2">Date</th>
                      <th className="p-2">Utilisateur</th>
                      <th className="p-2">Rôle</th>
                      <th className="p-2">Action</th>
                      <th className="p-2">Statut</th>
                      <th className="p-2">Détail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-4 text-slate-500 text-center">
                          Aucune entrée
                        </td>
                      </tr>
                    ) : (
                      auditRows.map((row) => (
                        <tr key={row.id} className="border-t border-white/5 text-slate-300">
                          <td className="p-2 whitespace-nowrap text-slate-500">{row.timestamp}</td>
                          <td className="p-2">{row.utilisateur_nom || '—'}</td>
                          <td className="p-2">{row.role || '—'}</td>
                          <td className="p-2 text-amber-200/90">{row.action}</td>
                          <td className="p-2">{row.statut}</td>
                          <td className="p-2 max-w-[280px] truncate text-slate-500" title={row.detail}>
                            {row.detail}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t border-white/10 bg-[#040e1e]/95 backdrop-blur-md py-2 px-2 safe-area-pb" style={{ boxShadow: `0 -8px 32px ${ACCENT}12` }}>
        {([
          ['Accueil', 'dashboard', LayoutDashboard],
          ['Salles', 'rooms', Zap],
          ['Live', 'engineer', Radio],
          ['Tech', 'tech', Settings],
        ] as Array<[string, string, LucideIcon]>).map(([label, id, Icon]) => (
          <button
            key={String(id)}
            type="button"
            onClick={() => go(String(id))}
            className={`flex flex-col items-center gap-0.5 p-2 rounded-xl min-w-[56px] ${id === 'engineer' ? '' : 'text-slate-500'}`}
            style={id === 'engineer' ? { color: ACCENT } : undefined}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[9px] font-bold tracking-tight">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
