/**
 * Bottom-sheet modal shell. Provides the shared overlay, rounded sheet surface
 * and header so screens only supply their form controls.
 */

import React, { useMemo } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, View } from 'react-native';

import { fontSize, fontWeight, radius, spacing, type ThemeColors } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from './Icon';
import { IconButton } from './IconButton';

interface ModalSheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** When supplied, a close icon button is rendered in the sheet header. */
  closeLabel?: string;
  children: React.ReactNode;
}

export function ModalSheet({
  visible,
  title,
  onClose,
  closeLabel,
  children,
}: ModalSheetProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.root}
      >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            {closeLabel ? (
              <IconButton
                icon={<Icon name="close" size={18} color={colors.textMuted} />}
                onPress={onClose}
                accessibilityLabel={closeLabel}
                variant="plain"
              />
            ) : null}
          </View>
          <View style={styles.body}>{children}</View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      borderTopWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xl,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      columnGap: spacing.sm,
    },
    title: {
      flexShrink: 1,
      color: colors.text,
      fontSize: fontSize.lg,
      fontWeight: fontWeight.bold,
    },
    body: { rowGap: spacing.md, marginTop: spacing.xs },
  });
}
