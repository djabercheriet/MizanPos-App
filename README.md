# MIZANE Mobile Scanner (Phase 2)

Companion barcode-scanner app for **MIZANE POS**, for **Android** and **iOS**.

It pairs with the desktop application over the **local LAN only**, then sends scanned
product barcodes to the running POS cart. There is **no cloud relay** in this phase.

- React Native + **Expo SDK 57** (`expo ~57.0.4`, React Native `0.86.0`, React `19.2.3`)
- TypeScript (strict), Hermes, New Architecture
- Custom **development build** required (a local native module provides the pinned TLS
  transport — Expo Go cannot run it)

> This app is *not* a point of sale. It never creates products, never updates stock,
> never sends SQL, and never performs checkout. The only operational payload it can
> submit is a barcode string.

---

## 1. Project layout

```
MIZANE_MOBILE_SCANNER/
├── app.json                      Expo config (permissions, plugins, identifiers)
├── babel.config.js
├── index.ts                      registerRootComponent(App)
├── package.json
├── tsconfig.json
├── assets/
│   └── scan-beep.wav             Bundled scan confirmation beep
├── modules/
│   └── mizane-pinned-wss/        Local Expo native module (pinned WSS transport)
│       ├── expo-module.config.json
│       ├── index.ts              JS surface (connect / send / close + events)
│       ├── android/…             Kotlin + OkHttp, SHA-256 cert pinning
│       └── ios/…                 Swift + URLSessionWebSocketTask, SHA-256 cert pinning
└── src/
    ├── App.tsx                   Provider + screen router
    ├── components/               Button, Card, ScreenShell, StatusPill
    ├── feedback/                 Haptics + beep
    ├── i18n/                     English, العربية, Français (+ RTL flag)
    ├── native/                   Typed wrapper over the native module
    ├── protocol/                 Wire protocol v1 mirror + QR payload validator
    ├── screens/                  Welcome, Pair, Pending, Scanner, History, Settings
    ├── state/                    AppProvider (context store + router)
    ├── storage/                  SecureStore credentials, prefs, history, identity
    ├── theme/                    Design tokens
    └── transport/                GatewayClient (handshake, pairing, scan/ack, reconnect)
```

---

## 2. Prerequisites

- Node.js **20.19.x** or newer (Expo SDK 57 requirement)
- Android: Android Studio + SDK, a device or emulator with a camera
- iOS: macOS + Xcode 16+, a device (the iOS simulator has no camera)
- The MIZANE POS desktop app running on the **same Wi-Fi/LAN**

---

## 3. Install and build

```bash
cd G:\DEV\MIZANE_MOBILE_SCANNER
npm install

# Android (creates ./android and builds the dev client)
npx expo prebuild --platform android
npx expo run:android

# iOS (macOS only; creates ./ios and builds the dev client)
npx expo prebuild --platform ios
npx expo run:ios
```

After the first native build, day-to-day development uses:

```bash
npx expo start --dev-client
```

Type checking (optional, no build):

```bash
npm run typecheck
```

> `expo prebuild` regenerates `android/` and `ios/`. Both are git-ignored — the native
> module in `modules/` is the source of truth and is re-linked on every prebuild.

---

## 4. How to test pairing manually

1. On the desktop app open **Settings → Mobile Scanner** and confirm the gateway shows
   as *running* with a `wss://<ip>:8443` address.
2. Tap **Start pairing**. A QR code appears; it is single-use and expires in 120 seconds.
3. In the phone app tap **Pair with POS** and point the camera at the QR code.
4. The phone connects to the exact `host:port` from the QR, pinning the certificate
   fingerprint also carried in the QR, and sends a pairing request.
5. The desktop shows an approval prompt naming your phone. Approve it.
6. The phone stores the issued credential in the OS keychain and opens the **Scanner**.
7. Scan a product barcode. The desktop POS cart should receive the item, and the phone
   shows a *Sent to cart* confirmation.

Things worth verifying explicitly:

- Wrong certificate pin: with a deliberately altered fingerprint in a modified QR, the
  handshake must **fail** (no connection is established).
- Duplicate handling: the same barcode scanned twice within the cooldown is treated as
  one scan; a duplicate frame that the desktop has already seen returns an `ack` with a
  `null` scan id and the phone reports *Already sent (duplicate)*.
- Disconnection: turn off Wi-Fi mid-scan. The phone shows the offline banner and
  **does not** queue the scan for later delivery.
- Revocation: revoke the device on the desktop. The phone moves to the **Welcome**
  screen with the device marked revoked, and the stored credential is deleted.

---

## 5. Pairing protocol compatibility (v1)

The app mirrors `KINETIC_POS/electron/scan-protocol.js` exactly. Nothing new was
invented and the desktop gateway was **not modified**.

### QR payload (produced by the desktop)

```json
{
  "marker": "mizane-scan",
  "v": 1,
  "mode": "lan",
  "host": "192.168.1.24",
  "port": 8443,
  "fingerprint": "<sha256 hex of the desktop leaf certificate>",
  "ticket": "<base64url, single-use>",
  "expiresAt": 1767225600000
}
```

Validated on the phone: marker, `v === 1`, `mode === 'lan'`, a **private** IPv4 host
(`10.x`, `172.16–31.x`, `192.168.x`, `169.254.x`), port `1024–65535`, a 64-char
lowercase-hex fingerprint, a base64url ticket (20–200 chars) and a future expiry.

### Handshake sequence

| Direction | Message | Notes |
|---|---|---|
| desktop → phone | `server.hello { fingerprint, requiresPairing: true, deviceName: null }` | sent immediately after the upgrade |
| phone → desktop | `pair.request { ticket, deviceName, platform, publicKey: null, ts }` | ticket is single-use |
| desktop → phone | `pair.pending { requestId, expiresAt }` | approval prompt is shown |
| desktop → phone | `pair.result { ok, deviceId, credential, reason }` | credential delivered **once** |
| phone → desktop | `hello { deviceId, credential }` | on every later connection |
| desktop → phone | `server.hello { fingerprint, requiresPairing: false, deviceName }` | authentication succeeded |
| phone → desktop | `scan { deviceId, credential, nonce, ts, code }` | follows the exact regexes |
| desktop → phone | `ack { nonce, scanId }` | `scanId: null` means "duplicate, not re-delivered" |
| phone → desktop | `ping { ts }` / desktop → phone `pong { ts }` | keepalive every 25 s |

Constants mirrored from the desktop: `PROTOCOL_VERSION = 1`, `PROTOCOL_MARKER =
"mizane-scan"`, `MAX_FRAME_BYTES = 4096`, `TIMESTAMP_TOLERANCE_MS = 60_000`, barcode
pattern `^[0-9A-Za-z][0-9A-Za-z._-]{0,63}$`, nonce `^[A-Za-z0-9_-]{8,64}$`, credential /
ticket `^[A-Za-z0-9_-]{20,200}$`, device id `^[A-Za-z0-9_-]{8,64}$`.

Pairing reason codes handled with dedicated messages: `invalid_ticket`,
`ticket_unavailable`, `pairing_busy`, `rejected_by_user`, `approval_timeout`,
`pairing_failed`, `desktop_unavailable`, `gateway_stopped`.

---

## 6. Native TLS implementation

The transport is a **local Expo native module** (`modules/mizane-pinned-wss`), not the
JavaScript `WebSocket` shim, so TLS verification happens in the platform stack.

- **Android** — `OkHttpClient` with `ConnectionSpec.RESTRICTED_TLS` (TLS 1.2+), a
  custom `X509TrustManager` that computes `SHA-256(DER leaf certificate)` and compares
  it in constant time (`MessageDigest.isEqual`) against the pinned fingerprint, and a
  `hostnameVerifier` that accepts because peer identity **is** the exact certificate pin.
- **iOS** — `URLSessionWebSocketTask` with a `URLSessionDelegate` that answers the
  `NSURLAuthenticationMethodServerTrust` challenge by hashing the leaf certificate with
  `CryptoKit.SHA256` and comparing it byte-for-byte against the pin. A mismatch calls
  `cancelAuthenticationChallenge`.

Rules honoured:

- only `wss://` URLs are accepted; `ws://` is refused in native code,
- certificate validation is **never disabled** — CA chain + hostname checks are replaced
  by an exact 256-bit certificate pin, which is stronger for a self-signed certificate,
- an arbitrary self-signed certificate is **not** accepted: it must match the pin,
- the pinned fingerprint is passed again on **every reconnection**.

### Desktop certificate compatibility note

The Phase 1 desktop certificate is generated as:

```js
selfsigned.generate([{ name: 'commonName', value: 'mizane-pos-mobile-gateway' }], { … })
```

It has **no Subject Alternative Name**, and its `commonName` is a hostname string, not
the LAN IP that appears in the QR payload. Standard hostname verification therefore
cannot succeed for `wss://192.168.x.y:8443`.

The mobile app handles this **without changing the desktop** by authenticating the peer
with the exact certificate fingerprint pin instead of the hostname. No desktop code was
modified in this phase.

*Optional future hardening (not applied):* adding `{ name: 'subjectAltName', altNames:
[{ type: 7, ip: <lan ip> }] }` to the desktop's `selfsigned.generate()` call would let
native hostname verification pass as well. That is a desktop change and needs its own
review, because it changes the certificate — and therefore the pinned fingerprint, and
therefore every already-paired phone.

---

## 7. Security properties

- Credentials and the device id live in `expo-secure-store` (Android Keystore / iOS
  Keychain, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`). Nothing sensitive is written to
  AsyncStorage and nothing sensitive is logged.
- The pairing ticket and credential are never printed, and the QR payload is never
  persisted — only the issued pairing record is stored.
- Scans are **never buffered**. `GatewayClient.sendScan` fails immediately unless the
  socket is `connected`, so a scan captured while offline can never land in a later cart.
- The client can only ever send `hello`, `pair.request`, `scan` and `ping`.

---

## 8. Known limitations

- **Not tested on a physical device.** The code has not been installed, built, or run.
  Device pairing, camera behaviour and audio playback must be verified on real hardware.
- **Custom development build required.** Expo Go does not contain the native module;
  the app shows a clear message instead of a confusing failure.
- **iOS simulator has no camera** — use a physical iPhone.
- `upc_a` is requested only on Android; the iOS scanner reports UPC-A as `ean13`.
- Audio feedback requires the bundled `assets/scan-beep.wav`. If the platform refuses
  to play it, haptics still provide feedback.
- Language switching updates text immediately; a full RTL mirror of the native layout
  may need an app reload on some Android versions (RN `I18nManager` behaviour).
- Scan history is a **local log only** and is capped at 100 entries; it is never synced.
- Cloud relay is intentionally out of scope; the transport interface is isolated in
  `src/transport` so a relay transport can be added later without touching screens.
