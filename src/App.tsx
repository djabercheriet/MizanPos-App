import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { TabBar } from './components/TabBar';
import { AppProvider, useApp, type Route } from './state/AppContext';
import { DevicesScreen } from './screens/DevicesScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { PairScreen } from './screens/PairScreen';
import { PairingPendingScreen } from './screens/PairingPendingScreen';
import { ScannerScreen } from './screens/ScannerScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { type ThemeColors } from './theme/theme';
import { ThemeProvider, useTheme } from './theme/ThemeContext';

/** Destinations hosted inside the bottom-tab shell. */
const TAB_ROUTES: readonly Route[] = ['welcome', 'scanner', 'history', 'devices', 'settings'];

function screenFor(route: Route): React.JSX.Element {
  switch (route) {
    case 'pair':
      return <PairScreen />;
    case 'pending':
      return <PairingPendingScreen />;
    case 'scanner':
      return <ScannerScreen />;
    case 'history':
      return <HistoryScreen />;
    case 'devices':
      return <DevicesScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'welcome':
    default:
      return <WelcomeScreen />;
  }
}

function Router(): React.JSX.Element {
  const { ready, route, navigate } = useApp();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  // Pairing is a full-screen flow: it deliberately covers the tab bar so the
  // camera and the approval request own the whole viewport.
  if (!TAB_ROUTES.includes(route)) return screenFor(route);

  return (
    <View style={styles.shell}>
      <View style={styles.body}>{screenFor(route)}</View>
      <TabBar active={route} onSelect={navigate} />
    </View>
  );
}

/** Resolves the persisted scheme into the theme every screen consumes. */
function ThemedRoot(): React.JSX.Element {
  const { theme } = useApp();

  return (
    <ThemeProvider scheme={theme}>
      <StatusBar style={theme === 'light' ? 'dark' : 'light'} />
      <Router />
    </ThemeProvider>
  );
}

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <ThemedRoot />
      </AppProvider>
    </SafeAreaProvider>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    loading: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    shell: { flex: 1, backgroundColor: colors.background },
    body: { flex: 1 },
  });
}
