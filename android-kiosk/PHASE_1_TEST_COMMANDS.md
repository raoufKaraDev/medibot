# Phase 1 Testing Commands & Phase 2 Structure

## 🧪 Phase 1: Quick Test Commands

### Pre-Test (Setup)

```bash
# Navigate to project
cd c:\ROBOT_MED\android-kiosk

# Update hospital LAN IP in config
# Edit: app/src/main/java/com/medibot/kiosk/config/KioskConfig.kt
# Line 15: DEFAULT_KIOSK_URL = "http://YOUR_IP:5173"
# Line 18-20: DEFAULT_ALLOWED_HOSTS = listOf("YOUR_IP", ...)

# Clean build
./gradlew clean assembleDebug

# Verify build success
ls app/build/outputs/apk/debug/app-debug.apk
# Should output: app/build/outputs/apk/debug/app-debug.apk
```

---

### Emulator Testing

```bash
# Start emulator (Pixel 4a, API 34)
emulator -avd Pixel_4a_API_34 &

# Wait for boot
adb wait-for-device
sleep 5

# Install APK
adb install -r app/build/outputs/apk/debug/app-debug.apk

# Launch app
adb shell am start -n com.medibot.kiosk/.KioskActivity

# Monitor logs in real-time
adb logcat | grep -E "KioskActivity|SessionManager|NetworkMonitor"
```

**What to verify on emulator screen:**
- ✓ Full-screen (no status bar, no navigation bar)
- ✓ WebView displays content
- ✓ No crash dialogs
- ✓ Touch response

**Limitation:** WebView may show blank on emulator (no internet). That's OK for Phase 1 MVP test.

---

### Physical Device Testing (Samsung A9+)

```bash
# Check connection
adb devices
# Output: <SERIAL_NUMBER> device

# Install APK
adb install -r app/build/outputs/apk/debug/app-debug.apk

# Launch app
adb shell am start -n com.medibot.kiosk/.KioskActivity

# Enable Device Admin (manual on tablet):
# Settings → Apps → Special app access → Device admin apps
# Toggle: MediBot Kiosk → ON

# Or via ADB (warning: sets device owner):
adb shell dpm set-device-owner com.medibot.kiosk/.admin.KioskDeviceAdminReceiver

# Verify Device Admin is active
adb shell dpm list device-admins
# Output should show: com.medibot.kiosk/.admin.KioskDeviceAdminReceiver
```

**What to verify on tablet screen:**
- ✓ Full-screen immersive (no status bar, no nav bar)
- ✓ Hospital kiosk loads from LAN
- ✓ Press back button → No effect (stays in app)
- ✓ Press home button → May not work without full DPM lock
- ✓ Touch responds to WebView content
- ✓ Wait 15 minutes of inactivity → Auto-logout

**Live Testing: Inactivity Timeout (15 min)**

```bash
# Start monitoring logs
adb logcat | grep SessionManager &

# Launch app
adb shell am start -n com.medibot.kiosk/.KioskActivity

# Time: 00:00 - App launched
# Time: 00:01 - Do not touch device AT ALL
# Time: 13:00 - 13 minutes elapsed (watch logs for warning)
# Expected log: "Session timeout warning: auto-logout in 120s"
# Time: 15:00 - 15 minutes elapsed
# Expected log: "Session timeout triggered"
# Verify: App reloaded to home screen (or blank if offline)
```

---

### Logs & Debugging

```bash
# View all medibot logs
adb logcat | grep medibot

# View specific component logs
adb logcat | grep KioskActivity        # Main activity
adb logcat | grep SessionManager       # Timeout events
adb logcat | grep NetworkMonitor       # Network state
adb logcat | grep KioskWebClient       # WebView/SSL errors

# Save logs to file for analysis
adb logcat > phase1_test_$(date +%Y%m%d_%H%M%S).log

# Search for errors
adb logcat | grep -i "error\|exception\|crash"

# Clear previous logs and start fresh
adb logcat -c
adb shell am start -n com.medibot.kiosk/.KioskActivity
adb logcat | grep medibot
```

**Expected logs on startup:**
```
KioskActivity: onCreate
KioskActivity: Kiosk mode enabled via DevicePolicyManager
KioskActivity: Loading kiosk URL: http://192.168.1.100:5173
KioskWebClient: Page load started
SessionManager: Starting session timeout monitor (900s)
NetworkMonitor: Network monitor started
KioskWebClient: Page load finished
KioskActivity: resumed
```

---

### Network Testing

```bash
# Test network connectivity
adb shell ping 192.168.1.100  # Ping laptop (should respond)

# Simulate network failure (disconnect Wi-Fi on tablet)
# Watch logs for: "Network lost"

# Verify app doesn't crash
adb logcat | grep NetworkMonitor

# Reconnect Wi-Fi
# Watch logs for: "Network available"

# Verify app recovers
adb shell am start -n com.medibot.kiosk/.KioskActivity
```

---

### Performance & Memory

```bash
# View memory usage
adb shell dumpsys meminfo com.medibot.kiosk | grep TOTAL

# Monitor in real-time (Android Studio Profiler)
# Run → Attach Debugger to Android Process
# Select: MediBot Kiosk (com.medibot.kiosk)
# Watch: Memory, CPU, Battery tabs

# Check if app survives 1 hour
# Launch app
adb shell am start -n com.medibot.kiosk/.KioskActivity
# Wait 1 hour (monitor with occasional adb logcat checks)
# Verify: No crash, no major memory increase
```

---

### Crash Testing

```bash
# Force-stop app
adb shell am force-stop com.medibot.kiosk

# Verify crash is logged
adb logcat | grep "AndroidRuntime"

# Verify app doesn't auto-restart (expected)
# Boot receiver only triggers on device reboot, not app crash

# Manually restart app (should work fine)
adb shell am start -n com.medibot.kiosk/.KioskActivity
```

---

### Regression Testing (Web Kiosk Feature Parity)

Compare Android wrapper vs. web kiosk (same features should work):

```bash
# On device:
# 1. Select room → Verify room displays
# 2. Select patient → Verify patient data shows
# 3. View prescriptions → Verify medications list
# 4. Check medication drawer assignment
# 5. Verify quick-note options (taken, vomited, refused, missing)
# 6. Check MQTT status (robot status, connectivity)
# 7. Test emergency panel (if available)
# 8. Verify colors, fonts, layout match web version
# 9. Test any animations or transitions
# 10. Verify all data loads correctly
```

---

### Device Admin Setup (Critical for Phase 1)

```bash
# Check if device admin is already active
adb shell dpm list device-admins
# If output shows: com.medibot.kiosk/.admin.KioskDeviceAdminReceiver → Already enabled

# Manual enable on tablet:
# Settings → Apps → Special app access → Device admin apps
# Find "MediBot Kiosk" → Toggle ON → Confirm

# Command-line enable (may brick device if not careful):
# adb shell dpm set-device-owner com.medibot.kiosk/.admin.KioskDeviceAdminReceiver

# Verify after enabling
adb shell dpm list device-admins

# To disable (if needed):
# adb shell dpm remove-active-admin com.medibot.kiosk/.admin.KioskDeviceAdminReceiver
```

---

## 📋 Phase 1 Exit Checklist

Before proceeding to Phase 2, verify:

- [ ] APK builds: `./gradlew assembleDebug` completes without errors
- [ ] Emulator: APK installs and launches
- [ ] Emulator: Full-screen mode active, no status bar
- [ ] Emulator: Back button blocked (repeated presses have no effect)
- [ ] Emulator: Logs show normal startup sequence
- [ ] Device: APK installs via USB (`adb install` succeeds)
- [ ] Device: App launches in full-screen on tablet
- [ ] Device: WebView loads hospital kiosk URL from LAN
- [ ] Device: Back button blocked (no accidental exit)
- [ ] Device: Home button behavior verified (may not work without full DPM)
- [ ] Device: Device Admin permissions granted
- [ ] Device: Session timeout tested (15 min inactivity)
- [ ] Device: Auto-logout resets UI to home
- [ ] Device: Network disconnection handled (no crash)
- [ ] Device: Network reconnection successful
- [ ] Device: All web kiosk features work (regression)
- [ ] Device: Memory stable (avg <150 MB)
- [ ] Device: CPU usage reasonable (<50% active)
- [ ] Device: Battery drain acceptable (~2% per hour)
- [ ] Logs: No error messages, normal activity log
- [ ] Documentation: All commands work as documented

**If all checks pass → APPROVED for Phase 2**

---

## 🚀 Phase 2: Development Structure

### Phase 2 New Files to Create

```bash
# Create new directories
mkdir -p app/src/main/java/com/medibot/kiosk/ota
mkdir -p app/src/main/java/com/medibot/kiosk/crash
mkdir -p app/src/main/java/com/medibot/kiosk/device

# Create OTA manager
touch app/src/main/java/com/medibot/kiosk/ota/OTAUpdateManager.kt

# Create crash handler
touch app/src/main/java/com/medibot/kiosk/crash/CrashHandler.kt

# Create battery monitor
touch app/src/main/java/com/medibot/kiosk/device/BatteryMonitor.kt

# Create timeout warning dialog
touch app/src/main/java/com/medibot/kiosk/session/TimeoutWarningDialog.kt

# Update existing files (see full document for changes)
# - KioskActivity.kt (add OTA, crash handler)
# - SessionManager.kt (show timeout warning)
# - build.gradle.kts (add new dependencies if needed)
```

---

### Phase 2 Architecture

```
Phase 2 Features:

1. OTA Update Manager (OTAUpdateManager.kt)
   - Background APK checker (every 24h)
   - Download & verify new APK
   - Install on user confirmation
   - Rollback previous version

2. Session Timeout UI (TimeoutWarningDialog.kt)
   - Show 2-minute warning before logout
   - Countdown timer display
   - "Stay logged in" button (resets timeout)
   - "Logout now" button (immediate logout)

3. Crash Handler (CrashHandler.kt)
   - Monitor for app crashes
   - Log crash details
   - Optional: Auto-restart with retry limit

4. Battery Monitor (BatteryMonitor.kt)
   - Display battery % via JS bridge
   - Low battery warning (<10%)
   - Auto-adjust screen brightness (optional)

5. Enhanced Security
   - Certificate pinning (optional, if certs available)
   - TLS 1.2+ enforcement
   - Improved SSL error handling
```

---

### Phase 2 Development Timeline

**Week 2: Core Features**
- Monday–Tuesday: OTA Update Manager
- Wednesday: Timeout Warning Dialog
- Thursday: Crash Handler
- Friday: Integration & initial testing

**Week 3: Hardening & Testing**
- Monday–Tuesday: Battery Monitor, Certificate Pinning
- Wednesday: Comprehensive testing (emulator + device)
- Thursday: Bug fixes, performance optimization
- Friday: Documentation, Phase 2 exit verification

---

### Phase 2 Build Commands

```bash
# Build Phase 2 APK
./gradlew clean assembleDebug

# Install Phase 2 APK
adb install -r app/build/outputs/apk/debug/app-debug.apk

# Test OTA (if server ready)
# Manually trigger: adb shell am broadcast -a com.medibot.kiosk.CHECK_FOR_UPDATE

# Test timeout warning (adjust timeout for testing)
# Change SessionManager: INACTIVITY_TIMEOUT_MS = 30000 (30 sec)
# Wait 25 sec → Warning appears
# Wait 30 sec → Auto-logout

# Test crash recovery
# Force-stop app, verify recovery logging
```

---

## ✅ Next: Run Phase 1 Tests

**Recommended Sequence:**

1. **Today**: Build APK, test on emulator (1–2 hours)
2. **Tomorrow**: Test on physical device (Samsung A9+) (2–3 hours)
3. **Day 3**: Run regression tests (all kiosk features) (2–3 hours)
4. **Day 4**: Verify Phase 1 exit criteria, fix any issues (1–2 hours)
5. **Day 5**: If all pass → Kickoff Phase 2

**Total Phase 1 Testing: ~2–3 days**

---

## 📞 Common Issues & Quick Fixes

| Issue | Fix |
|-------|-----|
| APK won't build | `./gradlew clean assembleDebug` (delete build cache) |
| APK won't install | Check: `adb devices`, device admin permission, app version |
| WebView blank | Check hospital LAN IP in `KioskConfig.kt`, verify web server running |
| Back button works | Device admin not granted (manual: Settings → Device admin apps) |
| Timeout doesn't trigger | Check: logs for timeout event, SessionManager running |
| Network error | Check: Wi-Fi connected to hospital LAN, tablet can ping laptop |
| App crashes | Check: `adb logcat \| grep "AndroidRuntime"` for crash details |
| Memory leak | Run Android Studio Profiler for 1 hour, check memory graph |

---

**Document Version**: 1.0  
**Date**: April 24, 2026  
**Status**: Ready for Phase 1 Testing  
**Next Step**: Execute Phase 1 test commands above, report results

Start with emulator testing, then move to physical device testing.
