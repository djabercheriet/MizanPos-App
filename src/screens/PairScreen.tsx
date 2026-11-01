import React, { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { IconButton } from '../components/IconButton';
import { ScreenShell } from '../components/ScreenShell';
import { parsePairingQr, type QrParseResult } from '../protocol/qr-payload';
import { useApp } from '../state/AppContext';
import { fontSize, fontWeight, radius, spacing, type ThemeColors } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

const REJECT_DEBOUNCE_MS = 1200;

export function PairScreen(): React.JSX.Element {
  const { t, navigate, pairWithPayload, pairingError, clearPairingError } = useApp();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const lastRejectRef = useRef<{ value: string; at: number }>({ value: '', at: 0 });
  const busyRef = useRef(false);

  const messageForRejection = useCallback(
    (result: QrParseResult): string => {
      if (result.ok) return '';
      const key = `pair.invalid.${result.code}` as const;
      const translated = t(key as 'pair.invalid.generic');
      return translated === (key as string) ? t('pair.invalid.generic') : translated;
    },
    [t],
  );

  const handleScanned = useCallback(
    ({ data }: { data: string }) => {
      if (busyRef.current) return;

      const now = Date.now();
      const parsed = parsePairingQr(data, now);

      if (!parsed.ok) {
        // Debounce repeated rejections of the same non-pairing code so the
        // banner does not flicker while the camera keeps re-reading it.
        const previous = lastRejectRef.current;
        if (previous.value === data && now - previous.at < REJECT_DEBOUNCE_MS) return;
        lastRejectRef.current = { value: data, at: now };
        setLocalError(messageForRejection(parsed));
        return;
      }

      busyRef.current = true;
      setLocalError(null);
      clearPairingError();
      void pairWithPayload(parsed.payload).finally(() => {
        busyRef.current = false;
      });
    },
    [clearPairingError, messageForRejection, pairWithPayload],
  );

  const displayedError = pairingError ?? localError;

  if (!permission) {
    return (
      <ScreenShell title={t('pair.title')} onBack={() => navigate('welcome')}>
        <Text style={styles.muted}>{t('common.loading')}</Text>
      </ScreenShell>
    );
  }

  if (!permission.granted) {
    return (
      <ScreenShell title={t('pair.title')} onBack={() => navigate('welcome')}>
        <Card title={t('pair.permissionTitle')}>
          <Text style={styles.muted}>{t('pair.permissionBody')}</Text>
        </Card>
        <View style={styles.spacer} />
        <Button
          label={t('pair.grantPermission')}
          onPress={() => void requestPermission()}
          size="lg"
        />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      title={t('pair.title')}
      subtitle={t('pair.instruction')}
      onBack={() => navigate('welcome')}
      right={
        <IconButton
          icon={<Icon name="flash" size={18} color={torch ? colors.accent : colors.text} />}
          onPress={() => setTorch((value) => !value)}
          accessibilityLabel={torch ? t('scanner.torchOn') : t('scanner.torchOff')}
          variant="surface"
          active={torch}
        />
      }
    >
      <View style={styles.cameraWrap}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={handleScanned}
        />
        <View style={styles.frame} pointerEvents="none">
          <View style={styles.frameCorner} />
        </View>
      </View>

      <Text style={styles.hint}>{t('pair.scanning')}</Text>

      {displayedError ? (
        <Card style={styles.errorCard}>
          <Text style={styles.errorText}>{displayedError}</Text>
        </Card>
      ) : null}
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
      minHeight: 260,
    },
    frame: {
      position: 'absolute',
      top: '18%',
      left: '14%',
      right: '14%',
      bottom: '18%',
      borderWidth: 2,
      borderColor: colors.accent,
      borderRadius: radius.lg,
      opacity: 0.9,
    },
    frameCorner: { flex: 1 },
    hint: {
      color: colors.textMuted,
      fontSize: fontSize.sm,
      textAlign: 'center',
      marginTop: spacing.md,
    },
    muted: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20 },
    spacer: { height: spacing.md },
    errorCard: { borderColor: colors.danger, backgroundColor: colors.dangerSoft, marginTop: spacing.md },
    errorText: { color: colors.danger, fontSize: fontSize.sm, lineHeight: 20, fontWeight: fontWeight.medium },
  });
}
