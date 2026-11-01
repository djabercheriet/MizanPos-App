import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fontSize, fontWeight, minTouchTarget, radius, spacing, type ThemeColors } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

/** Compact MIZANE wordmark (no image asset required). */
export function BrandMark({ compact = false }: { compact?: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.brand}>
      <View style={[styles.brandBadge, compact ? styles.brandBadgeCompact : null]}>
        <Text style={[styles.brandLetter, compact ? styles.brandLetterCompact : null]}>M</Text>
      </View>
      <View>
        <Text style={[styles.brandName, compact ? styles.brandNameCompact : null]}>MIZANE</Text>
        {compact ? null : <Text style={styles.brandSub}>SCANNER</Text>}
      </View>
    </View>
  );
}

interface ScreenShellProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  scroll?: boolean;
  showBrand?: boolean;
  footer?: React.ReactNode;
  /**
   * Set to false when the screen is hosted by the bottom-tab shell, which owns
   * the bottom safe area itself (prevents double inset padding).
   */
  bottomInset?: boolean;
}

export function ScreenShell({
  children,
  title,
  subtitle,
  onBack,
  right,
  scroll = false,
  showBrand = false,
  footer,
  bottomInset = true,
}: ScreenShellProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Screens that draw their own header (the home hero) pass none of the header
  // props, so the empty chrome is skipped instead of reserving space.
  const hasHeader = Boolean(onBack || title || subtitle || showBrand || right);

  const header = hasHeader ? (
    <View style={styles.header}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={12} style={styles.back} accessibilityRole="button">
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
      ) : null}
      <View style={styles.headerText}>
        {showBrand ? <BrandMark compact /> : null}
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.safe} edges={bottomInset ? ['top', 'bottom'] : ['top']}>
      <View style={styles.container}>
        {header}
        {scroll ? (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        ) : (
          <View style={styles.body}>{children}</View>
        )}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
      columnGap: spacing.md,
    },
    headerText: { flex: 1 },
    back: {
      width: minTouchTarget,
      height: minTouchTarget,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
    },
    backGlyph: { color: colors.text, fontSize: 22, lineHeight: 24, marginTop: -2 },
    right: { alignItems: 'flex-end', justifyContent: 'center', minHeight: minTouchTarget },
    title: { color: colors.text, fontSize: fontSize.xl, fontWeight: fontWeight.bold, marginTop: spacing.xs },
    subtitle: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: spacing.xs, lineHeight: 19 },
    body: { flex: 1, paddingHorizontal: spacing.lg },
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, rowGap: spacing.md },
    brand: { flexDirection: 'row', alignItems: 'center', columnGap: spacing.sm },
    brandBadge: {
      width: 34,
      height: 34,
      borderRadius: radius.sm,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    brandBadgeCompact: { width: 26, height: 26, borderRadius: radius.sm - 2 },
    brandLetter: { color: colors.onAccent, fontSize: 20, fontWeight: fontWeight.bold },
    brandLetterCompact: { fontSize: 15 },
    brandName: { color: colors.text, fontSize: fontSize.lg, fontWeight: fontWeight.bold, letterSpacing: 1.6 },
    brandNameCompact: { fontSize: fontSize.md, letterSpacing: 1.2 },
    brandSub: { color: colors.accent, fontSize: fontSize.xs, fontWeight: fontWeight.semibold, letterSpacing: 3 },
    footer: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
      rowGap: spacing.sm,
    },
  });
}
