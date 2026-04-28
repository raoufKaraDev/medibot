# Phase 2: Security & OTA Updates Implementation

**Status**: ✅ READY FOR BUILD  
**Date**: April 24, 2026  
**Scope**: OTA Manager, Timeout Warning UI, Crash Handler, Battery Monitor, Enhanced Security

---

## 🚀 Phase 2 Build & Implementation

### What's New (Phase 2)

**4 New Components Implemented:**

1. **OTA Update Manager** (`OTAUpdateManager.kt`)
   - Background APK checker (every 24h)
   - Download APK from internal server
   - Verify checksum
   - Install + rollback support

2. **Timeout Warning Dialog** (`TimeoutWarningDialog.kt`)
   - Shows 2-minute countdown before logout
   - "Stay Logged In" button → resets timeout
   - "Logout Now" button → immediate logout
   - Auto-logout if no action taken

3. **Crash Handler** (`CrashHandler.kt`)
   - Monitors app crashes
   - Logs crash details to file
   - Auto-restart with retry limit (max 3)
   - Prevents infinite crash loops

4. **Battery Monitor** (`BatteryMonitor.kt`)
   - Tracks battery level (polls every 10s)
   - Low battery warning (<10%)
   - Critical battery warning (<5%)
   - Injects battery info into WebView

**5. Enhanced Security** (`SecurityConfig.kt` updated)
   - Certificate pinning framework
   - TLS 1.2+ enforcement
   - Production certificate setup
   - Security info logging

---

### Build Phase 2 APK

```bash
cd c:\ROBOT_MED\android-kiosk

# 1. Clean build
./gradlew clean assembleDebug

# 2. Build complete (should show: BUILD SUCCESSFUL)
# Output: app/build/outputs/apk/debug/app-debug.apk

# 3. Verify output exists
ls app/build/outputs/apk/debug/app-debug.apk
```

**Expected output:**
```
BUILD SUCCESSFUL in Xs
:app:assembleDebug
```

---

### Install Phase 2 APK

```bash
# On device (Samsung A9+)
adb install -r app/build/outputs/apk/debug/app-debug.apk

# Or on emulator
adb wait-for-device
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

---

## 🧪 Phase 2 Testing Matrix

### Test 1: App Startup (Should succeed without crashes)

```bash
# Launch app
adb shell am start -n com.medibot.kiosk/.KioskActivity

# Monitor logs (should show OTA, crash handler, battery monitor starting)
adb logcat | grep -E "Starting periodic OTA check|CrashHandler initialized|Starting battery monitor"

# Expected logs:
# OTA check started
# Crash handler initialized
# Battery monitor started
# (No crash errors)
```

---

### Test 2: OTA Update Checker (Background task)

```bash
# Watch OTA logs
adb logcat | grep OTA

# Expected sequence (every 24 hours):
# OTA: Starting periodic OTA check (every 24h)
# OTA: Checking for OTA updates from: http://192.168.1.127:8000/ota
# OTA: Version check: current=1.0.0, latest=1.0.0
# OTA: App is up to date
```

**For testing with custom interval:**
- Edit `OTAUpdateManager.kt` line 19: `const val CHECK_INTERVAL_HOURS = 1L` (change to 1 minute for testing)
- Rebuild APK
- Watch logs for update check every 1 minute

---

### Test 3: Timeout Warning Dialog (2-minute warning)

**Step 1: Modify SessionManager for quick testing**

```bash
# Edit: app/src/main/java/com/medibot/kiosk/session/SessionManager.kt
# Change lines 20–21:

const val INACTIVITY_TIMEOUT_MS = 30 * 1000L   // 30 seconds (test)
const val WARNING_TIME_MS = 10 * 1000L          // 10 seconds before (test)
```

**Step 2: Build & install**

```bash
./gradlew clean assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

**Step 3: Test timeout flow**

```bash
# Terminal 1: Monitor logs
adb logcat | grep SessionManager

# Terminal 2: Launch app
adb shell am start -n com.medibot.kiosk/.KioskActivity
# Do NOT touch device

# Timeline:
# Time 0:00 - App launches (logs: "Starting session timeout monitor")
# Time 0:20 - 20 seconds elapsed (no warning yet)
# Time 0:21 - Warning dialog appears on screen (logs: "Session timeout warning: showing 2-minute countdown")
#            Dialog shows: "You will be logged out in 10 seconds..."
# Time 0:25 - Countdown updates: "...in 6 seconds..."
# Time 0:30 - Auto-logout triggered (logs: "Session timeout triggered")
#            App reloads home screen
```

**Expected warning dialog:**
```
╭─────────────────────────────────────╮
│ ⏱ Session Timeout                   │
│                                     │
│ You will be logged out in 10        │
│ seconds...                          │
│                                     │
│ Tap screen or click "Stay Logged In"│
│ to continue.                        │
│                                     │
│ [Stay Logged In]  [Logout Now]      │
╰─────────────────────────────────────╯
```

**Test "Stay Logged In":**
- Dialog shows → Click "Stay Logged In" button
- Dialog closes, timeout counter resets to 30 sec
- Wait another 30 sec → warning reappears

**Test "Logout Now":**
- Dialog shows → Click "Logout Now" button
- Immediate logout (don't wait)

---

### Test 4: Crash Handler (Auto-restart on crash)

```bash
# This test requires manually triggering a crash
# Since the app shouldn't crash, we'll simulate crash detection

# Terminal 1: Watch crash logs
adb logcat | grep CrashHandler

# Terminal 2: Force-stop app (simulate crash)
adb shell am force-stop com.medibot.kiosk

# Verify crash is logged
adb logcat | grep "CRASH DETECTED"

# Expected logs:
# CrashHandler: CRASH DETECTED in thread: main
# CrashHandler: Crash logged to: /cache/MediBot_Crashes/crash_2026-04-24_14-30-45.log
# CrashHandler: Auto-restarting app (attempt 1/3)
```

**Note:** App won't auto-restart from force-stop (boot receiver only triggers on device reboot). But crash handler will log the event.

---

### Test 5: Battery Monitor (Battery level tracking)

```bash
# Monitor battery logs
adb logcat | grep BatteryMonitor

# Expected logs every 10 seconds:
# Battery level available for WebView: 85%
# Battery level available for WebView: 84%
# (Shows battery level every 10 seconds)

# For testing low battery warning:
# Simulate low battery (need device setting or emulator capability)
# Expected log if battery < 10%:
# BatteryMonitor: Low battery warning: 8%
# BatteryMonitor: Adjusting brightness based on battery: 8%
```

**Check Battery via JS Bridge:**
```bash
# In web console (if enabled):
window.AndroidAPI.getDeviceInfo()
# Output: {"device": "SM-A900F", "battery_percent": 85, ...}
```

---

### Test 6: Regression Testing (All Phase 1 features still work)

Verify Phase 1 features still work in Phase 2:

- [ ] Full-screen immersive mode (no status bar)
- [ ] Back button blocked
- [ ] Home button blocked
- [ ] WebView loads hospital kiosk
- [ ] Network monitoring works
- [ ] MQTT connectivity (if available)
- [ ] Web kiosk features (room, patient, prescription, meds, notes)

---

## 📋 Phase 2 Build Checklist

### Pre-Build
- [x] OTA Update Manager created (`ota/OTAUpdateManager.kt`)
- [x] Timeout Warning Dialog created (`session/TimeoutWarningDialog.kt`)
- [x] Crash Handler created (`crash/CrashHandler.kt`)
- [x] Battery Monitor created (`device/BatteryMonitor.kt`)
- [x] Security Config enhanced
- [x] KioskActivity updated (OTA, crash, battery initialization)
- [x] SessionManager updated (timeout warning dialog integration)

### Build & Compile
- [ ] `./gradlew clean assembleDebug` completes without errors
- [ ] APK size reasonable (~20–25 MB)
- [ ] No compilation warnings (except deprecation)
- [ ] All imports resolved

### Emulator Testing
- [ ] APK installs on emulator
- [ ] App launches in full-screen
- [ ] No crashes on startup
- [ ] Logs show Phase 2 components starting

### Device Testing (Samsung A9+)
- [ ] APK installs via USB
- [ ] App launches and loads kiosk
- [ ] No crashes after 5 min of use
- [ ] Timeout warning dialog appears after modified timeout (10–30 sec test)
- [ ] "Stay Logged In" button works (resets timeout)
- [ ] "Logout Now" button works (immediate logout)
- [ ] Battery level changes monitored (logs show updates every 10 sec)
- [ ] Crash logs created on force-stop (check `/cache/MediBot_Crashes/`)

### Performance
- [ ] App doesn't lag or stutter
- [ ] Memory usage stable (<200 MB)
- [ ] CPU usage reasonable (<30% idle)
- [ ] Battery drain acceptable

### Logs & Debugging
- [ ] No error messages in logcat
- [ ] Phase 2 component startup messages visible
- [ ] Timeout warning logs appear correctly
- [ ] Crash logs written to disk

---

## 🔧 Phase 2 Configuration

### OTA Server Configuration (Optional for Phase 2)

For real OTA updates, set up a hospital server:

```bash
# In OTAUpdateManager.kt line 26, update server URL:
const val OTA_SERVER_URL = "http://YOUR_HOSPITAL_SERVER:8000/ota"

# Server should host:
# - http://YOUR_SERVER/ota/version.json (version info)
# - http://YOUR_SERVER/ota/app-1.1.0.apk (APK file)
# - http://YOUR_SERVER/ota/app-1.1.0.apk.sha256 (checksum file)
```

### Certificate Pinning Configuration (Optional for Phase 2)

For HTTPS with certificate pinning:

```bash
# 1. Get your hospital server certificate pin:
openssl s_client -connect hospital-server.com:443 < /dev/null | openssl x509 -outform DER | openssl dgst -sha256 -binary | openssl enc -base64
# Output: abc123xyz...

# 2. Edit SecurityConfig.kt:
val CERTIFICATE_PINS = listOf(
    "sha256/abc123xyz..."  // Add your pin
)

const val ENABLE_CERT_PINNING = true  // Enable for production
```

### Crash Handler Configuration

Adjust restart attempts in `CrashHandler.kt`:

```kotlin
companion object {
    const val MAX_RESTART_ATTEMPTS = 3  // Change if needed
    const val RESTART_DELAY_MS = 2000L  // 2 second delay before restart
}
```

---

## 📝 Phase 2 Files Created/Modified

### New Files (4)
| File | Purpose |
|------|---------|
| `ota/OTAUpdateManager.kt` | Background APK updater |
| `session/TimeoutWarningDialog.kt` | 2-min countdown warning |
| `crash/CrashHandler.kt` | Crash logging + auto-restart |
| `device/BatteryMonitor.kt` | Battery level tracking |

### Modified Files (3)
| File | Changes |
|------|---------|
| `KioskActivity.kt` | Initialize OTA, crash, battery managers |
| `SessionManager.kt` | Show timeout warning dialog |
| `SecurityConfig.kt` | Enhanced cert pinning, TLS config |

---

## ✅ Phase 2 Success Criteria

- [ ] APK builds without compilation errors
- [ ] App starts without crashes
- [ ] Full-screen mode still active
- [ ] Back button still blocked
- [ ] Timeout warning dialog appears after inactivity
- [ ] "Stay Logged In" button resets timeout
- [ ] "Logout Now" button triggers logout
- [ ] Battery level monitored (logs show level changes)
- [ ] Crash logs written to device storage
- [ ] All Phase 1 features still work (regression)
- [ ] Performance acceptable (no lag, memory <200 MB)
- [ ] OTA checker starts (logs show periodic check scheduled)

---

## 🚀 Quick Start: Build & Test Phase 2

```bash
# 1. Build APK
cd c:\ROBOT_MED\android-kiosk
./gradlew clean assembleDebug

# 2. Install on device
adb install -r app/build/outputs/apk/debug/app-debug.apk

# 3. Launch app
adb shell am start -n com.medibot.kiosk/.KioskActivity

# 4. Monitor all Phase 2 components
adb logcat | grep -E "OTA|CrashHandler|BatteryMonitor|SessionManager"

# 5. Test timeout (with modified times)
# - Wait 10 sec for warning dialog
# - Click "Stay Logged In" to test reset
# - Wait another 10 sec for logout

# 6. Test crash logging
adb shell am force-stop com.medibot.kiosk
adb logcat | grep "CRASH DETECTED"

# 7. Check crash log file
adb shell ls -la /data/data/com.medibot.kiosk/cache/MediBot_Crashes/
```

---

## 📊 Phase 2 vs Phase 1 Comparison

| Feature | Phase 1 | Phase 2 |
|---------|---------|---------|
| WebView Kiosk | ✅ | ✅ |
| Full-Screen Mode | ✅ | ✅ |
| Back Button Lock | ✅ | ✅ |
| Device Admin | ✅ | ✅ |
| Session Timeout | ✅ Basic | ✅ With Warning Dialog |
| Network Monitoring | ✅ | ✅ |
| OTA Updates | ❌ | ✅ NEW |
| Crash Handler | ❌ | ✅ NEW |
| Battery Monitor | ❌ | ✅ NEW |
| Certificate Pinning | ❌ | ✅ Framework |

---

## 📞 Troubleshooting Phase 2

| Issue | Solution |
|-------|----------|
| APK won't compile | Check imports, run `./gradlew clean` |
| Timeout dialog doesn't appear | Verify SessionManager was updated, rebuild |
| Crash handler not logging | Check permissions, verify cache directory exists |
| Battery monitor logs missing | Check if BatteryMonitor.startMonitoring() is called |
| OTA server not reachable | Verify hospital server URL in OTAUpdateManager.kt |

---

## 🎯 Next: Phase 3

After Phase 2 success:
- Phase 3: Device ops, MDM integration, production rollout (1 week)
- Phase 3 includes: Boot receiver validation, Samsung Knox setup, production signing

---

**Version**: 1.0  
**Date**: April 24, 2026  
**Status**: ✅ READY FOR PHASE 2 BUILD & TEST  
**Timeline**: 2 weeks development + testing (Weeks 2–3)  
**Entry Criteria**: Phase 1 skip approved  
**Exit Criteria**: All Phase 2 features tested, regressions verified
