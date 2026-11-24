package com.fisher.chess

import android.os.Handler
import android.os.Looper
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.content.Context
import android.webkit.WebView
import org.json.JSONObject

class EngineBridge(
    private val webView: WebView,
    private val engine: StockfishProcess,
    private val files: PgnFiles
) {
    private val main = Handler(Looper.getMainLooper())

    @android.webkit.JavascriptInterface
    fun request(json: String) {
        val o = try { JSONObject(json) } catch (e: Exception) { return }
        val id = o.optString("id")
        val fen = o.optString("fen", START_FEN)
        val multipv = o.optInt("multipv", 1)
        val depth = o.optInt("depth", 0)
        val movetime = o.optInt("movetime", 0)
        val skill = o.optInt("skill", -1)
        val elo = if (o.has("elo") && !o.isNull("elo")) o.optInt("elo", 0).takeIf { it > 0 } else null
        engine.search(fen, multipv, depth, movetime, skill, elo) { result ->
            val payload = if (result != null) {
                result.toJson(id)
            } else {
                JSONObject().apply {
                    put("ok", false)
                    put("id", id)
                    put("error", "Движок не ответил")
                }
            }
            main.post {
                val js = "window.Engine.onResult(" + JSONObject.quote(id) + "," +
                    JSONObject.quote(payload.toString()) + ")"
                webView.evaluateJavascript(js, null)
            }
        }
    }

    @android.webkit.JavascriptInterface
    fun stop() {
        engine.stop()
    }

    @android.webkit.JavascriptInterface
    @Suppress("DEPRECATION")
    fun vibrate(event: String) {
        val pattern = when (event) {
            "check" -> longArrayOf(0, 90)
            "mate" -> longArrayOf(0, 90, 110, 90)
            else -> return
        }
        main.post {
            val vibrator = webView.context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            if (vibrator?.hasVibrator() == true) {
                if (Build.VERSION.SDK_INT >= 26) {
                    vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1))
                } else {
                    vibrator.vibrate(pattern, -1)
                }
            }
        }
    }

    @android.webkit.JavascriptInterface
    fun setLanguage(language: String) {
        files.language = if (language == "en") "en" else "ru"
    }

    @android.webkit.JavascriptInterface
    fun pickPgn() {
        main.post { files.pick() }
    }

    @android.webkit.JavascriptInterface
    fun savePgn(name: String, text: String) {
        main.post { files.save(name, text) }
    }

    fun shutdown() {
        engine.shutdown()
    }

    companion object {
        const val START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    }
}
