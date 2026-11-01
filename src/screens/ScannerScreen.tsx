import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Platform,
  StyleSheet,
  Text,
  View,
  type AppStateStatus,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { IconButton } from '../components/IconButton';
import { ModalSheet } from '../components/ModalSheet';
import { ScreenShell } from '../components/ScreenShell';
import { ConnectionDot, StatusPill, toneForStatus } from '../components/StatusPill';
import { TextField } from '../components/TextField';
import { playFailureFeedback, playSuccessFeedback, releaseFeedback } from '../feedback/feedback';
import { BARCODE_PATTERN } from '../protocol/scan-protocol';
import { useApp } from '../state/AppContext';
import { fontSize, fontWeight, radius, spacing, type ThemeColors } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

/** Re-reading the SAME barcode inside this window is treated as one scan. */
const SAME_CODE_COOLDOWN_MS = 1500;
/** Minimum gap between any two accepted scans. */
const GLOBAL_MIN_INTERVAL_MS = 400;

/**
 * Product symbologies requested from expo-camera. Every entry exists in the
 * installed expo-camera (57.x) `BarcodeType` union and is supported by the
 * platform scanners behind it.
 */
type ProductBarcodeType =
  | 'ean13'
  | 'ean8'
  | 'upc_a'
  | 'upc_e'
  | 'code128'
  | 'code39'
  | 'code93'
  | 'itf14'
  | 'codabar'
  | 'qr'
  | 'datamatrix';

/** Retail + 2D symbologies recognised identically on Android and iOS. */
const SHARED_BARCODE_TYPES: ProductBarcodeType[] = [
  'ean13',
  'ean8',
  'upc_e',
  'code128',
  'code39',
  'code93',
  'itf14',
  'codabar',
  'qr',
  'datamatrix',
];

/**
 * `upc_a` is only ever emitted by the Android scanner. iOS folds UPC-A into
 * `ean13` (and drops the leading zero), so requesting it there is a no-op.
 */
const ANDROID_ONLY_TYPES: ProductBarcodeType[] = ['upc_a'];

export function ScannerScreen(): React.JSX.Element {
  const { t, navigate, submitScan, status, isConnected, preferences, lastScanResult } = useApp();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(preferences.torchDefault);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [cameraKey, setCameraKey] = useState(0);
  const [appActive, setAppActive] = useState(AppState.currentState !== 'background');
  /** Barcode handed to the transport but not yet resolved by the gateway. */
  const [pendingCode, setPendingCode] = useState<string | null>(null);

  const lastScanRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  /** Serialises the single-result UI: one scan is in flight at a time. */
  const inFlightRef = useRef(false);
  /**
   * Mirrored in a ref so the camera callback keeps a stable identity while the
   * manual sheet opens and closes. Supplying a new `onBarcodeScanned` is what
   * re-creates the native barcode listener on Android, and it is also the only
   * lever that exists there — the `active` prop is iOS-only.
   */
  const manualOpenRef = useRef(false);

  const barcodeTypes = useMemo<ProductBarcodeType[]>(
    () => (Platform.OS === 'android' ? [...SHARED_BARCODE_TYPES, ...ANDROID_ONLY_TYPES] : SHARED_BARCODE_TYPES),
    [],
  );
  // Stable identity: the settings object is read on every prop update.
  const scannerSettings = useMemo(() => ({ barcodeTypes }), [barcodeTypes]);

  /* ---------------------------------------------------------------- *
   * Camera / app lifecycle
   * ---------------------------------------------------------------- */

  // Leaving the Scanner tab unmounts this screen (the router renders only the
  // active route), which releases the camera. Backgrounding the app must do the
  // same so the camera is not held while the phone is elsewhere.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      setAppActive(next !== 'background');
    });
    return () => subscription.remove();
  }, []);

  // A freshly mounted native camera is never ready until it reports back.
  useEffect(() => {
    setCameraReady(false);
    setCameraError(false);
  }, [cameraKey, appActive]);

  useEffect(() => {
    if (!preferences.keepAwake || !appActive) return;
    void activateKeepAwakeAsync('mizane-scanner').catch(() => undefined);
    return () => {
      try {
        deactivateKeepAwake('mizane-scanner');
      } catch {
        // ignore
      }
    };
  }, [preferences.keepAwake, appActive]);

  useEffect(() => () => releaseFeedback(), []);

  /* ---------------------------------------------------------------- *
   * Scan pipeline
   * ---------------------------------------------------------------- */

  const deliver = useCallback(
    async (code: string, format: string | null) => {
      const feedback = {
        hapticsEnabled: preferences.hapticsEnabled,
        soundEnabled: preferences.soundEnabled,
      };
      // Shown until the transport resolves, i.e. "detected and being sent".
      setPendingCode(code);
      try {
        const result = await submitScan(code, format);
        // Only NEGATIVE transport outcomes are signalled here. A positive beep is
        // reserved for the desktop's `scan.result`: a WebSocket ack only proves
        // the gateway received the frame, not that the cart changed.
        if (result.status === 'failed' || result.status === 'duplicate') playFailureFeedback(feedback);
      } finally {
        setPendingCode(null);
      }
    },
    [preferences.hapticsEnabled, preferences.soundEnabled, submitScan],
  );

  // Success/failure feedback driven by the POS outcome (never by the ack).
  const feedback = useMemo(
    () => ({ hapticsEnabled: preferences.hapticsEnabled, soundEnabled: preferences.soundEnabled }),
    [preferences.hapticsEnabled, preferences.soundEnabled],
  );
  const outcomeAtRef = useRef(0);
  const outcomeRef = useRef<string | null>(null);
  useEffect(() => {
    const at = lastScanResult?.at ?? 0;
    if (at !== outcomeAtRef.current) {
      outcomeAtRef.current = at;
      outcomeRef.current = null;
    }
    const outcome = lastScanResult?.outcome ?? null;
    if (!outcome || outcome === outcomeRef.current) return;
    outcomeRef.current = outcome;
    if (outcome === 'added' || outcome === 'quantity') playSuccessFeedback(feedback);
    else playFailureFeedback(feedback);
  }, [lastScanResult, feedback]);

  const startScan = useCallback(
    (code: string, format: string | null) => {
      lastScanRef.current = { code, at: Date.now() };
      inFlightRef.current = true;
      void deliver(code, format).finally(() => {
        inFlightRef.current = false;
      });
    },
    [deliver],
  );

  const handleScanned = useCallback(
    ({ data, type }: { data: string; type: string }) => {
      // `data` is the decoded string exactly as read — never parsed as a number,
      // so leading zeros in a UPC/EAN survive.
      if (manualOpenRef.current || inFlightRef.current) return;

      const now = Date.now();
      const previous = lastScanRef.current;
      // The camera re-reports a barcode on many consecutive frames; an identical
      // value inside the cooldown is the same physical scan, not a new one. The
      // cooldown EXPIRES, so deliberately scanning the same product again works.
      if (previous.code === data && now - previous.at < SAME_CODE_COOLDOWN_MS) return;
      if (now - previous.at < GLOBAL_MIN_INTERVAL_MS) return;

      startScan(data, type ?? null);
    },
    [startScan],
  );

  const openManual = useCallback(() => {
    manualOpenRef.current = true;
    setManualOpen(true);
  }, []);

  const closeManual = useCallback(() => {
    manualOpenRef.current = false;
    setManualOpen(false);
  }, []);

  const submitManual = useCallback(() => {
    const value = manualValue.trim();
    if (!BARCODE_PATTERN.test(value)) return;
    closeManual();
    setManualValue('');
    startScan(value, null);
  }, [closeManual, manualValue, startScan]);

  const retryCamera = useCallback(() => {
    setCameraError(false);
    setCameraReady(false);
    setCameraKey((value) => value + 1);
  }, []);

  /* ---------------------------------------------------------------- *
   * Presentation
   * ---------------------------------------------------------------- */

  const statusLabel = t(`scanner.status.${status.status}` as 'scanner.status.idle');

  // Ordered from most- to least-authoritative. The POS outcome is the ONLY
  // source that may claim the cart changed; an ack never is.
  const banner = useMemo(() => {
    if (pendingCode) {
      return { tone: colors.info, background: colors.infoSoft, label: t('scanner.detected'), code: pendingCode };
    }
    if (!lastScanResult) return null;
    const { result, code, outcome } = lastScanResult;

    if (outcome === 'added') {
      return { tone: colors.accent, background: colors.accentSoft, label: t('scanner.added'), code };
    }
    if (outcome === 'quantity') {
      return { tone: colors.accent, background: colors.accentSoft, label: t('scanner.quantity'), code };
    }
    if (outcome === 'unknown_product') {
      return { tone: colors.warning, background: colors.warningSoft, label: t('scanner.unknown'), code };
    }
    if (outcome === 'expired') {
      return { tone: colors.warning, background: colors.warningSoft, label: t('scanner.expired'), code };
    }
    if (outcome === 'ignored') {
      return { tone: colors.textMuted, background: colors.surfaceAlt, label: t('scanner.ignored'), code };
    }

    // Transport states, each with its own wording.
    if (result.status === 'acked') {
      return { tone: colors.info, background: colors.infoSoft, label: t('scanner.confirming'), code };
    }
    if (result.status === 'duplicate') {
      return { tone: colors.warning, background: colors.warningSoft, label: t('scanner.duplicate'), code };
    }

    const detail = result.detail ?? '';
    if (detail === 'not_connected') {
      return { tone: colors.textMuted, background: colors.surfaceAlt, label: t('scanner.notConnected'), code };
    }
    if (detail === 'ack_timeout') {
      return { tone: colors.danger, background: colors.dangerSoft, label: t('scanner.timeout'), code };
    }
    if (detail.startsWith('invalid_barcode')) {
      return { tone: colors.danger, background: colors.dangerSoft, label: t('scanner.invalidBarcode'), code };
    }
    if (detail === 'send_failed') {
      return { tone: colors.danger, background: colors.dangerSoft, label: t('scanner.failed'), code };
    }
    if (detail) {
      return { tone: colors.danger, background: colors.dangerSoft, label: t('scanner.rejected'), code };
    }
    return { tone: colors.danger, background: colors.dangerSoft, label: t('scanner.failed'), code };
  }, [pendingCode, lastScanResult, t, colors]);

  if (!permission) {
    return (
      <ScreenShell title={t('scanner.title')} bottomInset={false}>
        <Text style={styles.muted}>{t('common.loading')}</Text>
      </ScreenShell>
    );
  }

  if (!permission.granted) {
    return (
      <ScreenShell title={t('scanner.title')} bottomInset={false}>
        <Card title={t('pair.permissionTitle')}>
          <Text style={styles.muted}>{t('pair.permissionBody')}</Text>
        </Card>
        <View style={styles.gap} />
        <Button label={t('pair.grantPermission')} onPress={() => void requestPermission()} size="lg" />
      </ScreenShell>
    );
  }

  // Only one CameraView is ever mounted: the native camera is released while the
  // app is backgrounded and re-acquired on return.
  const showCamera = appActive && !cameraError;
  const torchDisabled = !cameraReady || cameraError;
  const torchLabel = torchDisabled
    ? t('scanner.torchUnavailable')
    : torch
      ? t('scanner.torchOn')
      : t('scanner.torchOff');

  return (
    <ScreenShell
      title={t('scanner.title')}
      right={<StatusPill label={statusLabel} tone={toneForStatus(status.status)} />}
      bottomInset={false}
      footer={
        <>
          {banner ? (
            <View
              accessibilityLiveRegion="polite"
              style={[styles.resultBanner, { backgroundColor: banner.background }]}
            >
              <View style={styles.resultText}>
                <Text style={styles.resultCaption}>{t('scanner.lastScan')}</Text>
                <Text style={[styles.resultLabel, { color: banner.tone }]}>{banner.label}</Text>
              </View>
              <Text style={styles.resultCode} numberOfLines={1}>
                {banner.code}
              </Text>
            </View>
          ) : null}
          {!isConnected ? <Text style={styles.offline}>{t('scanner.offlineBanner')}</Text> : null}
          <View style={styles.actions}>
            <Button label={t('scanner.manual')} variant="secondary" onPress={openManual} style={styles.flex} />
            <Button
              label={t('scanner.history')}
              variant="secondary"
              onPress={() => navigate('history')}
              style={styles.flex}
            />
          </View>
        </>
      }
    >
      <View style={styles.cameraWrap}>
        {showCamera ? (
          <CameraView
            key={cameraKey}
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={scannerSettings}
            onBarcodeScanned={handleScanned}
            onCameraReady={() => setCameraReady(true)}
            onMountError={() => {
              setCameraReady(false);
              setCameraError(true);
            }}
          />
        ) : null}

        {showCamera ? (
          <View style={styles.frame} pointerEvents="none">
            <View style={[styles.corner, styles.cornerTopStart]} />
            <View style={[styles.corner, styles.cornerTopEnd]} />
            <View style={[styles.corner, styles.cornerBottomStart]} />
            <View style={[styles.corner, styles.cornerBottomEnd]} />
            <View style={styles.frameLine} />
          </View>
        ) : null}

        {showCamera && !cameraReady ? (
          <View style={styles.cameraNotice} pointerEvents="none">
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.cameraNoticeText}>{t('scanner.cameraStarting')}</Text>
          </View>
        ) : null}

        {cameraError ? (
          <View style={styles.cameraNotice}>
            <Text style={styles.cameraNoticeText}>{t('scanner.cameraError')}</Text>
            <Button label={t('common.retry')} variant="secondary" onPress={retryCamera} />
          </View>
        ) : null}

        {!isConnected && !cameraError ? (
          <View style={styles.connectionChip} pointerEvents="none">
            <ConnectionDot tone={toneForStatus(status.status)} />
            <Text style={styles.connectionChipLabel}>{statusLabel}</Text>
          </View>
        ) : null}

        {!cameraError ? (
          <IconButton
            icon={<Icon name="flash" size={20} color={colors.white} />}
            onPress={() => setTorch((value) => !value)}
            accessibilityLabel={torchLabel}
            variant="overlay"
            active={torch}
            disabled={torchDisabled}
            style={styles.torch}
          />
        ) : null}
      </View>

      <Text style={styles.hint}>{isConnected ? t('scanner.hint') : t('scanner.notConnected')}</Text>

      <ModalSheet
        visible={manualOpen}
        title={t('scanner.manualTitle')}
        onClose={closeManual}
        closeLabel={t('common.close')}
      >
        <TextField
          value={manualValue}
          onChangeText={setManualValue}
          placeholder={t('scanner.manualPlaceholder')}
          autoCapitalize="characters"
          autoCorrect={false}
          onSubmitEditing={submitManual}
          returnKeyType="send"
        />
        <Button
          label={t('scanner.submit')}
          onPress={submitManual}
          disabled={!BARCODE_PATTERN.test(manualValue.trim())}
        />
        <Button label={t('common.cancel')} variant="ghost" onPress={closeManual} />
      </ModalSheet>
    </ScreenShell>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    cameraWrap: {
      flex: 1,
      borderRadius: radius.lg,
      overflow: 'hidden',
      backgroundColor: colors.black,
      minHeight: 240,
    },
    frame: {
      position: 'absolute',
      top: '30%',
      bottom: '30%',
      start: '7%',
      end: '7%',
    },
    corner: {
      position: 'absolute',
      width: 26,
      height: 26,
      borderColor: colors.accent,
    },
    cornerTopStart: { top: 0, start: 0, borderTopWidth: 3, borderStartWidth: 3, borderTopStartRadius: radius.sm },
    cornerTopEnd: { top: 0, end: 0, borderTopWidth: 3, borderEndWidth: 3, borderTopEndRadius: radius.sm },
    cornerBottomStart: {
      bottom: 0,
      start: 0,
      borderBottomWidth: 3,
      borderStartWidth: 3,
      borderBottomStartRadius: radius.sm,
    },
    cornerBottomEnd: {
      bottom: 0,
      end: 0,
      borderBottomWidth: 3,
      borderEndWidth: 3,
      borderBottomEndRadius: radius.sm,
    },
    frameLine: {
      position: 'absolute',
      top: '50%',
      start: 0,
      end: 0,
      height: 2,
      opacity: 0.7,
      backgroundColor: colors.accent,
    },
    cameraNotice: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      justifyContent: 'center',
      rowGap: spacing.md,
      paddingHorizontal: spacing.xl,
      backgroundColor: colors.scannerOverlay,
    },
    cameraNoticeText: { color: colors.white, fontSize: fontSize.sm, textAlign: 'center' },
    connectionChip: {
      position: 'absolute',
      top: spacing.md,
      start: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      columnGap: spacing.sm,
      paddingVertical: spacing.xs + 2,
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      backgroundColor: colors.scannerOverlay,
      borderWidth: 1,
      borderColor: colors.borderStrong,
    },
    connectionChipLabel: { color: colors.white, fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
    torch: {
      position: 'absolute',
      top: spacing.md,
      end: spacing.md,
    },
    hint: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'center', marginTop: spacing.md },
    muted: { color: colors.textMuted, fontSize: fontSize.sm },
    gap: { height: spacing.md },
    resultBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      columnGap: spacing.md,
    },
    resultText: { flexShrink: 1 },
    resultCaption: {
      color: colors.textFaint,
      fontSize: fontSize.xs,
      fontWeight: fontWeight.semibold,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    resultLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, marginTop: 2 },
    resultCode: { color: colors.text, fontSize: fontSize.sm, flexShrink: 1 },
    offline: { color: colors.warning, fontSize: fontSize.xs, textAlign: 'center' },
    actions: { flexDirection: 'row', columnGap: spacing.sm },
    flex: { flex: 1 },
  });
}
