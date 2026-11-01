package expo.modules.mizanepinnedwss

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import okhttp3.ConnectionSpec
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import java.util.concurrent.TimeUnit

/**
 * MIZANE Mobile Scanner — pinned WSS transport (Android).
 *
 * Presents a tiny JS surface (`connect` / `send` / `close` + four events) and
 * enforces, in native code:
 *  - `wss://` only (no cleartext WebSocket),
 *  - exact SHA-256 certificate fingerprint pinning on the leaf certificate,
 *  - TLS 1.2+ via OkHttp's RESTRICTED_TLS connection spec,
 *  - no automatic reconnection inside the socket (the JS transport controls
 *    reconnection so the pin and backoff policy stay in one place).
 */
class MizanePinnedWssModule : Module() {

  private var webSocket: WebSocket? = null
  private var client: OkHttpClient? = null

  override fun definition() = ModuleDefinition {
    Name("MizanePinnedWss")

    Events("onOpen", "onMessage", "onClosed", "onError")

    OnDestroy {
      closeInternal()
    }

    AsyncFunction("connect") { url: String, fingerprint: String, timeoutMs: Int, promise: Promise ->
      if (!url.startsWith("wss://")) {
        promise.reject("ERR_INSECURE_URL", "Only wss:// endpoints are supported", null)
        return@AsyncFunction
      }

      val pinned = fingerprint.lowercase()
      if (!FINGERPRINT_PATTERN.matches(pinned)) {
        promise.reject("ERR_FINGERPRINT", "Invalid pinned certificate fingerprint", null)
        return@AsyncFunction
      }

      closeInternal()

      val okHttp = OkHttpClient.Builder()
        .connectTimeout(timeoutMs.coerceAtLeast(1000).toLong(), TimeUnit.MILLISECONDS)
        // The gateway holds the socket open indefinitely; rely on ping frames.
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .pingInterval(20, TimeUnit.SECONDS)
        .retryOnConnectionFailure(false)
        .connectionSpecs(listOf(ConnectionSpec.RESTRICTED_TLS))
        .sslSocketFactory(PinnedTls.createSocketFactory(pinned), PinnedTls.createTrustManager(pinned))
        // Peer identity is established by the exact certificate pin above, so
        // hostname matching is intentionally bypassed (the desktop certificate
        // has no SAN). This does not weaken authentication: it is pinned.
        .hostnameVerifier { _, _ -> true }
        .build()

      client = okHttp

      val request = Request.Builder().url(url).build()
      val settled = java.util.concurrent.atomic.AtomicBoolean(false)

      val listener = object : WebSocketListener() {
        override fun onOpen(ws: WebSocket, response: Response) {
          webSocket = ws
          if (settled.compareAndSet(false, true)) promise.resolve(null)
          sendEvent("onOpen", mapOf("url" to url))
        }

        override fun onMessage(ws: WebSocket, text: String) {
          sendEvent("onMessage", mapOf("data" to text))
        }

        override fun onMessage(ws: WebSocket, bytes: ByteString) {
          sendEvent("onMessage", mapOf("data" to bytes.utf8()))
        }

        override fun onClosing(ws: WebSocket, code: Int, reason: String) {
          ws.close(code, reason)
        }

        override fun onClosed(ws: WebSocket, code: Int, reason: String) {
          if (settled.compareAndSet(false, true)) {
            promise.reject("ERR_CONNECT", "Connection closed before it opened (code $code)", null)
          }
          sendEvent("onClosed", mapOf("code" to code, "reason" to reason))
        }

        override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
          val message = t.message ?: "Connection failed"
          if (settled.compareAndSet(false, true)) {
            promise.reject("ERR_CONNECT", message, t)
          }
          sendEvent("onError", mapOf("message" to message))
          sendEvent("onClosed", mapOf("code" to 1006, "reason" to message))
        }
      }

      webSocket = okHttp.newWebSocket(request, listener)
    }

    AsyncFunction("send") { data: String, promise: Promise ->
      val ws = webSocket
      if (ws == null) {
        promise.reject("ERR_NOT_CONNECTED", "No active gateway connection", null)
        return@AsyncFunction
      }
      val queued = try {
        ws.send(data)
      } catch (e: Exception) {
        false
      }
      if (queued) promise.resolve(null)
      else promise.reject("ERR_SEND", "Failed to send frame to the gateway", null)
    }

    AsyncFunction("close") { code: Int, reason: String, promise: Promise ->
      webSocket?.close(code, reason)
      webSocket = null
      promise.resolve(null)
    }
  }

  private fun closeInternal() {
    try {
      webSocket?.close(1000, "Client closing")
    } catch (_: Exception) {
      // ignore
    }
    webSocket = null
    client = null
  }

  private companion object {
    val FINGERPRINT_PATTERN = Regex("^[0-9a-f]{64}$")
  }
}
