# Phase 1: Testing Guide & Phase 2 Kickoff

## Phase 1: Testing Strategy

### Pre-Test Setup Checklist

Before running tests, ensure:

```bash
# 1. Verify Android Studio installed
# 2. Update KioskConfig.kt with your hospital LAN IP
# 3. Verify web kiosk running on laptop
#    curl http://192.168.1.100:5173

# 4. Build debug APK
cd c:\ROBOT_MED\android-kiosk
./gradlew clean assembleDebug

# 5. Check output exists
ls app/build/outputs/apk/debug/app-debug.apk
```

---

## 🧪 Phase 1a: Emulator Testing (2–3 hours)

### Setup Emulator

```bash
# Option 1: Create from scratch (first time)
# In Android Studio: Tools → Device Manager → Create Virtual Device
# Or via command line:
sdkmanager "system-images;android-34;google_apis;x86_64"
avdmanager create avd -n Pixel_4a_API_34 -k "system-images;android-34;google_apis;x86_64" -d "Pixel 4a"

# Option 2: Use existing emulator
emulator -avd Pixel_4a_API_34 &
```

**Wait for emulator to fully boot** (~30 seconds):

```bash
adb wait-for-device
adb devices
# Output should show: emulator-5554 device
```

### Install & Launch

```bash
# Install APK
adb install -r app/build/outputs/apk/debug/app-debug.apk

# Launch app
adb shell am start -n com.medibot.kiosk/.KioskActivity

# Or: Run from Android Studio (green Play button)
```

### Emulator Test Matrix

| Test | Action | Expected Result | Pass? |
|------|--------|-----------------|-------|
| **Startup** | Launch app | Full-screen kiosk loads, no crash | ☐ |
| **WebView Load** | App initializes | Web page visible (or mock page on emulator) | ☐ |
| **Full-Screen** | Look at screen | No status bar, no navigation bar visible | ☐ |
| **Back Button** | Press back 5x | Nothing happens, app stays open | ☐ |
| **Home Button** | Press home 5x | Nothing happens (may not work on emulator) | ☐ |
| **Screen Rotation** | Rotate device | App rotates with screen (or locked portrait) | ☐ |
| **Navigation** | Tap on web content | WebView responds to touches | ☐ |
| **User Interaction** | Tap screen | Session timeout resets | ☐ |
| **Timeout Warning** | Wait 13 minutes | Warning dialog appears (2 min before logout) | ☐ |
| **Auto-Logout** | Wait 15 minutes | App reloads home screen (no manual action) | ☐ |
| **Device Info** | Open browser console | `window.AndroidAPI.getDeviceInfo()` returns data | ☐ |
| **Crash Test** | Force-stop app: `adb shell am force-stop com.medibot.kiosk` | App doesn't restart automatically (boot receiver only) | ☐ |
| **Logs** | `adb logcat \| grep medibot` | Logs appear without errors | ☐ |

### Emulator Quick Test Script

```bash
#!/bin/bash
# Quick emulator test

echo "Starting emulator..."
emulator -avd Pixel_4a_API_34 &
adb wait-for-device
sleep 5

echo "Installing APK..."
adb install -r app/build/outputs/apk/debug/app-debug.apk

echo "Launching app..."
adb shell am start -n com.medibot.kiosk/.KioskActivity
sleep 3

echo "Checking logs..."
adb logcat | grep -i "KioskActivity" | head -20

echo "Emulator test complete. Check screen for:"
echo "  - Full-screen immersive mode (no status bar)"
echo "  - WebView content loaded"
echo "  - No crash dialogs"
```

### Emulator Limitations
- **Network**: Emulator cannot reach host `localhost` directly
  - Use: `http://10.0.2.2:5173` to reach host from emulator
  - Or: Mock server on emulator network
- **Button Press**: Some virtual buttons may not work
- **Device Admin**: DPM lock may not fully enforce on emulator

**Proceed to Physical Device Testing if emulator tests pass.**

---

## 📱 Phase 1b: Physical Device Testing (Samsung A9+) (2–3 hours)

### Prerequisites

```bash
# 1. Samsung tablet connected via USB
# 2. Enable Developer Mode: Settings → About phone → Tap Build number 7x
# 3. Enable USB Debugging: Settings → Developer options → USB Debugging (ON)
# 4. Authorize USB on tablet (popup dialog when connecting)

# Verify connection
adb devices
# Output: <TABLET_SERIAL> device
```

### Install & Launch

```bash
# Install debug APK
adb install -r app/build/outputs/apk/debug/app-debug.apk

# Launch app
adb shell am start -n com.medibot.kiosk/.KioskActivity

# Or connect via Android Studio and press green Play button
```

### Physical Device Test Matrix

| Test | Action | Expected Result | Pass? |
|------|--------|-----------------|-------|
| **Install** | Install APK via `adb install` | APK installs without errors | ☐ |
| **Startup** | Launch app | Full-screen immersive kiosk loads | ☐ |
| **Network** | App loads hospital kiosk | WebView displays kiosk (or mock) | ☐ |
| **Full-Screen** | Observe screen | No status bar, no nav bar, full immersive | ☐ |
| **Back Button** | Press back 5x | Nothing happens, app stays open | ☐ |
| **Home Button** | Press home 5x | Nothing happens (may not work without DPM) | ☐ |
| **Volume Buttons** | Press vol+/vol- | May or may not work (expected) | ☐ |
| **Power Button** | Press power (sleep) | Screen off, app resumes on unlock | ☐ |
| **Long Press Back** | Press & hold back | Nothing happens (blocked) | ☐ |
| **App Switcher** | Press app switcher | App switcher may or may not appear | ☐ |
| **Swipe Gesture** | Swipe up from bottom | Gesture may not work (immersive mode) | ☐ |
| **Touch Response** | Tap on web content | WebView responds to touches, scrolls | ☐ |
| **Multi-Touch** | Pinch zoom | Zoom works (or locked, depending on config) | ☐ |
| **Rotation** | Rotate tablet | Screen rotates or stays portrait (config dependent) | ☐ |
| **User Interaction** | Tap screen every 5 min | Session timeout resets | ☐ |
| **Timeout Warning** | Wait 13 minutes | Warning UI appears (optional, Phase 2) | ☐ |
| **Auto-Logout** | Wait 15 minutes of inactivity | App reloads home, user logged out | ☐ |
| **Network Down** | Disconnect Wi-Fi | Graceful error (no crash), retry possible | ☐ |
| **Network Up** | Reconnect Wi-Fi | App recovers, loads content | ☐ |
| **Device Admin** | Check status | Settings → Apps → Special access → Device admin | ☐ |
| **Battery** | Check device | Battery level displayed (if JS bridge works) | ☐ |
| **Crash Test** | Force-stop: `adb shell am force-stop com.medibot.kiosk` | App doesn't auto-restart (expected, boot only) | ☐ |
| **Memory** | Monitor in Android Studio | Profiler shows stable ~150 MB or less | ☐ |
| **CPU** | Monitor in Android Studio | CPU usage <10% idle, <50% during load | ☐ |
| **Battery Drain** | Run 1 hour | Battery drain ~2% per hour (rough estimate) | ☐ |
| **Logcat** | View logs: `adb logcat \| grep medibot` | No error messages, normal activity log | ☐ |

### Physical Device Test Plan

**Day 1: Installation & Basic UI**
```bash
# Morning: Install and verify basic functionality
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.medibot.kiosk/.KioskActivity
# Verify: Full-screen, WebView loads, back button blocked
# Estimated: 30 min
```

**Day 2: Session Management & Timeout**
```bash
# Full-day test: Monitor 15-minute inactivity
# 09:00 - Launch app
# 13:00 - No user interaction since 09:00 (4 hours)
# 13:00 - Set timer: 15 minutes exactly
# 13:15 - Verify auto-logout (check logs)
# Estimated: 15 min active + 15 min wait

adb logcat | grep SessionManager
# Watch for: "Session timeout triggered"
```

**Day 3: Network Failover**
```bash
# Test LAN connectivity and failover
# 1. Disconnect Wi-Fi → Verify graceful error (no crash)
adb logcat | grep NetworkMonitor
# Watch for: "Network lost"

# 2. Reconnect Wi-Fi → Verify recovery
adb logcat | grep "Network available"
# Watch for: App resumes normal operation

# Estimated: 30 min
```

**Day 4: Regression Testing (All Kiosk Features)**
```bash
# Compare web kiosk vs Android wrapper
# - Room selection
# - Patient data display
# - Prescription view
# - Medication UI
# - Quick notes
# - Emergency panel
# - MQTT connectivity (if available)
# - Theme/colors
# Estimated: 2–3 hours
```

**Day 5: Performance & Stability**
```bash
# Monitor for 1+ hour of continuous use
# - Memory profiling (Android Studio)
# - CPU usage
# - Battery drain
# - No crashes
# - No memory leaks
# Estimated: 1.5 hours
```

### Device Admin Setup (Critical for DPM Lock)

```bash
# Manual: On tablet
# Settings → Apps → Special app access → Device admin apps
# Toggle: MediBot Kiosk → ON
# Confirm popup

# Or via ADB (WARNING: This sets the device owner):
adb shell dpm set-device-owner com.medibot.kiosk/.admin.KioskDeviceAdminReceiver

# Verify device admin is active
adb shell dpm list device-admins
# Output should show: com.medibot.kiosk/.admin.KioskDeviceAdminReceiver
```

### Logging & Monitoring

```bash
# View real-time logs (filter by component)
adb logcat | grep "KioskActivity"        # Main activity
adb logcat | grep "SessionManager"       # Timeout
adb logcat | grep "NetworkMonitor"       # Network
adb logcat | grep "KioskWebClient"       # WebView/SSL

# Save logs to file (for analysis)
adb logcat > kiosk_test_$(date +%Y%m%d_%H%M%S).log

# Search logs for errors
adb logcat | grep -i "error\|exception\|crash"
```

### Expected Logs on Startup

```
KioskActivity: onCreate
KioskActivity: initialization complete
KioskWebClient: Page load started: http://192.168.1.100:5173
SessionManager: Starting session timeout monitor (900s)
NetworkMonitor: Network monitor started
KioskActivity: resumed
KioskWebClient: Page load finished: http://192.168.1.100:5173
```

---

## ✅ Phase 1 Exit Criteria (All Must Pass)

- [ ] **APK Builds**: No compiler errors, proper Gradle configuration
- [ ] **Emulator**: APK installs and runs without crashes
- [ ] **Emulator**: Full-screen, back button disabled, WebView responsive
- [ ] **Device**: APK installs via USB without errors
- [ ] **Device**: WebView loads hospital kiosk from LAN
- [ ] **Device**: Full-screen immersive mode active
- [ ] **Device**: Back & home buttons disabled
- [ ] **Device**: Device admin permissions granted
- [ ] **Device**: 15-minute inactivity timeout tested (manual 15-min wait)
- [ ] **Device**: Auto-logout resets UI to home
- [ ] **Device**: Network disconnection handled (no crash)
- [ ] **Device**: Network reconnection successful
- [ ] **Device**: Audit logs capture all events
- [ ] **Regression**: All web kiosk features work identically
- [ ] **Performance**: No crashes, memory stable, battery drain acceptable
- [ ] **Documentation**: All logs accessible and interpretable

**If all criteria met → Proceed to Phase 2**

---

## 🚀 Phase 2: Security & OTA Updates Kickoff

### Phase 2 Overview (Weeks 2–3)

**Goal**: Add OTA updates, security hardening, and production-ready features

**Timeline**:
- Week 2: OTA service, SSL hardening, crash recovery
- Week 3: Beta testing, rollback testing, Phase 2 exit

---

### Phase 2 Deliverables

#### D1: OTA Update Service
```kotlin
// New class: app/src/main/java/com/medibot/kiosk/ota/OTAUpdateManager.kt
// Responsibilities:
// - Background APK checker (every 24 hours)
// - Download manager (atomic download)
// - Update verification (SHA256 checksum)
// - Install trigger (user prompt or auto)
// - Rollback capability (keep previous APK)
```

#### D2: Session Timeout UI
```kotlin
// Update: app/src/main/java/com/medibot/kiosk/session/TimeoutWarningDialog.kt
// Displays:
// - "Logging out in 2 minutes"
// - Countdown timer (120 → 0 seconds)
// - "Stay logged in" button (resets timeout)
// - "Logout now" button
```

#### D3: Enhanced Security
```kotlin
// Update: app/src/main/java/com/medibot/kiosk/security/
// - Certificate pinning implementation
// - TLS 1.2+ enforcement
// - Network SSL error recovery
```

#### D4: Crash Recovery
```kotlin
// New class: app/src/main/java/com/medibot/kiosk/crash/CrashHandler.kt
// - Monitor for crashes
// - Auto-restart with retry count
// - Log crash details
```

#### D5: Battery Monitoring
```kotlin
// New class: app/src/main/java/com/medibot/kiosk/device/BatteryMonitor.kt
// - Display battery % in WebView
// - Low battery warning (<10%)
// - Auto-adjust brightness
```

---

### Phase 2 Architecture

```
Phase 1 (MVP)
    ↓
Phase 2 (Security & OTA)
    ├── OTAUpdateManager ........... Background APK updates
    ├── TimeoutWarningDialog ....... 2-min warning before logout
    ├── CrashHandler ............... Auto-restart on crash
    ├── BatteryMonitor ............. Battery level + warnings
    ├── SecurityConfig (enhanced) .. Cert pinning, TLS policy
    └── NetworkRecovery ............ Enhanced error handling
```

---

### Phase 2 Quick Start

#### 1. Create OTA Manager Class

```bash
# File: app/src/main/java/com/medibot/kiosk/ota/OTAUpdateManager.kt

cat > app/src/main/java/com/medibot/kiosk/ota/OTAUpdateManager.kt << 'EOF'
package com.medibot.kiosk.ota

import android.content.Context
import android.os.Handler
import android.os.Looper
import timber.log.Timber
import java.util.concurrent.TimeUnit

class OTAUpdateManager(private val context: Context) {

    companion object {
        const val CHECK_INTERVAL_HOURS = 24L
        const val OTA_SERVER_URL = "http://YOUR_HOSPITAL_SERVER/ota"
    }

    private val handler = Handler(Looper.getMainLooper())
    private var checkRunnable: Runnable? = null

    fun startPeriodicCheck() {
        Timber.d("Starting periodic OTA check (every ${CHECK_INTERVAL_HOURS}h)")
        scheduleNextCheck()
    }

    private fun scheduleNextCheck() {
        checkRunnable = Runnable {
            checkForUpdate()
            scheduleNextCheck()  // Reschedule after check
        }
        val delayMillis = TimeUnit.HOURS.toMillis(CHECK_INTERVAL_HOURS)
        handler.postDelayed(checkRunnable!!, delayMillis)
    }

    private fun checkForUpdate() {
        // TODO: Implement update checking logic
        // 1. Query OTA server for latest APK
        // 2. Compare version with current app
        // 3. If newer: download APK
        // 4. Show update prompt to user
        Timber.d("Checking for OTA updates...")
    }

    fun stopPeriodicCheck() {
        checkRunnable?.let { handler.removeCallbacks(it) }
        Timber.d("OTA check stopped")
    }
}
EOF
```

#### 2. Update KioskActivity to Start OTA

```bash
# Edit: app/src/main/java/com/medibot/kiosk/KioskActivity.kt

# Add to onCreate():
otaManager = OTAUpdateManager(this)
otaManager.startPeriodicCheck()

# Add to onDestroy():
otaManager.stopPeriodicCheck()
```

#### 3. Add Timeout Warning Dialog

```bash
# File: app/src/main/java/com/medibot/kiosk/session/TimeoutWarningDialog.kt

cat > app/src/main/java/com/medibot/kiosk/session/TimeoutWarningDialog.kt << 'EOF'
package com.medibot.kiosk.session

import android.app.AlertDialog
import android.content.Context
import android.os.Handler
import android.os.Looper
import timber.log.Timber

class TimeoutWarningDialog(
    private val context: Context,
    private val onConfirm: () -> Unit  // User clicked "Stay logged in"
) {

    fun show(secondsRemaining: Int = 120) {
        Timber.d("Showing timeout warning: ${secondsRemaining}s remaining")

        var remaining = secondsRemaining
        val handler = Handler(Looper.getMainLooper())

        val dialog = AlertDialog.Builder(context)
            .setTitle("Session Timeout Warning")
            .setMessage("Logging out in $remaining seconds...")
            .setPositiveButton("Stay Logged In") { _, _ ->
                Timber.d("User clicked stay logged in")
                onConfirm()
            }
            .setNegativeButton("Logout Now") { _, _ ->
                Timber.d("User clicked logout now")
                // Trigger logout immediately
            }
            .setCancelable(false)
            .create()

        dialog.show()

        // Update countdown every second
        val updateRunnable = object : Runnable {
            override fun run() {
                remaining--
                if (remaining > 0) {
                    dialog.setMessage("Logging out in $remaining seconds...")
                    handler.postDelayed(this, 1000)
                } else {
                    dialog.dismiss()
                    Timber.d("Timeout reached, auto-logout triggered")
                }
            }
        }
        handler.postDelayed(updateRunnable, 1000)
    }
}
EOF
```

---

### Phase 2 Test Plan

#### OTA Update Testing

```bash
# 1. Setup mock OTA server (or skip if not available yet)
# 2. Create newer APK (increment version in build.gradle.kts)
# 3. Host on test server
# 4. Trigger OTA check (manually or wait 24h)
# 5. Verify:
#    - APK downloads without errors
#    - SHA256 checksum validated
#    - Installation successful
#    - Rollback works (downgrade to previous)

# Manual OTA trigger (for testing):
adb shell am broadcast -a com.medibot.kiosk.CHECK_FOR_UPDATE
```

#### Timeout Warning Testing

```bash
# 1. Modify SessionManager for quick testing:
#    Change INACTIVITY_TIMEOUT_MS = 30 * 1000L  (30 seconds for test)
#    Change WARNING_TIME_MS = 5 * 1000L         (5 seconds for test)
#
# 2. Wait 25 seconds → Warning dialog appears
# 3. Verify countdown works (5, 4, 3, 2, 1...)
# 4. Test "Stay Logged In" button → Timeout resets
# 5. Test "Logout Now" button → Immediate logout
#
# 6. Revert to production times:
#    INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000L
#    WARNING_TIME_MS = 2 * 60 * 1000L
```

#### Crash Recovery Testing

```bash
# 1. Force app crash
adb shell am start -n com.medibot.kiosk/.CrashActivity  # (doesn't exist, will crash)

# 2. Verify crash is logged
adb logcat | grep "CrashHandler"

# 3. Verify app can recover (restart)
adb shell am start -n com.medibot.kiosk/.KioskActivity
```

---

### Phase 2 Build Checklist

- [ ] OTA update manager class created
- [ ] Timeout warning dialog implemented
- [ ] Crash handler integrated
- [ ] Battery monitor added
- [ ] Certificate pinning configured
- [ ] All new classes compile without errors
- [ ] Debug APK builds successfully
- [ ] Emulator testing passes
- [ ] Device testing passes (all Phase 2 features)
- [ ] OTA server configured and tested
- [ ] Rollback tested
- [ ] Documentation updated
- [ ] Phase 2 exit criteria defined

---

### Phase 2 Success Criteria

- [ ] OTA updates work (download, verify, install)
- [ ] Timeout warning UI displays 2 min before logout
- [ ] Countdown timer works correctly
- [ ] App recovers from crashes (auto-restart)
- [ ] Battery level displayed in WebView
- [ ] Low battery warning appears (<10%)
- [ ] Certificate pinning enforced (if configured)
- [ ] TLS 1.2+ only
- [ ] SSL errors handled gracefully
- [ ] All Phase 1 features still work (regression)
- [ ] No new crashes or memory leaks
- [ ] Performance acceptable (battery drain <3% per hour)

---

## 📋 Summary: Phase 1 → Phase 2

### Phase 1 Exit → Phase 2 Entry

**Check before proceeding to Phase 2:**

1. ✅ Phase 1 all exit criteria passed
2. ✅ APK tested on emulator and device
3. ✅ All logs clean (no errors)
4. ✅ Regression tests passed (web kiosk feature parity)
5. ✅ Network failover tested
6. ✅ Device admin permissions working
7. ✅ Inactivity timeout tested (15 min exactly)

**If all checks pass → Proceed to Phase 2**

---

### Phase 2 Incremental Development

Phase 2 can be developed incrementally (not all at once):

1. **Week 2a**: OTA Update Manager (most critical)
2. **Week 2b**: Timeout Warning Dialog (UX improvement)
3. **Week 2c**: Crash Handler (stability)
4. **Week 3a**: Certificate Pinning (security)
5. **Week 3b**: Battery Monitor (UX)
6. **Week 3c**: Testing & documentation

---

## 📞 Quick Commands Reference

### Build & Install
```bash
# Clean build
./gradlew clean assembleDebug

# Install on device
adb install -r app/build/outputs/apk/debug/app-debug.apk

# Launch app
adb shell am start -n com.medibot.kiosk/.KioskActivity
```

### Testing & Logs
```bash
# View logs
adb logcat | grep medibot

# Save logs to file
adb logcat > test_logs.txt

# Clear device data
adb shell pm clear com.medibot.kiosk

# Force-stop app
adb shell am force-stop com.medibot.kiosk

# Check device admin status
adb shell dpm list device-admins
```

### Debugging
```bash
# View all running processes
adb shell ps | grep medibot

# Check memory usage
adb shell dumpsys meminfo com.medibot.kiosk

# View crash logs
adb logcat | grep "AndroidRuntime"

# Connect Android Studio Profiler
# Run → Attach Debugger to Android Process
```

---

## ✅ Phase 1 Testing → Phase 2 Kickoff: READY

**Next Steps:**
1. Run Phase 1 testing (emulator + device)
2. Collect logs and verify all criteria pass
3. Document any issues found
4. Fix and retest if needed
5. When all Phase 1 criteria pass → Start Phase 2

**Estimated Timeline:**
- Phase 1 Testing: 1–2 days
- Phase 2 Development: 2 weeks
- Phase 2 Testing: 3–5 days
- Phase 3 (Device Ops + MDM): 1 week

---

**Document Version**: 1.0  
**Date**: April 24, 2026  
**Status**: Ready for Phase 1 Testing  
**Next**: Phase 2 Kickoff (after Phase 1 exit criteria met)
