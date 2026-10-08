package com.tahticihan.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.ViewGroup
import android.view.View
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private val origin: String get() = BuildConfig.WEB_ORIGIN
    private val notifyPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.parseColor("#0c0a08")
        window.navigationBarColor = Color.parseColor("#0c0a08")

        if (origin.isBlank() || !origin.startsWith("https://")) {
            val gate = TextView(this)
            gate.setBackgroundColor(Color.parseColor("#0c0a08"))
            gate.setTextColor(Color.parseColor("#e8dcc4"))
            gate.textSize = 16f
            gate.setPadding(48, 48, 48, 48)
            gate.text = "Saltanat kapısı henüz bağlanmadı. Yayıncı gradle.properties içine taht.web.origin=https://… yazmalıdır."
            setContentView(gate)
            return
        }

        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            notifyPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        webView = WebView(this)
        webView.setBackgroundColor(Color.parseColor("#0c0a08"))
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.mediaPlaybackRequiresUserGesture = false
        webView.settings.cacheMode = WebSettings.LOAD_DEFAULT
        webView.settings.textZoom = 100
        webView.settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        webView.settings.allowFileAccess = false
        webView.settings.allowContentAccess = false
        webView.overScrollMode = View.OVER_SCROLL_NEVER
        webView.settings.userAgentString = webView.settings.userAgentString + " TahtiCihanNative/1.0"
        val cookies = CookieManager.getInstance()
        cookies.setAcceptCookie(true)
        cookies.setAcceptThirdPartyCookies(webView, true)
        BillingBridge.install(webView, this)
        PushBridge.install(webView, this)
        webView.webChromeClient = WebChromeClient()
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                if (url.host == Uri.parse(origin).host) return false
                startActivity(Intent(Intent.ACTION_VIEW, url))
                return true
            }

            override fun onPageFinished(view: WebView, url: String?) {
                BillingBridge.inject(view)
                PushBridge.inject(view)
            }
        }

        val root = FrameLayout(this)
        root.setBackgroundColor(Color.parseColor("#0c0a08"))
        root.addView(webView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else moveTaskToBack(true)
            }
        })

        webView.loadUrl(mapDeepLink(intent) ?: origin)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (!::webView.isInitialized) return
        mapDeepLink(intent)?.let { webView.loadUrl(it) }
    }

    private fun mapDeepLink(intent: Intent?): String? {
        val data = intent?.data ?: return null
        if (data.scheme == "https" && data.host == Uri.parse(origin).host) return data.toString()
        if (data.scheme == "tahticihan") {
            val path = listOfNotNull(data.host, data.path?.trim('/')).filter { it.isNotBlank() }.joinToString("/")
            val q = data.encodedQuery?.let { "?$it" } ?: ""
            val suffix = if (path.isBlank()) "/oyun$q" else "/$path$q"
            return origin.trimEnd('/') + suffix
        }
        return null
    }
}