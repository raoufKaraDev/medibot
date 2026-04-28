package com.medibot.kiosk

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import com.medibot.kiosk.admin.KioskDeviceAdminReceiver
import timber.log.Timber

/**
 * Manages DevicePolicyManager for kiosk mode enforcement.
 *
 * Responsibilities:
 * - Request device admin permissions (if not already granted)
 * - Enable/disable kiosk mode (lock device into this app)
 * - Prevent accidental exit and app switching
 */
class KioskPolicyManager(private val context: Context) {

    private val dpm: DevicePolicyManager = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    private val adminComponentName = ComponentName(context, KioskDeviceAdminReceiver::class.java)

    fun enableKioskMode() {
        if (!isDeviceAdminActive()) {
            Timber.w("Device admin not active. Requesting permission...")
            requestDeviceAdminPermission()
            return
        }

        try {
            // Set lock task packages (restrict to kiosk app only)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                dpm.setLockTaskPackages(adminComponentName, arrayOf(context.packageName))
                Timber.d("Lock task packages configured for kiosk app")
            }

            // Disable status bar (if API available)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                dpm.setStatusBarDisabled(adminComponentName, true)
                Timber.d("Status bar disabled")
            }

            // Disable keyguard (lock screen)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                dpm.setKeyguardDisabled(adminComponentName, true)
                Timber.d("Keyguard disabled")
            }

            Timber.i("Kiosk mode enabled successfully")
        } catch (e: Exception) {
            Timber.e(e, "Failed to enable kiosk mode")
            throw e
        }
    }

    fun disableKioskMode() {
        if (!isDeviceAdminActive()) {
            Timber.w("Device admin not active; cannot disable kiosk mode")
            return
        }

        try {
            // Clear lock task packages
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                dpm.setLockTaskPackages(adminComponentName, emptyArray())
                Timber.d("Lock task packages cleared")
            }

            // Re-enable status bar
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                dpm.setStatusBarDisabled(adminComponentName, false)
                Timber.d("Status bar re-enabled")
            }

            // Re-enable keyguard
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                dpm.setKeyguardDisabled(adminComponentName, false)
                Timber.d("Keyguard re-enabled")
            }

            Timber.i("Kiosk mode disabled")
        } catch (e: Exception) {
            Timber.e(e, "Failed to disable kiosk mode")
        }
    }

    private fun isDeviceAdminActive(): Boolean {
        return dpm.isAdminActive(adminComponentName)
    }

    private fun requestDeviceAdminPermission() {
        try {
            val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
                putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponentName)
                putExtra(
                    DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                    "MediBot Kiosk requires device admin to enforce kiosk mode"
                )
            }
            context.startActivity(intent)
            Timber.d("Device admin permission requested")
        } catch (e: Exception) {
            Timber.e(e, "Failed to request device admin permission")
        }
    }

    fun wipeDeviceData() {
        if (!isDeviceAdminActive()) {
            Timber.w("Device admin not active; cannot wipe device")
            return
        }

        try {
            // WARNING: This is destructive. Use only in emergency scenarios.
            dpm.wipeData(DevicePolicyManager.WIPE_EXTERNAL_STORAGE)
            Timber.w("Device wipe initiated (security emergency)")
        } catch (e: Exception) {
            Timber.e(e, "Failed to wipe device")
        }
    }
}
