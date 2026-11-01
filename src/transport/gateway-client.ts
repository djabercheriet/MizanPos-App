/**
 * MIZANE Mobile Scanner — desktop gateway client (transport layer).
 *
 * Owns the pinned WSS socket and speaks the exact Phase 1 v1 protocol:
 *
 *   connect (TLS pinned to the QR fingerprint)
 *     ← server.hello { requiresPairing: true|false }
 *     → hello | pair.request
 *     … pairing: ← pair.pending → (desktop approval) ← pair.result
 *     … scanning: → scan  ← ack
 *
 * Guarantees enforced here:
 *  - Only `hello`, `pair.request`, `scan` and `ping` are ever sent.
 *  - Scans are NEVER buffered: if the socket is not `connected`, `sendScan`
 *    fails immediately instead of queueing for a later POS cart.
 *  - The pinned fingerprint is re-applied on every reconnection.
 *  - Reconnection uses bounded exponential backoff and never resends scans.
 */

import {
  buildHello,
  buildPairRequest,
  buildPing,
  buildScan,
  decodeIncoming,
  MESSAGE_TYPES,
  PAIR_REASONS,
  validateBarcode,
  type PairResultMessage,
  type ScanOutcome,
  type ScanResultMessage,
  type ServerHelloMessage,
} from '../protocol/scan-protocol';
import { pairingAddress, type PairingPayload } from '../protocol/qr-payload';
import { PinnedSocket, isPinnedTransportAvailable, ERR_NATIVE_UNAVAILABLE } from '../native/pinned-wss';
import { isUsablePairing, randomToken, type StoredPairing } from '../storage/secure';

export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'pairing'
  | 'awaiting_approval'
  | 'authenticating'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'revoked'
  | 'error';

export interface GatewayStatusSnapshot {
  status: ConnectionStatus;
  address: string | null;
  desktopName: string | null;
  lastError: string | null;
  reconnectAttempt: number;
}

export interface ScanResult {
  status: 'acked' | 'duplicate' | 'failed';
  scanId: string | null;
  detail: string | null;
}

/** What the POS did with a scan, as reported by the desktop after processing. */
export interface ScanOutcomeInfo {
  code: string;
  scanId: string | null;
  outcome: ScanOutcome;
  detail: string | null;
}

export interface GatewayClientHandlers {
  onStatusChange?: (snapshot: GatewayStatusSnapshot) => void;
  /** Called on every accepted (non-duplicate) scan acknowledgement. */
  onScanAcknowledged?: (info: { code: string; scanId: string | null }) => void;
  /**
   * Called only when the desktop confirms what the POS actually did with the
   * barcode. An `ack` alone must never be surfaced as a successful add.
   */
  onScanOutcome?: (info: ScanOutcomeInfo) => void;
}

/** Error carrying a stable machine code plus a human message. */
export class GatewayError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'GatewayError';
    this.code = code;
  }
}

const CONNECT_TIMEOUT_MS = 8000;
const SCAN_ACK_TIMEOUT_MS = 8000;
const PAIR_APPROVAL_TIMEOUT_MS = 125_000;
const PING_INTERVAL_MS = 25_000;
const PING_TIMEOUT_MS = 10_000;
const MAX_RECONNECT_ATTEMPTS = 6;
/** How long the POS outcome for an acknowledged scan is still accepted. */
const SCAN_OUTCOME_TTL_MS = 30_000;
/** Upper bound on scans tracked while waiting for their POS outcome. */
const MAX_TRACKED_OUTCOMES = 32;

type Timer = ReturnType<typeof setTimeout>;

interface PendingScan {
  code: string;
  resolve: (result: ScanResult) => void;
  timer: Timer;
}

interface AwaitedOutcome {
  code: string;
  scanId: string | null;
  timer: Timer;
}

export class GatewayClient {
  private socket: PinnedSocket | null = null;
  private handlers: GatewayClientHandlers;

  private status: ConnectionStatus = 'idle';
  private lastError: string | null = null;
  private reconnectAttempt = 0;

  private pairing: StoredPairing | null = null;
  /**
   * The terminal currently being paired with. Kept separately so a pairing
   * attempt never fabricates a `pairing` record with an empty device id — the
   * gateway would reject that with `invalid_device_id`.
   */
  private pairingTarget: { host: string; port: number; fingerprint: string } | null = null;
  private desktopName: string | null = null;
  /** Device id the live socket actually authenticated with (null when none). */
  private authenticatedDeviceId: string | null = null;
  /**
   * Guards against sending `pair.request` twice for one attempt. Both `pair()`
   * and the `server.hello` handler can trigger the send (the desktop greets a
   * fresh socket with `requiresPairing: true`), and the desktop answers a
   * second request with `pairing_busy` — which would fail a valid pairing.
   */
  private pairRequestSent = false;

  private pendingScans = new Map<string, PendingScan>();
  private awaitedOutcomes = new Map<string, AwaitedOutcome>();
  private pingTimer: Timer | null = null;
  private pongTimer: Timer | null = null;
  private reconnectTimer: Timer | null = null;
  private pairApprovalTimer: Timer | null = null;

  private intentionalClose = false;
  private pairingInFlight: {
    resolve: (pairing: StoredPairing) => void;
    reject: (error: GatewayError) => void;
    payload: PairingPayload;
    deviceName: string;
    platform: string;
    replaceDeviceId: string | null;
    credential: string | null;
  } | null = null;

  private authInFlight: {
    resolve: () => void;
    reject: (error: GatewayError) => void;
  } | null = null;

  constructor(handlers: GatewayClientHandlers = {}) {
    this.handlers = handlers;
  }

  /* ---------------------------------------------------------------- *
   * Public API
   * ---------------------------------------------------------------- */

  /** Current status snapshot (for rendering). */
  getSnapshot(): GatewayStatusSnapshot {
    const target = this.pairing ?? this.pairingTarget;
    return {
      status: this.status,
      address: target ? `wss://${target.host}:${target.port}` : null,
      desktopName: this.desktopName,
      lastError: this.lastError,
      reconnectAttempt: this.reconnectAttempt,
    };
  }

  /** True when the pinned native transport is present in this build. */
  static isTransportAvailable(): boolean {
    return isPinnedTransportAvailable();
  }

  /**
   * Pair this phone using a scanned QR payload.
   * Resolves with the issued pairing record (the caller persists it securely).
   */
  async pair(payload: PairingPayload, deviceName: string, platform: string): Promise<StoredPairing> {
    if (!isPinnedTransportAvailable()) {
      throw new GatewayError(
        ERR_NATIVE_UNAVAILABLE,
        'Pairing requires a development build with the pinned transport (Expo Go is not supported).',
      );
    }

    this.intentionalClose = false;
    // A re-pair can start from an ALREADY connected phone (the cashier opens the
    // Pair screen and scans a new QR). Tear the previous socket down first so a
    // stale frame handler or ping loop cannot race the new pairing.
    this.clearReconnectTimer();
    const existing = this.socket;
    this.socket = null;
    this.authenticatedDeviceId = null;
    if (existing) {
      existing.detach();
      void existing.close(1000, 'Re-pairing');
    }
    // Deliberately do NOT fabricate a `pairing` record here. A placeholder with
    // an empty `deviceId` is exactly what the gateway rejects with
    // `invalid_device_id` ("Device id is missing or malformed"). The pending
    // terminal is tracked separately and the phone only ever adopts the
    // desktop-ISSUED device id returned by `pair.result`.
    this.pairingTarget = { host: payload.host, port: payload.port, fingerprint: payload.fingerprint };
    this.desktopName = null;
    this.pairRequestSent = false;

    this.setStatus('connecting');

    const socket = this.createSocket();
    await socket.connect(pairingAddress(payload), payload.fingerprint, CONNECT_TIMEOUT_MS);

    // Socket is open; the desktop has already sent `server.hello`.
    return new Promise<StoredPairing>((resolve, reject) => {
      this.pairingInFlight = {
        resolve,
        reject,
        payload,
        deviceName,
        platform,
        // Re-pairing from an already-paired phone: ask the desktop to retire
        // THIS phone's previous record in the same transaction that issues the
        // new credential, so no duplicate/UNIQUE conflict can occur.
        replaceDeviceId: isUsablePairing(this.pairing) ? this.pairing.deviceId : null,
        credential: null,
      };
      this.setStatus('pairing');
      this.sendPairRequest();

      this.pairApprovalTimer = setTimeout(() => {
        if (!this.pairingInFlight) return;
        const inFlight = this.pairingInFlight;
        this.pairingInFlight = null;
        inFlight.reject(new GatewayError(PAIR_REASONS.APPROVAL_TIMEOUT, 'The desktop did not confirm the pairing in time.'));
      }, PAIR_APPROVAL_TIMEOUT_MS);
    });
  }

  /**
   * Connect using an already-stored pairing and authenticate it.
   * Resolves once the desktop confirms the credential with `server.hello`.
   */
  async connect(pairing: StoredPairing): Promise<void> {
    if (!isPinnedTransportAvailable()) {
      throw new GatewayError(
        ERR_NATIVE_UNAVAILABLE,
        'The pinned transport requires a development build (Expo Go is not supported).',
      );
    }

    // Never leave a stale socket or a queued retry behind when (re)connecting:
    // two concurrent auth attempts on the same gateway would be rejected.
    this.clearReconnectTimer();
    const existing = this.socket;
    this.socket = null;
    if (existing) {
      existing.detach();
      void existing.close(1000, 'Reconnecting');
    }

    this.pairing = pairing;
    this.intentionalClose = false;
    this.reconnectAttempt = 0;

    try {
      await this.openAndAuthenticate();
    } catch (error) {
      // A temporarily offline (or restarting) desktop must NOT force a new QR
      // pairing. Start the bounded backoff loop so the existing credential is
      // retried automatically.
      if (!this.intentionalClose && isUsablePairing(this.pairing)) this.scheduleReconnect();
      throw error;
    }
  }

  /**
   * Cancel an in-flight pairing attempt and tear down the socket. Distinguishes
   * itself from `disconnect()` by rejecting the pending `pair()` promise with the
   * `cancelled` code so the UI can stay quiet.
   */
  async cancelPairing(): Promise<void> {
    const inFlight = this.pairingInFlight;
    this.pairingInFlight = null;
    if (this.pairApprovalTimer) {
      clearTimeout(this.pairApprovalTimer);
      this.pairApprovalTimer = null;
    }
    this.intentionalClose = true;
    // Cancelling a re-pair must NOT drop an existing, still-valid pairing: the
    // phone simply keeps using its stored credential.
    this.pairingTarget = null;
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.detach();
      await socket.close(1000, 'Pairing cancelled');
    }
    inFlight?.reject(new GatewayError('cancelled', 'Pairing cancelled'));
    // The pairing attempt tore the live socket down; bring the existing
    // credential back online so nothing requires another QR pairing.
    if (!this.resumeStoredPairing()) this.setStatus('idle');
  }

  /**
   * Restore the connection to an already-paired desktop after an aborted
   * pairing attempt. Returns `false` when there is nothing usable to resume, so
   * the caller can pick its own idle/disconnected state.
   */
  private resumeStoredPairing(): boolean {
    if (!isUsablePairing(this.pairing)) return false;
    this.intentionalClose = false;
    this.reconnectAttempt = 0;
    this.setStatus('reconnecting');
    this.scheduleReconnect();
    return true;
  }

  /** Close the socket and stop reconnecting. Keeps the stored pairing. */
  async disconnect(): Promise<void> {
    this.intentionalClose = true;
    this.clearTimers();
    this.clearAwaitedOutcomes();
    this.failAllPendingScans('Disconnected');
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.detach();
      await socket.close(1000, 'Client closing');
    }
    this.setStatus('disconnected');
  }

  /** Drop the pairing reference held by the client (storage is the caller's job). */
  forgetPairing(): void {
    this.pairing = null;
    this.pairingTarget = null;
    this.desktopName = null;
    this.authenticatedDeviceId = null;
  }

  /**
   * Send one barcode. Never buffers: if the socket is not connected this fails
   * immediately so a stale scan can never land in a later POS cart.
   */
  async sendScan(code: string, format: string | null = null): Promise<ScanResult> {
    void format;
    const pairing = this.pairing;
    if (
      this.status !== 'connected' ||
      !this.socket ||
      !isUsablePairing(pairing) ||
      this.authenticatedDeviceId !== pairing.deviceId
    ) {
      return { status: 'failed', scanId: null, detail: 'not_connected' };
    }

    const barcode = validateBarcode(code);
    if (!barcode.ok) {
      return { status: 'failed', scanId: null, detail: barcode.code };
    }

    const nonce = randomToken(12);
    // ALWAYS the desktop-issued device id — never a phone-side hardware id.
    const frame = buildScan({
      deviceId: pairing.deviceId,
      credential: pairing.credential,
      nonce,
      code: barcode.value,
      ts: Date.now(),
    });

    try {
      await this.socket.send(frame);
    } catch {
      return { status: 'failed', scanId: null, detail: 'send_failed' };
    }

    return new Promise<ScanResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingScans.delete(nonce);
        resolve({ status: 'failed', scanId: null, detail: 'ack_timeout' });
      }, SCAN_ACK_TIMEOUT_MS);
      // The barcode is kept so the ack (and the later `scan.result`) can be
      // attributed back to the exact code the cashier scanned.
      this.pendingScans.set(nonce, { code: barcode.value, resolve, timer });
    });
  }

  /** Tear everything down (used when the app unmounts). */
  async shutdown(): Promise<void> {
    await this.disconnect();
  }

  /* ---------------------------------------------------------------- *
   * Socket lifecycle
   * ---------------------------------------------------------------- */

  private createSocket(): PinnedSocket {
    const socket = new PinnedSocket();
    socket.attach({
      onOpen: () => {
        // Nothing to do here: the desktop immediately sends `server.hello`,
        // and the pairing/auth flow is driven from there.
      },
      onMessage: (data) => this.handleFrame(data),
      onClosed: (code, reason) => this.handleClosed(code, reason),
      onError: (message) => this.handleSocketError(message),
    });
    this.socket = socket;
    return socket;
  }

  private async openAndAuthenticate(): Promise<void> {
    const pairing = this.pairing;
    if (!isUsablePairing(pairing)) {
      // A stored record that fails the desktop's own format rules must never be
      // sent: the gateway would reject it with `invalid_device_id`
      // ("Device id is missing or malformed"). Fail fast with a recovery state
      // instead of looping.
      this.lastError = 'This phone is not paired with a desktop.';
      this.setStatus('disconnected');
      throw new GatewayError('no_pairing', 'This phone is not paired with a desktop.');
    }

    this.clearReconnectTimer();
    this.authenticatedDeviceId = null;
    this.setStatus(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');

    const socket = this.createSocket();
    try {
      await socket.connect(`wss://${pairing.host}:${pairing.port}`, pairing.fingerprint, CONNECT_TIMEOUT_MS);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      this.lastError = message;
      throw new GatewayError('connect_failed', message);
    }

    await new Promise<void>((resolve, reject) => {
      this.authInFlight = { resolve, reject };
      this.setStatus('authenticating');
      void socket.send(buildHello({ deviceId: pairing.deviceId, credential: pairing.credential })).catch(() => {
        this.authInFlight = null;
        reject(new GatewayError('send_failed', 'Could not authenticate with the desktop gateway.'));
      });
    });

    // The live socket is now bound to the desktop-issued device id.
    this.authenticatedDeviceId = pairing.deviceId;
    this.reconnectAttempt = 0;
    this.setStatus('connected');
  }

  private sendPairRequest(): void {
    // Exactly one `pair.request` per pairing attempt: a duplicate would be
    // answered by the desktop with `pairing_busy`.
    if (this.pairRequestSent) return;
    const inFlight = this.pairingInFlight;
    const socket = this.socket;
    if (!inFlight || !socket) return;
    this.pairRequestSent = true;
    const frame = buildPairRequest({
      ticket: inFlight.payload.ticket,
      deviceName: inFlight.deviceName,
      platform: inFlight.platform,
      replaceDeviceId: inFlight.replaceDeviceId,
    });
    void socket.send(frame).catch(() => {
      this.pairRequestSent = false;
      const pending = this.pairingInFlight;
      this.pairingInFlight = null;
      pending?.reject(new GatewayError('send_failed', 'Could not send the pairing request to the desktop.'));
    });
  }

  /* ---------------------------------------------------------------- *
   * Frame handling
   * ---------------------------------------------------------------- */

  private handleFrame(raw: string): void {
    const decoded = decodeIncoming(raw);
    if (!decoded.ok) {
      // Malformed frames are dropped; the transport stays usable.
      return;
    }

    switch (decoded.message.type) {
      case MESSAGE_TYPES.SERVER_HELLO:
        this.handleServerHello(decoded.message);
        break;
      case MESSAGE_TYPES.PAIR_PENDING:
        this.setStatus('awaiting_approval');
        break;
      case MESSAGE_TYPES.PAIR_RESULT:
        this.handlePairResult(decoded.message);
        break;
      case MESSAGE_TYPES.ACK:
        this.handleAck(decoded.message.nonce, decoded.message.scanId);
        break;
      case MESSAGE_TYPES.SCAN_RESULT:
        this.handleScanResult(decoded.message);
        break;
      case MESSAGE_TYPES.ERROR:
        this.handleProtocolError(decoded.message.code, decoded.message.reason, decoded.message.nonce);
        break;
      case MESSAGE_TYPES.PONG:
        this.clearPongTimer();
        break;
      default:
        break;
    }
  }

  private handleServerHello(message: ServerHelloMessage): void {
    if (message.requiresPairing) {
      // First-contact handshake: the socket already knows the pairing payload.
      if (this.pairingInFlight) this.sendPairRequest();
      return;
    }

    // Post-authentication confirmation.
    this.desktopName = message.deviceName;
    if (this.pairing) {
      this.pairing = { ...this.pairing, desktopName: message.deviceName };
    }
    this.startPingLoop();

    if (this.authInFlight) {
      const inFlight = this.authInFlight;
      this.authInFlight = null;
      inFlight.resolve();
    } else {
      // Re-authenticated after a reconnect.
      this.setStatus('connected');
    }
  }

  private handlePairResult(message: PairResultMessage): void {
    const inFlight = this.pairingInFlight;
    if (this.pairApprovalTimer) {
      clearTimeout(this.pairApprovalTimer);
      this.pairApprovalTimer = null;
    }

    if (!inFlight) return;
    this.pairingInFlight = null;

    if (!message.ok) {
      const reason = message.reason ?? PAIR_REASONS.PAIRING_FAILED;
      inFlight.reject(new GatewayError(reason, pairReasonMessage(reason)));
      // A rejected re-pair must not strand an already-paired phone offline.
      if (!this.resumeStoredPairing()) this.setStatus('disconnected');
      return;
    }

    const issued: StoredPairing = {
      deviceId: message.deviceId as string,
      credential: message.credential as string,
      host: inFlight.payload.host,
      port: inFlight.payload.port,
      fingerprint: inFlight.payload.fingerprint,
      desktopName: this.desktopName,
      pairedAt: Date.now(),
    };
    this.pairing = issued;
    // The socket that just completed `pair.request` IS now authenticated for
    // this device id (the desktop bound it in `_approvePairing`), so record it.
    // Without this, the very first scan after pairing would be refused locally
    // as `not_connected` and never reach the POS.
    this.authenticatedDeviceId = issued.deviceId;
    this.reconnectAttempt = 0;
    this.startPingLoop();
    this.setStatus('connected');
    inFlight.resolve(issued);
  }

  private handleAck(nonce: string, scanId: string | null): void {
    const pending = this.pendingScans.get(nonce);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingScans.delete(nonce);
    pending.resolve({
      status: scanId === null ? 'duplicate' : 'acked',
      scanId,
      detail: scanId === null ? 'duplicate' : null,
    });
    if (scanId !== null) {
      this.handlers.onScanAcknowledged?.({ code: pending.code, scanId });
      // The ack only proves the GATEWAY accepted the frame. The cart outcome is
      // reported separately in `scan.result`, so track it here and let the UI
      // stay in a "confirming" state until the POS actually reports back.
      this.trackAwaitedOutcome(nonce, pending.code, scanId);
    }
  }

  /** `scan.result` — what the POS actually did with the barcode. */
  private handleScanResult(message: ScanResultMessage): void {
    const awaited = this.awaitedOutcomes.get(message.nonce);
    if (awaited) {
      clearTimeout(awaited.timer);
      this.awaitedOutcomes.delete(message.nonce);
    }
    this.handlers.onScanOutcome?.({
      code: awaited?.code ?? '',
      scanId: awaited?.scanId ?? null,
      outcome: message.outcome,
      detail: message.detail,
    });
  }

  private handleProtocolError(code: string, reason: string, nonce: string | null = null): void {
    if (code === 'unauthorized') {
      // The device was revoked, or the stored credential is no longer valid.
      this.intentionalClose = true;
      this.lastError = reason;
      this.setStatus('revoked');
      if (this.authInFlight) {
        const inFlight = this.authInFlight;
        this.authInFlight = null;
        inFlight.reject(new GatewayError('revoked', reason));
      }
      void this.socket?.close(1008, 'Unauthorized');
      return;
    }

    this.lastError = reason;

    // A rejected SCAN must resolve the frame that caused it, so the phone shows
    // a precise reason instead of waiting for the ack timeout.
    if (nonce) {
      const pending = this.pendingScans.get(nonce);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingScans.delete(nonce);
        pending.resolve({ status: 'failed', scanId: null, detail: code });
      }
    }

    if (this.authInFlight) {
      const inFlight = this.authInFlight;
      this.authInFlight = null;
      inFlight.reject(new GatewayError(code, reason));
      this.setStatus('error');
      return;
    }

    // The socket itself is still alive; surface the reason without tearing the
    // connection state down.
    this.setStatus(this.status);
  }

  private handleClosed(code: number, reason: string): void {
    void code;
    this.clearTimers();
    this.authenticatedDeviceId = null;

    if (this.pairingInFlight) {
      const inFlight = this.pairingInFlight;
      this.pairingInFlight = null;
      inFlight.reject(new GatewayError(PAIR_REASONS.DESKTOP_UNAVAILABLE, 'The desktop closed the connection.'));
      this.setStatus(this.pairing ? 'disconnected' : 'idle');
      return;
    }

    if (this.authInFlight) {
      const inFlight = this.authInFlight;
      this.authInFlight = null;
      inFlight.reject(new GatewayError('connect_failed', reason || 'Connection closed'));
    }

    if (this.intentionalClose || this.status === 'revoked') {
      return;
    }

    if (this.pairing) {
      this.setStatus('reconnecting');
      this.scheduleReconnect();
    } else {
      this.setStatus('disconnected');
    }
  }

  private handleSocketError(message: string): void {
    this.lastError = message;
    if (this.status === 'connected' || this.status === 'authenticating') {
      // A transport error after open is followed by onClosed, which drives
      // reconnection. Record it for display only.
      return;
    }
  }

  /* ---------------------------------------------------------------- *
   * Reconnection + keepalive
   * ---------------------------------------------------------------- */

  private scheduleReconnect(): void {
    if (this.reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      this.setStatus('disconnected');
      return;
    }
    this.clearReconnectTimer();
    this.reconnectAttempt += 1;
    const delay = Math.min(1000 * 2 ** (this.reconnectAttempt - 1), 15_000);
    this.setStatus('reconnecting');

    this.reconnectTimer = setTimeout(() => {
      this.openAndAuthenticate().catch(() => {
        // Retry until the attempt budget is exhausted.
        if (!this.intentionalClose) this.scheduleReconnect();
      });
    }, delay);
  }

  private startPingLoop(): void {
    this.clearPingTimer();
    this.pingTimer = setInterval(() => {
      void this.sendPing();
    }, PING_INTERVAL_MS);
  }

  private async sendPing(): Promise<void> {
    const socket = this.socket;
    if (!socket || this.status !== 'connected') return;
    try {
      await socket.send(buildPing(Date.now()));
    } catch {
      return;
    }
    this.clearPongTimer();
    this.pongTimer = setTimeout(() => {
      // No pong in time: force a reconnect by closing the socket.
      this.lastError = 'The desktop gateway stopped responding.';
      void socket.close(1001, 'Keepalive timeout');
    }, PING_TIMEOUT_MS);
  }

  /* ---------------------------------------------------------------- *
   * Helpers
   * ---------------------------------------------------------------- */

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.handlers.onStatusChange?.(this.getSnapshot());
  }

  /** Remember an acked scan until the desktop reports what the POS did. */
  private trackAwaitedOutcome(nonce: string, code: string, scanId: string | null): void {
    const timer = setTimeout(() => {
      this.awaitedOutcomes.delete(nonce);
    }, SCAN_OUTCOME_TTL_MS);
    this.awaitedOutcomes.set(nonce, { code, scanId, timer });
    // Bound the map so a long session cannot grow it without limit.
    while (this.awaitedOutcomes.size > MAX_TRACKED_OUTCOMES) {
      const oldest = this.awaitedOutcomes.keys().next();
      if (oldest.done) break;
      const entry = this.awaitedOutcomes.get(oldest.value);
      if (entry) clearTimeout(entry.timer);
      this.awaitedOutcomes.delete(oldest.value);
    }
  }

  private clearAwaitedOutcomes(): void {
    for (const entry of this.awaitedOutcomes.values()) clearTimeout(entry.timer);
    this.awaitedOutcomes.clear();
  }

  private failAllPendingScans(detail: string): void {
    for (const [nonce, pending] of this.pendingScans) {
      clearTimeout(pending.timer);
      this.pendingScans.delete(nonce);
      pending.resolve({ status: 'failed', scanId: null, detail });
    }
  }

  private clearPingTimer(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private clearPongTimer(): void {
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearPingTimer();
    this.clearPongTimer();
    if (this.pairApprovalTimer) {
      clearTimeout(this.pairApprovalTimer);
      this.pairApprovalTimer = null;
    }
  }
}

/** Map a desktop pairing reason code to a clear, user-facing message. */
export function pairReasonMessage(reason: string): string {
  switch (reason) {
    case PAIR_REASONS.INVALID_TICKET:
      return 'This pairing code is not valid. Generate a new code on the desktop.';
    case PAIR_REASONS.TICKET_UNAVAILABLE:
      return 'This pairing code was already used. Generate a new code on the desktop.';
    case PAIR_REASONS.PAIRING_BUSY:
      return 'Another pairing request is already waiting for approval on the desktop.';
    case PAIR_REASONS.REJECTED_BY_USER:
      return 'The pairing request was denied on the desktop.';
    case PAIR_REASONS.APPROVAL_TIMEOUT:
      return 'The pairing request timed out before it was approved on the desktop.';
    case PAIR_REASONS.DESKTOP_UNAVAILABLE:
      return 'The desktop application is not reachable.';
    case PAIR_REASONS.GATEWAY_STOPPED:
      return 'The desktop scanner gateway has stopped.';
    case PAIR_REASONS.PAIRING_FAILED:
    default:
      return 'Pairing failed on the desktop. Please try again.';
  }
}
