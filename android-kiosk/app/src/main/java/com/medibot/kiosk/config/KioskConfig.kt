package com.medibot.kiosk.config

import android.content.Context
import android.content.SharedPreferences
import timber.log.Timber

/**
 * Centralized configuration for kiosk app.
 */
object KioskConfig {

    enum class Environment { LOCALHOSPITAL, REMOTEBACKUP }

    private const val PREFS_NAME = "kiosk_config"
    private const val KEY_KIOSK_URL = "kiosk_url"
    private const val KEY_ALLOWED_HOSTS = "allowed_hosts"

    // Development defaults
    private const val DEFAULT_KIOSK_URL = "http://medibot.local:8000/kiosk"
    private val DEFAULT_ALLOWED_HOSTS = listOf(
        "medibot.local",      // mDNS hostname
        "medibot-backup.example.com",
        "localhost",
        "android.local"
    )

    fun getPrefs(context: Context): SharedPreferences {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    fun getKioskURL(context: Context): String {
        val prefs = getPrefs(context)
        val url = prefs.getString(KEY_KIOSK_URL, DEFAULT_KIOSK_URL) ?: DEFAULT_KIOSK_URL
        Timber.d("Kiosk URL: $url")
        return url
    }

    fun setKioskURL(context: Context, url: String) {
        val prefs = getPrefs(context)
        prefs.edit().putString(KEY_KIOSK_URL, url).apply()
        Timber.d("Kiosk URL updated: $url")
    }

    fun getAllowedHosts(context: Context): List<String> {
        val prefs = getPrefs(context)
        val hosts = prefs.getString(KEY_ALLOWED_HOSTS, DEFAULT_ALLOWED_HOSTS.joinToString(";"))
            ?.split(";") ?: DEFAULT_ALLOWED_HOSTS
        Timber.d("Allowed hosts: $hosts")
        return hosts
    }

    fun setAllowedHosts(context: Context, hosts: List<String>) {
        val prefs = getPrefs(context)
        prefs.edit().putString(KEY_ALLOWED_HOSTS, hosts.joinToString(";")).apply()
        Timber.d("Allowed hosts updated: $hosts")
    }

    fun getEnvironment(context: Context): Environment {
        val env = context.getSharedPreferences("kioskconfig", Context.MODE_PRIVATE)
            .getString("environment", "LOCALHOSPITAL")
        return Environment.valueOf(env!!)
    }

    fun getApiBaseUrl(context: Context): String {
        val env = getEnvironment(context)
        return when (env) {
            Environment.LOCALHOSPITAL -> {
                val sharedPref = context.getSharedPreferences("kioskconfig", Context.MODE_PRIVATE)
                sharedPref.getString("api_base_url", "http://192.168.1.100:8000")!!
            }
            Environment.REMOTEBACKUP -> "https://medibot-backup.example.com"
        }
    }

    fun getKioskUrl(context: Context): String {
        return "${getApiBaseUrl(context)}/kiosk"
    }

    fun getMqttBroker(context: Context): String? {
        val env = getEnvironment(context)
        return if (env == Environment.LOCALHOSPITAL) {
            val sharedPref = context.getSharedPreferences("kioskconfig", Context.MODE_PRIVATE)
            sharedPref.getString("mqtt_broker", "192.168.1.100")
        } else null  // Remote backup does not use MQTT
    }

    fun getSessionTimeoutMinutes(context: Context): Int {
        return if (getEnvironment(context) == Environment.LOCALHOSPITAL) 30 else 60
    }

    fun isLocalMode(context: Context): Boolean {
        return getEnvironment(context) == Environment.LOCALHOSPITAL
    }
}
