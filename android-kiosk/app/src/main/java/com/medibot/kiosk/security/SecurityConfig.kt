package com.medibot.kiosk.security

import com.medibot.kiosk.BuildConfig
import timber.log.Timber

/**
 * Security configuration for kiosk app.
 *
 * Handles (Phase 2 enhancements):
 * - Certificate pinning (optional)
 * - SSL/TLS policy (1.2+)
 * - Data encryption
 * - Network security
 */
object SecurityConfig {

    // Hospital server certificate pins (SHA-256, base64)
    // Add your hospital server's certificate pins here for production
    val CERTIFICATE_PINS = listOf<String>(
        // Example: "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
        // To get your cert pin:
        // 1. openssl s_client -connect your-server.com:443 < /dev/null | openssl x509 -outform DER | openssl dgst -sha256 -binary | openssl enc -base64
        // 2. Add the output below
    )

    // Enable certificate pinning for production
    const val ENABLE_CERT_PINNING = false  // Set to true after adding CERTIFICATE_PINS

    // Require HTTPS in production
    const val REQUIRE_HTTPS = true

    // Minimum TLS version (TLS 1.2+)
    const val MIN_TLS_VERSION = "TLSv1.2"

    // SSL error handling policy
    const val ALLOW_SELF_SIGNED_DEBUG = true  // Allow self-signed in debug builds only
    const val ALLOW_SELF_SIGNED_PRODUCTION = false

    fun isCertificatePinningEnabled(): Boolean {
        return ENABLE_CERT_PINNING && CERTIFICATE_PINS.isNotEmpty()
    }

    fun shouldRequireHTTPS(): Boolean {
        return REQUIRE_HTTPS
    }

    fun shouldAllowSelfSigned(): Boolean {
        return if (BuildConfig.DEBUG) ALLOW_SELF_SIGNED_DEBUG else ALLOW_SELF_SIGNED_PRODUCTION
    }

    fun logSecurityInfo() {
        Timber.d(
            "Security Config: " +
            "pinning=${isCertificatePinningEnabled()}, " +
            "https=${shouldRequireHTTPS()}, " +
            "tlsMin=$MIN_TLS_VERSION, " +
            "allowSelfSigned=${shouldAllowSelfSigned()}"
        )
    }

    fun getSecurityBannerMessage(): String {
        return buildString {
            append("🔒 Security Status: ")
            if (isCertificatePinningEnabled()) append("✓ Cert Pinning, ")
            if (shouldRequireHTTPS()) append("✓ HTTPS Only, ")
            append("✓ TLS ${MIN_TLS_VERSION}+")
        }
    }

    // Phase 2: Add certificate pins for production hospital server
    fun setupProductionCertificatePins(certificatePins: List<String>) {
        Timber.i("Setting up production certificate pins: ${certificatePins.size} pins configured")
        // TODO: Implement dynamic pin configuration
    }

    // Phase 2: Validate certificate
    fun validateCertificate(certificatePEM: String): Boolean {
        // TODO: Implement certificate validation
        // - Parse PEM
        // - Extract public key
        // - Compare with pins
        Timber.d("Validating certificate...")
        return true
    }
}
