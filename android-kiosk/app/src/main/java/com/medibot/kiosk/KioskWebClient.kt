package com.medibot.kiosk

import android.net.http.SslError
import android.webkit.SslErrorHandler
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebViewClient
import com.medibot.kiosk.config.KioskConfig
import com.medibot.kiosk.security.SecurityConfig
import com.medibot.kiosk.session.SessionManager
import timber.log.Timber

/**
 * Custom WebViewClient for kiosk: handles SSL, navigation, errors.
 *
 * Security responsibilities:
 * - Validate SSL certificates (pinning if configured)
 * - Whitelist allowed URLs (hospital LAN only)
 * - Block external navigation
 * - Handle network errors gracefully
 */
class KioskWebClient(
    private val activity: KioskActivity,
    private val sessionManager: SessionManager
) : WebViewClient() {

    override fun shouldOverrideUrlLoading(view: android.webkit.WebView, request: WebResourceRequest): Boolean {
        val url = request.url.toString()

        // Check if URL is whitelisted (hospital LAN only)
        if (!isURLWhitelisted(url)) {
            Timber.w("Blocked navigation to non-whitelisted URL: $url")
            return true  // Block navigation
        }

        Timber.d("Allowing navigation to: $url")
        return false  // Allow navigation
    }

    override fun onPageStarted(view: android.webkit.WebView, url: String, favicon: android.graphics.Bitmap?) {
        super.onPageStarted(view, url, favicon)
        Timber.d("Page load started: $url")
        sessionManager.resetTimeout()
    }

    override fun onPageFinished(view: android.webkit.WebView, url: String) {
        super.onPageFinished(view, url)
        Timber.d("Page load finished: $url")

        // Inject kiosk-mode header for backend to detect
        injectKioskModeSignal(view)
    }

    override fun onReceivedError(view: android.webkit.WebView, request: WebResourceRequest, error: WebResourceError) {
        super.onReceivedError(view, request, error)
        Timber.e("WebView error: ${error.description} for ${request.url}")

        // Let user know of connection issues (via JS callback)
        activity.onNetworkError(error.description.toString())
    }

    override fun onReceivedSslError(view: android.webkit.WebView, handler: SslErrorHandler, error: SslError) {
        // Enforce certificate validation strict policy
        val errorMessage = when (error.primaryError) {
            SslError.SSL_UNTRUSTED -> "Untrusted certificate"
            SslError.SSL_EXPIRED -> "Expired certificate"
            SslError.SSL_IDMISMATCH -> "Hostname mismatch"
            SslError.SSL_NOTYETVALID -> "Certificate not yet valid"
            else -> "SSL error"
        }

        Timber.e("SSL Error: $errorMessage for ${error.url}")

        // In development, allow SSL errors (common for local hospital servers)
        if (BuildConfig.DEBUG) {
            Timber.w("DEBUG: Allowing SSL error for development: $errorMessage")
            handler.proceed()
        } else {
            Timber.e("SSL certificate validation failed. Blocking navigation.")
            handler.cancel()
        }
    }

    private fun isURLWhitelisted(url: String): Boolean {
        val allowedHosts = KioskConfig.getAllowedHosts(activity)
        val uri = android.net.Uri.parse(url)
        val host = uri.host ?: return false
        val scheme = uri.scheme ?: return false

        // Must be HTTP or HTTPS
        if (scheme !in listOf("http", "https")) {
            return false
        }

        // Check if host matches allowed list
        return allowedHosts.any { allowed ->
            host == allowed || host.endsWith(".$allowed")
        }
    }

    private fun injectKioskModeSignal(view: android.webkit.WebView) {
        val js = """
            window.kioskMode = true;
            window.kioskVersion = "${BuildConfig.VERSION_NAME}";
            window.kioskBrand = "MediBot";
            console.log("Kiosk mode active: v${BuildConfig.VERSION_NAME}");
        """.trimIndent()
        view.evaluateJavascript(js, null)
    }
}
