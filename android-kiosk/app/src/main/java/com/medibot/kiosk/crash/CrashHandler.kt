package com.medibot.kiosk.crash

import android.content.Context
import android.content.Intent
import com.medibot.kiosk.BuildConfig
import timber.log.Timber
import java.io.BufferedWriter
import java.io.File
import java.io.FileWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Crash Handler: Monitors app crashes and logs them.
 *
 * Responsibilities:
 * - Catch uncaught exceptions
 * - Log crash details to file
 * - Optional: Auto-restart with retry limit
 * - Prevent infinite crash loops
 */
class CrashHandler(private val context: Context) : Thread.UncaughtExceptionHandler {

    companion object {
        const val CRASH_LOG_DIR = "MediBot_Crashes"
        const val MAX_RESTART_ATTEMPTS = 3
        const val RESTART_DELAY_MS = 2000L
    }

    private val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()
    private val crashLogDir = File(context.cacheDir, CRASH_LOG_DIR)

    init {
        if (!crashLogDir.exists()) {
            crashLogDir.mkdirs()
        }
        Thread.setDefaultUncaughtExceptionHandler(this)
        Timber.d("CrashHandler initialized")
    }

    override fun uncaughtException(thread: Thread, exception: Throwable) {
        Timber.e(exception, "CRASH DETECTED in thread: ${thread.name}")

        try {
            // Log crash details to file
            logCrashToFile(thread, exception)

            // Check restart attempts
            val restartCount = getRestartCount()
            if (restartCount < MAX_RESTART_ATTEMPTS) {
                Timber.w("Auto-restarting app (attempt ${restartCount + 1}/$MAX_RESTART_ATTEMPTS)")
                incrementRestartCount()

                // Delay before restart (allows UI update)
                Thread.sleep(RESTART_DELAY_MS)

                // Restart kiosk activity
                restartKioskActivity()
            } else {
                Timber.e("Max restart attempts reached. Not auto-restarting.")
            }
        } catch (e: Exception) {
            Timber.e(e, "Error in crash handler")
        }

        // Call default handler (system crash reporting)
        defaultHandler?.uncaughtException(thread, exception)
    }

    private fun logCrashToFile(thread: Thread, exception: Throwable) {
        try {
            val timestamp = SimpleDateFormat("yyyy-MM-dd_HH:mm:ss", Locale.US).format(Date())
            val crashLogFile = File(crashLogDir, "crash_$timestamp.log")

            BufferedWriter(FileWriter(crashLogFile)).use { writer ->
                writer.write("=== CRASH LOG ===\n")
                writer.write("Timestamp: $timestamp\n")
                writer.write("Thread: ${thread.name}\n")
                writer.write("App Version: ${BuildConfig.VERSION_NAME}\n")
                writer.write("Android SDK: ${android.os.Build.VERSION.SDK_INT}\n")
                writer.write("\nException:\n")
                writer.write("${exception.javaClass.simpleName}: ${exception.message}\n\n")
                writer.write("Stack Trace:\n")
                exception.printStackTrace(java.io.PrintWriter(writer))

                // Include cause if present
                var cause = exception.cause
                while (cause != null) {
                    writer.write("\nCaused by:\n")
                    writer.write("${cause.javaClass.simpleName}: ${cause.message}\n")
                    cause.printStackTrace(java.io.PrintWriter(writer))
                    cause = cause.cause
                }
            }

            Timber.d("Crash logged to: ${crashLogFile.absolutePath}")
        } catch (e: Exception) {
            Timber.e(e, "Failed to log crash to file")
        }
    }

    private fun restartKioskActivity() {
        try {
            val intent = Intent(context, com.medibot.kiosk.KioskActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
            }
            context.startActivity(intent)
            Timber.i("Kiosk activity restart initiated")
        } catch (e: Exception) {
            Timber.e(e, "Failed to restart kiosk activity")
        }
    }

    private fun getRestartCount(): Int {
        return try {
            val prefs = context.getSharedPreferences("crash_prefs", Context.MODE_PRIVATE)
            prefs.getInt("restart_count", 0)
        } catch (e: Exception) {
            0
        }
    }

    private fun incrementRestartCount() {
        try {
            val prefs = context.getSharedPreferences("crash_prefs", Context.MODE_PRIVATE)
            val count = prefs.getInt("restart_count", 0)
            prefs.edit().putInt("restart_count", count + 1).apply()
        } catch (e: Exception) {
            Timber.e(e, "Failed to update restart count")
        }
    }

    fun resetRestartCount() {
        try {
            val prefs = context.getSharedPreferences("crash_prefs", Context.MODE_PRIVATE)
            prefs.edit().remove("restart_count").apply()
            Timber.d("Restart count reset")
        } catch (e: Exception) {
            Timber.e(e, "Failed to reset restart count")
        }
    }

    fun getCrashLogs(): List<File> {
        return crashLogDir.listFiles()?.filter { it.name.endsWith(".log") }?.sortedByDescending { it.lastModified() } ?: emptyList()
    }

    fun clearOldCrashLogs(olderThanDays: Int = 30) {
        try {
            val cutoffTime = System.currentTimeMillis() - (olderThanDays * 24 * 60 * 60 * 1000L)
            val logsToDelete = crashLogDir.listFiles()?.filter { it.lastModified() < cutoffTime } ?: emptyList()

            logsToDelete.forEach {
                if (it.delete()) {
                    Timber.d("Deleted old crash log: ${it.name}")
                }
            }
        } catch (e: Exception) {
            Timber.e(e, "Failed to clear old crash logs")
        }
    }
}
