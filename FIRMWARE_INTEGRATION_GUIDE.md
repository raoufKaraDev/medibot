# MediBot — Firmware Integration Reference
> **Project:** Robot distributeur de médicaments pédiatrique  
> **Hôpital:** Hôpital de Rouiba — Service Pédiatrie  
> **Robot ID:** `ROBOT001`  
> **Date:** April 2026

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                     │
│   EngineerView  ←─WebSocket ws://HOST:9001─→  MQTT      │
│   TechView      ←─REST API  http://HOST:8000─→ FastAPI  │
└─────────────────────────────────────────────────────────┘
              │                        │
              ▼                        ▼
┌─────────────────────┐   ┌────────────────────────────┐
│   MQTT Broker       │   │   FastAPI Backend           │
│   TCP  port 1883    │   │   SQLite  medibot.db        │
│   WS   port 9001    │   │   Paho MQTT client          │
└─────────────────────┘   └────────────────────────────┘
              │
    ┌─────────┴─────────┐
    ▼                   ▼
┌─────────┐       ┌──────────┐
│  ESP32  │─UART─▶│  STM32F4 │
│ WiFi    │       │ RFID     │
│ MQTT    │       │ Drawers  │
└─────────┘       └──────────┘
```

---

## 2. MQTT Topics — Complete Map

| Direction | Topic | Description |
|-----------|-------|-------------|
| Server → Board | `robot/ROBOT001/cmd/dispense` | All commands to the robot |
| Board → Server | `robot/ROBOT001/status` | Telemetry & heartbeat |
| Board → Server | `robot/ROBOT001/ack` | Command acknowledgement |
| Board → Server | `robot/ROBOT001/rfid` | RFID scan events |
| Board → Server | `robot/ROBOT001/dispense` | Dispense completion events |

> The frontend subscribes to **`robot/ROBOT001/#`** (wildcard) to catch all subtopics.

---

## 3. CMD Topic — All Commands Sent by Server

### Topic: `robot/ROBOT001/cmd/dispense`
All payloads are **JSON**, published with **QoS 1**.

### 3.1 — Normal Dispense (triggered by doctor)
```json
{
  "cmd": "open_drawer",
  "drawer": 3,
  "patient": "Yanis Belkacem",
  "med": "Amoxicilline"
}
```

### 3.2 — Force Open (triggered from Tech/Engineer page)
```json
{
  "cmd": "open_drawer",
  "drawer": 3,
  "forced": true,
  "reason": "maintenance"
}
```
> `reason` values: `"maintenance"` | `"urgence"` | `"test"` | `"blocage mécanique"` | `"réapprovisionnement"`

### 3.3 — Emergency Stop (triggered from Engineer page sidebar)
```json
{
  "cmd": "emergency_stop"
}
```

---

## 4. STATUS Topic — What Your Board MUST Publish

### Topic: `robot/ROBOT001/status`
Publish this **periodically** (recommended: every **5 seconds**).  
The frontend reads this to update the Engineer View live dashboard.

### Minimal payload (required fields):
```json
{
  "esp32": "online",
  "stm32": "ready"
}
```

### Full payload (all supported fields):
```json
{
  "esp32": "online",
  "stm32": "ready",
  "bat": 87,
  "rssi": -62,
  "coretemp": 43.5,
  "cpu": 18
}
```

### Field Reference:

| JSON Key | Alternate Keys Accepted | Type | Description | Display in UI |
|----------|------------------------|------|-------------|---------------|
| `esp32` | — | `"online"` \| `"offline"` | ESP32 WiFi/MQTT status | 🟢 Connexion → ESP32 |
| `stm32` | — | `"ready"` \| `"busy"` \| `"online"` \| `"offline"` | STM32 status | 🟢 Connexion → STM32 |
| `bat` | `battery` | `number` (0–100) | Battery % | WiFi bar section |
| `rssi` | `wifirssi` | `number` (negative dBm, e.g. -62) | WiFi signal strength | WiFi signal bar |
| `coretemp` | `temp`, `tcpu` | `number` (°C) | CPU/core temperature | 🌡️ Temp. card |
| `cpu` | `cpupct` | `number` (0–100) | CPU load % | 💻 Charge CPU card |

### STM32 Status Values:
| Value | Meaning | UI Color |
|-------|---------|----------|
| `"ready"` | STM32 idle, ready for command | 🟢 Green |
| `"busy"` | STM32 currently moving a drawer | 🟡 Amber |
| `"online"` | Mapped to `"ready"` by frontend | 🟢 Green |
| anything else | Offline / error | 🔴 Red |

---

## 5. ACK Topic — Command Acknowledgement

### Topic: `robot/ROBOT001/ack`
Publish after receiving and processing a CMD command.

```json
{
  "ack": "open_drawer",
  "drawer": 3,
  "status": "ok"
}
```

| Field | Values |
|-------|--------|
| `ack` | mirrors the `cmd` value received |
| `drawer` | drawer number that was opened |
| `status` | `"ok"` \| `"error"` \| `"busy"` |

> The terminal in Engineer View will highlight ACK messages in **amber** (`text-amber-400`).

---

## 6. Hardware Pin Mapping (STM32F4)

These values are shown in the Tech page "Hardware" section:

| Peripheral | Pins | Protocol |
|-----------|------|----------|
| RFID RC522 | PA4 (CS), PA5 (SCK), PA6 (MISO), PA7 (MOSI) | SPI1 |
| UART to ESP32 | PA9 (TX), PA10 (RX) | UART1 — 115200 baud |
| Drawer 1 | PB6 | GPIO OUT |
| Drawer 2 | PB7 | GPIO OUT |
| Drawer 3 | PB8 | GPIO OUT |
| Drawer 4 | PB9 | GPIO OUT |
| Drawer 5 | PB4 | GPIO OUT |
| Drawer 6 | PB5 | GPIO OUT |

---

## 7. UART Protocol (ESP32 ↔ STM32)

Format: **JSON + newline** (`\n`)

### ESP32 → STM32 (forward CMD from MQTT):
```
{"cmd":"open_drawer","drawer":3}\n
```

### STM32 → ESP32 (report status):
```
{"stm32":"ready","drawer_done":3}\n
```

---

## 8. MQTT Terminal — Color Codes

The live terminal in the Engineer View colors topics as follows:

| Color | Topic contains | Meaning |
|-------|---------------|---------|
| 🩵 Teal `#73f1e4` | `status` | Heartbeat / telemetry |
| 🟡 Amber | `ack` | Command acknowledgement |
| 🟣 Violet | `rfid` | RFID badge scan |
| 🔴 Rose | `cmd` | Command sent to robot |
| 🟢 Emerald | `dispense` | Dispense completion |
| ⚫ Gray | anything else | Unknown / other |

---

## 9. Firmware History — OTA Metadata

When you flash a new firmware version, register it via:

```
POST /api/tech/firmware
Content-Type: application/json

{
  "version": "1.2.0",
  "filename": "medibot_esp32_v1.2.0.bin"
}
```

The Tech page displays the last 10 registered versions.  
The actual binary transfer is done outside MediBot (via serial flash or OTA tool).

---

## 10. Network Configuration

| Parameter | Value |
|-----------|-------|
| MQTT Broker Host | Same host as FastAPI server |
| MQTT TCP Port | `1883` |
| MQTT WebSocket Port | `9001` |
| FastAPI REST Port | `8000` (default) |
| MQTT Client ID (backend) | `medibot-backend` |
| MQTT Client ID (frontend) | `medibot-engineer-{random}` |
| MQTT Keep-alive | 60 seconds |
| MQTT Reconnect delay | 1–10 seconds |
| MQTT QoS | 1 (at least once) |

---

## 11. Board Startup Checklist

Before connecting to the system, verify:

- [ ] ESP32 connects to WiFi (check RSSI in status payload)
- [ ] ESP32 connects to MQTT broker on port 1883
- [ ] ESP32 subscribes to `robot/ROBOT001/cmd/dispense`
- [ ] ESP32 publishes first status on `robot/ROBOT001/status` within 10s of boot
- [ ] STM32 responds on UART1 at 115200 baud
- [ ] All 6 drawer pins initialized LOW (closed)
- [ ] RFID RC522 on SPI1 initialized and scanning
- [ ] Engineer View shows ESP32 = 🟢 online, STM32 = 🟢 ready

---

## 12. Dispense Flow (Full Sequence)

```
Doctor selects patient + medication
       ↓
POST /api/dispense  { drawer: 3, patient: "...", med: "..." }
       ↓
FastAPI → mqtt_publish({ cmd: "open_drawer", drawer: 3, ... })
       ↓  (topic: robot/ROBOT001/cmd/dispense)
ESP32 receives CMD via MQTT
       ↓
ESP32 sends via UART: {"cmd":"open_drawer","drawer":3}
       ↓
STM32 activates PB8 (drawer 3 solenoid/motor)
       ↓
STM32 sends via UART: {"stm32":"busy","drawer_done":3}
       ↓
ESP32 publishes ACK: robot/ROBOT001/ack
       ↓
ESP32 publishes status update: robot/ROBOT001/status  { stm32: "ready" }
       ↓
Frontend terminal logs the full exchange in real-time
```

---

## 13. Quick Debug Checklist

| Symptom | Check |
|---------|-------|
| ESP32 = 🔴 offline | WiFi connected? MQTT broker running on port 1883? |
| STM32 = 🟡 unknown | ESP32 receiving UART from STM32? Status payload includes `stm32` key? |
| MQTT latency bar empty | No messages on `robot/ROBOT001/#` — broker subscriptions OK? |
| Temp shows 42°C default | Board not publishing `coretemp`/`temp`/`tcpu` in status |
| CPU shows 18% default | Board not publishing `cpu`/`cpupct` in status |
| Drawer won't open | Check `mqttsent=1` in dispense_log — if 0, MQTT publish failed |
| Force open no effect | Check `/api/tech/force-open` response: `{ ok: true }` ? |

---

*Generated by MediBot system — Hôpital de Rouiba — Service Pédiatrie*
