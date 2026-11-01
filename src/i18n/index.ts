/**
 * MIZANE Mobile Scanner — i18n.
 *
 * Deliberately dependency-free: a flat key → string map per language plus a
 * `t()` lookup that falls back to English and finally to the key itself.
 * Arabic switches the UI to RTL via `isRTL`.
 */

import { ar } from './ar';
import { en, type TranslationKey, type Translations } from './en';
import { fr } from './fr';
import type { LanguageCode } from '../storage/preferences';

export type { TranslationKey } from './en';

const CATALOGUES: Record<LanguageCode, Translations> = { en, ar, fr };

export const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  en: 'English',
  ar: 'العربية',
  fr: 'Français',
};

/** True when the language is written right-to-left. */
export function isRTL(language: LanguageCode): boolean {
  return language === 'ar';
}

export interface Translator {
  language: LanguageCode;
  rtl: boolean;
  t: (key: TranslationKey) => string;
}

/** Build a translator for a language, falling back to English then the key. */
export function createTranslator(language: LanguageCode): Translator {
  const catalogue = CATALOGUES[language] ?? en;
  return {
    language,
    rtl: isRTL(language),
    t: (key: TranslationKey) => catalogue[key] ?? en[key] ?? key,
  };
}
