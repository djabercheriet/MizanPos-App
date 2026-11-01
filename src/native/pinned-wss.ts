/**
 * MIZANE Mobile Scanner — pinned WSS native bridge (JS wrapper).
 *
 * Thin, typed wrapper over the local `mizane-pinned-wss` Expo native module.
 * It hides the native event-emitter shape from the transport layer and makes
 * the "custom development build required" failure mode explicit and readable.
 */

import MizanePinnedWss, { type PinnedWssEvents } from '../../modules/mizane-pinned-wss';

export interface PinnedSocketHandlers {
  onOpen: () => void;
  onMessage: (data: string) => void;
  onClosed: (code: number, reason: string) => void;
  onError: (message: string) => void;
}

/** Stable error code used when the native module is absent (Expo Go). */
export const ERR_NATIVE_UNAVAILABLE = 'ERR_NATIVE_UNAVAILABLE';

/** True when the pinned transport module exists in the running binary. */
export function isPinnedTransportAvailable(): boolean {
  return MizanePinnedWss != null;
}

export class PinnedSocket {
  private subscriptions: { remove: () => void }[] = [];
  private opened = false;

  /** Open a pinned connection. Rejects if TLS pinning or the upgrade fails. */
  async connect(url: string, fingerprint: string, timeoutMs = 8000): Promise<void> {
    if (!isPinnedTransportAvailable()) {
      throw Object.assign(new Error('The pinned transport requires a development build (Expo Go is not supported).'), {
        code: ERR_NATIVE_UNAVAILABLE,
      });
    }
    this.opened = false;
    await MizanePinnedWss.connect(url, fingerprint, timeoutMs);
  }

  /** Send one UTF-8 text frame. Rejects when the socket is not open. */
  async send(data: string): Promise<void> {
    await MizanePinnedWss.send(data);
  }

  /** Close the socket. Safe to call when already closed. */
  async close(code = 1000, reason = 'Client closing'): Promise<void> {
    try {
      await MizanePinnedWss.close(code, reason);
    } catch {
      // Closing an already-closed socket is not an error for the caller.
    }
  }

  /** Attach handlers. Must be called before `connect()`. */
  attach(handlers: PinnedSocketHandlers): void {
    this.detach();
    const subscribe = <K extends keyof PinnedWssEvents>(
      event: K,
      handler: (payload: Parameters<PinnedWssEvents[K]>[0]) => void,
    ) => {
      const subscription = (MizanePinnedWss as unknown as {
        addListener: (name: string, cb: (payload: unknown) => void) => { remove: () => void };
      }).addListener(event, handler as (payload: unknown) => void);
      this.subscriptions.push(subscription);
    };

    subscribe('onOpen', () => {
      this.opened = true;
      handlers.onOpen();
    });
    subscribe('onMessage', (event) => handlers.onMessage(event.data));
    subscribe('onClosed', (event) => handlers.onClosed(event.code, event.reason));
    subscribe('onError', (event) => handlers.onError(event.message));
  }

  /** Remove all native listeners. */
  detach(): void {
    for (const subscription of this.subscriptions) {
      try {
        subscription.remove();
      } catch {
        // ignore
      }
    }
    this.subscriptions = [];
  }

  get isOpen(): boolean {
    return this.opened;
  }
}
