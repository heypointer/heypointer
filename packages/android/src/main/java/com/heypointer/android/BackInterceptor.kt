package com.heypointer.android

import android.app.Activity
import android.os.Build
import android.view.InputEvent
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.Window
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher

/**
 * Makes the Back button close the guide card first, instead of leaving the screen or the app.
 *
 * Two paths, because Android has two Back mechanisms. Apps that handle Back as a key event (every app
 * before the Android 13 predictive-back opt-in) are covered by wrapping the window callback. Apps that opted
 * in (`android:enableOnBackInvokedCallback`, Android 13+) get a dispatcher callback that exists only while
 * the card is open. Only one of the two ever fires for a given Back press.
 *
 * The same wrapper lets `observe` watch touches and keys on their way to the app (it never consumes or changes them),
 * which is how assist mode learns that the user already tapped the highlighted control.
 */
internal class BackInterceptor(
    private val activity: Activity,
    private val isActive: () -> Boolean,
    private val onBack: () -> Unit,
    private val observe: ((InputEvent) -> Unit)? = null,
) {
    private val window: Window = activity.window
    private var predictive: Predictive? = null
    private var installed: Window.Callback? = null

    fun install() {
        val base = window.callback ?: return
        val wrapper = KeyWrapper(base)
        installed = wrapper
        window.callback = wrapper
    }

    /** Call when the card opens or closes. Cheap and idempotent. */
    fun sync() {
        if (Build.VERSION.SDK_INT < 33) return
        val want = isActive()
        if (want && predictive == null) predictive = Predictive(activity, onBack).also { it.register() }
        if (!want) { predictive?.unregister(); predictive = null }
    }

    fun uninstall() {
        predictive?.unregister(); predictive = null
        val w = installed ?: return
        if (window.callback === w) window.callback = (w as KeyWrapper).base // otherwise someone wrapped us: we stay as a pass-through
        installed = null
    }

    private inner class KeyWrapper(val base: Window.Callback) : Window.Callback by base {
        override fun dispatchTouchEvent(event: MotionEvent): Boolean {
            if (installed != null) runCatching { observe?.invoke(event) }
            return base.dispatchTouchEvent(event)
        }

        override fun dispatchKeyEvent(event: KeyEvent): Boolean {
            if (installed != null) runCatching { observe?.invoke(event) }
            if (event.keyCode == KeyEvent.KEYCODE_BACK && installed != null && isActive()) {
                // Swallow the whole press so the activity's own onBackPressed never runs; act once, on release.
                if (event.action == KeyEvent.ACTION_UP && !event.isCanceled) onBack()
                return true
            }
            return base.dispatchKeyEvent(event)
        }
    }

    @android.annotation.TargetApi(33)
    private class Predictive(private val activity: Activity, onBack: () -> Unit) {
        private val callback = OnBackInvokedCallback { onBack() }
        fun register() = activity.onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, callback)
        fun unregister() = activity.onBackInvokedDispatcher.unregisterOnBackInvokedCallback(callback)
    }
}
