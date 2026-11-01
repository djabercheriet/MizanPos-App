/**
 * Square icon-only button with a guaranteed 44pt touch target, used for
 * one-handed controls (torch, sheet close).
 */

import React, { useMemo } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { minTouchTarget, radius, type ThemeColors } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

export type IconButtonVariant = 'surface' | 'overlay' | 'plain';

interface IconButtonProps {
  /** The icon node to render (an `<Icon />` or a text glyph). */
  icon: React.ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  variant?: IconButtonVariant;
  disabled?: boolean;
  /** Highlights the button for a latched control such as the torch. */
  active?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  variant = 'surface',
  disabled = false,
  active = false,
  style,
}: IconButtonProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, selected: active }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        active ? styles.active : null,
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      {icon}
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    base: {
      width: minTouchTarget,
      height: minTouchTarget,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    surface: {
      backgroundColor: colors.surfaceAlt,
      borderColor: colors.border,
    },
    overlay: {
      backgroundColor: colors.overlay,
      borderColor: colors.borderStrong,
    },
    plain: {
      backgroundColor: 'transparent',
      borderColor: 'transparent',
    },
    active: {
      backgroundColor: colors.accentSoft,
      borderColor: colors.accent,
    },
    pressed: { opacity: 0.8 },
    disabled: { opacity: 0.45 },
  });
}
