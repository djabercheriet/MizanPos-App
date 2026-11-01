/**
 * MIZANE Mobile Scanner — design tokens.
 *
 * Colour tokens are declared once per scheme with an identical shape
 * (`ThemeColors`). Screens and components never import a palette directly:
 * they resolve the active scheme through `useTheme()` (see `ThemeContext.tsx`)
 * so a single implementation renders correctly in Dark and Light mode.
 *
 * Spacing, radius and typography scales are scheme-independent and are
 * imported directly.
 */

export type ThemeScheme = 'dark' | 'light';

export interface ThemeColors {
  /** Screen background. */
  background: string;
  /** Raised panels: cards, tiles, sheets. */
  surface: string;
  /** Secondary surface: inputs, secondary buttons, neutral chips. */
  surfaceAlt: string;
  /** Hairline separators. */
  border: string;
  /** Emphasised borders for interactive elements. */
  borderStrong: string;
  text: string;
  /** Secondary text, hints. */
  textMuted: string;
  /** Tertiary text, timestamps, placeholders. */
  textFaint: string;
  accent: string;
  accentDark: string;
  accentSoft: string;
  /** Foreground used on top of `accent` fills. */
  onAccent: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  info: string;
  infoSoft: string;
  white: string;
  black: string;
  /** Full-screen backdrops (modals, permission screens). */
  overlay: string;
  /** Layered overlay used on top of the live camera preview. */
  scannerOverlay: string;
}

/**
 * Default scheme. Deep navy canvas, slate surfaces, emerald accent and a blue
 * information tone — the MIZANE retail identity.
 */
export const darkColors: ThemeColors = {
  background: '#0B1120',
  surface: '#1E293B',
  surfaceAlt: '#26364F',
  border: 'rgba(148, 163, 184, 0.16)',
  borderStrong: 'rgba(148, 163, 184, 0.32)',
  text: '#E8EEF9',
  textMuted: '#94A3B8',
  textFaint: '#64748B',
  accent: '#22C55E',
  accentDark: '#15803D',
  accentSoft: 'rgba(34, 197, 94, 0.14)',
  onAccent: '#04120A',
  danger: '#F05252',
  dangerSoft: 'rgba(240, 82, 82, 0.14)',
  warning: '#F0A93B',
  warningSoft: 'rgba(240, 169, 59, 0.14)',
  info: '#3B82F6',
  infoSoft: 'rgba(59, 130, 246, 0.16)',
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(3, 7, 14, 0.78)',
  scannerOverlay: 'rgba(3, 7, 14, 0.55)',
};

/**
 * Light scheme. Same token contract, re-tuned for contrast on a light canvas
 * so no screen needs a light-specific implementation.
 */
export const lightColors: ThemeColors = {
  background: '#F1F5F9',
  surface: '#FFFFFF',
  surfaceAlt: '#E8EEF6',
  border: 'rgba(15, 23, 42, 0.10)',
  borderStrong: 'rgba(15, 23, 42, 0.22)',
  text: '#0B1120',
  textMuted: '#5A6B85',
  textFaint: '#8A99B0',
  accent: '#16A34A',
  accentDark: '#15803D',
  accentSoft: 'rgba(34, 197, 94, 0.16)',
  onAccent: '#FFFFFF',
  danger: '#DC2626',
  dangerSoft: 'rgba(220, 38, 38, 0.10)',
  warning: '#B45309',
  warningSoft: 'rgba(180, 83, 9, 0.12)',
  info: '#2563EB',
  infoSoft: 'rgba(37, 99, 235, 0.10)',
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(15, 23, 42, 0.55)',
  scannerOverlay: 'rgba(15, 23, 42, 0.45)',
};

/** Base spacing scale. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Border-radius scale. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

/** Type scale. */
export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 22,
  xxl: 28,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/** Minimum touch target recommended for one-handed phone use. */
export const minTouchTarget = 44;
