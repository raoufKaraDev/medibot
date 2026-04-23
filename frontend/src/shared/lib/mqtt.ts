// MQTT WebSocket client — package npm `mqtt` (Mosquitto WebSocket on port 9001)
import mqtt from 'mqtt';

// Configuration constants
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
  mqtt: 'connecting' | 'online' | 'offline';
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

const HEARTBEAT_TIMEOUT = 45000;  // 45 seconds - gives time for network blips and status publication delays

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
      statusCallback({
        mqtt: 'online',
        esp32: 'offline',
        stm32: 'offline',
        battery: null,
        rssi: null,
      });
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

  // Guard: if already connected, return existing client
  if (client && client.connected) {
    resetHeartbeatTimer();
    return;
  }

  // If client exists but is disconnected, try to reconnect instead of recreating
  if (client && !client.connected && client.reconnecting) {
    resetHeartbeatTimer();
    return;
  }

  // Only create new client if we don't have one or it's not trying to reconnect
  if (client && !client.reconnecting) {
    client = null;
  }

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

    // Delay to ensure connection is fully established before subscribing
    // Increased from 100ms to 250ms to avoid "client disconnecting" race condition
    setTimeout(() => {
      // Check if client is still connected before subscribing
      if (!c.connected) {
        console.warn('[MQTT] Client disconnected before subscription attempt, skipping subscribe');
        return;
      }

      // Batch subscribe to all topics in a single call
      const topics = [TOPICS.STATUS, TOPICS.RFID, TOPICS.ACK];
      c.subscribe(topics, { qos: 0 }, (err) => {
        if (err) {
          console.error('[MQTT] Subscribe error:', err);
          // Retry subscription after a longer delay
          setTimeout(() => {
            if (!c.connected) {
              console.warn('[MQTT] Client disconnected before retry, aborting');
              return;
            }
            c.subscribe(topics, { qos: 0 }, (retryErr) => {
              if (retryErr) {
                console.error('[MQTT] Subscribe retry failed:', retryErr);
                // Set status but don't fail completely - mqtt might be unavailable
                statusCallback?.({ mqtt: 'online', esp32: 'unknown', stm32: 'unknown', battery: null, rssi: null });
              } else {
                console.log('[MQTT] Successfully subscribed to topics (on retry)');
                resetHeartbeatTimer();
              }
            });
          }, 1000);
        } else {
          console.log('[MQTT] Successfully subscribed to topics');
          resetHeartbeatTimer();
        }
      });
    }, 250);
  });

  c.on('disconnect', () => {
    console.warn('[MQTT] Disconnected');
    clearHeartbeat();
    statusCallback?.({ mqtt: 'offline', esp32: 'offline', stm32: 'offline', battery: null, rssi: null });
  });

  c.on('close', () => {
    clearHeartbeat();
    statusCallback?.({ mqtt: 'offline', esp32: 'offline', stm32: 'offline', battery: null, rssi: null });
  });

  c.on('error', (err: unknown) => {
    const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : err;
    console.error('[MQTT] Error:', msg);
    statusCallback?.({ mqtt: 'offline', esp32: 'offline', stm32: 'offline', battery: null, rssi: null });
  });

  c.on('message', (topic: string, message: Buffer) => {
    const payload = message.toString();
    console.log(`[MQTT] ${topic}: ${payload}`);

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
        statusCallback?.({
          mqtt: 'online',
          esp32: 'unknown',
          stm32: 'unknown',
          battery: null,
          rssi: null,
        });
      }
    }

    if (topic === TOPICS.RFID) {
      try {
        const data = JSON.parse(payload) as { uid?: string };
        if (data.uid) {
          console.log('[MQTT] RFID scanned:', data.uid);
          rfidCallback?.(data.uid);
        }
      } catch {
        /* ignore */
      }
    }

    if (topic === TOPICS.ACK) {
      try {
        const data = JSON.parse(payload) as { drawer?: unknown; status?: unknown };
        if (data.drawer !== undefined && data.status !== undefined) {
          console.log(`[MQTT] ACK drawer=${data.drawer} status=${data.status}`);
          ackCallback?.(Number(data.drawer), String(data.status));
        }
      } catch {
        /* ignore */
      }
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
    const payload = JSON.stringify({ cmd: 'open_drawer', drawer });
    c.publish(TOPICS.DISPENSE, payload);
    console.log('[MQTT] PUBLISH →', payload);
  } else {
    console.warn('[MQTT] Cannot publish — not connected');
  }
}

export function disconnectMQTT() {
  clearHeartbeat();
  if (client) {
    client.end();
    client = null;
  }
}
