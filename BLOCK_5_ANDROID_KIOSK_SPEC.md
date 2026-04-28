# Block 5: Android Kiosk Strategy — Implementation Specification

## Objective
Package the existing web-based kiosk view into an Android application for the Samsung Galaxy A9+ tablet without rebuilding the main web app or changing existing core logic.

## Current State Assessment

### Existing Kiosk Components (Frontend)
- **Location**: `frontend/src/features/kiosk/KioskView.tsx`
- **Status**: Fully functional, production-ready
- **Features**:
  - Room selection
  - Patient data display
  - Prescription workflow
  - Medication dispensing UI
  - Quick-note capture (taken, vomited, refused, missing, etc.)
  - Real-time MQTT connection for robot/device status
  - Emergency panel integration
  - Theme support (dark/light)

### App Mode Switching (Frontend)
- **Location**: `frontend/src/App.tsx`
- **Current Modes**: 
  - `kiosk` (default) — no auth, full-screen patient UI
  - `admin` (requires login) — admin dashboard with doctor auth

### Build & Deploy
- **Build tool**: Vite
- **Framework**: React + TypeScript
- **Package manager**: npm
- **Output**: Single HTML + JS bundle
- **Current deployment**: Web browser on laptop/mobile

---

## Block 5 Strategy: Wrapper Approach (Recommended)

### Phase 1: Wrapper Android Application

#### 1.1 Technology Stack
| Component | Choice | Rationale |
|-----------|--------|-----------|
| Framework | Android Native (Kotlin) | Direct access to device APIs, security controls, kiosk mode |
| WebView | Android WebView | Displays existing web kiosk with full feature support |
| Kiosk Framework | DevicePolicyManager API | Android 5.0+ device restrictions, full-screen lock |
| MQTT Bridge | Native MQTTv3/v5 library (e.g., Eclipse Paho) | Optional: local MQTT relay if network isolation needed |
| Target API | Android 8.0+ (API 26+) | Samsung A9+ support, modern features, security patches |

#### 1.2 Android Wrapper Architecture

```
MediBot-Kiosk-Android (New repo/branch)
├── app/
│   ├── src/main/
│   │   ├── java/com/medibot/kiosk/
│   │   │   ├── KioskActivity.kt         (Main WebView container)
│   │   │   ├── KioskPolicyManager.kt    (Device policy, lock mode)
│   │   │   ├── NetworkManager.kt        (LAN connectivity check)
│   │   │   ├── SessionManager.kt        (Auto-logout, timeout)
│   │   │   ├── SecurityConfig.kt        (HTTPS cert pinning, TLS)
│   │   │   └── JSBridge.kt              (JS ↔ Android communication)
│   │   ├── AndroidManifest.xml
│   │   └── res/
│   │       ├── layout/
│   │       ├── drawable/
│   │       └── values/
│   ├── build.gradle.kts                 (Dependencies, versioning)
│   └── ...
├── README.md                            (Setup, build, deployment)
└── gradle/                              (Build scripts)
```

---

### Phase 2: Kiosk-Only Policy & UX Lock

#### 2.1 Full-Screen Kiosk Mode
- **Device Policy Manager (DPM)**: Lock device into kiosk app
  - Prevent home/back buttons
  - Disable notification panel
  - Disable status bar access
  - Prevent app switching

#### 2.2 WebView Configuration
```kotlin
// Pseudo-code
webView.settings.apply {
  javaScriptEnabled = true
  domStorageEnabled = true
  databaseEnabled = false  // Disable local DB for security
  mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
  userAgentString = "MediBot-Kiosk-Android/$VERSION"
}
webView.setWebViewClient(KioskWebClient())  // Custom SSL handling, nav interception
```

#### 2.3 Navigation Restrictions
- Whitelist base URL: `http://<LAPTOP_LAN_IP>:5173` (dev) or `http://<HOSPITAL_SERVER>` (prod)
- Block any navigation outside hospital network
- Intercept and disable admin login deep links
- Inject custom header to signal kiosk mode to backend

#### 2.4 Session Auto-Logout
- Track inactivity timer (default: 15 minutes idle)
- Warn user at 2-minute mark
- Auto-dismiss keyboard/modals on timeout
- Reset to idle kiosk home screen
- Log timeout event to audit trail

---

### Phase 3: Tablet Operations & Device Management

#### 3.1 Startup Auto-Launch
- **Android Boot Receiver**: Listen for `ACTION_BOOT_COMPLETED`
- **Persistent Service**: Ensures kiosk app restarts if killed
- **Launcher Configuration**: Set as default launcher (optional, if hospital policy allows)

#### 3.2 Accidental Exit Prevention
- Override back button: no-op or show "Confirm Exit?" (if allowed)
- Disable swipe-to-close gestures
- Disable app switcher access
- Monitor for crashes: auto-relaunch with retry count

#### 3.3 Update Rollout Strategy
- **Over-the-Air (OTA)**: APK hosted on internal server
  - Background check every 24 hours
  - Download during low-activity window
  - Prompt user to update (or auto-apply if in kiosk lock)
- **Gradual Rollout**: Deploy to staging tablets first, monitor for issues
- **Rollback**: Keep previous APK signed key; downgrade allowed

---

### Phase 4: Network & Connectivity

#### 4.1 LAN Detection
- Verify connection to hospital LAN (static IP or mDNS lookup)
- Fail gracefully if offline (show cached content if available)
- Attempt reconnect on network change event

#### 4.2 Certificate Pinning (Optional)
- Pin hospital server HTTPS cert or CA cert
- Reject self-signed certs unless explicitly trusted
- Refresh cert on known expiry

#### 4.3 JS ↔ Native Bridge
```kotlin
// Example: Tablet can query device info
webView.addJavascriptInterface(object {
  @JavascriptInterface
  fun getDeviceInfo(): String = JSONObject().apply {
    put("device", Build.MODEL)
    put("os_version", Build.VERSION.SDK_INT)
    put("app_version", BuildConfig.VERSION_NAME)
    put("battery_percent", getBatteryPercent())
  }.toString()
}, "AndroidAPI")
```

---

## Block 5 Deliverables

### D1: Android Kiosk Implementation Spec (This Document)
- **Status**: ✅ Complete
- **Includes**: Architecture, tech stack, policy, ops, phasing

### D2: Android Project Template (Phase 1 Kickoff)
- Kotlin project scaffold with WebView + DPM integration
- Build configuration (gradle, signing, versioning)
- README with local build steps

### D3: Deployment & OTA Runbook (Phase 2)
- How to build signed APK
- How to host APK on internal server
- How to configure tablet for auto-update
- Recovery/rollback procedures

### D4: Samsung Device Policy Configuration (Phase 2)
- MDM agent setup (optional: integration with Samsung Knox or simple DPM)
- Kiosk lock configuration
- Firewall/network policies if hospital IT manages devices

### D5: Testing & Validation Checklist (Phase 3)
- Kiosk lock enforcement tests
- MQTT connectivity tests
- Session timeout tests
- Network failover tests
- Auto-update tests
- Regression tests vs. web kiosk

---

## Implementation Phases

### Phase 1: Wrapper MVP (Weeks 1–2)
**Goal**: Basic Android WebView container with kiosk mode lock

**Scope**:
- Android project setup (Kotlin)
- WebView configured to load hospital kiosk URL
- DevicePolicyManager lock (prevent back/home)
- Basic certificate pinning
- Deliverable: APK that runs existing web kiosk in full-screen

**Entry Gate**: Block 4 (Network Topology) complete, LAN stable
**Exit Gate**: Wrapper app loads kiosk without errors, DPM lock functional

---

### Phase 2: Session & Security Hardening (Weeks 2–3)
**Goal**: Add auto-logout, update mechanism, security controls

**Scope**:
- Inactivity timeout (15 min → auto-logout)
- OTA update service (background APK delivery)
- JS bridge for battery/device info
- Network connectivity monitoring
- Deliverable: Signed APK with auto-update capability

**Entry Gate**: Phase 1 MVP stable
**Exit Gate**: Update mechanism tested, timeout working

---

### Phase 3: Device Ops & Deployment (Weeks 3–4)
**Goal**: Production-ready tablet ops, MDM integration (if needed)

**Scope**:
- Boot receiver for auto-start
- Crash/recovery handler
- Samsung Knox or MDM agent integration (if hospital requires)
- Rollback procedures
- Operator runbook
- Deliverable: Production APK + ops manual

**Entry Gate**: Phase 2 secure and stable
**Exit Gate**: Tablet OTA deployment tested, rollback confirmed

---

## Known Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| WebView version mismatch | JS bridge broken, cert validation issues | Pin WebView via Google Play System Update, test quarterly |
| Network disconnection mid-session | Lost state, user confusion | Implement optimistic updates, sync queue |
| Accidental app exit | Clinical workflow interrupted | Override back button, disable app switcher via DPM |
| MQTT/device control via WebView | Security exposure, unintended robot commands | JS bridge whitelist only safe APIs, no direct MQTT in WebView |
| Samsung A9+ browser cache stale | Outdated UI after update | Clear cache on app update, force reload on version change |
| Device theft / tampering | Hospital data exposure | Device encryption enabled, DPM wipe capability, VPN to hospital LAN |
| OTA update conflicts | Broken app after incomplete download | Atomic update (download, verify signature, then replace) |

---

## NOT Included in Block 5 (Future Blocks)
- Kiosk + admin hybrid app (reserved for later if business needs change)
- Android TV / Multi-room support (out of scope)
- Bluetooth/NFC integration (reserved for pharmacy/med cabinet pairing)
- Offline mode (local SQLite cache) — Phase 4+ if needed

---

## Success Criteria

- [ ] Existing web kiosk loads in Android WebView without modifications
- [ ] Full-screen kiosk mode prevents accidental exit/navigation
- [ ] Auto-logout works after inactivity timeout
- [ ] OTA update mechanism downloads and applies new APK
- [ ] Network failure does not crash app (graceful error handling)
- [ ] Audit trail captures all kiosk events (login, room, med, timeout, error)
- [ ] Tablet maintains >4-hour battery usage without charge under normal ward use
- [ ] No new code changes to existing web app backend/frontend
- [ ] Regression tests pass (100% kiosk feature parity vs. web)

---

## Approval Gate

**Ready to proceed to Phase 1?**
- [x] Architecture decision approved (wrapper vs. native rebuild)
- [x] LAN topology stable (Block 4 complete)
- [x] Kiosk web view finalized (no breaking changes planned)
- [x] Android project template resources allocated
- [x] Hospital IT coordination for MDM/Device policy (if required)

---

**Document Version**: 1.0  
**Date**: April 24, 2026  
**Status**: ✅ APPROVED — Phase 1 Kickoff Authorized  
**Author**: Block 5 Planning  
**Next Milestone**: Phase 1 Wrapper MVP (2 weeks)
