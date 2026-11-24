package com.fisher.chess

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Build
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.window.OnBackInvokedDispatcher
import android.widget.FrameLayout
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import java.io.File
import java.io.IOException

class MainActivity : Activity() {

    private lateinit var webView: WebView
    private lateinit var bridge: EngineBridge
    private lateinit var pgnFiles: PgnFiles

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        webView = WebView(this)
        webView.setBackgroundColor(0xFF262421.toInt())
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mediaPlaybackRequiresUserGesture = true
            cacheMode = WebSettings.LOAD_DEFAULT
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                return assetResponse(request.url)
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                if (url.host == "appassets.androidplatform.net") return false
                try { startActivity(Intent(Intent.ACTION_VIEW, url)) } catch (e: Exception) {}
                return true
            }
        }
        webView.webChromeClient = WebChromeClient()

        val container = FrameLayout(this)
        container.setBackgroundColor(0xFF262421.toInt())
        container.addView(webView, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT
        ))
        if (Build.VERSION.SDK_INT >= 30) {
            window.setDecorFitsSystemWindows(false)
            container.setOnApplyWindowInsetsListener { view, insets ->
                val safe = insets.getInsets(WindowInsets.Type.systemBars() or
                    WindowInsets.Type.displayCutout() or WindowInsets.Type.ime())
                // Shrink the CSS viewport, including fixed controls and dialogs.
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom)
                WindowInsets.CONSUMED
            }
        } else {
            // Legacy decor fits the bars/cutout and adjustResize handles the keyboard.
            container.fitsSystemWindows = true
        }

        val binary = File(applicationInfo.nativeLibraryDir, "libstockfish.so").absolutePath
        val engine = StockfishProcess(binary)
        pgnFiles = PgnFiles(this, webView)
        bridge = EngineBridge(webView, engine, pgnFiles)
        webView.addJavascriptInterface(bridge, "AndroidEngine")

        setContentView(container)
        container.post {
            if (Build.VERSION.SDK_INT >= 30) {
                window.insetsController?.setSystemBarsAppearance(0,
                    WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or
                        WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS)
            }
            container.requestApplyInsets()
        }
        if (Build.VERSION.SDK_INT >= 33) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) {
                handleBack()
            }
        }
        webView.loadUrl("https://appassets.androidplatform.net/assets/web/index.html")
    }

    override fun onDestroy() {
        bridge.shutdown()
        webView.destroy()
        super.onDestroy()
    }

    @Deprecated("Uses the platform back callback for API 24 compatibility")
    override fun onBackPressed() {
        handleBack()
    }

    private fun handleBack() {
        webView.evaluateJavascript("!!(window.FisherBack && window.FisherBack())") { handled ->
            if (handled != "true") finish()
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        pgnFiles.onResult(requestCode, resultCode, data)
    }

    private fun assetResponse(url: Uri): WebResourceResponse? {
        if (url.host != "appassets.androidplatform.net") return null
        val path = url.path?.trimStart('/') ?: return null
        if (!path.startsWith("assets/web/")) return null
        val rel = path.removePrefix("assets/web/")
        if (rel.contains("..")) return null
        return try {
            WebResourceResponse(mimeOf(rel), charsetOf(rel), assets.open("web/$rel"))
        } catch (e: IOException) {
            null
        }
    }

    private fun mimeOf(path: String): String = when {
        path.endsWith(".html") -> "text/html"
        path.endsWith(".css") -> "text/css"
        path.endsWith(".js") -> "application/javascript"
        path.endsWith(".json") -> "application/json"
        path.endsWith(".svg") -> "image/svg+xml"
        path.endsWith(".png") -> "image/png"
        path.endsWith(".mp3") -> "audio/mpeg"
        path.endsWith(".webm") -> "audio/webm"
        path.endsWith(".txt") -> "text/plain"
        else -> "application/octet-stream"
    }

    private fun charsetOf(path: String): String? =
        if (path.endsWith(".html") || path.endsWith(".css") || path.endsWith(".js") ||
            path.endsWith(".json") || path.endsWith(".svg") || path.endsWith(".txt")
        ) "UTF-8" else null
}
