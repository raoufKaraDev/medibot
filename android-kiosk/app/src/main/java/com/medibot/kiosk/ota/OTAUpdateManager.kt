package com.medibot.kiosk.ota

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import com.medibot.kiosk.BuildConfig
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import timber.log.Timber
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * OTA Update Manager: Background APK updater.
 *
 * Responsibilities:
 * - Check for newer APK every 24 hours
 * - Download APK from internal server
 * - Verify SHA256 checksum
 * - Prompt user or auto-install
 * - Support rollback to previous version
 */
class OTAUpdateManager(private val context: Context) {

    companion object {
        const val CHECK_INTERVAL_HOURS = 24L
        const val OTA_SERVER_URL = "http://192.168.1.127:8000/ota"  // Hospital OTA server
        const val OTA_DIR = "MediBot_OTA"
        const val PREFS_OTA = "ota_prefs"
        const val KEY_LAST_CHECK = "last_check_time"
        const val KEY_CURRENT_APK = "current_apk"
    }

    private val handler = Handler(Looper.getMainLooper())
    private var checkRunnable: Runnable? = null
    private val downloadManager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
    private val otaDir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), OTA_DIR)

    init {
        if (!otaDir.exists()) {
            otaDir.mkdirs()
        }
    }

    fun startPeriodicCheck() {
        Timber.d("Starting periodic OTA check (every ${CHECK_INTERVAL_HOURS}h)")
        scheduleNextCheck()
    }

    private fun scheduleNextCheck() {
        checkRunnable = Runnable {
            checkForUpdate()
            scheduleNextCheck()
        }
        val delayMillis = TimeUnit.HOURS.toMillis(CHECK_INTERVAL_HOURS)
        handler.postDelayed(checkRunnable!!, delayMillis)
    }

    fun checkForUpdate() {
        Timber.d("Checking for OTA updates from: $OTA_SERVER_URL")

        // TODO: Implement actual server query
        // 1. Query OTA_SERVER_URL/version.json for latest version
        // 2. Compare with BuildConfig.VERSION_NAME
        // 3. If newer: download and verify
        // 4. Show update prompt

        try {
            // Mock: Simulate version check (replace with real HTTP call)
            val latestVersion = getLatestVersionFromServer()
            val currentVersion = BuildConfig.VERSION_NAME

            Timber.d("Version check: current=$currentVersion, latest=$latestVersion")

            if (latestVersion > currentVersion) {
                Timber.i("Newer version available: $latestVersion")
                downloadNewAPK(latestVersion)
            } else {
                Timber.d("App is up to date")
            }
        } catch (e: Exception) {
            Timber.e(e, "Failed to check for updates")
        }
    }

    private fun getLatestVersionFromServer(): String {
        // TODO: Replace with real HTTP request to OTA server
        // Example response: {"version": "1.1.0", "apk_url": "http://...", "sha256": "..."}
        return "1.0.0"  // Mock: Always current for now
    }

    private fun downloadNewAPK(version: String) {
        Timber.i("Downloading APK version: $version")

        try {
            val apkUrl = "$OTA_SERVER_URL/app-$version.apk"
            val apkFile = File(otaDir, "app-$version.apk")

            // Use DownloadManager to fetch APK
            val request = DownloadManager.Request(Uri.parse(apkUrl))
                .setTitle("MediBot Kiosk Update")
                .setDescription("Downloading version $version...")
                .setDestinationUri(Uri.fromFile(apkFile))
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)

            val downloadId = downloadManager.enqueue(request)
            Timber.d("Download enqueued with ID: $downloadId")

            // TODO: Register BroadcastReceiver to handle download completion
            // - Verify SHA256 checksum
            // - Trigger installation
            // - Show update prompt

        } catch (e: Exception) {
            Timber.e(e, "Failed to download APK")
        }
    }

    fun installAPK(apkFile: File) {
        Timber.i("Installing APK: ${apkFile.absolutePath}")

        try {
            // TODO: Implement silent/background APK installation
            // On Android 12+: Use PackageInstaller API
            // On Android 11 and below: Use Intent.ACTION_VIEW or Package Manager

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                // Android 12+: PackageInstaller API
                installViaPackageInstaller(apkFile)
            } else {
                // Android 11 and below: Intent or Package Manager
                installViaIntent(apkFile)
            }
        } catch (e: Exception) {
            Timber.e(e, "Failed to install APK")
        }
    }

    private fun installViaPackageInstaller(apkFile: File) {
        Timber.d("Installing via PackageInstaller (Android 12+)")
        // TODO: Implement PackageInstaller.Session API
    }

    private fun installViaIntent(apkFile: File) {
        Timber.d("Installing via Intent (Android 11 and below)")
        // TODO: Implement Intent-based installation
    }

    fun rollbackToPreviousVersion(): Boolean {
        Timber.i("Rolling back to previous APK version")

        try {
            val apkDir = otaDir
            val apkFiles = apkDir.listFiles() ?: return false

            // Find most recent backup APK
            val backupAPK = apkFiles
                .filter { it.name.startsWith("app-") && it.name.endsWith(".apk") }
                .sortedByDescending { it.lastModified() }
                .getOrNull(1)  // Get second most recent (first is current)

            if (backupAPK != null) {
                installAPK(backupAPK)
                Timber.i("Rollback initiated: ${backupAPK.name}")
                return true
            } else {
                Timber.w("No backup APK found for rollback")
                return false
            }
        } catch (e: Exception) {
            Timber.e(e, "Failed to rollback")
            return false
        }
    }

    fun stopPeriodicCheck() {
        checkRunnable?.let { handler.removeCallbacks(it) }
        Timber.d("OTA check stopped")
    }

    fun getDownloadDirectory(): File = otaDir
}
