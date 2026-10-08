package com.tahticihan.app

import android.app.Activity
import android.webkit.JavascriptInterface
import android.webkit.WebView
import java.lang.reflect.Proxy

/**
 * FCM token via reflection. Compiles without google-services.json.
 * When Hasan adds Firebase Messaging, getToken works; otherwise JS gets null.
 */
class PushBridge(
    private val activity: Activity,
    private val webView: WebView,
) {
    @JavascriptInterface
    fun requestPush() {
        fetchToken { token ->
            val js = if (token.isNullOrBlank()) "null" else "'${token.replace("'", "")}'"
            eval("window.__tahtPushToken = $js; window.__tahtPushResolve && window.__tahtPushResolve($js)")
        }
    }

    @JavascriptInterface
    fun getPushToken() {
        requestPush()
    }

    private fun fetchToken(done: (String?) -> Unit) {
        try {
            val fmClass = Class.forName("com.google.firebase.messaging.FirebaseMessaging")
            val instance = fmClass.getMethod("getInstance").invoke(null)
            val task = fmClass.getMethod("getToken").invoke(instance)
            val taskClass = Class.forName("com.google.android.gms.tasks.Task")
            val listenerClass = Class.forName("com.google.android.gms.tasks.OnCompleteListener")
            val listener = Proxy.newProxyInstance(listenerClass.classLoader, arrayOf(listenerClass)) { _, _, args ->
                val t = args[0]
                val ok = taskClass.getMethod("isSuccessful").invoke(t) as Boolean
                val token = if (ok) taskClass.getMethod("getResult").invoke(t) as? String else null
                activity.runOnUiThread { done(token) }
                null
            }
            taskClass.getMethod("addOnCompleteListener", listenerClass).invoke(task, listener)
        } catch (_: Throwable) {
            activity.runOnUiThread { done(null) }
        }
    }

    private fun eval(js: String) {
        webView.post { webView.evaluateJavascript(js, null) }
    }

    companion object {
        const val BRIDGE_JS = """
                window.TahtNative = Object.assign(window.TahtNative || {}, {
                  platform: "android",
                  getPushToken: () => new Promise((resolve) => {
                    window.__tahtPushResolve = resolve;
                    window.TahtPushNative.getPushToken();
                  }),
                  requestPush: () => new Promise((resolve) => {
                    window.__tahtPushResolve = resolve;
                    window.TahtPushNative.requestPush();
                  })
                });
                """

        fun install(webView: WebView, activity: Activity): PushBridge {
            val bridge = PushBridge(activity, webView)
            webView.addJavascriptInterface(bridge, "TahtPushNative")
            inject(webView)
            return bridge
        }

        fun inject(webView: WebView) {
            webView.evaluateJavascript(BRIDGE_JS.trimIndent(), null)
        }
    }
}
