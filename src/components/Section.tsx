/**
 * Structured content primitives: section headings and hairline dividers.
 *
 * `SectionHeading` is the single source of truth for the uppercase label used
 * on cards and content sections, so every screen shares one typographic rhythm.
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { fontSize, fontWeight, spacing, type ThemeColors } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

export function SectionHeading({
  label,
  style,
}: {
  label: string;
  style?: StyleProp<TextStyle>;
}): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <Text style={[styles.heading, style]}>{label}</Text>;
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <View style={[styles.divider, style]} />;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    heading: {
      color: colors.textMuted,
      fontSize: fontSize.xs,
      fontWeight: fontWeight.semibold,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginBottom: spacing.md,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
    },
  });
}
