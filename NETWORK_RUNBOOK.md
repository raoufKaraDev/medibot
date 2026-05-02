# MediBot — Network Runbook

## LAN Architecture

| Device        | IP Address    | Role                        |
|---------------|---------------|-----------------------------|
| Laptop        | 192.168.1.100 | Backend, MQTT broker, Admin |
| Tablet (A9)   | 192.168.1.101 | Kiosk client only           |
| Robot (ESP32) | 192.168.1.102 | MQTT client, dispensing     |

## Wi-Fi Configuration

- SSID: `MediBot-Hospital`
- Security: WPA3 (or WPA2-PSK minimum)
- Subnet: `192.168.1.0/24`
- Gateway: `192.168.1.1`
- DHCP Range: `192.168.1.200 – 192.168.1.254`
- DHCP Exclusion: `192.168.1.100 – 192.168.1.110` (static device range)

## Static IP Reservations

| Device | MAC Address  | Reserved IP   |
|--------|--------------|---------------|
| Laptop | [LAPTOP_MAC] | 192.168.1.100 |
| Tablet | [TABLET_MAC] | 192.168.1.101 |
| Robot  | [ROBOT_MAC]  | 192.168.1.102 |

> Replace placeholders with actual MAC addresses at deployment time.

## Port Allocation

| Service        | Protocol | Host          | Port | LAN Only? |
|----------------|----------|---------------|------|-----------|
| FastAPI Backend| HTTP     | 192.168.1.100 | 8000 | Yes       |
| MQTT Broker    | TCP      | 192.168.1.100 | 1883 | Yes       |
| MQTT WebSocket | WS       | 192.168.1.100 | 9001 | Yes       |
| Health Check   | HTTP     | 192.168.1.100 | 8000 | Yes       |

## Firewall Rules (Laptop)

### Inbound
- Allow `192.168.1.0/24` → port `8000` (API)
- Allow `192.168.1.0/24` → port `1883` (MQTT TCP)
- Allow `192.168.1.0/24` → port `9001` (MQTT WebSocket)
- Block all other inbound

### Outbound
- Allow any → port `443` (HTTPS sync to remote, optional)
- Allow any → port `53` (DNS)
- Allow any → port `123` (NTP)

## Connectivity Test Checklist

```bash
# 1. Verify backend is running
curl http://192.168.1.100:8000/health

# 2. Verify kiosk route is accessible
curl http://192.168.1.100:8000/kiosk

# 3. Verify MQTT broker is running
mosquitto_sub -h 192.168.1.100 -p 1883 -t "robot/ROBOT001/status" -C 1

# 4. Ping tablet
ping 192.168.1.101

# 5. Ping robot
ping 192.168.1.102
```

## Offline Resilience

| Failure Scenario   | Laptop | Tablet      | Robot       | Remote Sync  |
|--------------------|--------|-------------|-------------|--------------|
| Internet down      | ✅ OK  | ✅ OK       | ✅ OK       | ⏸ Paused     |
| Laptop reboots     | ⏸ Down | ❌ No API  | ❌ No MQTT  | ⏸ Paused     |
| Wi-Fi AP failure   | ✅ OK  | ❌ Offline  | ❌ Offline  | ⏸ Paused     |
| Tablet disconnects | ✅ OK  | ❌ Offline  | ✅ OK       | ✅ Unaffected |

> **Core rule:** Internet outage has ZERO impact on live hospital dispensing.

## Daily Operations

### Morning Startup
1. `curl http://localhost:8000/health` — verify backend is running
2. Check Wi-Fi is broadcasting `MediBot-Hospital`
3. Verify tablet connects and shows kiosk at `http://192.168.1.100:8000/kiosk`
4. Verify robot connects — check backend `/tech` panel or MQTT logs
5. Run one complete dispense test before first patient

### Evening Shutdown
1. Close all patient sessions on tablet
2. Stop backend gracefully (allow pending requests to finish)
3. Tablet and robot can stay in sleep mode or power off

## Troubleshooting

| Problem                     | Symptom              | Fix                                     |
|-----------------------------|----------------------|-----------------------------------------|
| Tablet can't reach backend  | White screen         | `ping 192.168.1.100` — check laptop IP |
| MQTT disconnected           | Robot unresponsive   | Restart Mosquitto; check robot network  |
| Slow API responses          | Kiosk UI lags        | Check laptop CPU/RAM; restart backend   |
| Sync to remote failing      | Stale backup data    | Check internet; verify HTTPS to remote  |

## Performance Targets

| Operation               | Target | Maximum |
|-------------------------|--------|---------|
| API GET request         | 100ms  | 200ms   |
| Kiosk page load         | 2s     | 5s      |
| MQTT publish/subscribe  | 50ms   | 200ms   |
| Drawer unlock command   | 100ms  | 500ms   |
