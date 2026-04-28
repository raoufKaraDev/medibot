# Phase 1 MVP: Android Project Files Checklist

## ✅ Project Structure Created

### Build Configuration
- [x] `build.gradle.kts` (root) — Plugin versions, dependency resolution
- [x] `app/build.gradle.kts` — App dependencies, compile config, build types
- [x] `settings.gradle.kts` — Project settings, gradle configuration

### Manifests & Resources
- [x] `app/src/main/AndroidManifest.xml` — Permissions, activities, receivers, device admin
- [x] `app/src/main/res/layout/activity_kiosk.xml` — WebView container
- [x] `app/src/main/res/values/strings.xml` — App strings
- [x] `app/src/main/res/values/styles.xml` — Theme definition
- [x] `app/src/main/res/values/colors.xml` — Color palette
- [x] `app/src/main/res/xml/device_admin_policy.xml` — DPM policy (lock task, disable status bar)

### Core Implementation (Kotlin)

#### Main Activity
- [x] `KioskActivity.kt` — Main activity, WebView container, full-screen, session timeout

#### WebView Client
- [x] `KioskWebClient.kt` — SSL validation, URL whitelist, navigation interception

#### Device Policy Manager
- [x] `KioskPolicyManager.kt` — Enable/disable kiosk mode, lock task
- [x] `KioskDeviceAdminReceiver.kt` — Device admin receiver lifecycle

#### Session Management
- [x] `SessionManager.kt` — Inactivity timeout (15 min), warning, auto-logout

#### Network & Connectivity
- [x] `NetworkMonitor.kt` — Network state monitoring, connectivity changes

#### Configuration
- [x] `KioskConfig.kt` — Centralized config (kiosk URL, allowed hosts, preferences)

#### Security
- [x] `SecurityConfig.kt` — Certificate pinning, SSL policy, security flags

#### JS Bridge
- [x] `AndroidJSBridge.kt` — JavaScript ↔ Android communication (device info, battery)

#### Boot & Recovery
- [x] `BootReceiver.kt` — Auto-start on device boot

### Documentation
- [x] `README.md` — Complete setup, development, testing, deployment guide
- [x] `PHASE_1_CHECKLIST.md` — This file

---

## 📋 Phase 1 MVP Scope

### Deliverables ✅

**D1: Android WebView Wrapper**
- Loads hospital kiosk URL from LAN
- Full-screen immersive mode (hides status bar, navigation bar)
- Prevents accidental exit (back button disabled, home button disabled)
- Supports dev URL: `http://192.168.1.100:5173` (configurable)

**D2: DevicePolicyManager Integration**
- Lock task mode (restrict to kiosk app only)
- Disable status bar
- Disable keyguard
- Device admin receiver for lifecycle events

**D3: Inactivity Timeout**
- 15-minute default timeout
- 2-minute warning before logout
- Auto-logout resets to home screen
- Resets on any user interaction

**D4: Network Monitoring**
- Detect connectivity state changes
- Alert activity on network loss
- Graceful error handling

**D5: Build Configuration**
- Android 8.0+ target (API 26+)
- Samsung Galaxy A9+ compatible
- Debug and release build types
- Gradle build system

**D6: Documentation**
- Setup guide with network configuration
- Development workflow (emulator, device)
- Testing checklist
- Troubleshooting guide
- Architecture overview

---

## 🚀 Quick Start

### 1. Configure for Your Network

Edit `app/src/main/java/com/medibot/kiosk/config/KioskConfig.kt`:

```kotlin
private const val DEFAULT_KIOSK_URL = "http://192.168.1.100:5173"  // ← Your laptop LAN IP
private val DEFAULT_ALLOWED_HOSTS = listOf(
    "192.168.1.100",      // ← Your laptop LAN IP
    "medibot.local",
)
```

### 2. Build Debug APK

```bash
cd c:\ROBOT_MED\android-kiosk
./gradlew assembleDebug
# Output: app/build/outputs/apk/debug/app-debug.apk
```

### 3. Install on Device

```bash
adb devices  # Connect tablet via USB
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### 4. Enable Device Admin

On tablet:
- Settings → Apps → Special app access → Device admin apps
- Enable "MediBot Kiosk"

### 5. Launch & Test

- App should auto-start in full-screen
- WebView loads hospital kiosk URL
- Back/Home buttons disabled
- 15-min inactivity timeout enforced

---

## 📝 Entry & Exit Criteria

### Entry Gate (✅ Approved)
- [x] Wrapper approach confirmed
- [x] LAN topology stable (Block 4)
- [x] Web kiosk finalized
- [x] Android resources allocated
- [x] Hospital IT coordination ready

### Exit Gate (Success Criteria)
- [ ] Debug APK builds without errors
- [ ] Emulator: APK installs and runs
- [ ] Emulator: WebView loads kiosk URL successfully
- [ ] Emulator: Full-screen immersive mode active
- [ ] Emulator: Back button does nothing (blocked)
- [ ] Device (tablet): APK installs via USB
- [ ] Device: Kiosk URL loads on hospital LAN
- [ ] Device: Device admin permissions granted
- [ ] Device: DPM lock task active (app locked in)
- [ ] Device: Inactivity timeout tested (manual 15-min wait)
- [ ] Device: Network disconnection handled gracefully
- [ ] Regression: Web kiosk features work identically
- [ ] Audit log: Session events recorded

---

## 🔧 Build Environment Setup

### Prerequisites

**Windows:**
```powershell
# Install Android Studio (includes SDK, Gradle)
# Install JDK 11+
# Verify Java:
java -version  # Should show 11+
```

**macOS:**
```bash
# Install Android Studio
# Install JDK (via Homebrew)
brew install openjdk@11
java -version
```

**Linux:**
```bash
sudo apt install openjdk-11-jdk
java -version
```

### Android Studio Setup

1. Open Android Studio
2. SDK Manager: Install API 34, Android 8.0 (API 26)
3. Create emulator: Pixel 4a, API 34, Android 14
4. Or: Connect tablet via USB (enable Developer Mode)

---

## 🧪 Testing Strategy

### Phase 1a: Emulator Testing (Days 1–2)
1. Build debug APK
2. Launch emulator (Pixel 4a, API 34)
3. Install APK: `adb install -r app/build/outputs/apk/debug/app-debug.apk`
4. Verify: Full-screen loads, back button blocked, timeout works

### Phase 1b: Device Testing (Day 3–4)
1. Connect Samsung A9+ tablet via USB
2. Enable Developer Mode on tablet
3. Grant USB debugging permission
4. Install APK
5. Enable Device Admin permission
6. Test on real hospital LAN (laptop serves kiosk)
7. Verify all features

### Phase 1c: Regression Testing (Day 5)
1. Compare web kiosk vs. Android wrapper (feature parity)
2. Test all rooms, patients, medications
3. Test auth, suspend/reactivate workflows
4. Test MQTT connectivity (if enabled)
5. Document any UI/UX differences

---

## 📦 Deliverable Artifacts

```
android-kiosk/
├── app/build/outputs/apk/
│   ├── debug/app-debug.apk              ← Install on device
│   └── release/app-release.apk          ← Sign and deploy (Phase 2+)
├── app/src/                             ← Source code
├── README.md                            ← Setup guide
└── PHASE_1_CHECKLIST.md                 ← This file
```

---

## 🎯 Phase 1 Success Metrics

| Metric | Target | Status |
|--------|--------|--------|
| APK build time | <2 min | TBD |
| APK size | <20 MB | TBD |
| Startup time | <3 sec | TBD |
| WebView load time | <2 sec | TBD |
| Memory usage | <150 MB | TBD |
| Battery drain | <2% per hour (idle) | TBD |
| Back button override | 100% blocked | TBD |
| Timeout enforcement | Exactly 15 min | TBD |
| Network failover | Graceful | TBD |

---

## 📞 Support & Next Steps

### Phase 1 Complete → Phase 2 (Weeks 2–3)
- Auto-logout warning UI (countdown dialog)
- OTA update mechanism
- Enhanced security (SSL pinning, SOP)
- Production build signing

### Phase 2 Complete → Phase 3 (Weeks 3–4)
- Boot receiver validation
- Samsung Knox MDM integration
- Device ops runbook
- Production deployment

---

**Document Version**: 1.0  
**Date**: April 24, 2026  
**Status**: ✅ Ready for Build  
**Target**: Phase 1 Completion (2 weeks)
