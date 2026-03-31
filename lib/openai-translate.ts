import {
  SourceGenderHint,
  TextTranslationPayload,
  TranslationItem,
  TranslationPayload
} from "@/lib/types";
import { getLanguageWordGuardrail } from "@/lib/language-guardrails";

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
const OPENAI_TIMEOUT_MS = Number.parseInt(process.env.OPENAI_TIMEOUT_MS ?? "12000", 10);
const GENDERED_LANGUAGE_CODES = new Set(["de", "fr", "es", "it", "pt", "ru", "ar"]);
const WORD_TARGET_SIMILAR_LIMIT = 3;

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

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeWord(value: string): string {
  return value.trim().toLowerCase();
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
    sourcePartOfSpeech,
    sourceLemma: toText(source.sourceLemma),
    sourceMorphology: toText(source.sourceMorphology),
    sourceGenderHints: shouldShowGender ? normalizeGenderHints(source.sourceGenderHints) : [],
    translations: input.targetLanguages.map((targetLanguage) =>
      normalizeTranslationItem(map.get(targetLanguage), targetLanguage)
    )
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

function hasMeaningfulWordPayload(payload: TranslationPayload): boolean {
  const hasSourceMeta =
    Boolean(payload.sourcePhonetic) ||
    Boolean(payload.correctedSourceWord) ||
    Boolean(payload.sourceLemma) ||
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
    sourcePartOfSpeech: "unknown",
    sourceLemma: "",
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
    sourcePartOfSpeech,
    sourceLemma: metaMap.get("sourcelemma") ?? "",
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
    sourcePartOfSpeech,
    sourceLemma: metaMap.get("sourcelemma") ?? "",
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
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  logLabel: string;
}): Promise<string> {
  const { apiKey, systemPrompt, userPrompt, maxTokens, logLabel } = params;
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        // max_tokens: maxTokens,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      })
    });
  } catch (error) {
    const elapsed = performance.now() - startedAt;
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`${logLabel} timed out after ${OPENAI_TIMEOUT_MS} ms`);
    }

    throw new Error(
      `${logLabel} failed after ${elapsed.toFixed(2)} ms: ${error instanceof Error ? error.message : "Unknown fetch error"}`
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const elapsed = performance.now() - startedAt;
  console.log(`[${logLabel}] model=${MODEL} status=${response.status} duration=${elapsed.toFixed(2)} ms`);

  const completion = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(completion.error?.message ?? `${logLabel} failed`);
  }

  const content = completion.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(`${logLabel} returned empty content`);
  }

  return content;
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
  const systemPrompt =
    "You are a multilingual dictionary assistant. Return strict JSON only.";
  const baseUserPrompt =
    `Translate this source word: "${input.sourceWord}"\n` +
    `Source language code: ${input.sourceLanguage}\n` +
    `Target language codes: ${input.targetLanguages.join(", ")}\n` +
    "Return exactly one JSON object with this schema (no markdown, no code fences, no extra text):\n" +
    "{\n" +
    '  "sourcePhonetic": string,\n' +
    '  "correctedSourceWord": string,\n' +
    '  "sourcePartOfSpeech": "noun" | "verb" | "adjective" | "adverb" | "pronoun" | "preposition" | "conjunction" | "interjection" | "numeral" | "particle" | "determiner" | "unknown",\n' +
    '  "sourceLemma": string,\n' +
    '  "sourceMorphology": string,\n' +
    '  "sourceGenderHints": [{ "gender": "masculine" | "feminine" | "neuter", "article": string, "word": string }],\n' +
    '  "translations": [\n' +
    '    {\n' +
    '      "targetLanguage": string,\n' +
    '      "directTranslation": string,\n' +
    '      "similarWords": [string, string, string]\n' +
    "    }\n" +
    "  ]\n" +
    "}\n" +
    "Rules:\n" +
    "- Analyze the source token strictly within the provided source language only; ignore homographs from other languages.\n" +
    "- Example: when source language is de, token \"die\" is a determiner/article, not an English verb.\n" +
    "- sourceLemma should be dictionary base form; if input is inflected, return lemma.\n" +
    "- correctedSourceWord should be empty if input spelling is already correct.\n" +
    "- sourceMorphology should briefly describe inflection/morphology; if none, keep empty.\n" +
    "- sourceGenderHints must be empty unless sourcePartOfSpeech is noun and source language has grammatical gender.\n" +
    "- translations must keep the same order as target language codes.\n" +
    "- Each translation must return exactly 1 directTranslation and exactly 3 similarWords.\n" +
    "- similarWords must not duplicate directTranslation.\n";
  const strictRule = getLanguageWordGuardrail(input.sourceLanguage, input.sourceWord);
  const strictPromptHint = strictRule
    ? `- Strict check for this token: in language ${input.sourceLanguage}, "${input.sourceWord}" should be ${strictRule.partOfSpeech}.\n`
    : "- Strict check: if the token is a cross-language homograph, still classify only by source language.\n";

  const content = await requestOpenAIContent({
    apiKey,
    systemPrompt,
    userPrompt: baseUserPrompt,
    maxTokens: OPENAI_MAX_TOKENS,
    logLabel: "openai:word"
  });

  let payload = parseWordPayloadFlexible(content, input);
  const needsRetry = !hasMeaningfulWordPayload(payload) || hasLanguageGuardrailConflict(input, payload);

  if (needsRetry) {
    const retryContent = await requestOpenAIContent({
      apiKey,
      systemPrompt,
      userPrompt:
        `${baseUserPrompt}\n` +
        "Validation pass:\n" +
        strictPromptHint +
        "- Validate part-of-speech and lemma strictly in the source language context.\n" +
        "- Return valid JSON only.\n",
      maxTokens: OPENAI_MAX_TOKENS,
      logLabel: "openai:word-retry"
    });

    const retryPayload = parseWordPayloadFlexible(retryContent, input);
    if (hasMeaningfulWordPayload(retryPayload)) {
      payload = retryPayload;
    }
  }

  return applySourceLanguageOverrides(input, payload);
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

  const systemPrompt = "You are a multilingual translation assistant. Return strict CSV only.";
  const userPrompt =
    `Translate this source text: "${input.sourceText}"\n` +
    `Source language code: ${input.sourceLanguage}\n` +
    `Target language codes: ${input.targetLanguages.join(", ")}\n` +
    "Return CSV with header exactly:\n" +
    "targetLanguage,translatedText\n" +
    "Rules:\n" +
    "- No markdown and no code fences.\n" +
    "- Provide natural and faithful direct translations.\n" +
    "- Keep punctuation and intent.\n" +
    "- Keep exactly one CSV row for each target language code, and keep the same order as target language codes.\n" +
    "- Use RFC4180 CSV escaping. Always quote translatedText with double quotes.\n" +
    "- If translated text has line breaks, replace each line break with literal \\n.\n";

  const content = await requestOpenAIContent({
    apiKey,
    systemPrompt,
    userPrompt,
    maxTokens: OPENAI_TEXT_MAX_TOKENS,
    logLabel: "openai:text"
  });

  return normalizeTextPayloadFromCsv(content, input);
}
