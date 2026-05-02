// MQTT WebSocket client — package npm `mqtt` (Mosquitto WebSocket on port 9001)
// NOTE: MQTT only works on the hospital LAN (192.168.1.x).
// On Vercel/HTTPS or any non-LAN host, connection is skipped gracefully.
import mqtt from 'mqtt';

const MQTT_WS_PORT = 9001;
const MQTT_CLIENT_TIMEOUT = 5000;
const MQTT_RECONNECT_PERIOD = 3000;

export const TOPICS = {
  STATUS: 'robot/ROBOT001/status',
  RFID: 'robot/ROBOT001/rfid',
  ACK: 'robot/ROBOT001/ack',
  DISPENSE: 'robot/ROBOT001/cmd/dispense',
} as const;

export type Stm32State = 'ready' | 'offline' | 'unknown' | 'busy';

export type RobotStatus = {
  mqtt: 'connecting' | 'online' | 'offline' | 'unavailable';
  esp32: 'online' | 'offline' | 'unknown';
  stm32: Stm32State;
  battery: number | null;
  rssi: number | null;
};

type StatusCallback = (status: RobotStatus) => void;
type RFIDCallback = (uid: string) => void;
type AckCallback = (drawer: number, ackStatus: string) => void;

let client: mqtt.MqttClient | null = null;
let statusCallback: StatusCallback | null = null;
let rfidCallback: RFIDCallback | null = null;
let ackCallback: AckCallback | null = null;
let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;

const HEARTBEAT_TIMEOUT = 45000;

/**
 * Returns true only when running on the hospital LAN.
 * Vercel / any HTTPS / non-192.168.x.x host → returns false.
 */
function isLanEnvironment(): boolean {
  const host = window.location.hostname;
  // localhost or 192.168.x.x LAN
  return host === 'localhost' || host === '127.0.0.1' || /^192\.168\./.test(host);
}

function clearHeartbeat() {
  if (heartbeatTimer) {
    clearTimeout(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function resetHeartbeatTimer() {
  clearHeartbeat();
  heartbeatTimer = setTimeout(() => {
    if (typeof statusCallback === 'function') {
      statusCallback({ mqtt: 'online', esp32: 'offline', stm32: 'offline', battery: null, rssi: null });
    }
  }, HEARTBEAT_TIMEOUT);
}

function parseStm32(raw: unknown): Stm32State {
  if (raw === 'ready' || raw === 'busy') return raw;
  if (raw === 'online') return 'ready';
  return 'offline';
}

function parseBattery(data: Record<string, unknown>): number | null {
  const b = data.bat ?? data.battery ?? data.batt;
  if (typeof b === 'number' && !Number.isNaN(b)) return Math.max(0, Math.min(100, Math.round(b)));
  if (typeof b === 'string' && b.trim() !== '') {
    const n = parseInt(b, 10);
    if (!Number.isNaN(n)) return Math.max(0, Math.min(100, n));
  }
  return null;
}

function parseRssi(data: Record<string, unknown>): number | null {
  const r = data.rssi ?? data.wifi_rssi;
  if (typeof r === 'number' && !Number.isNaN(r)) return r;
  if (typeof r === 'string') {
    const n = parseInt(r, 10);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

export function connectMQTT(onStatus: StatusCallback, onRFID: RFIDCallback, onAck: AckCallback) {
  statusCallback = onStatus;
  rfidCallback = onRFID;
  ackCallback = onAck;

  // On Vercel/HTTPS/non-LAN: skip silently, show robot as unavailable
  if (!isLanEnvironment()) {
    console.info('[MQTT] Non-LAN environment detected — MQTT disabled (demo/preview mode).');
    onStatus({ mqtt: 'unavailable', esp32: 'offline', stm32: 'offline', battery: null, rssi: null });
    return;
  }

  if (client && client.connected) { resetHeartbeatTimer(); return; }
  if (client && !client.connected && client.reconnecting) { resetHeartbeatTimer(); return; }
  if (client && !client.reconnecting) { client = null; }

  onStatus({ mqtt: 'connecting', esp32: 'unknown', stm32: 'unknown', battery: null, rssi: null });

  const brokerHost = window.location.hostname;
  const c = mqtt.connect(`ws://${brokerHost}:${MQTT_WS_PORT}`, {
    clientId: 'medibot_web_' + Math.random().toString(16).slice(2, 10),
    connectTimeout: MQTT_CLIENT_TIMEOUT,
    reconnectPeriod: MQTT_RECONNECT_PERIOD,
  });
  client = c;

  c.on('connect', () => {
    console.log('[MQTT] Connected to broker');
    statusCallback?.({ mqtt: 'online', esp32: 'unknown', stm32: 'unknown', battery: null, rssi: null });
    setTimeout(() => {
      if (!c.connected) return;
      const topics = [TOPICS.STATUS, TOPICS.RFID, TOPICS.ACK];
      c.subscribe(topics, { qos: 0 }, (err) => {
        if (err) {
          setTimeout(() => {
            if (!c.connected) return;
            c.subscribe(topics, { qos: 0 }, (retryErr) => {
              if (!retryErr) resetHeartbeatTimer();
            });
          }, 1000);
        } else {
          resetHeartbeatTimer();
        }
      });
    }, 250);
  });

  c.on('disconnect', () => { clearHeartbeat(); statusCallback?.({ mqtt: 'offline', esp32: 'offline', stm32: 'offline', battery: null, rssi: null }); });
  c.on('close',      () => { clearHeartbeat(); statusCallback?.({ mqtt: 'offline', esp32: 'offline', stm32: 'offline', battery: null, rssi: null }); });
  c.on('error', (err: unknown) => {
    const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : err;
    console.error('[MQTT] Error:', msg);
    statusCallback?.({ mqtt: 'offline', esp32: 'offline', stm32: 'offline', battery: null, rssi: null });
  });

  c.on('message', (topic: string, message: Buffer) => {
    const payload = message.toString();
    if (topic === TOPICS.STATUS) {
      resetHeartbeatTimer();
      try {
        const data = JSON.parse(payload) as Record<string, unknown>;
        statusCallback?.({
          mqtt: 'online',
          esp32: data.esp32 === 'online' ? 'online' : 'offline',
          stm32: parseStm32(data.stm32),
          battery: parseBattery(data),
          rssi: parseRssi(data),
        });
      } catch {
        statusCallback?.({ mqtt: 'online', esp32: 'unknown', stm32: 'unknown', battery: null, rssi: null });
      }
    }
    if (topic === TOPICS.RFID) {
      try {
        const data = JSON.parse(payload) as { uid?: string };
        if (data.uid) rfidCallback?.(data.uid);
      } catch { /* ignore */ }
    }
    if (topic === TOPICS.ACK) {
      try {
        const data = JSON.parse(payload) as { drawer?: unknown; status?: unknown };
        if (data.drawer !== undefined && data.status !== undefined)
          ackCallback?.(Number(data.drawer), String(data.status));
      } catch { /* ignore */ }
    }
  });
}

export function updateMQTTCallbacks(onStatus: StatusCallback, onRFID: RFIDCallback, onAck: AckCallback) {
  statusCallback = onStatus;
  rfidCallback = onRFID;
  ackCallback = onAck;
}

export function publishDispense(drawer: number) {
  const c = client;
  if (c?.connected) {
    c.publish(TOPICS.DISPENSE, JSON.stringify({ cmd: 'open_drawer', drawer }));
  } else {
    console.warn('[MQTT] Cannot publish — not connected');
  }
}

export function disconnectMQTT() {
  clearHeartbeat();
  if (client) { client.end(); client = null; }
}
