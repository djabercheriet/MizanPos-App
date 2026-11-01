/**
 * MIZANE Mobile Scanner — pinned WSS native transport (JS surface).
 *
 * This is a LOCAL Expo module (see `expo-module.config.json`). It is only
 * available in a custom development build produced with `expo prebuild` +
 * `expo run:android` / `expo run:ios` — it is NOT available in Expo Go.
 *
 * Security contract implemented by the native code:
 *  - The WebSocket handshake is performed over TLS using the platform TLS
 *    stack (Android OkHttp / iOS URLSession).
 *  - The desktop leaf certificate is verified by an EXACT SHA-256 fingerprint
 *    pin supplied in the pairing QR. A mismatch aborts the handshake.
 *  - PKI chain / hostname verification is intentionally replaced by that pin,
 *    because the Phase 1 desktop certificate is self-signed and carries no SAN
 *    (see the desktop compatibility note in the README). The pin is strictly
 *    stronger than a CA check for a self-signed certificate, and it is
 *    preserved on every reconnection.
 *  - Only `wss://` URLs are accepted; insecure (`ws://`) connections are
 *    refused by the native layer.
 */

import { NativeModule, requireNativeModule } from 'expo-modules-core';

export type PinnedWssEvents = {
  /** Emitted once the TLS handshake + WebSocket upgrade completed. */
  onOpen: (event: { url: string }) => void;
  /** Emitted for every inbound UTF-8 text frame. */
  onMessage: (event: { data: string }) => void;
  /** Emitted when the socket closes (graceful or transport-level). */
  onClosed: (event: { code: number; reason: string }) => void;
  /** Emitted on transport/TLS errors after the socket was opened. */
  onError: (event: { message: string }) => void;
};

export declare class MizanePinnedWssModule extends NativeModule<PinnedWssEvents> {
  /**
   * Open a pinned WSS connection.
   * @param url `wss://<host>:<port>` — the exact endpoint from the pairing QR.
   * @param fingerprint Lowercase hex SHA-256 of the desktop leaf certificate.
   * @param timeoutMs Connect/TLS handshake timeout.
   */
  connect(url: string, fingerprint: string, timeoutMs: number): Promise<void>;
  /** Send a single UTF-8 text frame. */
  send(data: string): Promise<void>;
  /** Close the current socket (safe to call when already closed). */
  close(code: number, reason: string): Promise<void>;
}

const MizanePinnedWss = requireNativeModule<MizanePinnedWssModule>('MizanePinnedWss');

export default MizanePinnedWss;

/** True when the pinned transport native module is present in this build. */
export function isPinnedWssAvailable(): boolean {
  return MizanePinnedWss != null;
}
