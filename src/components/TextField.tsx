/**
 * Themed single-line text input. Owns its own surface, border and placeholder
 * colours so screens never hardcode field styling.
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { fontSize, fontWeight, radius, spacing, type ThemeColors } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  /** Optional uppercase field label rendered above the input. */
  label?: string;
  /** Helper text rendered below the input. */
  hint?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

export function TextField({ label, hint, containerStyle, ...inputProps }: TextFieldProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={containerStyle}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        {...inputProps}
        placeholderTextColor={colors.textFaint}
        style={styles.input}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    label: {
      color: colors.textMuted,
      fontSize: fontSize.xs,
      fontWeight: fontWeight.semibold,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginBottom: spacing.sm,
    },
    input: {
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      color: colors.text,
      fontSize: fontSize.md,
    },
    hint: {
      color: colors.textFaint,
      fontSize: fontSize.xs,
      marginTop: spacing.sm,
    },
  });
}
