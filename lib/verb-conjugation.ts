import type { I18nKey } from "@/lib/i18n";
import {
  FRENCH_CONJUGATION_MOOD_LABEL_KEYS,
  FRENCH_CONJUGATION_TENSE_LABEL_KEYS
} from "@/lib/lang-conjugation/french-conjugation";
import {
  GERMAN_CONJUGATION_MOOD_LABEL_KEYS,
  GERMAN_CONJUGATION_TENSE_LABEL_KEYS
} from "@/lib/lang-conjugation/german-conjugation";
import {
  SPANISH_CONJUGATION_MOOD_LABEL_KEYS,
  SPANISH_CONJUGATION_TENSE_LABEL_KEYS
} from "@/lib/lang-conjugation/spanish-conjugation";
import type { SupportedConjugationLanguage } from "@/lib/lang-conjugation/types";

export const VERB_CONJUGATION_SUPPORTED_SOURCE_LANGUAGES = ["de", "fr", "es"] as const;

export function supportsVerbConjugationLanguage(code: string): code is SupportedConjugationLanguage {
  return VERB_CONJUGATION_SUPPORTED_SOURCE_LANGUAGES.includes(code.trim().toLowerCase() as SupportedConjugationLanguage);
}

export function getConjugationMoodLabelKeys(language: SupportedConjugationLanguage): Record<string, I18nKey> {
  switch (language) {
    case "de":
      return GERMAN_CONJUGATION_MOOD_LABEL_KEYS as Record<string, I18nKey>;
    case "es":
      return SPANISH_CONJUGATION_MOOD_LABEL_KEYS as Record<string, I18nKey>;
    case "fr":
    default:
      return FRENCH_CONJUGATION_MOOD_LABEL_KEYS as Record<string, I18nKey>;
  }
}

export function getConjugationTenseLabelKeys(language: SupportedConjugationLanguage): Record<string, I18nKey> {
  switch (language) {
    case "de":
      return GERMAN_CONJUGATION_TENSE_LABEL_KEYS as Record<string, I18nKey>;
    case "es":
      return SPANISH_CONJUGATION_TENSE_LABEL_KEYS as Record<string, I18nKey>;
    case "fr":
    default:
      return FRENCH_CONJUGATION_TENSE_LABEL_KEYS as Record<string, I18nKey>;
  }
}
