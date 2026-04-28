package com.medibot.kiosk

import android.content.Context
import android.os.BatteryManager
import android.os.Build
import android.webkit.JavascriptInterface
import org.json.JSONObject
import timber.log.Timber

/**
 * JavaScript bridge: allows web kiosk to query device info.
 *
 * Accessible from web as: window.AndroidAPI.getDeviceInfo()
 */
class AndroidJSBridge(private val context: Context) {

    @JavascriptInterface
    fun getDeviceInfo(): String {
        return try {
            val info = JSONObject().apply {
                put("device", Build.MODEL)
                put("manufacturer", Build.MANUFACTURER)
                put("os_version", Build.VERSION.SDK_INT)
                put("app_version", BuildConfig.VERSION_NAME)
                put("battery_percent", getBatteryPercent())
            }
            info.toString()
        } catch (e: Exception) {
            Timber.e(e, "Error getting device info")
            JSONObject().apply {
                put("error", e.message)
            }.toString()
        }
    }

    @JavascriptInterface
    fun getBatteryPercent(): Int {
        return try {
            val batteryManager = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
            batteryManager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CHARGE_COUNTER)
        } catch (e: Exception) {
            Timber.e(e, "Error getting battery percent")
            -1
        }
    }

    @JavascriptInterface
    fun log(message: String) {
        Timber.d("WebView: $message")
    }

    @JavascriptInterface
    fun logError(message: String) {
        Timber.e("WebView error: $message")
    }
}
