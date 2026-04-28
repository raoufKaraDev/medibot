# MediBot Kiosk — Android Application

## Overview

This is the Android wrapper for the MediBot hospital kiosk interface. It packages the existing web-based kiosk (React, TypeScript) into a native Android app with full-screen kiosk mode lock, auto-logout, and secure LAN connectivity.

**Key Features:**
- WebView loads hospital kiosk URL from LAN
- DevicePolicyManager enforces full-screen kiosk mode (prevents exit)
- 15-minute inactivity timeout + auto-logout
- Network connectivity monitoring
- Certificate pinning for HTTPS (optional)
- OTA update support (Phase 2+)
- Auto-start on device boot
- Crash recovery

---

## Prerequisites

### Development Environment
- **Android Studio** 2023.1 or later
- **Android SDK**: API 26+ (Android 8.0+)
- **Kotlin**: 1.9.20+
- **Gradle**: 8.1.3+
- **Java**: JDK 11+

### Target Device
- **Samsung Galaxy A9+** (or compatible Android 8.0+ device)
- **Min Android**: 8.0 (API 26)
- **Target Android**: 14 (API 34)

### Hospital Network
- **Laptop IP**: Static or reserved DHCP (e.g., 192.168.1.100)
- **Kiosk URL**: `http://<LAPTOP_IP>:5173` (dev) or `http://<HOSPITAL_SERVER>` (prod)
- **LAN Connectivity**: Tablet must be on same SSID/VLAN as laptop

---

## Setup

### 1. Clone or Extract Project

```bash
# Extract to workspace
cd /path/to/projects
unzip android-kiosk.zip
cd android-kiosk
```

### 2. Configure Hospital Network

Edit [app/src/main/java/com/medibot/kiosk/config/KioskConfig.kt](app/src/main/java/com/medibot/kiosk/config/KioskConfig.kt):

```kotlin
private const val DEFAULT_KIOSK_URL = "http://192.168.1.100:5173"  // ← Update to your laptop IP
private val DEFAULT_ALLOWED_HOSTS = listOf(
    "192.168.1.100",      // ← Update to your laptop IP
    "medibot.local",      // Optional mDNS hostname
    "10.0.0.0/8"          // Hospital private subnet (optional)
)
```

### 3. Open in Android Studio

```bash
# Open project
open -a "Android Studio" .
# Or: File → Open → select this folder
```

### 4. Build APK

```bash
# Build debug APK (for emulator/testing)
./gradlew assembleDebug

# Build release APK (for production)
./gradlew assembleRelease
```

Output: `app/build/outputs/apk/{debug,release}/app-{debug,release}.apk`

---

## Development

### Project Structure

```
android-kiosk/
├── app/
│   ├── src/main/
│   │   ├── java/com/medibot/kiosk/
│   │   │   ├── KioskActivity.kt              (Main activity)
│   │   │   ├── KioskWebClient.kt             (WebView client, SSL, navigation)
│   │   │   ├── KioskPolicyManager.kt         (DevicePolicyManager wrapper)
│   │   │   ├── AndroidJSBridge.kt            (JS↔native bridge)
│   │   │   ├── admin/
│   │   │   │   └── KioskDeviceAdminReceiver.kt
│   │   │   ├── session/
│   │   │   │   └── SessionManager.kt         (Inactivity timeout)
│   │   │   ├── network/
│   │   │   │   └── NetworkMonitor.kt         (Connectivity tracking)
│   │   │   ├── config/
│   │   │   │   └── KioskConfig.kt            (App configuration)
│   │   │   ├── security/
│   │   │   │   └── SecurityConfig.kt         (SSL/cert pinning)
│   │   │   └── receiver/
│   │   │       └── BootReceiver.kt           (Auto-start on boot)
│   │   ├── AndroidManifest.xml
│   │   ├── res/
│   │   │   ├── layout/
│   │   │   ├── values/
│   │   │   └── xml/
│   ├── build.gradle.kts
│   └── proguard-rules.pro
├── build.gradle.kts
├── settings.gradle.kts
└── README.md
```

### Key Classes

| Class | Purpose |
|-------|---------|
| `KioskActivity` | Main activity; loads web kiosk URL in WebView |
| `KioskWebClient` | Handles SSL validation, URL whitelist, errors |
| `KioskPolicyManager` | Enables/disables DevicePolicyManager lock |
| `SessionManager` | Tracks inactivity timeout (15 min default) |
| `NetworkMonitor` | Detects connectivity changes |
| `AndroidJSBridge` | Allows JS to query device info (battery, model, etc.) |
| `KioskConfig` | Centralized app configuration (URLs, hosts) |

### Running on Emulator

```bash
# Start Android emulator
emulator -avd Pixel_4a -no-snapshot -no-window &

# Build and run debug APK
./gradlew installDebug
./gradlew run

# Or in Android Studio: Run → Run 'app'
```

### Running on Device

```bash
# Connect Samsung tablet via USB (enable Developer Mode)
adb devices  # Should list device

# Build and install
./gradlew installDebug

# Or in Android Studio: Select device → Run 'app'
```

---

## Configuration

### Hospital Network Settings

Edit `app/src/main/java/com/medibot/kiosk/config/KioskConfig.kt`:

```kotlin
// Default kiosk URL (development)
const val DEFAULT_KIOSK_URL = "http://192.168.1.100:5173"

// Whitelisted hosts (only these URLs allowed in WebView)
val DEFAULT_ALLOWED_HOSTS = listOf(
    "192.168.1.100",      // Laptop LAN IP
    "medibot.local",      // mDNS hostname
    "10.0.0.0/8"          // Hospital subnet
)
```

### Inactivity Timeout

Edit `app/src/main/java/com/medibot/kiosk/session/SessionManager.kt`:

```kotlin
const val INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000L  // 15 minutes
const val WARNING_TIME_MS = 2 * 60 * 1000L          // 2 minutes before timeout
```

### SSL/Certificate Pinning (Optional)

Edit `app/src/main/java/com/medibot/kiosk/security/SecurityConfig.kt`:

```kotlin
val CERTIFICATE_PINS = listOf(
    "sha256/YOUR_CERT_PIN_HERE"  // Add hospital server certificate pins
)

const val ENABLE_CERT_PINNING = true  // Enable in production
```

---

## Testing

### Manual Test Checklist

- [ ] APK installs on tablet
- [ ] App launches and loads kiosk URL from LAN
- [ ] WebView displays kiosk interface correctly
- [ ] Back button disabled (no exit)
- [ ] Home button disabled (no exit)
- [ ] Status bar hidden (full-screen)
- [ ] Inactivity timeout triggers after 15 min of no touch
- [ ] Network disconnection handled gracefully
- [ ] Tablet can reconnect after network outage
- [ ] Battery info displayed via AndroidAPI

### Unit Tests

```bash
./gradlew test
```

### Integration Tests (on device)

```bash
./gradlew connectedAndroidTest
```

---

## Deployment

### Phase 1: Manual Installation (Testing)

```bash
# Connect tablet via USB
adb devices

# Install debug APK
adb install -r app/build/outputs/apk/debug/app-debug.apk

# Or use Android Studio: Run 'app'
```

### Phase 2: OTA Updates (Future)

- Build signed release APK
- Host APK on internal server (e.g., hospital IT server)
- Tablet checks for updates every 24 hours
- Auto-download and apply with user confirmation

### Phase 3: Enterprise MDM (Future)

- Integrate with Samsung Knox MDM or hospital IT policies
- Remote device management
- Automatic rollout to multiple tablets
- Rollback capability

---

## Troubleshooting

### WebView not loading

**Problem**: Blank white screen, no content loaded

**Solutions**:
1. Check hospital network IP in `KioskConfig.kt`
2. Verify tablet is on same SSID as laptop
3. Ping laptop from tablet: `adb shell ping 192.168.1.100`
4. Check web kiosk is running: `curl http://192.168.1.100:5173`
5. Logcat: `adb logcat | grep KioskActivity`

### Device Admin Permission Not Granted

**Problem**: Kiosk mode not active (back button works, home button works)

**Solutions**:
1. Open Android Settings → Apps → Special app access → Device admin apps
2. Enable "MediBot Kiosk"
3. Or run: `adb shell dpm set-device-owner com.medibot.kiosk/.admin.KioskDeviceAdminReceiver`

### Session Timeout Not Working

**Problem**: User not logged out after 15 minutes of inactivity

**Solutions**:
1. Check `SessionManager.kt` timeout values
2. Verify app is in focus (not backgrounded)
3. Logcat: `adb logcat | grep SessionManager`

### Certificate Pinning Error

**Problem**: `SSL_PINNING_ERROR` or blank screen with no content

**Solutions**:
1. Check certificate pins in `SecurityConfig.kt`
2. Verify hospital server certificate validity: `openssl s_client -connect hospital.com:443`
3. Temporarily disable pinning in debug mode (NOT production)

---

## Logging & Debugging

### Enable Logcat in Android Studio

```
Logcat → Filter by app name: "medibot"
```

### View logs from command line

```bash
adb logcat | grep medibot
adb logcat -C  # Colored output
```

### Key log tags

- `KioskActivity` — Main activity lifecycle
- `KioskWebClient` — WebView navigation and SSL
- `SessionManager` — Inactivity timeout
- `NetworkMonitor` — Network connectivity
- `AndroidJSBridge` — JS bridge calls

---

## Next Steps (Phase 2)

- [ ] Implement OTA update service
- [ ] Add battery level monitoring + low-battery warning
- [ ] Network failover strategy (fallback to offline mode)
- [ ] Session timeout UI warning (countdown dialog)
- [ ] Samsung Knox MDM integration
- [ ] Crash recovery handler

---

## Support & Questions

For issues or questions:
1. Check Logcat output (`adb logcat | grep medibot`)
2. Review troubleshooting section above
3. Check Block 5 spec: [BLOCK_5_ANDROID_KIOSK_SPEC.md](../../BLOCK_5_ANDROID_KIOSK_SPEC.md)
4. Contact hospital IT/development team

---

**Version**: 1.0.0  
**Last Updated**: April 24, 2026  
**Target Device**: Samsung Galaxy A9+ (Android 8.0+)  
**Kiosk URL**: `http://<LAPTOP_IP>:5173` (dev) or hospital server (prod)
