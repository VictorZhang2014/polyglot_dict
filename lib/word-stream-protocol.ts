import type { SourceGenderHint, TranslationPayload } from "@/lib/types";

export type WordStreamInput = {
  sourceWord: string;
  sourceLanguage: string;
  targetLanguages: string[];
};

export type WordProtocolEvent =
  | { type: "corrected"; value: string }
  | { type: "pos"; value: string }
  | { type: "suggest"; value: string }
  | { type: "translation"; targetLanguage: string; value: string }
  | { type: "phonetic"; value: string }
  | { type: "lemma"; value: string }
  | { type: "plural"; value: string }
  | { type: "morph"; value: string }
  | { type: "gender"; value: SourceGenderHint }
  | { type: "similar"; targetLanguage: string; value: string }
  | { type: "done" };

const MAX_SUGGESTIONS = 5;
const MAX_SIMILAR_WORDS = 3;

function cleanValue(value: string): string {
  return value.trim().replace(/\r/g, "");
}

function parseScalarRecord(line: string, label: string): string | null {
  const match = line.match(new RegExp(`^${label}(?:\\||:)\\s*(.*)$`, "i"));
  if (!match) {
    return null;
  }

  return cleanValue(match[1] ?? "");
}

function sanitizeProtocolValue(value: string): string {
  return value.replace(/\r?\n/g, " ").replace(/\|/g, "/").trim();
}

function normalizePartOfSpeech(value: string): string {
  const normalized = value.trim().toLowerCase();
  const allowed = new Set([
    "noun",
    "verb",
    "adjective",
    "adverb",
    "pronoun",
    "preposition",
    "conjunction",
    "interjection",
    "numeral",
    "particle",
    "determiner",
    "unknown"
  ]);

  return allowed.has(normalized) ? normalized : "unknown";
}

function normalizeGender(value: string): string {
  const normalized = value.trim().toLowerCase();
  return ["masculine", "feminine", "neuter"].includes(normalized) ? normalized : "";
}

function hasTranslationTarget(payload: TranslationPayload, targetLanguage: string): boolean {
  return payload.translations.some((item) => item.targetLanguage === targetLanguage);
}

function uniqueStrings(values: string[], limit: number): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, limit);
}

export function createEmptyWordPayload(input: WordStreamInput): TranslationPayload {
  return {
    sourceWord: input.sourceWord,
    sourceLanguage: input.sourceLanguage,
    sourcePhonetic: "",
    correctedSourceWord: "",
    suggestedSourceWords: [],
    sourcePartOfSpeech: "unknown",
    sourceLemma: "",
    sourcePluralForm: "",
    sourceMorphology: "",
    sourceGenderHints: [],
    translations: input.targetLanguages.map((targetLanguage) => ({
      targetLanguage,
      directTranslation: "",
      similarWords: []
    }))
  };
}

export function parseWordProtocolLine(line: string): WordProtocolEvent | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed === "DONE") {
    return { type: "done" };
  }

  const correctedValue = parseScalarRecord(trimmed, "CORRECTED");
  if (correctedValue !== null) {
    return { type: "corrected", value: correctedValue };
  }

  const posValue = parseScalarRecord(trimmed, "POS");
  if (posValue !== null) {
    return { type: "pos", value: normalizePartOfSpeech(posValue) };
  }

  const suggestValue = parseScalarRecord(trimmed, "SUGGEST");
  if (suggestValue !== null) {
    return { type: "suggest", value: suggestValue };
  }

  const phoneticValue = parseScalarRecord(trimmed, "PHONETIC");
  if (phoneticValue !== null) {
    return { type: "phonetic", value: phoneticValue };
  }

  const lemmaValue = parseScalarRecord(trimmed, "LEMMA");
  if (lemmaValue !== null) {
    return { type: "lemma", value: lemmaValue };
  }

  const pluralValue = parseScalarRecord(trimmed, "PLURAL");
  if (pluralValue !== null) {
    return { type: "plural", value: pluralValue };
  }

  const morphValue = parseScalarRecord(trimmed, "MORPH");
  if (morphValue !== null) {
    return { type: "morph", value: morphValue };
  }

  const parts = trimmed.split("|");
  const recordType = parts[0]?.trim().toUpperCase() ?? "";

  switch (recordType) {
    case "CORRECTED":
      return { type: "corrected", value: cleanValue(parts.slice(1).join("|")) };
    case "POS":
      return { type: "pos", value: normalizePartOfSpeech(parts.slice(1).join("|")) };
    case "SUGGEST":
      return { type: "suggest", value: cleanValue(parts.slice(1).join("|")) };
    case "TRANS": {
      const targetLanguage = cleanValue(parts[1] ?? "").toLowerCase();
      if (!targetLanguage) {
        return null;
      }
      return { type: "translation", targetLanguage, value: cleanValue(parts.slice(2).join("|")) };
    }
    case "PHONETIC":
      return { type: "phonetic", value: cleanValue(parts.slice(1).join("|")) };
    case "LEMMA":
      return { type: "lemma", value: cleanValue(parts.slice(1).join("|")) };
    case "PLURAL":
      return { type: "plural", value: cleanValue(parts.slice(1).join("|")) };
    case "MORPH":
      return { type: "morph", value: cleanValue(parts.slice(1).join("|")) };
    case "GENDER": {
      const gender = normalizeGender(parts[1] ?? "");
      const article = cleanValue(parts[2] ?? "");
      const word = cleanValue(parts.slice(3).join("|"));
      if (!gender || !article || !word) {
        return null;
      }
      return {
        type: "gender",
        value: { gender, article, word }
      };
    }
    case "SIMILAR": {
      const targetLanguage = cleanValue(parts[1] ?? "").toLowerCase();
      if (!targetLanguage) {
        return null;
      }
      return { type: "similar", targetLanguage, value: cleanValue(parts.slice(2).join("|")) };
    }
    default:
      return null;
  }
}

export function applyWordProtocolEvent(payload: TranslationPayload, event: WordProtocolEvent): TranslationPayload {
  switch (event.type) {
    case "corrected":
      return {
        ...payload,
        correctedSourceWord: event.value
      };
    case "pos":
      return {
        ...payload,
        sourcePartOfSpeech: event.value
      };
    case "suggest": {
      const nextSuggested = uniqueStrings([...(payload.suggestedSourceWords ?? []), event.value], MAX_SUGGESTIONS);
      return {
        ...payload,
        suggestedSourceWords: nextSuggested
      };
    }
    case "translation":
      if (!hasTranslationTarget(payload, event.targetLanguage)) {
        return payload;
      }

      return {
        ...payload,
        translations: payload.translations.map((item) =>
          item.targetLanguage === event.targetLanguage
            ? {
                ...item,
                directTranslation: event.value
              }
            : item
        )
      };
    case "phonetic":
      return {
        ...payload,
        sourcePhonetic: event.value
      };
    case "lemma":
      return {
        ...payload,
        sourceLemma: event.value
      };
    case "plural":
      return {
        ...payload,
        sourcePluralForm: event.value
      };
    case "morph":
      return {
        ...payload,
        sourceMorphology: event.value
      };
    case "gender": {
      const hints = payload.sourceGenderHints ?? [];
      const dedupeKey = `${event.value.gender}|${event.value.article.toLowerCase()}|${event.value.word.toLowerCase()}`;
      const seen = new Set(hints.map((item) => `${item.gender}|${item.article.toLowerCase()}|${item.word.toLowerCase()}`));
      if (seen.has(dedupeKey)) {
        return payload;
      }

      return {
        ...payload,
        sourceGenderHints: [...hints, event.value].slice(0, 3)
      };
    }
    case "similar":
      if (!hasTranslationTarget(payload, event.targetLanguage)) {
        return payload;
      }

      return {
        ...payload,
        translations: payload.translations.map((item) => {
          if (item.targetLanguage !== event.targetLanguage) {
            return item;
          }

          const similarWords = uniqueStrings([...item.similarWords, event.value], MAX_SIMILAR_WORDS);
          return {
            ...item,
            similarWords
          };
        })
      };
    case "done":
      return payload;
  }
}

export function parseWordProtocolContent(content: string, input: WordStreamInput): TranslationPayload {
  return content
    .split(/\r?\n/)
    .map((line) => parseWordProtocolLine(line))
    .filter((event): event is WordProtocolEvent => Boolean(event))
    .reduce((payload, event) => applyWordProtocolEvent(payload, event), createEmptyWordPayload(input));
}

export function serializeWordTranslationPayload(payload: TranslationPayload): string {
  const lines: string[] = [
    `CORRECTED|${sanitizeProtocolValue(payload.correctedSourceWord ?? "")}`,
    `POS|${sanitizeProtocolValue(payload.sourcePartOfSpeech ?? "unknown")}`
  ];

  for (const suggestion of payload.suggestedSourceWords ?? []) {
    lines.push(`SUGGEST|${sanitizeProtocolValue(suggestion)}`);
  }

  for (const translation of payload.translations) {
    lines.push(`TRANS|${translation.targetLanguage}|${sanitizeProtocolValue(translation.directTranslation)}`);
  }

  lines.push(`PHONETIC|${sanitizeProtocolValue(payload.sourcePhonetic ?? "")}`);
  lines.push(`LEMMA|${sanitizeProtocolValue(payload.sourceLemma ?? "")}`);
  lines.push(`PLURAL|${sanitizeProtocolValue(payload.sourcePluralForm ?? "")}`);
  lines.push(`MORPH|${sanitizeProtocolValue(payload.sourceMorphology ?? "")}`);

  for (const hint of payload.sourceGenderHints ?? []) {
    lines.push(
      `GENDER|${sanitizeProtocolValue(hint.gender)}|${sanitizeProtocolValue(hint.article)}|${sanitizeProtocolValue(hint.word)}`
    );
  }

  for (const translation of payload.translations) {
    for (const word of translation.similarWords) {
      lines.push(`SIMILAR|${translation.targetLanguage}|${sanitizeProtocolValue(word)}`);
    }
  }

  lines.push("DONE");
  return `${lines.join("\n")}\n`;
}
