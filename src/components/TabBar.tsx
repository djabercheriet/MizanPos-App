/**
 * Bottom-tab navigation.
 *
 * Hand-rolled because the project intentionally ships no navigation library:
 * the app router is a `Route` value in `AppContext`, and this bar simply
 * switches that value. Icons are drawn with views (see `Icon`), so the bar
 * needs no icon font.
 */

import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { TranslationKey } from '../i18n';
import type { Route } from '../state/AppContext';
import { useApp } from '../state/AppContext';
import { fontSize, fontWeight, radius, spacing, type ThemeColors } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import { Icon, type IconName } from './Icon';
import { ConnectionDot, toneForStatus } from './StatusPill';

interface TabDefinition {
  route: Route;
  icon: IconName;
  labelKey: TranslationKey;
}

/** The five primary destinations, in one-handed reach order. */
const TABS: readonly TabDefinition[] = [
  { route: 'welcome', icon: 'home', labelKey: 'tabs.home' },
  { route: 'scanner', icon: 'scanner', labelKey: 'tabs.scanner' },
  { route: 'history', icon: 'history', labelKey: 'tabs.history' },
  { route: 'devices', icon: 'devices', labelKey: 'tabs.devices' },
  { route: 'settings', icon: 'settings', labelKey: 'tabs.settings' },
];

export function TabBar({
  active,
  onSelect,
}: {
  active: Route;
  onSelect: (route: Route) => void;
}): React.JSX.Element {
  const { t, status, pairing } = useApp();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <SafeAreaView edges={['bottom']} style={styles.safe}>
      <View style={styles.bar}>
        {TABS.map((tab) => {
          const selected = tab.route === active;
          const color = selected ? colors.accent : colors.textMuted;

          return (
            <Pressable
              key={tab.route}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={t(tab.labelKey)}
              onPress={() => onSelect(tab.route)}
              style={styles.item}
            >
              <View style={[styles.indicator, selected ? styles.indicatorActive : null]} />
              <View style={styles.iconWrap}>
                <Icon name={tab.icon} color={color} size={22} />
                {/* Live connection indicator for the paired-terminal tab —
                    sourced from the transport status, never a mock state. */}
                {tab.route === 'devices' && pairing ? (
                  <ConnectionDot tone={toneForStatus(status.status)} style={styles.dot} />
                ) : null}
              </View>
              <Text style={[styles.label, { color }]} numberOfLines={1}>
                {t(tab.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: {
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    bar: {
      flexDirection: 'row',
      alignItems: 'stretch',
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
    },
    item: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      rowGap: 2,
      paddingVertical: spacing.xs,
    },
    indicator: {
      position: 'absolute',
      top: -spacing.sm,
      width: 26,
      height: 3,
      borderRadius: radius.pill,
      backgroundColor: 'transparent',
    },
    indicatorActive: { backgroundColor: colors.accent },
    iconWrap: { width: 30, height: 24, alignItems: 'center', justifyContent: 'center' },
    dot: { position: 'absolute', top: 0, end: -2 },
    label: { fontSize: fontSize.xs - 1, fontWeight: fontWeight.medium },
  });
}
