import {
  SourceGenderHint,
  TextTranslationPayload,
  TranslationItem,
  TranslationPayload
} from "@/lib/types";
import { getLanguageWordGuardrail } from "@/lib/language-guardrails";
import { createOpenAIClient } from "@/lib/openai-client";
import { createEmptyWordPayload } from "@/lib/word-stream-protocol";

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
const OPENAI_MAX_TOKENS = Number.parseInt(process.env.OPENAI_MAX_TOKENS ?? "320", 10);
const OPENAI_TEXT_MAX_TOKENS = Number.parseInt(process.env.OPENAI_TEXT_MAX_TOKENS ?? "520", 10);
const GENDERED_LANGUAGE_CODES = new Set(["de", "fr", "es", "it", "pt", "ru", "ar"]);
const WORD_TARGET_SIMILAR_LIMIT = 3;
const WORD_SYSTEM_PROMPT = "You are a multilingual dictionary assistant. Return strict JSON only.";
const WORD_FAST_STREAM_SYSTEM_PROMPT = "You are a multilingual dictionary assistant. Return compact plain-text event lines only.";
const WORD_DETAIL_STREAM_SYSTEM_PROMPT = "You are a multilingual dictionary assistant. Return compact plain-text detail lines only.";
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
const WORD_FAST_STREAM_PROMPT_RULES = `Rules:
- No markdown, no code fences, and no explanations.
- Output exactly one CORRECTED line: CORRECTED|<corrected word or empty>
- Output exactly one POS line: POS|<noun|verb|adjective|adverb|pronoun|preposition|conjunction|interjection|numeral|particle|determiner|unknown>
- If you are not confident what the intended source word is, keep CORRECTED empty unless the spelling correction is obvious, keep POS as unknown, keep all TRANS values empty, and output 3-5 SUGGEST lines.
- For likely alternatives, output up to 5 lines: SUGGEST|<candidate>
- For each target language code, output exactly one line in the same order: TRANS|<language code>|<direct translation or empty>
- Finish with exactly one line: DONE
- Never use the pipe character inside field values.
- direct translations must be natural lexical items in the target language only.
- If the source spelling is already correct, keep the CORRECTED value empty after the pipe.`;
const WORD_DETAIL_STREAM_PROMPT_RULES = `Rules:
- No markdown, no code fences, and no explanations.
- Output exactly one PHONETIC line: PHONETIC|<value or empty>
- Output exactly one LEMMA line: LEMMA|<value or empty>
- Output exactly one PLURAL line: PLURAL|<value or empty>
- Output exactly one MORPH line: MORPH|<value or empty>
- For source-language gender hints, output zero to three lines: GENDER|<masculine|feminine|neuter>|<article>|<word>
- For each target language, output up to 3 lines: SIMILAR|<language code>|<similar word>
- Finish with exactly one line: DONE
- Never use the pipe character inside field values.
- Metadata must refer to the resolved source word. If correctedSourceWord is non-empty, use that corrected word.
- If a standard IPA or ordinary phonetic transcription is known for the resolved source word, PHONETIC must not be empty.
- For nouns, PLURAL should be the noun plural form when known; otherwise keep it empty.
- similar words must be in the target language only and must not duplicate the direct translation for that target language.`;
const WORD_PHONETIC_FALLBACK_SYSTEM_PROMPT = "You are a multilingual dictionary assistant. Return one compact phonetic line only.";
const WORD_PHONETIC_FALLBACK_PROMPT_RULES = `Rules:
- No markdown, no code fences, and no explanations.
- Output exactly one line: PHONETIC|<IPA or ordinary phonetic transcription>
- If no reliable transcription is known, keep the value empty after the pipe.
- Finish with exactly one line: DONE
- Never use the pipe character inside field values.`;
const TEXT_SYSTEM_PROMPT = "You are a multilingual translation assistant. Return plain text only.";
export const TEXT_TRANSLATION_STREAM_SEPARATOR = "$LAFIN&";
const TEXT_PROMPT_RULES = `Rules:
- No markdown and no code fences.
- Provide natural and faithful direct translations.
- Keep punctuation and intent.
- Return exactly one translated segment for each target language code, and keep the same order as target language codes.
- After each translated segment, output the separator ${TEXT_TRANSLATION_STREAM_SEPARATOR}
- Do not include language labels, numbering, explanations, or extra separators.
- Do not omit the separator after the final translated segment.
- If translated text has line breaks, keep them as normal text.`;

function buildWordUserPrompt(input: TranslateInput): string {
  return [
    `Translate this source word: "${input.sourceWord}"`,
    `Source language code: ${input.sourceLanguage}`,
    `Target language codes: ${input.targetLanguages.join(", ")}`,
    WORD_PROMPT_RESPONSE_SCHEMA,
    WORD_PROMPT_RULES
  ].join("\n");
}

function buildWordFastStreamUserPrompt(input: TranslateInput): string {
  return [
    `Translate this source word: "${input.sourceWord}"`,
    `Source language code: ${input.sourceLanguage}`,
    `Target language codes: ${input.targetLanguages.join(", ")}`,
    WORD_FAST_STREAM_PROMPT_RULES
  ].join("\n");
}

function buildWordDetailStreamUserPrompt(input: TranslateInput, fastPayload: TranslationPayload): string {
  const resolvedWord = fastPayload.correctedSourceWord?.trim() || input.sourceWord;
  const knownTranslations = fastPayload.translations
    .map((item) => `${item.targetLanguage}: ${item.directTranslation || "(empty)"}`)
    .join("\n");
  const suggestions = (fastPayload.suggestedSourceWords ?? []).join(", ");

  return [
    `Original source word: "${input.sourceWord}"`,
    `Resolved source word: "${resolvedWord}"`,
    `Source language code: ${input.sourceLanguage}`,
    `Known part of speech: ${fastPayload.sourcePartOfSpeech ?? "unknown"}`,
    `Known correctedSourceWord: ${fastPayload.correctedSourceWord ?? ""}`,
    `Target language codes: ${input.targetLanguages.join(", ")}`,
    `Known direct translations by target language:\n${knownTranslations}`,
    `Known source suggestions: ${suggestions}`,
    WORD_DETAIL_STREAM_PROMPT_RULES
  ].join("\n");
}

function buildWordPhoneticFallbackUserPrompt(input: TranslateInput, fastPayload: TranslationPayload): string {
  const resolvedWord = fastPayload.correctedSourceWord?.trim() || input.sourceWord;

  return [
    `Source word: "${resolvedWord}"`,
    `Original query word: "${input.sourceWord}"`,
    `Source language code: ${input.sourceLanguage}`,
    `Known part of speech: ${fastPayload.sourcePartOfSpeech ?? "unknown"}`,
    WORD_PHONETIC_FALLBACK_PROMPT_RULES
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

function hasSuspiciousTargetLanguageLeakage(input: TranslateInput, payload: TranslationPayload): boolean {
  const sourceCandidates = buildSourceCandidates(input, payload);

  return payload.translations.some((item) => {
    const directSuspicious =
      payload.sourcePartOfSpeech === "unknown" && isSourceLikeTargetWord(item.directTranslation, sourceCandidates);
    const suspiciousSimilarCount = item.similarWords.filter((word) => isSourceLikeTargetWord(word, sourceCandidates)).length;

    return directSuspicious || suspiciousSimilarCount > 0;
  });
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

async function requestOpenAIContent(params: {
  apiKey: string;
  baseUrl?: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  logLabel: string; 
}): Promise<string> {
  const { apiKey, baseUrl, systemPrompt, userPrompt, maxTokens, logLabel } = params;

  const client = createOpenAIClient({
    apiKey,
    baseUrl
  });

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
      }
    );

    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error(`${logLabel} returned empty content`);
    }

    return content;
  } catch (error) {
    const errorStatus =
      error && typeof error === "object" && "status" in error && typeof error.status === "number"
        ? error.status
        : undefined;
    if (typeof errorStatus === "number") {
      status = errorStatus;
    }

    throw new Error(
      `${logLabel} : ${error instanceof Error ? error.message : "Unknown SDK error"}`
    );
  }
}

async function requestOpenAIContentStream(params: {
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
}): Promise<AsyncIterable<string>> {
  const { apiKey, systemPrompt, userPrompt, maxTokens } = params;

  const client = createOpenAIClient({
    apiKey
  });

  const stream = await client.chat.completions.create({
    model: MODEL,
    temperature: 0,
    max_tokens: maxTokens,
    stream: true,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]
  });

  return {
    async *[Symbol.asyncIterator]() {
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          yield delta;
        }
      }
    }
  };
}

async function fetchWordPayload(input: TranslateInput, apiKey: string): Promise<TranslationPayload> {
  const requestWordPayload = async (requestInput: TranslateInput): Promise<TranslationPayload> => {
    const baseUserPrompt = buildWordUserPrompt(requestInput);
    const content = await requestOpenAIContent({
      apiKey,
      systemPrompt: WORD_SYSTEM_PROMPT,
      userPrompt: baseUserPrompt,
      maxTokens: OPENAI_MAX_TOKENS,
      logLabel: "openai:word"
    });

    const payload = parseWordPayloadFlexible(content, requestInput);
    return sanitizeTranslationsAgainstSource(requestInput, applySourceLanguageOverrides(requestInput, payload));
  };

  const payload = await requestWordPayload(input);
  return clearSuggestionsIfResolved(payload);
}

export async function translateWithOpenAI(input: TranslateInput): Promise<TranslationPayload> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing");
  }

  return fetchWordPayload(input, apiKey);
}

export function finalizeWordPayload(input: TranslateInput, payload: TranslationPayload): TranslationPayload {
  const normalized = {
    ...payload,
    sourceWord: input.sourceWord,
    sourceLanguage: input.sourceLanguage,
    suggestedSourceWords: payload.suggestedSourceWords ?? [],
    sourceGenderHints: payload.sourceGenderHints ?? [],
    translations: input.targetLanguages.map((targetLanguage) => {
      const item = payload.translations.find((entry) => entry.targetLanguage === targetLanguage);
      return {
        targetLanguage,
        directTranslation: item?.directTranslation ?? "",
        similarWords: item?.similarWords ?? []
      };
    })
  };

  return clearSuggestionsIfResolved(
    sanitizeTranslationsAgainstSource(input, applySourceLanguageOverrides(input, normalized))
  );
}

export async function streamWordFastTranslationWithOpenAI(input: TranslateInput): Promise<AsyncIterable<string>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing");
  }

  return requestOpenAIContentStream({
    apiKey,
    systemPrompt: WORD_FAST_STREAM_SYSTEM_PROMPT,
    userPrompt: buildWordFastStreamUserPrompt(input),
    maxTokens: OPENAI_MAX_TOKENS
  });
}

export async function streamWordDetailTranslationWithOpenAI(
  input: TranslateInput,
  fastPayload: TranslationPayload
): Promise<AsyncIterable<string>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing");
  }

  return requestOpenAIContentStream({
    apiKey,
    systemPrompt: WORD_DETAIL_STREAM_SYSTEM_PROMPT,
    userPrompt: buildWordDetailStreamUserPrompt(input, fastPayload),
    maxTokens: OPENAI_MAX_TOKENS
  });
}

export async function requestWordPhoneticFallbackLine(
  input: TranslateInput,
  fastPayload: TranslationPayload
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing");
  }

  const content = await requestOpenAIContent({
    apiKey,
    systemPrompt: WORD_PHONETIC_FALLBACK_SYSTEM_PROMPT,
    userPrompt: buildWordPhoneticFallbackUserPrompt(input, fastPayload),
    maxTokens: 48,
    logLabel: "openai:word:phonetic"
  });

  return content.trim();
}

export function normalizeTextPayloadFromStreamContent(content: string, input: TranslateTextInput): TextTranslationPayload {
  const segments = content
    .split(TEXT_TRANSLATION_STREAM_SEPARATOR)
    .map((segment) => segment.trim())
    .filter((segment, index, values) => Boolean(segment) || index < values.length - 1);

  return {
    sourceText: input.sourceText,
    sourceLanguage: input.sourceLanguage,
    translations: input.targetLanguages.map((targetLanguage, index) => ({
      targetLanguage,
      translatedText: segments[index] ?? ""
    }))
  };
}

export function serializeTextTranslationPayload(payload: TextTranslationPayload): string {
  return `${payload.translations.map((item) => item.translatedText).join(TEXT_TRANSLATION_STREAM_SEPARATOR)}${TEXT_TRANSLATION_STREAM_SEPARATOR}`;
}

export async function streamTextTranslationWithOpenAI(input: TranslateTextInput): Promise<AsyncIterable<string>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing");
  }

  return requestOpenAIContentStream({
    apiKey,
    systemPrompt: TEXT_SYSTEM_PROMPT,
    userPrompt: buildTextUserPrompt(input),
    maxTokens: OPENAI_TEXT_MAX_TOKENS
  });
}
