package com.fisher.chess

import android.app.Activity
import android.content.Intent
import android.webkit.WebView
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.nio.charset.Charset
import kotlin.concurrent.thread

class PgnFiles(private val activity: Activity, private val webView: WebView) {

    private var pendingSave: String? = null
    @Volatile var language: String = "ru"

    private class FileError(message: String) : Exception(message)

    private fun message(russian: String, english: String): String =
        if (language == "en") english else russian

    fun pick() {
        val i = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/x-chess-pgn", "text/plain", "application/octet-stream"))
        }
        try {
            activity.startActivityForResult(i, REQ_PICK)
        } catch (e: Exception) {
            eval("window.Files.onError(" + JSONObject.quote(message("Не удалось открыть выбор PGN", "Could not open the PGN file picker")) + ")")
        }
    }

    fun save(name: String, text: String) {
        pendingSave = text
        val i = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "application/x-chess-pgn"
            putExtra(Intent.EXTRA_TITLE, name)
        }
        try {
            activity.startActivityForResult(i, REQ_SAVE)
        } catch (e: Exception) {
            pendingSave = null
            eval("window.Files.onSaved(false," + JSONObject.quote(message("Не удалось открыть сохранение PGN", "Could not open the PGN save dialog")) + ")")
        }
    }

    fun onResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == REQ_PICK) {
            if (resultCode != Activity.RESULT_OK) return
            val uri = data?.data ?: return
            thread(name = "pgn-import") {
                try {
                    val bytes = activity.contentResolver.openInputStream(uri)?.use { input ->
                        val out = ByteArrayOutputStream()
                        val buf = ByteArray(8192)
                        while (true) {
                            val n = input.read(buf)
                            if (n < 0) break
                            if (out.size() + n > 8 * 1024 * 1024) throw FileError(message("PGN больше 8 МБ", "PGN exceeds 8 MB"))
                            out.write(buf, 0, n)
                        }
                        out.toByteArray()
                    } ?: throw FileError(message("Не удалось открыть PGN", "Could not open PGN"))
                    val text = decode(bytes)
                    val name = uri.lastPathSegment ?: "file.pgn"
                    eval("window.Files.onPgn(" + JSONObject.quote(text) + "," + JSONObject.quote(name) + ")")
                } catch (e: Exception) {
                    val error = if (e is FileError) e.message else message("Не удалось прочитать PGN", "Could not read PGN")
                    eval("window.Files.onError(" + JSONObject.quote(error) + ")")
                }
            }
        } else if (requestCode == REQ_SAVE) {
            val text = pendingSave
            pendingSave = null
            if (resultCode != Activity.RESULT_OK) return
            var ok = false
            val uri = data?.data
            if (resultCode == Activity.RESULT_OK && uri != null && text != null) {
                try {
                    val output = activity.contentResolver.openOutputStream(uri, "wt")
                        ?: throw FileError(message("Не удалось открыть файл для записи", "Could not open file for writing"))
                    output.use {
                        it.write(text.toByteArray(Charsets.UTF_8))
                    }
                    ok = true
                } catch (e: Exception) {
                    ok = false
                }
            }
            eval("window.Files.onSaved(" + ok + "," +
                JSONObject.quote(if (ok) "" else message("Не удалось сохранить", "Could not save PGN")) + ")")
        }
    }

    private fun decode(bytes: ByteArray): String {
        if (bytes.size >= 2 && bytes[0] == 0xFF.toByte() && bytes[1] == 0xFE.toByte())
            return String(bytes, 2, bytes.size - 2, Charsets.UTF_16LE)
        if (bytes.size >= 2 && bytes[0] == 0xFE.toByte() && bytes[1] == 0xFF.toByte())
            return String(bytes, 2, bytes.size - 2, Charsets.UTF_16BE)
        return try {
            Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes)).toString().removePrefix("\uFEFF")
        } catch (e: java.nio.charset.CharacterCodingException) {
            String(bytes, Charset.forName("windows-1251"))
        }
    }

    private fun eval(js: String) {
        webView.post { webView.evaluateJavascript(js, null) }
    }

    companion object {
        const val REQ_PICK = 41
        const val REQ_SAVE = 42
    }
}
