import React, { useMemo } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';

import { Button } from '../components/Button';
import { ScreenShell } from '../components/ScreenShell';
import type { TranslationKey } from '../i18n';
import type { ScanOutcome } from '../protocol/scan-protocol';
import { useApp } from '../state/AppContext';
import type { ScanHistoryEntry } from '../storage/history';
import { fontSize, fontWeight, radius, spacing, type ThemeColors } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

function formatTime(epochMs: number): string {
  const date = new Date(epochMs);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/** Wording for the POS outcome — reused from the scanner so the two agree. */
const OUTCOME_LABEL: Record<ScanOutcome, TranslationKey> = {
  added: 'scanner.added',
  quantity: 'scanner.quantity',
  unknown_product: 'scanner.unknown',
  expired: 'scanner.expired',
  ignored: 'scanner.ignored',
};

export function HistoryScreen(): React.JSX.Element {
  const { t, history, clearScanHistory } = useApp();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Resolved per scheme: the tones follow the active palette instead of being
  // frozen against one set of colours at module load.
  const statusTone = useMemo<Record<ScanHistoryEntry['status'], string>>(
    () => ({
      acked: colors.accent,
      duplicate: colors.warning,
      failed: colors.danger,
    }),
    [colors],
  );

  const outcomeTone = useMemo<Record<ScanOutcome, string>>(
    () => ({
      added: colors.accent,
      quantity: colors.accent,
      unknown_product: colors.warning,
      expired: colors.warning,
      ignored: colors.textMuted,
    }),
    [colors],
  );

  const confirmClear = () => {
    Alert.alert(t('history.clear'), t('history.clearConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.clear'), style: 'destructive', onPress: () => void clearScanHistory() },
    ]);
  };

  return (
    <ScreenShell
      title={t('history.title')}
      bottomInset={false}
      footer={
        history.length > 0 ? (
          <>
            <Text style={styles.note}>{t('history.note')}</Text>
            <Button label={t('history.clear')} variant="danger" onPress={confirmClear} />
          </>
        ) : undefined
      }
    >
      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        contentContainerStyle={history.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={<Text style={styles.empty}>{t('history.empty')}</Text>}
        renderItem={({ item }) => {
          // The POS outcome, when the desktop reported one, is the real result;
          // the transport status is only a fallback while it is still pending.
          const tone = item.outcome ? outcomeTone[item.outcome] : statusTone[item.status];
          const label = item.outcome
            ? t(OUTCOME_LABEL[item.outcome])
            : t(`history.status.${item.status}` as 'history.status.acked');
          return (
            <View style={styles.row}>
              <View style={[styles.statusBar, { backgroundColor: tone }]} />
              <View style={styles.rowBody}>
                <Text style={styles.code} numberOfLines={1}>
                  {item.code}
                </Text>
                <Text style={[styles.status, { color: tone }]}>
                  {label}
                  {item.format ? ` · ${item.format}` : ''}
                </Text>
              </View>
              <Text style={styles.time}>{formatTime(item.capturedAt)}</Text>
            </View>
          );
        }}
      />
    </ScreenShell>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    listContent: { paddingBottom: spacing.xl, rowGap: spacing.sm },
    emptyContainer: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
    empty: { color: colors.textMuted, fontSize: fontSize.sm },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    statusBar: { width: 4, alignSelf: 'stretch' },
    rowBody: { flex: 1, paddingVertical: spacing.md, paddingHorizontal: spacing.md },
    code: { color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.semibold, letterSpacing: 0.6 },
    status: { fontSize: fontSize.xs, marginTop: 2 },
    time: { color: colors.textFaint, fontSize: fontSize.xs, paddingHorizontal: spacing.md },
    note: { color: colors.textFaint, fontSize: fontSize.xs, textAlign: 'center' },
  });
}
