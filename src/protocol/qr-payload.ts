/**
 * MIZANE Mobile Scanner — Pairing QR payload (v1).
 *
 * Mirrors the EXACT envelope built by the desktop in
 * `KINETIC_POS/electron/scan-hub.js` → `startPairing()`:
 *
 *   {
 *     marker: 'mizane-scan',
 *     v: 1,
 *     mode: 'lan',
 *     host: <private IPv4 string>,
 *     port: <integer 1024-65535>,
 *     fingerprint: <sha256 hex of the desktop leaf certificate>,
 *     ticket: <base64url single-use ticket>,
 *     expiresAt: <epoch ms>
 *   }
 *
 * Phase 2 is LAN-only; `mode` is validated to be `'lan'` and anything else is
 * rejected with a clear message (the envelope is deliberately extensible so a
 * future cloud relay can introduce new modes without breaking this parser).
 */

import { FINGERPRINT_PATTERN, PROTOCOL_MARKER, PROTOCOL_VERSION, TICKET_PATTERN } from './scan-protocol';

export const PAIRING_MODES = {
  LAN: 'lan',
} as const;

export type PairingMode = (typeof PAIRING_MODES)[keyof typeof PAIRING_MODES];

export interface PairingPayload {
  marker: string;
  v: number;
  mode: PairingMode;
  host: string;
  port: number;
  fingerprint: string;
  ticket: string;
  expiresAt: number;
}

export type QrParseResult =
  | { ok: true; payload: PairingPayload }
  | { ok: false; code: string; reason: string };

/** True only for RFC1918 / link-local IPv4 addresses (never a public IP). */
export function isPrivateIPv4(address: unknown): boolean {
  if (typeof address !== 'string') return false;
  const parts = address.split('.');
  if (parts.length !== 4) return false;
  const octets = parts.map((p) => Number(p));
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = octets as [number, number];
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // link-local
  return false;
}

function fail(code: string, reason: string): QrParseResult {
  return { ok: false, code, reason };
}

/**
 * Parse and validate a scanned QR frame. Rejects anything that is not a
 * well-formed MIZANE pairing envelope, so a stray product barcode or a foreign
 * QR code produces a clear message instead of a broken connection attempt.
 */
export function parsePairingQr(raw: string, now: number = Date.now()): QrParseResult {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return fail('empty_qr', 'The scanned code was empty');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fail('not_json', 'This is not a MIZANE pairing code');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return fail('malformed_payload', 'This is not a MIZANE pairing code');
  }
  const obj = parsed as Record<string, unknown>;

  if (obj.marker !== PROTOCOL_MARKER) {
    return fail('invalid_marker', 'This QR code is not a MIZANE pairing code');
  }
  if (obj.v !== PROTOCOL_VERSION) {
    return fail('unsupported_version', `This pairing code uses an unsupported protocol version (${String(obj.v)})`);
  }
  if (obj.mode !== PAIRING_MODES.LAN) {
    return fail('unsupported_mode', `Unsupported pairing mode: ${String(obj.mode)}`);
  }

  const host = obj.host;
  if (typeof host !== 'string' || !isPrivateIPv4(host)) {
    return fail('invalid_host', 'The pairing code does not contain a valid private LAN address');
  }

  const port = obj.port;
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1024 || port > 65535) {
    return fail('invalid_port', 'The pairing code does not contain a valid port');
  }

  const fingerprint = obj.fingerprint;
  if (typeof fingerprint !== 'string' || !FINGERPRINT_PATTERN.test(fingerprint)) {
    return fail('invalid_fingerprint', 'The pairing code does not contain a valid certificate fingerprint');
  }

  const ticket = obj.ticket;
  if (typeof ticket !== 'string' || !TICKET_PATTERN.test(ticket)) {
    return fail('invalid_ticket', 'The pairing code does not contain a valid pairing ticket');
  }

  const expiresAt = obj.expiresAt;
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) {
    return fail('invalid_expiry', 'The pairing code does not contain a valid expiry');
  }
  if (expiresAt <= now) {
    return fail('expired_ticket', 'This pairing code has expired. Please generate a new one on the desktop.');
  }

  return {
    ok: true,
    payload: {
      marker: PROTOCOL_MARKER,
      v: PROTOCOL_VERSION,
      mode: PAIRING_MODES.LAN,
      host,
      port,
      fingerprint: fingerprint.toLowerCase(),
      ticket,
      expiresAt,
    },
  };
}

/** Human-readable LAN URL for the paired endpoint (never includes the ticket). */
export function pairingAddress(payload: PairingPayload): string {
  return `wss://${payload.host}:${payload.port}`;
}
