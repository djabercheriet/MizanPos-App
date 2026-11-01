import React, { useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { fontSize, fontWeight, radius, spacing, type ThemeColors } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import type { ConnectionStatus } from '../transport/gateway-client';

type Tone = 'ok' | 'warn' | 'bad' | 'neutral';

/** Maps a transport status onto the shared badge tones. */
export function toneForStatus(status: ConnectionStatus): Tone {
  switch (status) {
    case 'connected':
      return 'ok';
    case 'connecting':
    case 'authenticating':
    case 'pairing':
    case 'awaiting_approval':
    case 'reconnecting':
      return 'warn';
    case 'revoked':
    case 'error':
      return 'bad';
    default:
      return 'neutral';
  }
}

/**
 * Status badge / connection indicator: a tone-coloured dot with a label, used
 * in headers and on the terminal card.
 */
export function StatusPill({
  label,
  tone,
  style,
}: {
  label: string;
  tone: Tone;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const palette = useMemo(() => tonePalette(colors)[tone], [colors, tone]);

  return (
    <View style={[styles.pill, { backgroundColor: palette.background }, style]}>
      <View style={[styles.dot, { backgroundColor: palette.dot }]} />
      <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

/** Bare connection dot, for compact placements such as the tab bar. */
export function ConnectionDot({ tone, style }: { tone: Tone; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const palette = useMemo(() => tonePalette(colors)[tone], [colors, tone]);

  return <View style={[styles.dot, { backgroundColor: palette.dot }, style]} />;
}

function tonePalette(colors: ThemeColors): Record<Tone, { background: string; text: string; dot: string }> {
  return {
    ok: { background: colors.accentSoft, text: colors.accent, dot: colors.accent },
    warn: { background: colors.warningSoft, text: colors.warning, dot: colors.warning },
    bad: { background: colors.dangerSoft, text: colors.danger, dot: colors.danger },
    neutral: { background: colors.surfaceAlt, text: colors.textMuted, dot: colors.textFaint },
  };
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      paddingVertical: spacing.xs + 1,
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      columnGap: spacing.sm,
    },
    dot: { width: 7, height: 7, borderRadius: 4 },
    label: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  });
}
