package com.medibot.kiosk.session

import android.app.AlertDialog
import android.content.Context
import android.os.Handler
import android.os.Looper
import timber.log.Timber

/**
 * Timeout Warning Dialog: Shows 2-minute countdown before auto-logout.
 *
 * Displayed when inactivity is about to trigger auto-logout.
 * User can:
 * - Click "Stay Logged In" to reset timeout
 * - Click "Logout Now" for immediate logout
 * - Wait for countdown to 0 → auto-logout
 */
class TimeoutWarningDialog(
    private val context: Context,
    private val onStayLoggedIn: () -> Unit,
    private val onLogoutNow: () -> Unit
) {

    private var dialog: AlertDialog? = null
    private val handler = Handler(Looper.getMainLooper())
    private var updateRunnable: Runnable? = null

    fun show(secondsRemaining: Int = 120) {
        Timber.d("Showing timeout warning: ${secondsRemaining}s remaining")

        var remaining = secondsRemaining
        var isClosed = false

        // Create dialog with countdown
        val builder = AlertDialog.Builder(context)
            .setTitle("⏱ Session Timeout")
            .setMessage("You will be logged out in $remaining seconds...\n\nTap screen or click 'Stay Logged In' to continue.")
            .setPositiveButton("Stay Logged In") { _, _ ->
                Timber.d("User clicked 'Stay Logged In'")
                isClosed = true
                onStayLoggedIn()
            }
            .setNegativeButton("Logout Now") { _, _ ->
                Timber.d("User clicked 'Logout Now'")
                isClosed = true
                onLogoutNow()
            }
            .setCancelable(false)  // Prevent accidental dismissal

        dialog = builder.create()
        dialog?.show()

        // Update countdown every second
        updateRunnable = object : Runnable {
            override fun run() {
                if (!isClosed) {
                    remaining--
                    if (remaining > 0) {
                        dialog?.setMessage("You will be logged out in $remaining seconds...\n\nTap screen or click 'Stay Logged In' to continue.")
                        handler.postDelayed(this, 1000)
                    } else {
                        Timber.d("Timeout countdown reached 0, triggering auto-logout")
                        isClosed = true
                        dialog?.dismiss()
                        onLogoutNow()  // Auto-logout
                    }
                }
            }
        }

        handler.postDelayed(updateRunnable!!, 1000)
    }

    fun dismiss() {
        updateRunnable?.let { handler.removeCallbacks(it) }
        dialog?.dismiss()
        dialog = null
        Timber.d("Timeout warning dialog dismissed")
    }
}
