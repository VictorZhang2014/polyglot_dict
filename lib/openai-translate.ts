import {
  SourceGenderHint,
  TextTranslationPayload,
  TranslationItem,
  TranslationPayload
} from "@/lib/types";
import { getLanguageWordGuardrail } from "@/lib/language-guardrails";
import { createOpenAIClient } from "@/lib/openai-client";

type TranslateInput = {
  sourceWord: string;
  sourceLanguage: string;
  targetLanguages: string[];
};

type TranslateTextInput = {
  sourceText: string;
  sourceLanguage: string;
  targetLanguages: string[];
};

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
const OPENAI_API_BASE_URL = process.env.OPENAI_API_BASE_URL ?? "https://api.openai.com/v1/chat/completions";
const OPENAI_MAX_TOKENS = Number.parseInt(process.env.OPENAI_MAX_TOKENS ?? "320", 10);
const OPENAI_TEXT_MAX_TOKENS = Number.parseInt(process.env.OPENAI_TEXT_MAX_TOKENS ?? "520", 10);
const OPENAI_TIMEOUT_MS = Number.parseInt(process.env.OPENAI_TIMEOUT_MS ?? "12000", 10);
const OPENAI_TOTAL_TIMEOUT_MS = Number.parseInt(process.env.OPENAI_TOTAL_TIMEOUT_MS ?? "10000", 10);
const OPENAI_FOLLOWUP_MIN_BUDGET_MS = Number.parseInt(process.env.OPENAI_FOLLOWUP_MIN_BUDGET_MS ?? "2500", 10);
const GENDERED_LANGUAGE_CODES = new Set(["de", "fr", "es", "it", "pt", "ru", "ar"]);
const WORD_TARGET_SIMILAR_LIMIT = 3;
const WORD_SYSTEM_PROMPT = "You are a multilingual dictionary assistant. Return strict JSON only.";
const WORD_PROMPT_RESPONSE_SCHEMA = `Return exactly one JSON object with this schema (no markdown, no code fences, no extra text):
{
  "sourcePhonetic": string,
  "correctedSourceWord": string,
  "suggestedSourceWords": [string],
  "sourcePartOfSpeech": "noun" | "verb" | "adjective" | "adverb" | "pronoun" | "preposition" | "conjunction" | "interjection" | "numeral" | "particle" | "determiner" | "unknown",
  "sourceLemma": string,
  "sourcePluralForm": string,
  "sourceMorphology": string,
  "sourceGenderHints": [{ "gender": "masculine" | "feminine" | "neuter", "article": string, "word": string }],
  "translations": [
    {
      "targetLanguage": string,
      "directTranslation": string,
      "similarWords": [string]
    }
  ]
}`;
const WORD_PROMPT_RULES = `Rules:
- Analyze the source token strictly within the provided source language only; ignore homographs from other languages.
- Example: when source language is de, token "die" is a determiner/article, not an English verb.
- If the input spelling is wrong, interpret and translate the corrected word, and ensure all metadata refers to that corrected word.
- If you are not confident what the intended source word is, keep translations empty, keep correctedSourceWord empty, and return 3-5 likely source-language candidates in suggestedSourceWords.
- sourcePhonetic must match the final valid source word: if correctedSourceWord is non-empty, sourcePhonetic must be for correctedSourceWord; otherwise it must be for the original input.
- sourceLemma should be dictionary base form; if input is inflected, return lemma.
- sourcePluralForm must be the noun plural form when sourcePartOfSpeech is noun; otherwise keep it empty.
- If correctedSourceWord is non-empty, sourceLemma and sourcePluralForm must also refer to the corrected word.
- correctedSourceWord should be empty if input spelling is already correct.
- sourceMorphology should briefly describe inflection/morphology; if none, keep empty.
- sourceGenderHints must be empty unless sourcePartOfSpeech is noun and source language has grammatical gender.
- translations must keep the same order as target language codes.
- Every directTranslation and every similarWords entry must be a valid lexical item in its target language only.
- Never copy source-language words, source lemmas, or source plural forms into another target language unless that spelling is genuinely standard in the target language.
- Return 1 reliable directTranslation and up to 3 reliable similarWords for each target language.
- If you are unsure, prefer fewer items instead of guessing or mixing languages.
- similarWords must not duplicate directTranslation.`;
const WORD_RETRY_RULES = `- Ensure sourcePhonetic matches the final valid source word after any spelling correction.
- Ensure noun entries include sourcePluralForm, and it refers to the final valid source word after any spelling correction.
- If the intended word is still uncertain, return 3-5 candidates in suggestedSourceWords instead of guessing translations.
- Reject cross-language leakage in directTranslation and similarWords.
- Validate part-of-speech and lemma strictly in the source language context.
- Return valid JSON only.`;
const WORD_SUGGEST_SYSTEM_PROMPT = "You suggest likely intended source words for misspelled input. Return strict JSON only.";
const WORD_SUGGEST_RESPONSE_SCHEMA = `Return exactly one JSON object with this schema (no markdown, no code fences, no extra text):
{
  "suggestedSourceWords": [string]
}`;
const WORD_SUGGEST_RULES = `Rules:
- Work only in the provided source language.
- Return 3-5 likely intended source words for the misspelled input.
- Return only real, standard words in the source language.
- Order candidates from most likely to least likely.
- If you are very unsure, return fewer items instead of inventing words.`;
const TEXT_SYSTEM_PROMPT = "You are a multilingual translation assistant. Return strict CSV only.";
const TEXT_PROMPT_RULES = `Return CSV with header exactly:
targetLanguage,translatedText
Rules:
- No markdown and no code fences.
- Provide natural and faithful direct translations.
- Keep punctuation and intent.
- Keep exactly one CSV row for each target language code, and keep the same order as target language codes.
- Use RFC4180 CSV escaping. Always quote translatedText with double quotes.
- If translated text has line breaks, replace each line break with literal \\n.`;

function buildWordUserPrompt(input: TranslateInput): string {
  return [
    `Translate this source word: "${input.sourceWord}"`,
    `Source language code: ${input.sourceLanguage}`,
    `Target language codes: ${input.targetLanguages.join(", ")}`,
    WORD_PROMPT_RESPONSE_SCHEMA,
    WORD_PROMPT_RULES
  ].join("\n");
}

function buildWordRetryPrompt(input: TranslateInput, strictPromptHint: string): string {
  return [
    buildWordUserPrompt(input),
    "Validation pass:",
    strictPromptHint.trimEnd(),
    WORD_RETRY_RULES
  ].join("\n");
}

function buildTextUserPrompt(input: TranslateTextInput): string {
  return [
    `Translate this source text: "${input.sourceText}"`,
    `Source language code: ${input.sourceLanguage}`,
    `Target language codes: ${input.targetLanguages.join(", ")}`,
    TEXT_PROMPT_RULES
  ].join("\n");
}

function buildWordSuggestionPrompt(input: TranslateInput): string {
  return [
    `Misspelled source word: "${input.sourceWord}"`,
    `Source language code: ${input.sourceLanguage}`,
    WORD_SUGGEST_RESPONSE_SCHEMA,
    WORD_SUGGEST_RULES
  ].join("\n");
}

function supportsGrammaticalGender(code: string): boolean {
  return GENDERED_LANGUAGE_CODES.has(code.trim().toLowerCase());
}

function uniqueStrings(values: unknown, limit = 10): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const cleaned = values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);

  return Array.from(new Set(cleaned)).slice(0, limit);
}

function uniqueTrimmedStrings(values: unknown, limit = 10): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(
    new Set(
      values
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean)
    )
  ).slice(0, limit);
}

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeWord(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeComparableWord(value: string): string {
  return normalizeWord(value)
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function commonPrefixLength(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  let index = 0;
  while (index < limit && left[index] === right[index]) {
    index += 1;
  }
  return index;
}

function normalizeCellToken(value: string): string {
  let next = toText(value);

  if (next.startsWith("`") && next.endsWith("`") && next.length >= 2) {
    next = next.slice(1, -1).trim();
  }

  if (next.startsWith("**") && next.endsWith("**") && next.length >= 4) {
    next = next.slice(2, -2).trim();
  }

  if (next.startsWith("__") && next.endsWith("__") && next.length >= 4) {
    next = next.slice(2, -2).trim();
  }

  return next;
}

function normalizePartOfSpeech(value: unknown): string {
  const normalized = toText(value).toLowerCase();
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

function normalizeGenderHints(values: unknown): SourceGenderHint[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const hints: SourceGenderHint[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    const gender = toText(source.gender).toLowerCase();
    const article = toText(source.article);
    const word = toText(source.word);

    if (!gender || !article || !word) {
      continue;
    }

    const dedupeKey = `${gender}|${article.toLowerCase()}|${word.toLowerCase()}`;
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    hints.push({ gender, article, word });
    if (hints.length >= 3) {
      break;
    }
  }

  return hints;
}

function normalizeTranslationItem(raw: unknown, targetLanguage: string): TranslationItem {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  return {
    targetLanguage,
    directTranslation: toText(source.directTranslation),
    similarWords: uniqueStrings(source.similarWords, WORD_TARGET_SIMILAR_LIMIT)
  };
}

function buildSourceCandidates(input: TranslateInput, payload: TranslationPayload): string[] {
  return Array.from(
    new Set(
      [
        input.sourceWord,
        payload.sourceWord,
        payload.correctedSourceWord ?? "",
        payload.sourceLemma ?? "",
        payload.sourcePluralForm ?? "",
        ...(payload.sourceGenderHints ?? []).map((item) => item.word)
      ]
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function isSourceLikeTargetWord(value: string, sourceCandidates: string[]): boolean {
  const normalizedValue = normalizeComparableWord(value);
  if (normalizedValue.length < 4) {
    return false;
  }

  return sourceCandidates.some((candidate) => {
    const normalizedCandidate = normalizeComparableWord(candidate);
    if (normalizedCandidate.length < 4) {
      return false;
    }

    if (normalizedValue === normalizedCandidate) {
      return true;
    }

    const minLength = Math.min(normalizedValue.length, normalizedCandidate.length);
    if (minLength >= 5 && (normalizedValue.startsWith(normalizedCandidate) || normalizedCandidate.startsWith(normalizedValue))) {
      return true;
    }

    return minLength >= 6 && commonPrefixLength(normalizedValue, normalizedCandidate) >= 4;
  });
}

function normalizePayload(raw: unknown, input: TranslateInput): TranslationPayload {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const map = new Map<string, unknown>();
  const sourcePartOfSpeech = normalizePartOfSpeech(source.sourcePartOfSpeech);
  const shouldShowGender = sourcePartOfSpeech === "noun" && supportsGrammaticalGender(input.sourceLanguage);

  const translations = Array.isArray(source.translations) ? source.translations : [];
  for (const item of translations) {
    if (item && typeof item === "object") {
      const target = toText((item as Record<string, unknown>).targetLanguage).toLowerCase();
      if (target) {
        map.set(target, item);
      }
    }
  }

  return {
    sourceWord: input.sourceWord,
    sourceLanguage: input.sourceLanguage,
    sourcePhonetic: toText(source.sourcePhonetic),
    correctedSourceWord: toText(source.correctedSourceWord),
    suggestedSourceWords: uniqueTrimmedStrings(source.suggestedSourceWords, 5),
    sourcePartOfSpeech,
    sourceLemma: toText(source.sourceLemma),
    sourcePluralForm: toText(source.sourcePluralForm),
    sourceMorphology: toText(source.sourceMorphology),
    sourceGenderHints: shouldShowGender ? normalizeGenderHints(source.sourceGenderHints) : [],
    translations: input.targetLanguages.map((targetLanguage) =>
      normalizeTranslationItem(map.get(targetLanguage), targetLanguage)
    )
  };
}

function shouldRefineCorrectedWordPayload(input: TranslateInput, payload: TranslationPayload): boolean {
  const corrected = payload.correctedSourceWord?.trim() ?? "";
  return Boolean(corrected) && normalizeWord(corrected) !== normalizeWord(input.sourceWord);
}

function hasSuspiciousTargetLanguageLeakage(input: TranslateInput, payload: TranslationPayload): boolean {
  const sourceCandidates = buildSourceCandidates(input, payload);

  return payload.translations.some((item) => {
    const directSuspicious =
      payload.sourcePartOfSpeech === "unknown" && isSourceLikeTargetWord(item.directTranslation, sourceCandidates);
    const suspiciousSimilarCount = item.similarWords.filter((word) => isSourceLikeTargetWord(word, sourceCandidates)).length;

    return directSuspicious || suspiciousSimilarCount > 0;
  });
}

function shouldSuggestCandidates(input: TranslateInput, payload: TranslationPayload): boolean {
  const hasResolvedTranslations = payload.translations.some(
    (item) => Boolean(item.directTranslation) || item.similarWords.length > 0
  );
  const hasConfidentCorrection =
    Boolean(payload.correctedSourceWord?.trim()) && normalizeWord(payload.correctedSourceWord ?? "") !== normalizeWord(input.sourceWord);
  const hasSuggestions = (payload.suggestedSourceWords?.length ?? 0) > 0;

  return !hasResolvedTranslations && !hasConfidentCorrection && !hasSuggestions;
}

function hasResolvedWordResult(payload: TranslationPayload): boolean {
  const hasResolvedTranslations = payload.translations.some(
    (item) => Boolean(item.directTranslation) || item.similarWords.length > 0
  );

  return (
    hasResolvedTranslations ||
    Boolean(payload.sourceLemma?.trim()) ||
    normalizePartOfSpeech(payload.sourcePartOfSpeech) !== "unknown"
  );
}

function clearSuggestionsIfResolved(payload: TranslationPayload): TranslationPayload {
  if (!hasResolvedWordResult(payload) || (payload.suggestedSourceWords?.length ?? 0) === 0) {
    return payload;
  }

  return {
    ...payload,
    suggestedSourceWords: []
  };
}

function mergeCorrectedWordPayload(
  originalPayload: TranslationPayload,
  correctedPayload: TranslationPayload
): TranslationPayload {
  return {
    ...originalPayload,
    sourcePhonetic: correctedPayload.sourcePhonetic || originalPayload.sourcePhonetic || "",
    sourcePartOfSpeech: correctedPayload.sourcePartOfSpeech || originalPayload.sourcePartOfSpeech || "unknown",
    sourceLemma: correctedPayload.sourceLemma || originalPayload.sourceLemma || "",
    sourcePluralForm: correctedPayload.sourcePluralForm || originalPayload.sourcePluralForm || "",
    sourceMorphology: correctedPayload.sourceMorphology || originalPayload.sourceMorphology || "",
    suggestedSourceWords:
      (correctedPayload.suggestedSourceWords?.length ?? 0) > 0
        ? correctedPayload.suggestedSourceWords
        : (originalPayload.suggestedSourceWords ?? []),
    sourceGenderHints:
      (correctedPayload.sourceGenderHints?.length ?? 0) > 0
        ? correctedPayload.sourceGenderHints
        : (originalPayload.sourceGenderHints ?? []),
    translations: correctedPayload.translations.length > 0 ? correctedPayload.translations : originalPayload.translations
  };
}

function sanitizeTranslationsAgainstSource(input: TranslateInput, payload: TranslationPayload): TranslationPayload {
  const sourceCandidates = buildSourceCandidates(input, payload);

  return {
    ...payload,
    translations: payload.translations.map((item) => {
      const directTranslation =
        payload.sourcePartOfSpeech === "unknown" && isSourceLikeTargetWord(item.directTranslation, sourceCandidates)
          ? ""
          : item.directTranslation;
      const directKey = normalizeComparableWord(directTranslation);
      const similarWords = item.similarWords
        .filter((word) => !isSourceLikeTargetWord(word, sourceCandidates))
        .filter((word) => normalizeComparableWord(word) !== directKey)
        .slice(0, WORD_TARGET_SIMILAR_LIMIT);

      return {
        ...item,
        directTranslation,
        similarWords
      };
    })
  };
}

function createSuggestionOnlyPayload(input: TranslateInput, suggestions: string[]): TranslationPayload {
  return {
    ...createEmptyWordPayload(input),
    suggestedSourceWords: suggestions
  };
}

function applySourceLanguageOverrides(input: TranslateInput, payload: TranslationPayload): TranslationPayload {
  const candidateWords = [
    payload.correctedSourceWord ?? "",
    payload.sourceWord ?? "",
    input.sourceWord
  ].filter(Boolean);
  const matchedRule = candidateWords
    .map((word) => getLanguageWordGuardrail(input.sourceLanguage, word))
    .find((rule) => Boolean(rule));

  if (matchedRule) {
    return {
      ...payload,
      sourcePartOfSpeech: matchedRule.partOfSpeech,
      sourceLemma: matchedRule.lemma || payload.sourceLemma || "",
      sourceMorphology: payload.sourceMorphology || matchedRule.morphology || "",
      sourceGenderHints: matchedRule.partOfSpeech === "noun" ? payload.sourceGenderHints : []
    };
  }

  return payload;
}

function hasLanguageGuardrailConflict(input: TranslateInput, payload: TranslationPayload): boolean {
  const candidateWords = [
    payload.correctedSourceWord ?? "",
    payload.sourceWord ?? "",
    input.sourceWord
  ].filter(Boolean);

  for (const word of candidateWords) {
    const rule = getLanguageWordGuardrail(input.sourceLanguage, word);
    if (!rule) {
      continue;
    }

    const partOfSpeech = normalizePartOfSpeech(payload.sourcePartOfSpeech);
    return partOfSpeech !== rule.partOfSpeech;
  }

  return false;
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];

    if (inQuotes) {
      if (char === "\"") {
        const next = csv[index + 1];
        if (next === "\"") {
          currentCell += "\"";
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += char;
      }
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if (char === "\n") {
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    if (char === "\r") {
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
}

function parseMarkdownTableRows(markdown: string): string[][] {
  const lines = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes("|"));

  const rows: string[][] = [];

  for (const line of lines) {
    const stripped = line.replace(/^\|/, "").replace(/\|$/, "").trim();
    if (!stripped) {
      continue;
    }

    const maybeSeparator = stripped.replace(/[|\-\:\s]/g, "");
    if (!maybeSeparator) {
      continue;
    }

    const cells: string[] = [];
    let current = "";
    let escaped = false;

    for (let index = 0; index < stripped.length; index += 1) {
      const char = stripped[index];

      if (escaped) {
        current += char;
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === "|") {
        cells.push(current.trim());
        current = "";
        continue;
      }

      current += char;
    }

    cells.push(current.trim());
    rows.push(cells);
  }

  return rows;
}

function csvCell(row: string[], index: number): string {
  return normalizeCellToken(toText(row[index]));
}

function csvValues(row: string[], startIndex: number): string[] {
  return row
    .slice(startIndex)
    .map((value) => normalizeCellToken(toText(value)).replace(/\\n/g, "\n"))
    .filter(Boolean);
}

function parseSuggestedSourceWords(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueTrimmedStrings(value, 5);
  }

  if (typeof value !== "string") {
    return [];
  }

  return uniqueTrimmedStrings(
    value
      .split(/[\n,;|]/)
      .map((item) => item.trim())
      .filter(Boolean),
    5
  );
}

function hasMeaningfulWordPayload(payload: TranslationPayload): boolean {
  const hasSourceMeta =
    Boolean(payload.sourcePhonetic) ||
    Boolean(payload.correctedSourceWord) ||
    (payload.suggestedSourceWords?.length ?? 0) > 0 ||
    Boolean(payload.sourceLemma) ||
    Boolean(payload.sourcePluralForm) ||
    Boolean(payload.sourceMorphology) ||
    (payload.sourcePartOfSpeech ?? "unknown") !== "unknown" ||
    (payload.sourceGenderHints?.length ?? 0) > 0;

  const hasTranslations = payload.translations.some(
    (item) => Boolean(item.directTranslation) || item.similarWords.length > 0
  );

  return hasSourceMeta || hasTranslations;
}

function createEmptyWordPayload(input: TranslateInput): TranslationPayload {
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

function normalizePayloadFromCsv(csv: string, input: TranslateInput): TranslationPayload {
  const parsedRows = parseCsvRows(csv.trim()).filter((row) => row.some((cell) => toText(cell)));
  const hasHeader = parsedRows.length > 0 && csvCell(parsedRows[0], 0).toLowerCase() === "recordtype";
  const dataRows = hasHeader ? parsedRows.slice(1) : parsedRows;

  const metaMap = new Map<string, string>();
  const rawGenderHints: Array<{ gender: string; article: string; word: string }> = [];
  const rawTranslations = new Map<string, { directTranslation: string; similarWords: string[] }>();

  for (const row of dataRows) {
    const recordType = csvCell(row, 0).toLowerCase();
    if (!recordType) {
      continue;
    }

    if (recordType === "meta") {
      const key = csvCell(row, 1).toLowerCase();
      if (key && !metaMap.has(key)) {
        metaMap.set(key, csvCell(row, 3).replace(/\\n/g, "\n"));
      }
      continue;
    }

    if (recordType === "genderhint") {
      const gender = csvCell(row, 3).toLowerCase();
      const article = csvCell(row, 4);
      const word = csvCell(row, 5);
      if (gender && article && word) {
        rawGenderHints.push({ gender, article, word });
      }
      continue;
    }

    if (recordType === "translation") {
      const targetLanguage = csvCell(row, 2).toLowerCase();
      if (!targetLanguage || rawTranslations.has(targetLanguage)) {
        continue;
      }

      rawTranslations.set(targetLanguage, {
        directTranslation: csvCell(row, 3).replace(/\\n/g, "\n"),
        similarWords: csvValues(row, 4)
      });
    }
  }

  const sourcePartOfSpeech = normalizePartOfSpeech(metaMap.get("sourcepartofspeech"));
  const shouldShowGender = sourcePartOfSpeech === "noun" && supportsGrammaticalGender(input.sourceLanguage);

  return {
    sourceWord: input.sourceWord,
    sourceLanguage: input.sourceLanguage,
    sourcePhonetic: metaMap.get("sourcephonetic") ?? "",
    correctedSourceWord: metaMap.get("correctedsourceword") ?? "",
    suggestedSourceWords: parseSuggestedSourceWords(metaMap.get("suggestedsourcewords")),
    sourcePartOfSpeech,
    sourceLemma: metaMap.get("sourcelemma") ?? "",
    sourcePluralForm: metaMap.get("sourcepluralform") ?? "",
    sourceMorphology: metaMap.get("sourcemorphology") ?? "",
    sourceGenderHints: shouldShowGender ? normalizeGenderHints(rawGenderHints) : [],
    translations: input.targetLanguages.map((targetLanguage) => {
      const row = rawTranslations.get(targetLanguage);
      return normalizeTranslationItem(
        {
          directTranslation: row?.directTranslation ?? "",
          similarWords: row?.similarWords ?? []
        },
        targetLanguage
      );
    })
  };
}

function normalizePayloadFromMarkdownTable(table: string, input: TranslateInput): TranslationPayload {
  const parsedRows = parseMarkdownTableRows(table.trim()).filter((row) => row.some((cell) => toText(cell)));
  const hasHeader = parsedRows.length > 0 && csvCell(parsedRows[0], 0).toLowerCase() === "recordtype";
  const dataRows = hasHeader ? parsedRows.slice(1) : parsedRows;

  const metaMap = new Map<string, string>();
  const rawGenderHints: Array<{ gender: string; article: string; word: string }> = [];
  const rawTranslations = new Map<string, { directTranslation: string; similarWords: string[] }>();

  for (const row of dataRows) {
    const recordType = csvCell(row, 0).toLowerCase();
    if (!recordType) {
      continue;
    }

    if (recordType === "meta") {
      const key = csvCell(row, 1).toLowerCase();
      if (key && !metaMap.has(key)) {
        metaMap.set(key, csvCell(row, 3).replace(/\\n/g, "\n"));
      }
      continue;
    }

    if (recordType === "genderhint") {
      const gender = csvCell(row, 3).toLowerCase();
      const article = csvCell(row, 4);
      const word = csvCell(row, 5);
      if (gender && article && word) {
        rawGenderHints.push({ gender, article, word });
      }
      continue;
    }

    if (recordType === "translation") {
      const targetLanguage = csvCell(row, 2).toLowerCase();
      if (!targetLanguage || rawTranslations.has(targetLanguage)) {
        continue;
      }

      rawTranslations.set(targetLanguage, {
        directTranslation: csvCell(row, 3).replace(/\\n/g, "\n"),
        similarWords: csvValues(row, 4)
      });
    }
  }

  const sourcePartOfSpeech = normalizePartOfSpeech(metaMap.get("sourcepartofspeech"));
  const shouldShowGender = sourcePartOfSpeech === "noun" && supportsGrammaticalGender(input.sourceLanguage);

  return {
    sourceWord: input.sourceWord,
    sourceLanguage: input.sourceLanguage,
    sourcePhonetic: metaMap.get("sourcephonetic") ?? "",
    correctedSourceWord: metaMap.get("correctedsourceword") ?? "",
    suggestedSourceWords: parseSuggestedSourceWords(metaMap.get("suggestedsourcewords")),
    sourcePartOfSpeech,
    sourceLemma: metaMap.get("sourcelemma") ?? "",
    sourcePluralForm: metaMap.get("sourcepluralform") ?? "",
    sourceMorphology: metaMap.get("sourcemorphology") ?? "",
    sourceGenderHints: shouldShowGender ? normalizeGenderHints(rawGenderHints) : [],
    translations: input.targetLanguages.map((targetLanguage) => {
      const row = rawTranslations.get(targetLanguage);
      return normalizeTranslationItem(
        {
          directTranslation: row?.directTranslation ?? "",
          similarWords: row?.similarWords ?? []
        },
        targetLanguage
      );
    })
  };
}

function parseWordPayloadFlexible(content: string, input: TranslateInput): TranslationPayload {
  try {
    const parsed = JSON.parse(content);
    const jsonPayload = normalizePayload(parsed, input);
    if (hasMeaningfulWordPayload(jsonPayload)) {
      return jsonPayload;
    }
  } catch {
    // Ignore parse failure and fall back to empty payload.
  }

  return createEmptyWordPayload(input);
}

function parseSuggestedWordsContent(content: string): string[] {
  try {
    const parsed = JSON.parse(content) as { suggestedSourceWords?: unknown };
    return parseSuggestedSourceWords(parsed.suggestedSourceWords);
  } catch {
    return [];
  }
}

type RequestBudget = {
  deadlineAt: number;
};

function createRequestBudget(totalMs: number): RequestBudget {
  return {
    deadlineAt: Date.now() + Math.max(1000, totalMs)
  };
}

function getRemainingBudgetMs(budget?: RequestBudget): number {
  if (!budget) {
    return OPENAI_TIMEOUT_MS;
  }

  return budget.deadlineAt - Date.now();
}

function hasBudgetForFollowup(budget?: RequestBudget, minRequiredMs = OPENAI_FOLLOWUP_MIN_BUDGET_MS): boolean {
  return getRemainingBudgetMs(budget) > minRequiredMs;
}

async function requestWordSuggestions(input: TranslateInput, apiKey: string, budget?: RequestBudget): Promise<string[]> {
  const content = await requestOpenAIContent({
    apiKey,
    systemPrompt: WORD_SUGGEST_SYSTEM_PROMPT,
    userPrompt: buildWordSuggestionPrompt(input),
    maxTokens: Math.min(OPENAI_MAX_TOKENS, 120),
    logLabel: "openai:word-suggest"
  });

  return parseSuggestedWordsContent(content);
}

async function requestOpenAIContent(params: {
  apiKey: string;
  baseUrl?: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  logLabel: string; 
}): Promise<string> {
  const { apiKey, baseUrl, systemPrompt, userPrompt, maxTokens, logLabel } = params;

  // const timeoutMs = Math.max(1, Math.min(OPENAI_TIMEOUT_MS, remainingBudgetMs));
  // const startedAt = performance.now();
  const client = createOpenAIClient({
    apiKey,
    baseUrl,
    // timeoutMs
  });
  // const controller = new AbortController();
  // const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let status = 200;
  try {
    const completion = await client.chat.completions.create(
      {
        model: MODEL,
        temperature: 0,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      },
      // {
      //   signal: controller.signal
      // }
    );

    // const elapsed = performance.now() - startedAt;
    // console.log(`[${logLabel}] model=${MODEL} status=${status} duration=${elapsed.toFixed(2)} ms`);

    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error(`${logLabel} returned empty content`);
    }

    return content;
  } catch (error) {
    // const elapsed = performance.now() - startedAt;
    // if (error instanceof Error && error.name === "AbortError") {
    //   throw new Error(`${logLabel} timed out after ${timeoutMs} ms`);
    // }

    const errorStatus =
      error && typeof error === "object" && "status" in error && typeof error.status === "number"
        ? error.status
        : undefined;
    if (typeof errorStatus === "number") {
      status = errorStatus;
    }

    // console.log(`[${logLabel}] model=${MODEL} status=${status} duration=${elapsed.toFixed(2)} ms`);
    throw new Error(
      `${logLabel} : ${error instanceof Error ? error.message : "Unknown SDK error"}`
    );
    // throw new Error(
    //   `${logLabel} failed after ${elapsed.toFixed(2)} ms: ${error instanceof Error ? error.message : "Unknown SDK error"}`
    // );
  } finally {
    // clearTimeout(timeoutId);
  }
}

function normalizeTextPayloadFromCsv(csv: string, input: TranslateTextInput): TextTranslationPayload {
  const parsedRows = parseCsvRows(csv.trim());
  const hasHeader =
    parsedRows.length > 0 &&
    toText(parsedRows[0]?.[0]).toLowerCase() === "targetlanguage" &&
    toText(parsedRows[0]?.[1]).toLowerCase() === "translatedtext";

  const dataRows = hasHeader ? parsedRows.slice(1) : parsedRows;
  const translationMap = new Map<string, string>();

  for (const row of dataRows) {
    const targetLanguage = toText(row[0]).toLowerCase();
    if (!targetLanguage || translationMap.has(targetLanguage)) {
      continue;
    }

    const translatedText = toText(row[1]).replace(/\\n/g, "\n");
    translationMap.set(targetLanguage, translatedText);
  }

  return {
    sourceText: input.sourceText,
    sourceLanguage: input.sourceLanguage,
    translations: input.targetLanguages.map((targetLanguage) => ({
      targetLanguage,
      translatedText: translationMap.get(targetLanguage) ?? ""
    }))
  };
}

async function fetchWordPayload(input: TranslateInput, apiKey: string): Promise<TranslationPayload> {
  // const budget = createRequestBudget(OPENAI_TOTAL_TIMEOUT_MS);

  const requestWordPayload = async (requestInput: TranslateInput): Promise<TranslationPayload> => {
    const baseUserPrompt = buildWordUserPrompt(requestInput);
    const strictRule = getLanguageWordGuardrail(requestInput.sourceLanguage, requestInput.sourceWord);
    const strictPromptHint = strictRule
      ? `- Strict check for this token: in language ${requestInput.sourceLanguage}, "${requestInput.sourceWord}" should be ${strictRule.partOfSpeech}.\n`
      : "- Strict check: if the token is a cross-language homograph, still classify only by source language.\n";

    const content = await requestOpenAIContent({
      apiKey,
      systemPrompt: WORD_SYSTEM_PROMPT,
      userPrompt: baseUserPrompt,
      maxTokens: OPENAI_MAX_TOKENS,
      logLabel: "openai:word"
    });

    let payload = parseWordPayloadFlexible(content, requestInput);
    // const needsRetry =
    //   !hasMeaningfulWordPayload(payload) ||
    //   hasLanguageGuardrailConflict(requestInput, payload) ||
    //   hasSuspiciousTargetLanguageLeakage(requestInput, payload);

    // if (needsRetry && hasBudgetForFollowup(budget)) {
    //   const retryContent = await requestOpenAIContent({
    //     apiKey,
    //     systemPrompt: WORD_SYSTEM_PROMPT,
    //     userPrompt: buildWordRetryPrompt(requestInput, strictPromptHint),
    //     maxTokens: OPENAI_MAX_TOKENS,
    //     logLabel: "openai:word-retry",
    //     budget
    //   });

    //   const retryPayload = parseWordPayloadFlexible(retryContent, requestInput);
    //   if (hasMeaningfulWordPayload(retryPayload)) {
    //     payload = retryPayload;
    //   }
    // } else if (needsRetry) {
    //   console.warn("[openai:word] Skipped retry because the remaining request budget is too low.");
    // }

    return sanitizeTranslationsAgainstSource(requestInput, applySourceLanguageOverrides(requestInput, payload));
  };

  let payload: TranslationPayload;
  // try {
    payload = await requestWordPayload(input);
  // } catch (error) {
    // try {
    //   if (hasBudgetForFollowup(budget)) {
    //     const suggestions = await requestWordSuggestions(input, apiKey, budget);
    //     if (suggestions.length > 0) {
    //       return createSuggestionOnlyPayload(input, suggestions);
    //     }
    //   } else {
    //     console.warn("[openai:word] Skipped fallback suggestions because the remaining request budget is too low.");
    //   }
    // } catch {
    //   // Fall through to original error below.
    // }
  //   throw error;
  // }

  if (shouldRefineCorrectedWordPayload(input, payload) 
    // && hasBudgetForFollowup(budget)
  ) {
    const correctedWord = payload.correctedSourceWord!.trim();
    try {
      const correctedPayload = await requestWordPayload({
        ...input,
        sourceWord: correctedWord
      });
      payload = mergeCorrectedWordPayload(payload, correctedPayload);
    } catch {
      // Keep the original payload if the refinement pass fails or times out.
    }
  } else if (shouldRefineCorrectedWordPayload(input, payload)) {
    console.warn("[openai:word] Skipped corrected-word refinement because the remaining request budget is too low.");
  }

  // if (shouldSuggestCandidates(input, payload) && hasBudgetForFollowup(budget)) {
  //   try {
  //     const suggestions = await requestWordSuggestions(input, apiKey, budget);
  //     if (suggestions.length > 0) {
  //       payload = {
  //         ...payload,
  //         suggestedSourceWords: suggestions
  //       };
  //     }
  //   } catch {
  //     // Keep the best payload we already have.
  //   }
  // } else if (shouldSuggestCandidates(input, payload)) {
  //   console.warn("[openai:word] Skipped candidate suggestions because the remaining request budget is too low.");
  // }

  return clearSuggestionsIfResolved(payload);
}

export async function translateWithOpenAI(input: TranslateInput): Promise<TranslationPayload> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing");
  }

  return fetchWordPayload(input, apiKey);
}

export async function translateTextWithOpenAI(input: TranslateTextInput): Promise<TextTranslationPayload> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing");
  }

  const content = await requestOpenAIContent({
    apiKey,
    systemPrompt: TEXT_SYSTEM_PROMPT,
    userPrompt: buildTextUserPrompt(input),
    maxTokens: OPENAI_TEXT_MAX_TOKENS,
    logLabel: "openai:text",
    // budget: createRequestBudget(Math.min(OPENAI_TIMEOUT_MS, OPENAI_TOTAL_TIMEOUT_MS))
  });

  return normalizeTextPayloadFromCsv(content, input);
}
