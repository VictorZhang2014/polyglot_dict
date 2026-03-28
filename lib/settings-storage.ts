import { BUILTIN_LANGUAGES, DEFAULT_TARGET_LANGUAGES } from "@/lib/languages";
import { AppSettings, LanguageOption } from "@/lib/types";

const SETTINGS_KEY = "polyglot_dict_settings_v1";
export const SETTINGS_CHANGED_EVENT = "polyglot_dict_settings_changed";
const BUILTIN_CODE_SET = new Set(BUILTIN_LANGUAGES.map((item) => item.code));

export const DEFAULT_SETTINGS: AppSettings = {
  targetLanguages: DEFAULT_TARGET_LANGUAGES,
  customLanguages: [],
  uiLanguage: DEFAULT_TARGET_LANGUAGES[0] ?? "en"
};

function normalizeCode(code: string): string {
  return code.trim().toLowerCase();
}

function uniqueCodes(codes: string[]): string[] {
  return Array.from(new Set(codes.map(normalizeCode))).filter(Boolean);
}

function normalizeLanguages(items: LanguageOption[]): LanguageOption[] {
  const dedup = new Map<string, LanguageOption>();

  for (const item of items) {
    const code = normalizeCode(item.code);
    const name = item.name.trim();
    if (!code || !name) {
      continue;
    }

    if (!dedup.has(code)) {
      dedup.set(code, { code, name });
    }
  }

  return Array.from(dedup.values());
}

function sanitize(raw: unknown): AppSettings {
  if (!raw || typeof raw !== "object") {
    return DEFAULT_SETTINGS;
  }

  const value = raw as Partial<AppSettings>;

  const targetLanguages = uniqueCodes(
    Array.isArray(value.targetLanguages) ? value.targetLanguages : DEFAULT_TARGET_LANGUAGES
  );

  const customLanguages = normalizeLanguages(
    Array.isArray(value.customLanguages) ? value.customLanguages : []
  );
  const normalizedTargets = targetLanguages.length > 0 ? targetLanguages : DEFAULT_TARGET_LANGUAGES;
  const candidateUiLanguage = typeof value.uiLanguage === "string" ? normalizeCode(value.uiLanguage) : "";
  const uiLanguage = BUILTIN_CODE_SET.has(candidateUiLanguage) ? candidateUiLanguage : DEFAULT_SETTINGS.uiLanguage;

  return {
    targetLanguages: normalizedTargets,
    customLanguages,
    uiLanguage
  };
}

export function readSettings(): AppSettings {
  if (typeof window === "undefined") {
    return DEFAULT_SETTINGS;
  }

  const raw = window.localStorage.getItem(SETTINGS_KEY);
  if (!raw) {
    return DEFAULT_SETTINGS;
  }

  try {
    return sanitize(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function writeSettings(settings: AppSettings): AppSettings {
  const clean = sanitize(settings);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(clean));
    window.dispatchEvent(new CustomEvent(SETTINGS_CHANGED_EVENT, { detail: clean }));
  }

  return clean;
}

export function getAllLanguageOptions(customLanguages: LanguageOption[]): LanguageOption[] {
  const merged = [...BUILTIN_LANGUAGES, ...customLanguages];
  const dedup = new Map<string, LanguageOption>();

  for (const item of merged) {
    if (!dedup.has(item.code)) {
      dedup.set(item.code, item);
    }
  }

  return Array.from(dedup.values());
}
