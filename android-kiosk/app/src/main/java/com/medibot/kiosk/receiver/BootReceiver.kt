package com.medibot.kiosk.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.medibot.kiosk.KioskActivity
import timber.log.Timber

/**
 * Boot receiver: auto-starts kiosk app after device reboot.
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            Timber.i("Device boot completed; auto-starting kiosk app")
            val launchIntent = Intent(context, KioskActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(launchIntent)
        }
    }
}
