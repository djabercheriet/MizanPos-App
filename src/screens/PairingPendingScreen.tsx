import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '../components/Button';
import { Card, InfoRow } from '../components/Card';
import { ScreenShell } from '../components/ScreenShell';
import { useApp } from '../state/AppContext';
import { spacing, type ThemeColors } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

function formatRemaining(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function PairingPendingScreen(): React.JSX.Element {
  const { t, pendingApproval, cancelPairing } = useApp();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const remaining = useMemo(
    () => (pendingApproval ? Math.max(0, pendingApproval.expiresAt - now) : 0),
    [pendingApproval, now],
  );

  return (
    <ScreenShell
      title={t('pending.title')}
      subtitle={t('pending.body')}
      footer={<Button label={t('pending.cancel')} variant="secondary" onPress={() => void cancelPairing()} />}
    >
      <View style={styles.spinnerRow}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>

      <Card title={t('settings.terminal')}>
        <InfoRow label={t('settings.deviceName')} value={pendingApproval?.deviceName ?? '—'} />
        <InfoRow
          label={t('settings.address')}
          value={pendingApproval ? `${pendingApproval.host}:${pendingApproval.port}` : '—'}
        />
        <InfoRow label={t('pending.expires')} value={formatRemaining(remaining)} />
      </Card>
    </ScreenShell>
  );
}

function createStyles(_colors: ThemeColors) {
  return StyleSheet.create({
    spinnerRow: { alignItems: 'center', paddingVertical: spacing.xl },
  });
}
