export const SITE_NAME = "ParlerAI";
export const SITE_URL = "https://parlerai.app";
export const DEFAULT_TITLE = "AI Polyglot Dictionary & Translator";
export const DEFAULT_DESCRIPTION =
  "ParlerAI is an AI-powered multilingual dictionary and translator for looking up words, meanings, phonetics, inflections, and translations across languages.";
export const DEFAULT_KEYWORDS = [
  "AI dictionary",
  "AI translator",
  "multilingual dictionary",
  "polyglot dictionary",
  "OpenAI translator",
  "German English dictionary",
  "German French dictionary",
  "German Chinese dictionary",
  "English French dictionary",
  "English Chinese dictionary",
  "French English dictionary",
  "French German dictionary",
  "Chinese English dictionary",
  "Chinese German dictionary",
  "German dictionary",
  "French dictionary",
  "English dictionary",
  "Chinese dictionary",
  "Spanish dictionary",
  "Italian dictionary",
  "Portuguese dictionary",
  "Japanese dictionary",
  "Korean dictionary",
  "Russian dictionary",
  "Arabic dictionary",
  "word lookup",
  "phonetics",
  "plural forms",
  "language learning"
];

export function resolveCanonical(path: string): string {
  return new URL(path, SITE_URL).toString();
}
