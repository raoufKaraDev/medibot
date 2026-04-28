package com.medibot.kiosk.device

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import timber.log.Timber

/**
 * Battery Monitor: Tracks device battery level and displays warnings.
 *
 * Responsibilities:
 * - Monitor battery level changes
 * - Inject battery level into WebView
 * - Show low battery warning (<10%)
 * - Auto-adjust screen brightness (optional)
 */
class BatteryMonitor(private val context: Context) {

    companion object {
        const val LOW_BATTERY_THRESHOLD = 10  // %
        const val CRITICAL_BATTERY_THRESHOLD = 5  // %
    }

    private val handler = Handler(Looper.getMainLooper())
    private var batteryCheckRunnable: Runnable? = null
    private var lastBatteryLevel = -1

    fun startMonitoring() {
        Timber.d("Starting battery monitor")
        checkBatteryLevel()
    }

    private fun checkBatteryLevel() {
        batteryCheckRunnable = Runnable {
            val batteryLevel = getBatteryLevel()

            if (batteryLevel != lastBatteryLevel) {
                Timber.d("Battery level changed: $lastBatteryLevel% → $batteryLevel%")
                lastBatteryLevel = batteryLevel

                // Check thresholds
                when {
                    batteryLevel <= CRITICAL_BATTERY_THRESHOLD -> {
                        Timber.w("CRITICAL battery level: $batteryLevel%")
                        showCriticalBatteryWarning(batteryLevel)
                    }
                    batteryLevel <= LOW_BATTERY_THRESHOLD -> {
                        Timber.w("Low battery warning: $batteryLevel%")
                        showLowBatteryWarning(batteryLevel)
                    }
                }

                // Inject battery level into WebView (via JS bridge)
                injectBatteryLevelToWeb(batteryLevel)
            }

            // Check again in 10 seconds
            batteryCheckRunnable?.let { handler.postDelayed(it, 10000) }
        }

        handler.post(batteryCheckRunnable!!)
    }

    private fun getBatteryLevel(): Int {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val batteryManager = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
                batteryManager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CHARGE_COUNTER)
            } else {
                // Fallback for older Android versions
                val ifilter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
                val batteryStatus = context.registerReceiver(null, ifilter)
                val level = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
                val scale = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
                if (level >= 0 && scale > 0) (level * 100) / scale else -1
            }
        } catch (e: Exception) {
            Timber.e(e, "Failed to get battery level")
            -1
        }
    }

    private fun getBatteryStatus(): String {
        return try {
            val ifilter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
            val batteryStatus = context.registerReceiver(null, ifilter)
            val status = batteryStatus?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1

            when (status) {
                BatteryManager.BATTERY_STATUS_CHARGING -> "charging"
                BatteryManager.BATTERY_STATUS_DISCHARGING -> "discharging"
                BatteryManager.BATTERY_STATUS_FULL -> "full"
                BatteryManager.BATTERY_STATUS_NOT_CHARGING -> "not_charging"
                else -> "unknown"
            }
        } catch (e: Exception) {
            "unknown"
        }
    }

    private fun showLowBatteryWarning(level: Int) {
        Timber.w("Low battery: $level%")
        // TODO: Show banner or toast on WebView
    }

    private fun showCriticalBatteryWarning(level: Int) {
        Timber.e("CRITICAL battery: $level% - Consider shutting down")
        // TODO: Show prominent warning on WebView
    }

    private fun injectBatteryLevelToWeb(level: Int) {
        // This would be called from KioskActivity's WebView
        // Allows JavaScript to access battery level: window.kioskBattery.level
        Timber.d("Battery level available for WebView: $level%")
    }

    fun adjustScreenBrightness(level: Int) {
        // Optional: Auto-reduce brightness when battery is low
        Timber.d("Adjusting brightness based on battery: $level%")
        // TODO: Implement screen brightness adjustment
    }

    fun stopMonitoring() {
        batteryCheckRunnable?.let { handler.removeCallbacks(it) }
        Timber.d("Battery monitor stopped")
    }
}
