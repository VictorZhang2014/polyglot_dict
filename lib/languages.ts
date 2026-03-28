import { LanguageOption } from "@/lib/types";

export const BUILTIN_LANGUAGES: LanguageOption[] = [
  { code: "de", name: "Deutsch (German)" },
  { code: "en", name: "English" },
  { code: "fr", name: "Français (French)" },
  { code: "zh", name: "中文 (Chinese)" },
  { code: "es", name: "Español (Spanish)" },
  { code: "it", name: "Italiano (Italian)" },
  { code: "pt", name: "Português (Portuguese)" },
  { code: "ja", name: "日本語 (Japanese)" },
  { code: "ko", name: "한국어 (Korean)" },
  { code: "ru", name: "Русский (Russian)" },
  { code: "ar", name: "العربية (Arabic)" }
];

export const DEFAULT_TARGET_LANGUAGES = ["en", "fr", "de"];

export function getLanguageName(code: string, options: LanguageOption[]): string {
  const normalized = code.trim().toLowerCase();
  return options.find((item) => item.code === normalized)?.name ?? normalized;
}
