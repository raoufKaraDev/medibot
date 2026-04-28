package com.medibot.kiosk

import android.app.admin.DevicePolicyManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.medibot.kiosk.config.KioskConfig
import com.medibot.kiosk.crash.CrashHandler
import com.medibot.kiosk.device.BatteryMonitor
import com.medibot.kiosk.network.NetworkMonitor
import com.medibot.kiosk.ota.OTAUpdateManager
import com.medibot.kiosk.security.SecurityConfig
import com.medibot.kiosk.session.SessionManager
import timber.log.Timber

/**
 * Main Kiosk Activity: WebView container for hospital kiosk interface.
 *
 * Responsibilities:
 * - Load hospital web kiosk URL from LAN
 * - Enforce full-screen kiosk mode (via DevicePolicyManager)
 * - Manage inactivity timeout and auto-logout
 * - Monitor network connectivity
 * - Handle browser-level security (certificate pinning, etc.)
 */
class KioskActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var container: FrameLayout
    private lateinit var sessionManager: SessionManager
    private lateinit var networkMonitor: NetworkMonitor
    private lateinit var kioskPolicyManager: KioskPolicyManager
    private lateinit var otaManager: OTAUpdateManager
    private lateinit var crashHandler: CrashHandler
    private lateinit var batteryMonitor: BatteryMonitor
    private val handler = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_kiosk)

        // Initialize logging
        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
        }

        Timber.d("KioskActivity onCreate")

        // Initialize managers
        otaManager = OTAUpdateManager(this)
        crashHandler = CrashHandler(this)
        batteryMonitor = BatteryMonitor(this)
        sessionManager = SessionManager(this)
        networkMonitor = NetworkMonitor(this)
        kioskPolicyManager = KioskPolicyManager(this)

        // Get UI references
        container = findViewById(R.id.kiosk_container)
        webView = findViewById(R.id.kiosk_webview)

        // Configure immersive full-screen mode
        configureFullScreen()

        // Configure WebView
        configureWebView()

        // Attempt to enable kiosk lock via DevicePolicyManager
        enableKioskMode()

        // Monitor network
        networkMonitor.start()

        // Start session timeout monitoring
        sessionManager.startTimeout()

        // Start OTA update checker (Phase 2)
        otaManager.startPeriodicCheck()

        // Start battery monitoring (Phase 2)
        batteryMonitor.startMonitoring()

        // Reset crash restart count (successful startup)
        crashHandler.resetRestartCount()

        // Load hospital kiosk URL
        loadKioskURL()

        Timber.d("KioskActivity initialization complete")
    }

    private fun configureFullScreen() {
        // Hide status bar and navigation bar
        WindowCompat.setDecorFitsSystemWindows(window, false)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.hide(WindowInsets.Type.systemBars())
            window.insetsController?.systemBarsBehavior =
                WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                )
        }
    }

    private fun configureWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = false  // Security: disable local DB
            mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            userAgentString = buildKioskUserAgent()

            // Security headers
            if (androidx.webkit.WebViewFeature.isFeatureSupported(androidx.webkit.WebViewFeature.FORCE_DARK)) {
                androidx.webkit.WebSettingsCompat.setForceDark(this, androidx.webkit.WebSettingsCompat.FORCE_DARK_OFF)
            }
        }

        // Set custom web client (handles SSL, navigation, errors)
        webView.webViewClient = KioskWebClient(this, sessionManager)

        // Add JS bridge for device info (optional)
        webView.addJavascriptInterface(AndroidJSBridge(this), "AndroidAPI")

        // Clear cache and cookies (fresh start)
        webView.clearCache(true)
        webView.clearHistory()
    }

    private fun buildKioskUserAgent(): String {
        val base = webView.settings.userAgentString
        return "$base MediBot-Kiosk-Android/${BuildConfig.VERSION_NAME}"
    }

    private fun enableKioskMode() {
        try {
            kioskPolicyManager.enableKioskMode()
            Timber.d("Kiosk mode enabled via DevicePolicyManager")
        } catch (e: Exception) {
            Timber.e(e, "Failed to enable kiosk mode (device may not support DPM)")
            // Continue anyway; UX will be degraded but functional
        }
    }

    private fun loadKioskURL() {
        val kioskURL = KioskConfig.getKioskURL(this)
        Timber.d("Loading kiosk URL: $kioskURL")
        webView.loadUrl(kioskURL)
    }

    override fun onResume() {
        super.onResume()
        sessionManager.onResume()
        networkMonitor.start()
        webView.onResume()

        // Restore full-screen immersive mode
        configureFullScreen()

        Timber.d("KioskActivity resumed")
    }

    override fun onPause() {
        super.onPause()
        sessionManager.onPause()
        webView.onPause()
        Timber.d("KioskActivity paused")
    }

    override fun onDestroy() {
        super.onDestroy()
        networkMonitor.stop()
        sessionManager.cancel()
        otaManager.stopPeriodicCheck()
        batteryMonitor.stopMonitoring()
        webView.destroy()
        Timber.d("KioskActivity destroyed (Phase 2)")
    }

    override fun onUserInteraction() {
        super.onUserInteraction()
        sessionManager.resetTimeout()  // Reset inactivity timer on user touch
    }

    // Override back button to prevent accidental exit
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        return when (keyCode) {
            KeyEvent.KEYCODE_BACK -> {
                Timber.d("Back button pressed (blocked in kiosk mode)")
                true  // Consume event; do nothing
            }
            KeyEvent.KEYCODE_HOME -> {
                Timber.d("Home button pressed (blocked in kiosk mode)")
                true  // Consume event; do nothing
            }
            else -> super.onKeyDown(keyCode, event)
        }
    }

    override fun dispatchTouchEvent(event: MotionEvent?): Boolean {
        sessionManager.resetTimeout()  // Reset inactivity on any touch
        return super.dispatchTouchEvent(event)
    }

    fun onSessionTimeout() {
        Timber.w("Session timeout triggered")
        // Reset to idle state (reload home)
        webView.loadUrl("javascript:if(window.kioskAPI && window.kioskAPI.logout) window.kioskAPI.logout();")
        // Fallback: reload URL
        handler.postDelayed({
            loadKioskURL()
        }, 500)
    }

    fun onNetworkError(message: String) {
        Timber.e("Network error: $message")
        webView.loadUrl("about:blank")
        // TODO: Show offline UI (e.g., loading spinner + retry button)
    }
}
