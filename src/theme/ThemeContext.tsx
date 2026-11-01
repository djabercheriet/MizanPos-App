/**
 * MIZANE Mobile Scanner — theme resolution.
 *
 * `ThemeProvider` receives the scheme selected in preferences and publishes the
 * matching token set. Components read it through `useTheme()` and build their
 * stylesheet from the returned colours, so Dark and Light share one screen
 * implementation.
 */

import React, { createContext, useContext, useMemo } from 'react';

import { darkColors, lightColors, type ThemeColors, type ThemeScheme } from './theme';

export interface Theme {
  scheme: ThemeScheme;
  colors: ThemeColors;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({
  scheme,
  children,
}: {
  scheme: ThemeScheme;
  children: React.ReactNode;
}): React.JSX.Element {
  // `darkColors`/`lightColors` are module constants, so the memo value keeps a
  // stable identity per scheme and stylesheets are only rebuilt on a switch.
  const value = useMemo<Theme>(
    () => ({ scheme, colors: scheme === 'light' ? lightColors : darkColors }),
    [scheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
}
