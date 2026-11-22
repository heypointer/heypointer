package com.heypointer.android

import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/** Asks the HeyPointer server for a walkthrough. Network work runs off the main thread; callbacks run on it. */
internal class HeyPointerClient(baseUrl: String, private val clientId: String, private val headers: (() -> Map<String, String>)? = null) {
    private val endpoint = baseUrl.trimEnd('/') + "/api/walkthrough"
    private val io = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())

    fun ask(goal: String, screen: String, done: (Result<Walkthrough>) -> Unit) {
        io.execute {
            val result = runCatching { fetch(goal, screen) }
            main.post { done(result) }
        }
    }

    private fun fetch(goal: String, screen: String): Walkthrough {
        ClientId.localProblem(clientId)?.let { throw HeyPointerException(it) }
        val body = JSONObject().put("goal", goal).put("context", JSONObject().put("url", screen)).toString()
        val conn = (URL(endpoint).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 8_000
            readTimeout = 20_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
            if (clientId.isNotBlank()) setRequestProperty(ClientId.HEADER, clientId.trim())
            // The app's own auth (e.g. a JWT for its backend proxy). Runs on this worker thread, so it may block.
            headers?.invoke()?.forEach { (name, value) ->
                if (name.lowercase() !in RESERVED_HEADERS) setRequestProperty(name, value)
            }
        }
        try {
            conn.outputStream.use { it.write(body.toByteArray()) }
            val code = conn.responseCode
            val text = (if (code in 200..299) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (code !in 200..299) {
                ClientId.failure(code, text).let { throw HeyPointerException(it.key, *it.args.toTypedArray()) }
            }
            return WalkthroughParser.parse(text)
        } catch (e: IOException) {
            throw HeyPointerException(Str.CANNOT_REACH, URL(endpoint).host)
        } finally {
            conn.disconnect()
        }
    }

    fun shutdown() = io.shutdownNow()

    private companion object {
        val RESERVED_HEADERS = setOf("content-type", "content-length", "host", ClientId.HEADER.lowercase())
    }
}
