/**
 * MIZANE Mobile Scanner — secure credential storage.
 *
 * Paired-device credentials and pairing material live in `expo-secure-store`
 * (Android Keystore / iOS Keychain). Nothing here is ever logged, and no
 * product or financial database credential is ever stored on the phone.
 */

import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

import { CREDENTIAL_PATTERN, DEVICE_ID_PATTERN, FINGERPRINT_PATTERN } from '../protocol/scan-protocol';
import { isPrivateIPv4 } from '../protocol/qr-payload';

const KEY_PAIRING = 'mizane.pairedGateway.v1';
const KEY_CLIENT_ID = 'mizane.clientId.v1';

export interface StoredPairing {
  /** Desktop-issued device id (`dev_…`). */
  deviceId: string;
  /** Desktop-issued long-lived credential (transmitted once at pairing time). */
  credential: string;
  /** LAN host from the pairing QR. */
  host: string;
  /** WSS port from the pairing QR. */
  port: number;
  /** Lowercase SHA-256 fingerprint pinned from the pairing QR. */
  fingerprint: string;
  /** Friendly name of the desktop terminal, if the gateway reported one. */
  desktopName: string | null;
  /** Epoch ms of the successful pairing. */
  pairedAt: number;
}

const secureOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/**
 * True when a pairing record can actually be used to authenticate.
 *
 * The device id MUST be the opaque, desktop-issued identifier returned by
 * `pair.result` — never a hardware/installation identifier from Expo, which is
 * nullable and would be rejected by the gateway with
 * `invalid_device_id` ("Device id is missing or malformed").
 */
export function isUsablePairing(pairing: StoredPairing | null | undefined): pairing is StoredPairing {
  if (!pairing) return false;
  return (
    DEVICE_ID_PATTERN.test(pairing.deviceId) &&
    CREDENTIAL_PATTERN.test(pairing.credential) &&
    FINGERPRINT_PATTERN.test(pairing.fingerprint) &&
    isPrivateIPv4(pairing.host) &&
    Number.isInteger(pairing.port) &&
    pairing.port >= 1024 &&
    pairing.port <= 65535
  );
}

/** Load the stored pairing, or `null` when this phone is not paired. */
export async function loadPairing(): Promise<StoredPairing | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY_PAIRING, secureOptions);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredPairing>;
    if (
      typeof parsed.deviceId !== 'string' ||
      typeof parsed.credential !== 'string' ||
      typeof parsed.host !== 'string' ||
      typeof parsed.port !== 'number' ||
      typeof parsed.fingerprint !== 'string'
    ) {
      return null;
    }
    const pairing: StoredPairing = {
      deviceId: parsed.deviceId,
      credential: parsed.credential,
      host: parsed.host,
      port: parsed.port,
      fingerprint: parsed.fingerprint,
      desktopName: typeof parsed.desktopName === 'string' ? parsed.desktopName : null,
      pairedAt: typeof parsed.pairedAt === 'number' ? parsed.pairedAt : Date.now(),
    };
    // A structurally valid entry that cannot authenticate is treated as "not
    // paired" so the app offers a clean re-pair instead of sending a hello the
    // gateway is guaranteed to reject.
    return isUsablePairing(pairing) ? pairing : null;
  } catch {
    return null;
  }
}

/**
 * Persist a freshly issued pairing (credential written once, never logged).
 *
 * Refuses to persist a record the gateway would reject, so a broken issue
 * response fails loudly at pairing time instead of on the next reconnect.
 */
export async function savePairing(pairing: StoredPairing): Promise<void> {
  if (!isUsablePairing(pairing)) {
    throw new Error('The desktop issued an invalid device credential. Pair again with a new code.');
  }
  await SecureStore.setItemAsync(KEY_PAIRING, JSON.stringify(pairing), secureOptions);
}

/** Forget the current pairing (used by "Disconnect" and revoke handling). */
export async function clearPairing(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY_PAIRING, secureOptions);
  } catch {
    // ignore
  }
}

/** Stable, opaque per-install client id used for the pairing request name. */
export async function loadClientId(): Promise<string> {
  try {
    const existing = await SecureStore.getItemAsync(KEY_CLIENT_ID, secureOptions);
    if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing;
  } catch {
    // fall through and regenerate
  }
  const created = randomToken(16);
  try {
    await SecureStore.setItemAsync(KEY_CLIENT_ID, created, secureOptions);
  } catch {
    // ignore — a non-persisted id still works for a single session
  }
  return created;
}

/** URL-safe random token of `bytes` entropy (base64url, no padding). */
export function randomToken(bytes: number): string {
  return base64UrlEncode(Crypto.getRandomBytes(bytes));
}

const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Base64url (no padding) encoding of raw bytes, without relying on btoa. */
function base64UrlEncode(bytes: Uint8Array): string {
  let out = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const b0 = bytes[index] as number;
    const b1 = index + 1 < bytes.length ? (bytes[index + 1] as number) : undefined;
    const b2 = index + 2 < bytes.length ? (bytes[index + 2] as number) : undefined;

    out += BASE64URL_ALPHABET[b0 >> 2];
    out += BASE64URL_ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 !== undefined) {
      out += BASE64URL_ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    }
    if (b2 !== undefined) {
      out += BASE64URL_ALPHABET[b2 & 0x3f];
    }
  }
  return out;
}

