# MIZANE Mobile Scanner

<p align="center">
  <strong>Turn your Android phone into a wireless barcode scanner for MIZANE POS.</strong>
</p>

<p align="center">
  <img src="assets/branding/app-icon.png" width="128" alt="MIZANE Mobile Scanner icon" />
</p>

<p align="center">
  <sub>Version 1.0.0 &nbsp;·&nbsp; Android &nbsp;·&nbsp; <code>com.mizane.mobilescanner</code></sub>
</p>

<p align="center">
  <a href="https://github.com/djabercheriet/MizanPos-App/releases">
    <strong>Download for Android</strong>
  </a>
  &nbsp; · &nbsp;
  <a href="https://github.com/djabercheriet/MizanPos-App/issues">
    Report an Issue
  </a>
</p>

---

## Your phone. Your scanner. Your POS.

MIZANE Mobile Scanner is a companion application that connects a smartphone to **MIZANE POS** and turns its camera into a wireless barcode scanner.

Scan a product with your phone and the barcode travels straight to the connected POS terminal over your local network. The POS looks the product up and updates the cart exactly as it would for a wired scanner — no dedicated handheld hardware required.

Everything stays on your own network. There is no cloud account, no relay server, and no data leaves the local machine.

---

## Features

- **Wireless Barcode Scanning** — Camera-based scanning of retail and 2D symbologies, with torch control and a manual entry fallback.
- **Direct POS Integration** — Scans are delivered to the connected MIZANE POS over a certificate-pinned, encrypted local WebSocket.
- **Real Cart Outcomes** — The phone reports what the POS actually did with the scan: added, quantity increased, unknown product, expired, or ignored.
- **Scan History** — Every scan is kept on the phone with its barcode and POS outcome for quick review.
- **Device Pairing** — Secure pairing through a one-time ticket or QR code, performed once and remembered thereafter.
- **Devices Management** — Reconnect, re-pair, or disconnect a POS terminal from a single screen.
- **Dark & Light Themes** — A single theme-aware codebase; the MIZANE navy identity by default.
- **English, العربية, Français** — Fully localised, with automatic right-to-left layout for Arabic.
- **Cashier-Friendly Feedback** — Haptics and a short confirmation tone on a POS-confirmed scan, with distinct states for "sent" versus "added to cart".

## Supported Barcode Formats

| Symbology | Type |
| --- | --- |
| EAN-13, EAN-8 | Retail product codes |
| UPC-A, UPC-E | North American retail codes |
| Code 128, Code 39, Code 93 | Alphanumeric and logistics |
| ITF-14 | Shipping and carton codes |
| Codabar | Library and parcel labels |
| QR Code, Data Matrix | 2D codes |

Barcode values are always preserved as text, so leading zeros are never lost.

> UPC-A is emitted by the Android scanner only. On iOS the platform reports UPC-A as EAN-13.

---

## Requirements

- **Phone:** Android 7.0 (API 24) or newer, with a working camera.
- **POS:** A MIZANE POS installation with the mobile scan gateway enabled, reachable on the same local network (Wi-Fi or LAN).
- **Development:** Node.js 20+, JDK 17, and the Android SDK (build-tools 36, platform 36) for building from source.

---

## Getting Started

### Run from source

```bash
npm install
npm run android      # builds and installs the debug app on a connected device or emulator
```

Other useful scripts:

```bash
npm start            # Metro bundler for an already-installed dev client
npm run typecheck    # TypeScript check, no emit
npx expo prebuild    # regenerate the native android/ project
```

### Building a release APK

Release signing is handled by an Expo config plugin and reads its credentials from Gradle properties, which are never stored in this repository.

Add the following to your user-level `~/.gradle/gradle.properties`:

```properties
MIZANE_UPLOAD_STORE_FILE=/absolute/path/to/release.jks
MIZANE_UPLOAD_KEY_ALIAS=your-key-alias
MIZANE_UPLOAD_STORE_PASSWORD=********
MIZANE_UPLOAD_KEY_PASSWORD=********
```

Then build:

```bash
npx expo prebuild --clean
cd android
./gradlew assembleRelease
```

The signed APK is written to `android/app/build/outputs/apk/release/app-release.apk`.

The build fails fast with a clear Gradle error if any signing property or the keystore file is missing. A release build is never silently signed with the debug keystore.

---

## How It Works

1. **Pair once.** The POS displays a pairing QR code (or a ticket). Scanning it from the phone exchanges a single-use ticket for a long-lived device credential.
2. **Connect.** The phone opens a WebSocket over TLS to the POS and authenticates with the credential issued during pairing.
3. **Scan.** A barcode is validated on the phone, sent to the POS, and acknowledged by the gateway.
4. **Confirm.** The POS reports what happened to the cart, and the phone shows that outcome — not just the fact that the frame was received.

The POS is the single source of truth. The phone only submits barcodes; it never creates products, changes prices, or alters inventory on its own.

---

## Security

- **Certificate Pinning** — The TLS connection is pinned to the SHA-256 fingerprint of the POS certificate (trust on first use), implemented by a small native module on both Android and iOS.
- **LAN Only** — Communication happens directly with your POS on the local network. Nothing is routed to the internet.
- **Server-Issued Identity** — The device identifier and credential are issued by the POS during pairing. Hardware identifiers are never used as credentials and cannot be spoofed into the gateway.
- **Replay Protection** — Each scan carries a single-use nonce and a timestamp that must fall within a tight tolerance window.
- **Credentials at Rest** — The paired credential is stored with the platform secure store, and Android backup is disabled so it never leaves the device.
- **No Secrets in the Repository** — Keystores and signing passwords are referenced through user-level Gradle properties outside version control.

---

## Project Structure

```
app.json                        Expo configuration, permissions, build plugins
plugins/                        Idempotent Expo config plugins (release signing)
assets/branding/                Application icon
modules/mizane-pinned-wss/      Native TLS-pinning WebSocket module (Android + iOS)
src/protocol/                   Wire protocol mirror and pairing QR payload
src/transport/                  Gateway client (connection, retry, keepalive)
src/screens/                    Welcome, Pairing, Scanner, History, Devices, Settings
src/components/                 Design system primitives and the tab bar
src/state/                      Application context and connection state
src/storage/                    Devices, history, preferences and secure storage
src/theme/                      Dark and light theme tokens
src/i18n/                       English, Arabic and French catalogues
```

Navigation is provided by a lightweight five-tab shell — **Home, Scanner, History, Devices, Settings** — with no external navigation or icon dependencies.

---

## Localisation

The interface ships in **English**, **العربية**, and **Français**. The language can be changed in Settings, defaults to the device locale when supported, and switches the entire layout to right-to-left for Arabic.

---

## Troubleshooting

**The phone cannot find the POS.**
Confirm both devices are on the same network, that the mobile scan gateway is enabled on the POS, and that no firewall is blocking the local port.

**Pairing fails or expires.**
Pairing tickets are single-use and short-lived. Generate a fresh QR code on the POS and scan it again.

**The camera shows nothing.**
Grant camera permission in Android settings, then reopen the Scanner tab. On some devices the camera may need a moment to initialise after a permission change.

**Scans report "unknown product".**
The POS could not find the barcode in its catalogue. Verify the product and its barcode mapping in MIZANE POS.

**Release build fails with a signing error.**
One of the four `MIZANE_UPLOAD_*` Gradle properties is missing or the keystore path is wrong. This failure is intentional — it prevents an unsigned or debug-signed release.

---

## License

MIZANE Mobile Scanner is proprietary software. Copyright (c) 2026 Mizan Pos. All rights reserved.

See [LICENSE](LICENSE) for the full terms. Redistribution, modification, or use outside of a licensed MIZANE POS installation is not permitted.
