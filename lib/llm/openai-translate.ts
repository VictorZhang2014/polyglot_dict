import {
  // SourceGenderHint,
  TextTranslationPayload,
  // TranslationItem,
  TranslationPayload
} from "@/lib/types";
import { getLanguageWordGuardrail } from "@/lib/language-guardrails";
import { BUILTIN_LANGUAGES, getLanguageName } from "@/lib/languages";
import { createClaudeAIClient } from "@/lib/llm/llm-client";
// import { createEmptyWordPayload } from "@/lib/word-stream-protocol";
import { CLAUDEAI_WORD_SYSTEM_PROMPT, CLAUDEAI_TEXT_SYSTEM_PROMPT, TEXT_SYSTEM_PROMPT_SEPARATOR } from "@/lib/llm/prompts";

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
 
const WORD_TARGET_SIMILAR_LIMIT = 3;

function describeLanguage(code: string): string {
  return `${getLanguageName(code, BUILTIN_LANGUAGES)} (${code})`;
}

function describeLanguages(codes: string[]): string {
  return codes.map((code) => describeLanguage(code)).join(", ");
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


async function requestClaudeAIContentStream(params: {
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
}): Promise<AsyncIterable<string>> {
  const { apiKey, systemPrompt, userPrompt, maxTokens } = params;
  const client = createClaudeAIClient({ apiKey });
  const model = process.env.CLAUDE_MODEL ?? "claude-opus-4-6";
  const stream = await client.messages.stream({
    model,
    temperature: 0,
    max_tokens: maxTokens, 
    system: systemPrompt,
    messages: [ 
      { role: "user", content: userPrompt }
    ]
  });
  return {
    async *[Symbol.asyncIterator]() {
      for await (const chunk of stream) {
        if (
          chunk.type === "content_block_delta" &&
          chunk.delta.type === "text_delta"
        ) {
          yield chunk.delta.text;
        }
      }
    }
  };
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

export function normalizeTextPayloadFromStreamContent(content: string, input: TranslateTextInput): TextTranslationPayload {
  const segments = content
    .split(TEXT_SYSTEM_PROMPT_SEPARATOR)
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
  return `${payload.translations.map((item) => item.translatedText).join(TEXT_SYSTEM_PROMPT_SEPARATOR)}${TEXT_SYSTEM_PROMPT_SEPARATOR}`;
}

function calcWordMaxTokens(targetLanguageCount: number): number {
  const base = 80;           // fixed fields: CORRECTED, POS, PHONETIC, LEMMA, PLURAL, MORPH, DONE
  const perLanguage = 60;    // TRANS + 3 SIMILAR lines per language
  const safetyBuffer = 150;  // edge cases: GENDER lines, long words, SUGGEST lines
  return base + (perLanguage * targetLanguageCount) + safetyBuffer;
}

function calcTextMaxTokens(
  sourceText: string,
  targetLanguageCodes: string[],
  separatorTokens: number = 7
): number {
  // Rough token estimate: ~1 token per 4 chars (English baseline)
  const sourceTokens = Math.ceil(sourceText.length / 4);

  // Expansion buffer: assume worst case ~40% expansion per language
  const expansionRate = 1.4;
  const tokensPerLanguage = Math.ceil(sourceTokens * expansionRate);

  // Total: all languages + separators + safety buffer
  const safetyBuffer = 150;
  return (tokensPerLanguage + separatorTokens) * targetLanguageCodes.length + safetyBuffer;
}

function buildWordStreamUserPrompt(input: TranslateInput): string {
  return [
    `Translate this source word: "${input.sourceWord}"`,
    `Source language: ${describeLanguage(input.sourceLanguage)}`,
    `Target languages: ${describeLanguages(input.targetLanguages)}`
  ].join("\n");
}

function buildTextUserPrompt(input: TranslateTextInput): string {
  return [
    `Source language: ${describeLanguage(input.sourceLanguage)}`,
    `Target languages: ${describeLanguages(input.targetLanguages)}`, 
    `Translate this source text: "${input.sourceText}"`,
  ].join("\n");
}

export async function streamWordTranslationWithClaudeAI(input: TranslateInput): Promise<AsyncIterable<string>> {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    throw new Error("CLAUDE_API_KEY is missing");
  }
  const maxTokens = calcWordMaxTokens(input.targetLanguages.length);
  return requestClaudeAIContentStream({
    apiKey,
    systemPrompt: CLAUDEAI_WORD_SYSTEM_PROMPT,
    userPrompt: buildWordStreamUserPrompt(input),
    maxTokens: maxTokens
  });
}

export async function streamTextTranslationWithClaudeAI(input: TranslateTextInput): Promise<AsyncIterable<string>> {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    throw new Error("CLAUDE_API_KEY is missing");
  }
  const maxTokens = calcTextMaxTokens(input.sourceText, input.targetLanguages, TEXT_SYSTEM_PROMPT_SEPARATOR.length);
  return requestClaudeAIContentStream({
    apiKey,
    systemPrompt: CLAUDEAI_TEXT_SYSTEM_PROMPT,
    userPrompt: buildTextUserPrompt(input),
    maxTokens: maxTokens
  });
}
