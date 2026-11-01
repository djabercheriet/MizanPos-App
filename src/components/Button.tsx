import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { fontSize, fontWeight, radius, spacing, type ThemeColors } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'md' | 'lg';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Resolved per-scheme colours for each variant. */
function useVariantStyles(colors: ThemeColors): Record<ButtonVariant, { container: ViewStyle; label: TextStyle }> {
  return useMemo(
    () => ({
      primary: {
        container: { backgroundColor: colors.accent, borderColor: colors.accent },
        label: { color: colors.onAccent },
      },
      secondary: {
        container: { backgroundColor: colors.surfaceAlt, borderColor: colors.borderStrong },
        label: { color: colors.text },
      },
      danger: {
        container: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
        label: { color: colors.danger },
      },
      ghost: {
        container: { backgroundColor: 'transparent', borderColor: 'transparent' },
        label: { color: colors.textMuted },
      },
    }),
    [colors],
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  style,
  testID,
}: ButtonProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const variants = useVariantStyles(colors);
  const isDisabled = disabled || loading;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        size === 'lg' ? styles.lg : styles.md,
        variants[variant].container,
        pressed && !isDisabled ? styles.pressed : null,
        isDisabled ? styles.disabled : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variants[variant].label.color} />
      ) : (
        <View style={styles.content}>
          {icon ? <View style={styles.icon}>{icon}</View> : null}
          <Text style={[styles.label, size === 'lg' ? styles.labelLg : styles.labelMd, variants[variant].label]}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    base: {
      minHeight: 46,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    md: { paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
    lg: { paddingVertical: spacing.md + 2, paddingHorizontal: spacing.xl },
    pressed: { opacity: 0.82 },
    disabled: { opacity: 0.45 },
    content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    icon: { marginEnd: spacing.sm },
    label: { fontWeight: fontWeight.semibold, letterSpacing: 0.2 },
    labelMd: { fontSize: fontSize.md },
    labelLg: { fontSize: fontSize.lg },
  });
}
