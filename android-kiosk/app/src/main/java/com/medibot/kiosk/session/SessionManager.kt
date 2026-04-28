package com.medibot.kiosk.session

import android.content.Context
import android.os.Handler
import android.os.Looper
import com.medibot.kiosk.KioskActivity
import timber.log.Timber

/**
 * Manages inactivity timeout and auto-logout.
 *
 * Responsibilities:
 * - Track user activity (touches, interactions)
 * - Trigger auto-logout after configurable inactivity period
 * - Show warning dialog before timeout (Phase 2)
 */
class SessionManager(private val context: Context) {

    companion object {
        const val INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000L  // 15 minutes
        const val WARNING_TIME_MS = 2 * 60 * 1000L          // 2 minutes before timeout
        const val WARNING_DISPLAY_SECONDS = 120             // 2 minutes countdown
    }

    private val handler = Handler(Looper.getMainLooper())
    private var timeoutRunnable: Runnable? = null
    private var warningRunnable: Runnable? = null
    private var isActive = true
    private var warningDialog: TimeoutWarningDialog? = null

    fun startTimeout() {
        Timber.d("Starting session timeout monitor (${INACTIVITY_TIMEOUT_MS / 1000}s)")
        resetTimeout()
    }

    fun resetTimeout() {
        if (!isActive) return

        // Cancel existing timeouts
        timeoutRunnable?.let { handler.removeCallbacks(it) }
        warningRunnable?.let { handler.removeCallbacks(it) }

        // Dismiss any showing warning dialog
        warningDialog?.dismiss()
        warningDialog = null

        // Schedule warning (2 min before timeout)
        warningRunnable = Runnable {
            Timber.w("Session timeout warning: showing 2-minute countdown")
            showTimeoutWarning()
        }
        handler.postDelayed(warningRunnable!!, INACTIVITY_TIMEOUT_MS - WARNING_TIME_MS)

        // Schedule actual timeout
        timeoutRunnable = Runnable {
            Timber.w("Session timeout triggered")
            if (context is KioskActivity) {
                context.onSessionTimeout()
            }
        }
        handler.postDelayed(timeoutRunnable!!, INACTIVITY_TIMEOUT_MS)

        Timber.d("Session timeout reset")
    }

    private fun showTimeoutWarning() {
        // Phase 2: Show countdown dialog
        warningDialog = TimeoutWarningDialog(
            context,
            onStayLoggedIn = {
                Timber.d("User clicked 'Stay Logged In'")
                resetTimeout()  // Reset timeout and close dialog
            },
            onLogoutNow = {
                Timber.d("User clicked 'Logout Now'")
                if (context is KioskActivity) {
                    context.onSessionTimeout()
                }
            }
        )
        warningDialog?.show(WARNING_DISPLAY_SECONDS)
    }

    fun cancel() {
        isActive = false
        timeoutRunnable?.let { handler.removeCallbacks(it) }
        warningRunnable?.let { handler.removeCallbacks(it) }
        warningDialog?.dismiss()
        Timber.d("Session timeout cancelled")
    }

    fun onResume() {
        isActive = true
        resetTimeout()
        Timber.d("Session resumed")
    }

    fun onPause() {
        isActive = false
        warningDialog?.dismiss()
        Timber.d("Session paused")
    }

    fun logoutNow() {
        Timber.i("User manually logged out")
        if (context is KioskActivity) {
            context.onSessionTimeout()
        }
    }
}
