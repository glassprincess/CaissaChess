package com.fisher.chess

import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.BufferedWriter
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.util.concurrent.Executors
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit

/** Один процесс Stockfish, запросы строго по очереди. */
class StockfishProcess(private val binaryPath: String) {

    data class Line(val multipv: Int, val depth: Int, val type: String, val value: Int, val pv: List<String>)

    data class Result(val bestmove: String, val lines: List<Line>) {
        fun toJson(id: String): JSONObject {
            val o = JSONObject()
            o.put("ok", true)
            o.put("id", id)
            o.put("bestmove", bestmove)
            val arr = JSONArray()
            for (l in lines) {
                val lo = JSONObject()
                lo.put("multipv", l.multipv)
                lo.put("depth", l.depth)
                lo.put("score", JSONObject().put("type", l.type).put("value", l.value))
                lo.put("pv", JSONArray(l.pv))
                arr.put(lo)
            }
            o.put("lines", arr)
            return o
        }
    }

    private val executor = Executors.newSingleThreadExecutor()
    private val writeLock = Any()
    @Volatile private var process: Process? = null
    @Volatile private var writer: BufferedWriter? = null
    @Volatile private var closed = false
    private var output = LinkedBlockingQueue<String>()
    private var eloMin = 1320
    private var eloMax = 3190

    fun search(fen: String, multipv: Int, depth: Int, movetime: Int, skill: Int, callback: (Result?) -> Unit) {
        search(fen, multipv, depth, movetime, skill, null, callback)
    }

    fun search(fen: String, multipv: Int, depth: Int, movetime: Int, skill: Int, elo: Int?, callback: (Result?) -> Unit) {
        executor.execute {
            val res = try {
                runSearch(fen, multipv, depth, movetime, skill, elo)
            } catch (e: Exception) {
                process?.destroy()
                process = null
                writer = null
                null
            }
            callback(res)
        }
    }

    fun stop() {
        try { send("stop") } catch (e: Exception) {}
    }

    fun shutdown() {
        closed = true
        try { send("quit") } catch (e: Exception) {}
        try { process?.destroy() } catch (e: Exception) {}
        executor.shutdownNow()
    }

    @Synchronized
    private fun ensureStarted() {
        check(!closed) { "engine closed" }
        val p = process
        if (p != null) {
            try { p.exitValue() } catch (e: IllegalThreadStateException) { return }
        }
        val np = ProcessBuilder(binaryPath).redirectErrorStream(true).start()
        process = np
        val lines = LinkedBlockingQueue<String>()
        output = lines
        Thread({
            try {
                BufferedReader(InputStreamReader(np.inputStream)).use { reader ->
                    while (true) lines.put(reader.readLine() ?: break)
                }
            } catch (e: Exception) {
                // Closing the process also closes stdout.
            } finally {
                lines.offer("\u0000")
            }
        }, "stockfish-output").apply { isDaemon = true; start() }
        writer = BufferedWriter(OutputStreamWriter(np.outputStream))
        send("uci")
        waitFor("uciok", 15000)
        send("setoption name Threads value 2")
        send("setoption name Hash value 64")
        send("isready")
        waitFor("readyok", 15000)
    }

    private fun waitFor(token: String, timeoutMs: Long) {
        val deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs)
        while (true) {
            val line = readLine(deadline)
            if (line.startsWith("option name UCI_Elo ")) {
                val range = Regex(" min (\\d+) max (\\d+)").find(line)
                if (range != null) {
                    eloMin = range.groupValues[1].toInt()
                    eloMax = range.groupValues[2].toInt().coerceAtLeast(eloMin)
                }
            }
            if (line.trim() == token) return
        }
    }

    private fun readLine(deadline: Long): String {
        val remaining = deadline - System.nanoTime()
        if (remaining <= 0) throw IllegalStateException("engine timeout")
        val line = output.poll(remaining, TimeUnit.NANOSECONDS)
            ?: throw IllegalStateException("engine timeout")
        check(line != "\u0000") { "engine closed" }
        return line
    }

    private fun send(cmd: String) {
        synchronized(writeLock) {
            writer?.write(cmd)
            writer?.write("\n")
            writer?.flush()
        }
    }

    private fun runSearch(fen: String, multipv: Int, depth: Int, movetime: Int, skill: Int, elo: Int?): Result {
        ensureStarted()
        send("setoption name UCI_LimitStrength value ${elo != null}")
        if (elo != null) send("setoption name UCI_Elo value ${elo.coerceIn(eloMin, eloMax)}")
        if (skill >= 0) send("setoption name Skill Level value $skill")
        else send("setoption name Skill Level value 20")
        send("setoption name MultiPV value ${multipv.coerceAtLeast(1)}")
        send("position fen $fen")
        val go = when {
            depth > 0 && movetime > 0 -> "go depth $depth movetime $movetime"
            depth > 0 -> "go depth $depth"
            movetime > 0 -> "go movetime $movetime"
            else -> "go depth 12"
        }
        send(go)

        val lines = LinkedHashMap<Int, Line>()
        var best = ""
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(170)
        while (true) {
            val raw = readLine(deadline)
            if (raw.startsWith("bestmove")) {
                best = raw.split(" ").getOrNull(1) ?: ""
                break
            }
            if (raw.startsWith("info") && raw.contains(" pv ")) {
                val line = parseInfo(raw)
                if (line != null) lines[line.multipv] = line
            }
        }
        return Result(best, lines.values.sortedBy { it.multipv })
    }

    private fun parseInfo(raw: String): Line? {
        val t = raw.split(Regex("\\s+"))
        var multipv = 1
        var depth = 0
        var type = "cp"
        var value = 0
        var pvAt = -1
        for (i in t.indices) {
            when (t[i]) {
                "depth" -> depth = t.getOrNull(i + 1)?.toIntOrNull() ?: depth
                "multipv" -> multipv = t.getOrNull(i + 1)?.toIntOrNull() ?: multipv
                "score" -> {
                    type = t.getOrNull(i + 1) ?: "cp"
                    value = t.getOrNull(i + 2)?.toIntOrNull() ?: 0
                }
                "pv" -> pvAt = i + 1
            }
        }
        if (pvAt < 0 || pvAt >= t.size) return null
        return Line(multipv, depth, type, value, t.subList(pvAt, t.size).toList())
    }
}
