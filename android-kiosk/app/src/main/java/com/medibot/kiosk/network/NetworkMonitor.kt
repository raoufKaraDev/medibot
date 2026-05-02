package com.medibot.kiosk.network

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import com.medibot.kiosk.KioskActivity
import com.medibot.kiosk.config.KioskConfig
import timber.log.Timber
import java.net.HttpURLConnection
import java.net.URL

/**
 * Monitors network connectivity and alerts activity of changes.
 *
 * Responsibilities:
 * - Detect network state changes (online/offline)
 * - Verify connection to hospital LAN
 * - Notify activity of network errors
 */
class NetworkMonitor(private val context: Context) {

    private val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            super.onAvailable(network)
            Timber.d("Network available: $network")
            // Retry any pending operations
        }

        override fun onLost(network: Network) {
            super.onLost(network)
            Timber.w("Network lost: $network")
            if (context is KioskActivity) {
                context.onNetworkError("Hospital LAN connection lost")
            }
        }

        override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
            super.onCapabilitiesChanged(network, caps)
            val isInternet = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            val isValidated = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
            Timber.d("Network capabilities changed: internet=$isInternet, validated=$isValidated")
        }
    }

    fun start() {
        try {
            val request = NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build()

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                connectivityManager.registerNetworkCallback(request, networkCallback)
                Timber.d("Network monitor started")
            }
        } catch (e: Exception) {
            Timber.e(e, "Failed to start network monitor")
        }
    }

    fun stop() {
        try {
            connectivityManager.unregisterNetworkCallback(networkCallback)
            Timber.d("Network monitor stopped")
        } catch (e: Exception) {
            Timber.e(e, "Failed to stop network monitor")
        }
    }

    fun isNetworkAvailable(): Boolean {
        val activeNetwork = connectivityManager.activeNetwork ?: return false
        val caps = connectivityManager.getNetworkCapabilities(activeNetwork) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    fun checkBackendConnectivity(context: Context, onResult: (Boolean) -> Unit) {
        val url = "${KioskConfig.getApiBaseUrl(context)}/health"
        Thread {
            try {
                val connection = URL(url).openConnection() as HttpURLConnection
                connection.connectTimeout = 3000
                connection.readTimeout = 3000
                connection.requestMethod = "GET"
                val reachable = connection.responseCode == 200
                connection.disconnect()
                onResult(reachable)
            } catch (e: Exception) {
                onResult(false)
            }
        }.start()
    }
}
