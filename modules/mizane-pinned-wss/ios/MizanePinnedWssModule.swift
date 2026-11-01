import ExpoModulesCore
import CryptoKit
import Foundation

/**
 * MIZANE Mobile Scanner — pinned WSS transport (iOS).
 *
 * Security contract enforced in native code:
 *  - Only `wss://` endpoints are accepted (no cleartext WebSocket).
 *  - The desktop leaf certificate is verified by an EXACT, constant-time
 *    SHA-256 fingerprint comparison against the pin delivered in the pairing QR
 *    code.
 *  - Standard trust evaluation / hostname matching is intentionally replaced by
 *    that pin because the Phase 1 desktop certificate is self-signed and (as
 *    generated today) has no Subject Alternative Name matching the LAN IP.
 *    Peer identity is therefore authenticated by a 256-bit certificate digest,
 *    which is stronger than CA validation for a self-signed certificate.
 *  - Reconnection (and the pin) is owned by the JS transport, not by this
 *    module, so the pinned fingerprint is re-applied on every reconnect.
 */
public class MizanePinnedWssModule: Module {
  private let controller = PinnedSocketController()

  public func definition() -> ModuleDefinition {
    Name("MizanePinnedWss")

    Events("onOpen", "onMessage", "onClosed", "onError")

    OnDestroy {
      self.controller.closeInternal()
    }

    AsyncFunction("connect") { (url: String, fingerprint: String, timeoutMs: Int, promise: Promise) in
      guard url.lowercased().hasPrefix("wss://") else {
        promise.reject("ERR_INSECURE_URL", "Only wss:// endpoints are supported")
        return
      }
      let pinned = fingerprint.lowercased()
      guard pinned.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil else {
        promise.reject("ERR_FINGERPRINT", "Invalid pinned certificate fingerprint")
        return
      }
      guard let parsedUrl = URL(string: url) else {
        promise.reject("ERR_URL", "Malformed gateway URL")
        return
      }

      self.controller.connect(
        url: parsedUrl,
        fingerprint: pinned,
        timeoutMs: timeoutMs,
        onOpen: { [weak self] in
          promise.resolve(nil)
          self?.sendEvent("onOpen", ["url": url])
        },
        onMessage: { [weak self] data in
          self?.sendEvent("onMessage", ["data": data])
        },
        onClosed: { [weak self] code, reason in
          self?.sendEvent("onClosed", ["code": code, "reason": reason])
        },
        onError: { [weak self] message in
          self?.sendEvent("onError", ["message": message])
        },
        onFailure: { message in
          promise.reject("ERR_CONNECT", message)
        }
      )
    }

    AsyncFunction("send") { (data: String, promise: Promise) in
      self.controller.send(data) { error in
        if let error = error {
          promise.reject("ERR_SEND", error)
        } else {
          promise.resolve(nil)
        }
      }
    }

    AsyncFunction("close") { (code: Int, reason: String, promise: Promise) in
      self.controller.close(code: code, reason: reason)
      promise.resolve(nil)
    }
  }
}

/**
 * Owns the URLSession + URLSessionWebSocketTask. It is both the session delegate
 * (server-trust challenge = certificate pinning) and the web socket delegate
 * (open/close callbacks), because URLSession delivers both to the same object.
 */
final class PinnedSocketController: NSObject, URLSessionWebSocketDelegate {
  private var session: URLSession?
  private var task: URLSessionWebSocketTask?
  private var timeoutWorkItem: DispatchWorkItem?
  private var pinnedFingerprint = ""

  private var settled = false

  private var onOpen: (() -> Void)?
  private var onMessage: ((String) -> Void)?
  private var onClosed: ((Int, String) -> Void)?
  private var onError: ((String) -> Void)?
  private var onFailure: ((String) -> Void)?

  private let stateQueue = DispatchQueue(label: "com.mizane.pinnedwss.state")

  func connect(
    url: URL,
    fingerprint: String,
    timeoutMs: Int,
    onOpen: @escaping () -> Void,
    onMessage: @escaping (String) -> Void,
    onClosed: @escaping (Int, String) -> Void,
    onError: @escaping (String) -> Void,
    onFailure: @escaping (String) -> Void
  ) {
    closeInternal()

    stateQueue.sync {
      settled = false
      pinnedFingerprint = fingerprint
      self.onOpen = onOpen
      self.onMessage = onMessage
      self.onClosed = onClosed
      self.onError = onError
      self.onFailure = onFailure
    }

    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = TimeInterval(timeoutMs) / 1000.0
    configuration.waitsForConnectivity = false
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData

    let session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
    self.session = session

    var request = URLRequest(url: url)
    request.timeoutInterval = TimeInterval(timeoutMs) / 1000.0

    let task = session.webSocketTask(with: request)
    self.task = task

    let timeout = DispatchWorkItem { [weak self] in
      self?.failOnce("Timed out while connecting to the gateway")
    }
    timeoutWorkItem = timeout
    DispatchQueue.global().asyncAfter(deadline: .now() + TimeInterval(timeoutMs) / 1000.0, execute: timeout)

    task.resume()
    receiveNext()
  }

  func send(_ text: String, completion: @escaping (String?) -> Void) {
    guard let task = task else {
      completion("No active gateway connection")
      return
    }
    task.send(.string(text)) { error in
      completion(error?.localizedDescription)
    }
  }

  func close(code: Int, reason: String) {
    let closeCode = URLSessionWebSocketTask.CloseCode(rawValue: code) ?? .normalClosure
    task?.cancel(with: closeCode, reason: reason.data(using: .utf8))
    closeInternal()
  }

  func closeInternal() {
    timeoutWorkItem?.cancel()
    timeoutWorkItem = nil
    task?.cancel(with: .goingAway, reason: nil)
    task = nil
    session?.invalidateAndCancel()
    session = nil
  }

  private func receiveNext() {
    task?.receive { [weak self] result in
      guard let self = self else { return }
      switch result {
      case .success(let message):
        switch message {
        case .string(let text): self.onMessage?(text)
        case .data(let data): self.onMessage?(String(data: data, encoding: .utf8) ?? "")
        @unknown default: break
        }
        self.receiveNext()
      case .failure(let error):
        // A cancel() during closeInternal also lands here; only report failures
        // that happen before the socket was ever opened.
        self.failOnce(error.localizedDescription)
      }
    }
  }

  /// Reports a connection failure exactly once (before the socket opened).
  private func failOnce(_ message: String) {
    var shouldReport = false
    stateQueue.sync {
      if !settled {
        settled = true
        shouldReport = true
      }
    }
    guard shouldReport else { return }
    onFailure?(message)
  }

  // MARK: - URLSessionWebSocketDelegate

  func urlSession(
    _ session: URLSession,
    webSocketTask: URLSessionWebSocketTask,
    didOpenWithProtocol protocol: String?
  ) {
    timeoutWorkItem?.cancel()
    timeoutWorkItem = nil
    var shouldReport = false
    stateQueue.sync {
      if !settled {
        settled = true
        shouldReport = true
      }
    }
    if shouldReport {
      onOpen?()
    }
  }

  func urlSession(
    _ session: URLSession,
    webSocketTask: URLSessionWebSocketTask,
    didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
    reason: Data?
  ) {
    let text = reason.flatMap { String(data: $0, encoding: .utf8) } ?? ""
    // If the socket never opened, surface it as a connection failure first.
    failOnce("Gateway connection closed before it opened")
    onClosed?(closeCode.rawValue, text)
  }

  // MARK: - URLSessionDelegate (certificate pinning)

  func urlSession(
    _ session: URLSession,
    didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
          let serverTrust = challenge.protectionSpace.serverTrust,
          let certificate = SecTrustGetCertificateAtIndex(serverTrust, 0) else {
      completionHandler(.cancelAuthenticationChallenge, nil)
      return
    }

    let certificateData = SecCertificateCopyData(certificate) as Data
    let digest = SHA256.hash(data: certificateData)
    let actual = digest.map { String(format: "%02x", $0) }.joined()

    let expectedBytes = Array(pinnedFingerprint.utf8)
    let actualBytes = Array(actual.utf8)
    guard expectedBytes.count == actualBytes.count else {
      completionHandler(.cancelAuthenticationChallenge, nil)
      return
    }
    var difference: UInt8 = 0
    for index in 0..<expectedBytes.count {
      difference |= expectedBytes[index] ^ actualBytes[index]
    }
    guard difference == 0 else {
      completionHandler(.cancelAuthenticationChallenge, nil)
      return
    }

    completionHandler(.useCredential, URLCredential(trust: serverTrust))
  }
}
