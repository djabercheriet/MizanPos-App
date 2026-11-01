/**
 * Devices — the paired terminal and the connection controls.
 *
 * This destination reuses the pairing/terminal presentation that previously
 * lived on the settings screen: same state, same handlers, same cards. Nothing
 * about the pairing protocol or the transport changes here.
 */

import React, { useMemo } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button } from '../components/Button';
import { Card, InfoRow } from '../components/Card';
import { ScreenShell } from '../components/ScreenShell';
import { Divider } from '../components/Section';
import { StatusPill, toneForStatus } from '../components/StatusPill';
import { useApp } from '../state/AppContext';
import { fontSize, fontWeight, spacing, type ThemeColors } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

export function DevicesScreen(): React.JSX.Element {
  const { t, navigate, pairing, status, reconnect, disconnect, isConnected } = useApp();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const confirmDisconnect = () => {
    Alert.alert(t('settings.disconnect'), t('settings.disconnectConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.disconnect'), style: 'destructive', onPress: () => void disconnect() },
    ]);
  };

  return (
    <ScreenShell
      title={t('devices.title')}
      subtitle={t('devices.subtitle')}
      right={<StatusPill label={t(`scanner.status.${status.status}` as 'scanner.status.idle')} tone={toneForStatus(status.status)} />}
      scroll
      bottomInset={false}
    >
      {status.status === 'revoked' ? (
        <Card style={styles.revokedCard}>
          <Text style={styles.revokedText}>{t('settings.revokedBody')}</Text>
        </Card>
      ) : null}

      <Card title={t('settings.terminal')}>
        {pairing ? (
          <>
            <InfoRow label={t('settings.deviceName')} value={status.desktopName || '—'} />
            <InfoRow label={t('settings.address')} value={`${pairing.host}:${pairing.port}`} />
            <InfoRow label={t('settings.fingerprint')} value={pairing.fingerprint} />
            <InfoRow label={t('settings.pairedAt')} value={new Date(pairing.pairedAt).toLocaleString()} />
            <Divider style={styles.divider} />
            <InfoRow label={t('settings.version')} value={pairing.deviceId.slice(0, 14)} />
          </>
        ) : (
          <>
            <Text style={styles.muted}>{t('welcome.notPaired')}</Text>
            <Text style={styles.body}>{t('devices.notPairedBody')}</Text>
            <Button
              label={t('welcome.pairButton')}
              onPress={() => navigate('pair')}
              size="lg"
              style={styles.cardAction}
            />
          </>
        )}
      </Card>

      <Card title={t('settings.connection')}>
        <View style={styles.statusRow}>
          <StatusPill label={t(`scanner.status.${status.status}` as 'scanner.status.idle')} tone={toneForStatus(status.status)} />
        </View>
        <Button
          label={t('settings.reconnect')}
          variant="secondary"
          disabled={!pairing || isConnected}
          onPress={() => void reconnect()}
          style={styles.cardAction}
        />
        <Button
          label={t('settings.repair')}
          variant="secondary"
          onPress={() => navigate('pair')}
          style={styles.cardAction}
        />
        <Button
          label={t('settings.disconnect')}
          variant="danger"
          disabled={!pairing}
          onPress={confirmDisconnect}
          style={styles.cardAction}
        />
      </Card>

      {/* Same gating as the home card: never surface an error that the current
          connection state has already superseded. */}
      {status.lastError && !isConnected && status.status !== 'revoked' ? (
        <Card style={styles.errorCard}>
          <Text style={styles.errorTitle}>{t('welcome.lastError')}</Text>
          <Text style={styles.errorText}>{status.lastError}</Text>
        </Card>
      ) : null}
    </ScreenShell>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    muted: { color: colors.textMuted, fontSize: fontSize.sm },
    body: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20, marginTop: spacing.sm },
    statusRow: { marginBottom: spacing.sm },
    divider: { marginVertical: spacing.xs },
    cardAction: { marginTop: spacing.sm },
    revokedCard: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
    revokedText: { color: colors.danger, fontSize: fontSize.sm, lineHeight: 20 },
    errorCard: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
    errorTitle: {
      color: colors.danger,
      fontSize: fontSize.xs,
      fontWeight: fontWeight.semibold,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      marginBottom: spacing.xs,
    },
    errorText: { color: colors.danger, fontSize: fontSize.sm, lineHeight: 20 },
  });
}
