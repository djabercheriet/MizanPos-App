/**
 * MIZANE Mobile Scanner — user preferences (non-sensitive).
 *
 * Stored in AsyncStorage because none of it is secret. Language, feedback
 * toggles and history size only.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ThemeScheme } from '../theme/theme';

const KEY_PREFERENCES = 'mizane.preferences.v1';

export type LanguageCode = 'en' | 'ar' | 'fr';

export interface Preferences {
  /** UI language. Defaults to the device locale when supported. */
  language: LanguageCode;
  /** Colour scheme. Defaults to the MIZANE dark identity. */
  theme: ThemeScheme;
  /** Vibrate on a successful scan. */
  hapticsEnabled: boolean;
  /** Play a short confirmation beep on a successful scan. */
  soundEnabled: boolean;
  /** Keep the screen awake while the scanner is visible. */
  keepAwake: boolean;
  /** Start the camera with the torch on. */
  torchDefault: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  language: 'en',
  theme: 'dark',
  hapticsEnabled: true,
  soundEnabled: true,
  keepAwake: true,
  torchDefault: false,
};

const LANGUAGES: readonly LanguageCode[] = ['en', 'ar', 'fr'];

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/** Pick the best supported language for a raw device locale (e.g. `ar-DZ`). */
export function resolveLanguage(locale: string | null | undefined): LanguageCode | null {
  if (!locale) return null;
  const base = locale.split(/[-_]/)[0]?.toLowerCase();
  return isLanguageCode(base) ? base : null;
}

export async function loadPreferences(): Promise<Preferences> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFERENCES);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      language: isLanguageCode(parsed.language) ? parsed.language : DEFAULT_PREFERENCES.language,
      theme: parsed.theme === 'light' ? 'light' : DEFAULT_PREFERENCES.theme,
      hapticsEnabled: parsed.hapticsEnabled !== false,
      soundEnabled: parsed.soundEnabled !== false,
      keepAwake: parsed.keepAwake !== false,
      torchDefault: parsed.torchDefault === true,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export async function savePreferences(preferences: Preferences): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_PREFERENCES, JSON.stringify(preferences));
  } catch {
    // ignore — preferences are non-critical
  }
}
