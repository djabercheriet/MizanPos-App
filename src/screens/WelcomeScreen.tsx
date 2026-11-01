import React, { useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { Button } from '../components/Button';
import { Card, InfoRow } from '../components/Card';
import { BrandMark, ScreenShell } from '../components/ScreenShell';
import { Divider } from '../components/Section';
import { StatusPill, toneForStatus } from '../components/StatusPill';
import type { TranslationKey } from '../i18n';
import { useApp } from '../state/AppContext';
import { fontSize, fontWeight, radius, spacing, type ThemeColors } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

/** Static barcode motif drawn with plain views — no image or glyph dependency. */
const MOTIF_BARS = [5, 2, 8, 2, 5, 8, 2, 5, 8, 2, 5];

/** Tablet / landscape breakpoint; phones always fill the viewport. */
const WIDE_BREAKPOINT = 720;

export function WelcomeScreen(): React.JSX.Element {
  const { t, status, pairing, transportAvailable, navigate, isConnected } = useApp();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;

  // `idle` is meaningless to a user who has never paired, so the label falls
  // back to the description of the state they are actually in.
  const statusLabel =
    status.status === 'idle' && !pairing
      ? t('welcome.notPaired')
      : t(`scanner.status.${status.status}` as 'scanner.status.idle');

  /** One short guidance line per real connection state — never a parallel one. */
  const hintKey = useMemo<TranslationKey>(() => {
    switch (status.status) {
      case 'connected':
        return 'welcome.hint.connected';
      case 'connecting':
      case 'authenticating':
        return 'welcome.hint.connecting';
      case 'pairing':
      case 'awaiting_approval':
        return 'welcome.hint.awaitingApproval';
      case 'reconnecting':
        return 'welcome.hint.reconnecting';
      case 'revoked':
        return 'settings.revokedBody';
      case 'error':
        return 'welcome.hint.error';
      default:
        return pairing ? 'welcome.hint.disconnected' : 'welcome.hint.notPaired';
    }
  }, [status.status, pairing]);

  const terminalName = status.desktopName || pairing?.host || '';

  return (
    <ScreenShell scroll bottomInset={false}>
      <View style={[styles.content, wide ? styles.contentWide : null]}>
        {/* 1 — Brand mark, title and compact subtitle */}
        <View style={styles.hero}>
          <View style={styles.brandChip}>
            <BrandMark />
          </View>
          <Text style={styles.heroTitle}>{t('welcome.title')}</Text>
          <Text style={styles.heroSubtitle}>{t('app.tagline')}</Text>
        </View>

        {!transportAvailable ? (
          <Card style={styles.warningCard}>
            <Text style={styles.warningText}>{t('welcome.transportMissing')}</Text>
          </Card>
        ) : null}

        {/* 2 — Live connection state and paired terminal */}
        <Card title={t('settings.connection')}>
          <StatusPill label={statusLabel} tone={toneForStatus(status.status)} />
          <Text style={styles.hint}>{t(hintKey)}</Text>

          {pairing ? (
            <>
              <Divider style={styles.divider} />
              <InfoRow label={t('settings.deviceName')} value={terminalName} />
              <InfoRow label={t('settings.address')} value={`${pairing.host}:${pairing.port}`} />
              <InfoRow label={t('settings.fingerprint')} value={`${pairing.fingerprint.slice(0, 16)}…`} />
            </>
          ) : null}
        </Card>

        {/* 3 — Main action area */}
        <View style={[styles.action, wide ? styles.actionWide : null]}>
          <View style={styles.motif}>
            <View style={styles.barcode} pointerEvents="none">
              {MOTIF_BARS.map((barWidth, index) => (
                <View key={index} style={[styles.bar, { width: barWidth }]} />
              ))}
            </View>
            <View style={styles.scanLine} pointerEvents="none" />
          </View>

          {pairing ? (
            <>
              <Text style={styles.actionLabel}>{t('welcome.pairedTo')}</Text>
              <Text style={styles.actionTerminal} numberOfLines={1}>
                {terminalName}
              </Text>
            </>
          ) : (
            <Text style={styles.actionGuide}>{t('pair.instruction')}</Text>
          )}

          <Button
            label={pairing ? t('welcome.startScanning') : t('welcome.pairButton')}
            onPress={() => navigate(pairing ? 'scanner' : 'pair')}
            size="lg"
            style={styles.cta}
          />
        </View>

        {/* Only surfaced while the link is not healthy: a stale error from an
            already recovered session would contradict the state shown above.
            Revoked is explained by the connection hint itself. */}
        {status.lastError && !isConnected && status.status !== 'revoked' ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorTitle}>{t('welcome.lastError')}</Text>
            <Text style={styles.errorText}>{status.lastError}</Text>
          </Card>
        ) : null}
      </View>
    </ScreenShell>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    content: { rowGap: spacing.md, paddingTop: spacing.xs },
    contentWide: { width: '100%', maxWidth: 560, alignSelf: 'center' },

    hero: { alignItems: 'center', rowGap: spacing.sm, paddingTop: spacing.xs, paddingBottom: spacing.xs },
    brandChip: {
      alignSelf: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 2,
      borderRadius: radius.pill,
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accent,
    },
    heroTitle: {
      color: colors.text,
      fontSize: fontSize.xl,
      fontWeight: fontWeight.bold,
      letterSpacing: 0.2,
      textAlign: 'center',
    },
    heroSubtitle: {
      color: colors.textMuted,
      fontSize: fontSize.sm,
      lineHeight: 19,
      textAlign: 'center',
      maxWidth: 320,
    },

    hint: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 19, marginTop: spacing.sm },
    divider: { marginVertical: spacing.xs },

    action: {
      alignItems: 'center',
      rowGap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
    },
    actionWide: { paddingVertical: spacing.xl },
    motif: {
      width: 96,
      height: 96,
      borderRadius: radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      marginBottom: spacing.xs,
    },
    barcode: { flexDirection: 'row', alignItems: 'center', columnGap: 3 },
    bar: { height: 30, borderRadius: 1, backgroundColor: colors.accent, opacity: 0.9 },
    scanLine: {
      position: 'absolute',
      start: spacing.md,
      end: spacing.md,
      height: 2,
      borderRadius: 2,
      backgroundColor: colors.info,
      opacity: 0.9,
    },
    actionLabel: {
      color: colors.textMuted,
      fontSize: fontSize.xs,
      fontWeight: fontWeight.semibold,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
    },
    actionTerminal: {
      color: colors.text,
      fontSize: fontSize.lg,
      fontWeight: fontWeight.semibold,
      textAlign: 'center',
    },
    actionGuide: {
      color: colors.textMuted,
      fontSize: fontSize.sm,
      lineHeight: 19,
      textAlign: 'center',
      maxWidth: 320,
    },
    cta: { alignSelf: 'stretch', marginTop: spacing.xs },

    warningCard: { backgroundColor: colors.warningSoft, borderColor: colors.warning },
    warningText: { color: colors.warning, fontSize: fontSize.sm, lineHeight: 20 },
    errorCard: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
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
