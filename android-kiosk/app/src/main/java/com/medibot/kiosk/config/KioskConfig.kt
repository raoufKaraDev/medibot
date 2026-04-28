package com.medibot.kiosk.config

import android.content.Context
import android.content.SharedPreferences
import timber.log.Timber

/**
 * Centralized configuration for kiosk app.
 */
object KioskConfig {

    private const val PREFS_NAME = "kiosk_config"
    private const val KEY_KIOSK_URL = "kiosk_url"
    private const val KEY_ALLOWED_HOSTS = "allowed_hosts"

    // Development defaults
    private const val DEFAULT_KIOSK_URL = "http://192.168.1.127:3000/"  // Updated to Vite server
    private val DEFAULT_ALLOWED_HOSTS = listOf(
        "192.168.1.127",      // Laptop LAN IP
        "medibot.local",      // mDNS hostname
        "10.0.0.0/8",         // Private subnet
        "192.168.0.0/16",      // Private subnet
        "172.16.0.0/12",       // Private subnet
        "localhost",
        "10.0.2.2"            // Android Emulator host loopback
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
}
