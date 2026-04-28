# Android Kiosk Quick Reference

## Network Configuration

### Hospital LAN Setup
Before building, determine your network:

```
Laptop (Source of Truth):
  - IP: 192.168.1.100 (or your static IP)
  - Hostname: laptop (or medibot.local)
  - Kiosk URL: http://192.168.1.100:5173 (dev)
  - Backend API: http://192.168.1.100:8000 (prod)

Samsung Tablet (Kiosk):
  - Same SSID as laptop
  - Can reach laptop on LAN
  - Connects via IP or mDNS

Robot / MQTT:
  - Same SSID
  - Connects to MQTT broker on laptop
```

### Edit KioskConfig.kt

Open: `app/src/main/java/com/medibot/kiosk/config/KioskConfig.kt`

```kotlin
// Line 15: Update to your laptop LAN IP
private const val DEFAULT_KIOSK_URL = "http://192.168.1.100:5173"

// Line 16–20: Update allowed hosts
private val DEFAULT_ALLOWED_HOSTS = listOf(
    "192.168.1.100",      // Your laptop IP
    "medibot.local",      // Optional: mDNS hostname
    "10.0.0.0/8"          // Optional: Hospital subnet
)
```

---

## Build Commands

### Build Gradle Wrapper (First Time)

```bash
cd c:\ROBOT_MED\android-kiosk

# Windows
gradlew.bat --version

# macOS/Linux
chmod +x gradlew
./gradlew --version
```

### Build Debug APK

```bash
# From android-kiosk folder
./gradlew assembleDebug

# Output:
# app/build/outputs/apk/debug/app-debug.apk (~15 MB)
```

### Build Release APK (Unsigned)

```bash
./gradlew assembleRelease

# Output:
# app/build/outputs/apk/release/app-release-unsigned.apk
```

### Clean Build

```bash
./gradlew clean assembleDebug
```

---

## Installation

### Via USB (Device)

```bash
# Check connection
adb devices
# Should list: <DEVICE_ID> device

# Install APK
adb install -r app/build/outputs/apk/debug/app-debug.apk

# Verify installed
adb shell pm list packages | grep medibot
# Should output: com.medibot.kiosk
```

### Via Emulator

```bash
# Start emulator (if not already running)
emulator -avd Pixel_4a &

# Wait for boot, then install
adb install -r app/build/outputs/apk/debug/app-debug.apk

# Launch app
adb shell am start -n com.medibot.kiosk/.KioskActivity
```

### Via Android Studio

1. Connect device or start emulator
2. Click green Play button (top right)
3. Select target device
4. Wait for build and install

---

## Enable Device Admin

### On Device (Manual)

1. Open **Settings**
2. Go to **Apps** → **Special app access** → **Device admin apps**
3. Find **MediBot Kiosk**
4. Toggle **ON**
5. Confirm dialog

### Via Command Line (ADB)

```bash
adb shell dpm set-device-owner com.medibot.kiosk/.admin.KioskDeviceAdminReceiver
```

---

## Logs & Debugging

### View Logs

```bash
# Filter by app
adb logcat | grep medibot

# More detailed
adb logcat -v threadtime | grep medibot

# Clear and restart
adb logcat -c
adb logcat | grep medibot
```

### Key Log Tags

| Tag | What It Logs |
|-----|--------------|
| `KioskActivity` | App lifecycle, WebView load |
| `KioskWebClient` | SSL, URL validation, navigation |
| `SessionManager` | Inactivity, timeout, logout |
| `NetworkMonitor` | Network state changes |
| `AndroidJSBridge` | Device info queries |

### Example: Monitor Timeout

```bash
adb logcat | grep SessionManager
# Output:
# SessionManager: Starting session timeout monitor (900s)
# SessionManager: Session timeout reset
# SessionManager: Session timeout warning: auto-logout in 120s
# SessionManager: Session timeout triggered
```

---

## Emulator Setup (Optional)

### Create Emulator

```bash
# List available APIs
emulator -list-avds

# Create if needed
avdmanager create avd -n Pixel_4a_API_34 -k "system-images;android-34;google_apis;x86_64"

# Start emulator
emulator -avd Pixel_4a_API_34 &

# Wait ~30 seconds for boot
adb wait-for-device
```

### Emulator Network Access

By default, emulator cannot reach `localhost` on host. Use:

```
http://10.0.2.2:5173  ← Emulator's way to reach host localhost
```

Update `KioskConfig.kt` for emulator testing:

```kotlin
// For testing on emulator
const val DEFAULT_KIOSK_URL = "http://10.0.2.2:5173"  // Emulator → host
```

For device testing, revert to your actual LAN IP.

---

## Troubleshooting

### APK Won't Install

```bash
# Error: INSTALL_FAILED_INVALID_APK
# Solution: Clean and rebuild
./gradlew clean assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### WebView Blank

```bash
# Check logs
adb logcat | grep KioskWebClient

# Check URL reachable
adb shell ping 192.168.1.100

# Check web server running
# On laptop: curl http://192.168.1.100:5173
```

### Device Admin Not Granted

```bash
# Manual: Settings → Apps → Special app access → Device admin apps → MediBot Kiosk (ON)

# Or via ADB (warning: sets as active device owner)
adb shell dpm set-device-owner com.medibot.kiosk/.admin.KioskDeviceAdminReceiver
```

### Timeout Not Triggering

```bash
# Check session manager logs
adb logcat | grep SessionManager

# Verify timeout values in SessionManager.kt:
# INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000  (15 min)

# For testing, reduce to 30 seconds:
# INACTIVITY_TIMEOUT_MS = 30 * 1000L
# (Don't forget to revert before production!)
```

---

## Configuration Checklist

- [ ] Update `KioskConfig.kt` with laptop LAN IP
- [ ] Update allowed hosts list if needed
- [ ] Verify hospital network is reachable from device
- [ ] Verify web kiosk is running on laptop (`http://IP:5173`)
- [ ] Build APK without errors
- [ ] Install on device without errors
- [ ] Grant Device Admin permissions
- [ ] Verify app launches in full-screen
- [ ] Verify back button disabled
- [ ] Verify home button disabled
- [ ] Test 5-minute inactivity (or adjust timeout for testing)

---

**Quick Ref Version**: 1.0  
**Updated**: April 24, 2026
