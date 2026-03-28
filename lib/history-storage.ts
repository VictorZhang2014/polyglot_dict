export type QueryHistoryTranslation = {
  targetLanguage: string;
  directTranslation: string;
};

export type QueryHistoryItem = {
  id: string;
  sourceWord: string;
  sourceLanguage: string;
  targetLanguages: string[];
  targetTranslations: QueryHistoryTranslation[];
  queriedAt: number;
};

const HISTORY_KEY = "polyglot_dict_query_history_v1";
const MAX_HISTORY = 100;

function normalizeWord(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeCode(value: string): string {
  return value.trim().toLowerCase();
}

function sanitize(raw: unknown): QueryHistoryItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item): QueryHistoryItem | null => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const value = item as Partial<QueryHistoryItem>;
      if (
        typeof value.id !== "string" ||
        typeof value.sourceWord !== "string" ||
        typeof value.sourceLanguage !== "string" ||
        !Array.isArray(value.targetLanguages) ||
        typeof value.queriedAt !== "number"
      ) {
        return null;
      }

      const targetLanguages = value.targetLanguages.filter((lang): lang is string => typeof lang === "string");
      const targetTranslations = Array.isArray(value.targetTranslations)
        ? value.targetTranslations
            .map((entry): QueryHistoryTranslation | null => {
              if (!entry || typeof entry !== "object") {
                return null;
              }

              const candidate = entry as Partial<QueryHistoryTranslation>;
              if (typeof candidate.targetLanguage !== "string" || typeof candidate.directTranslation !== "string") {
                return null;
              }

              return {
                targetLanguage: candidate.targetLanguage,
                directTranslation: candidate.directTranslation
              };
            })
            .filter((entry): entry is QueryHistoryTranslation => entry !== null)
        : [];

      return {
        id: value.id,
        sourceWord: value.sourceWord,
        sourceLanguage: value.sourceLanguage,
        targetLanguages,
        targetTranslations,
        queriedAt: value.queriedAt
      };
    })
    .filter((item): item is QueryHistoryItem => item !== null);
}

export function readQueryHistory(): QueryHistoryItem[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(HISTORY_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return sanitize(parsed).sort((a, b) => b.queriedAt - a.queriedAt);
  } catch {
    return [];
  }
}

export function writeQueryHistory(items: QueryHistoryItem[]): void {
  if (typeof window === "undefined") {
    return;
  }

  const next = sanitize(items)
    .sort((a, b) => b.queriedAt - a.queriedAt)
    .slice(0, MAX_HISTORY);
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
}

export function addQueryHistory(item: Omit<QueryHistoryItem, "id" | "queriedAt">): void {
  const existing = readQueryHistory();
  const isDuplicate = existing.some(
    (historyItem) =>
      normalizeWord(historyItem.sourceWord) === normalizeWord(item.sourceWord) &&
      normalizeCode(historyItem.sourceLanguage) === normalizeCode(item.sourceLanguage)
  );

  if (isDuplicate) {
    return;
  }

  const now = Date.now();
  const nextItem: QueryHistoryItem = {
    id: `${item.sourceLanguage}:${item.sourceWord}:${now}`,
    queriedAt: now,
    ...item
  };

  writeQueryHistory([nextItem, ...existing]);
}

export function clearQueryHistory(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(HISTORY_KEY);
}
