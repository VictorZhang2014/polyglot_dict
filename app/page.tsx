"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { InfoCircledIcon, MagnifyingGlassIcon, SpeakerLoudIcon } from "@radix-ui/react-icons";
import { Badge, Box, Callout, Card, Flex, Grid, Heading, Select, Text } from "@radix-ui/themes";
import { addQueryHistory } from "@/lib/history-storage";
import { BUILTIN_LANGUAGES, getLanguageName } from "@/lib/languages";
import { DEFAULT_SETTINGS, getAllLanguageOptions, readSettings } from "@/lib/settings-storage";
import { buildTranslationCacheKey, getTranslationCacheEntry, setTranslationCacheEntry } from "@/lib/translation-cache-indexeddb";
import { TranslateApiResponse, TranslationPayload } from "@/lib/types";
import { useI18n } from "@/lib/use-i18n";
import { applyWordProtocolEvent, createEmptyWordPayload, parseWordProtocolLine } from "@/lib/word-stream-protocol";
import { supportsVerbConjugationLanguage } from "@/lib/verb-conjugation";
const QUERY_PAGE_STATE_KEY = "polyglot_dict_query_page_state_v1";
const SPEECH_LANG_MAP: Record<string, string> = {
  de: "de-DE",
  en: "en-US",
  fr: "fr-FR",
  zh: "zh-CN",
  es: "es-ES",
  it: "it-IT",
  pt: "pt-PT",
  ja: "ja-JP",
  ko: "ko-KR",
  ru: "ru-RU",
  ar: "ar-SA"
};
const LANGUAGE_FLAGS: Record<string, string> = {
  de: "🇩🇪",
  en: "🇬🇧",
  fr: "🇫🇷",
  zh: "🇨🇳",
  es: "🇪🇸",
  it: "🇮🇹",
  pt: "🇵🇹",
  ja: "🇯🇵",
  ko: "🇰🇷",
  ru: "🇷🇺",
  ar: "🇸🇦"
};
const SELF_LANGUAGE_LABELS: Record<string, string> = {
  de: "Deutsch",
  en: "English",
  fr: "Français",
  zh: "中文",
  es: "Español",
  it: "Italiano",
  pt: "Português",
  ja: "日本語",
  ko: "한국어",
  ru: "Русский",
  ar: "العربية"
};

type QueryPagePersistedState = {
  sourceWord: string;
  sourceLanguage: string;
  response: TranslateApiResponse | null;
  error: string;
};

type WordTone = "gray" | "direct" | "similar";
type WordSize = "xl" | "lg" | "md" | "sm";
const GENDERED_LANGUAGE_CODES = new Set(["de", "fr", "es", "it", "pt", "ru", "ar"]);

function getLanguageFlag(code: string): string {
  return LANGUAGE_FLAGS[code] ?? "🌐";
}

function normalizeWord(value: string): string {
  return value.trim().toLowerCase();
}

function supportsGrammaticalGender(code: string): boolean {
  return GENDERED_LANGUAGE_CODES.has(code.trim().toLowerCase());
}

function getSelfLanguageLabel(code: string, fallback: string): string {
  return SELF_LANGUAGE_LABELS[code] ?? fallback;
}

function resolveSpeechLang(code: string): string {
  return SPEECH_LANG_MAP[code] ?? code;
}

function buildHistoryTranslations(payload: TranslationPayload, targetLanguages: string[]) {
  return targetLanguages.map((targetLanguage) => {
    const translated = payload.translations.find((item) => item.targetLanguage === targetLanguage);
    return {
      targetLanguage,
      directTranslation: translated?.directTranslation ?? ""
    };
  });
}

function resolveHistorySourceWord(payload: TranslationPayload, fallbackWord: string): string {
  const corrected = payload.correctedSourceWord?.trim() ?? "";
  if (corrected) {
    return corrected;
  }

  const sourceWord = payload.sourceWord?.trim() ?? "";
  if (sourceWord) {
    return sourceWord;
  }

  return fallbackWord.trim();
}

function hasAnyDirectTranslation(payload: TranslationPayload, targetLanguages: string[]): boolean {
  const map = new Map(payload.translations.map((item) => [item.targetLanguage, item.directTranslation.trim()]));
  return targetLanguages.some((code) => Boolean(map.get(code)));
}

function shouldShowSourceSuggestions(payload: TranslationPayload): boolean {
  const hasResolvedTranslations = payload.translations.some(
    (item) => Boolean(item.directTranslation.trim()) || item.similarWords.length > 0
  );

  return (
    (payload.suggestedSourceWords?.length ?? 0) > 0 &&
    !hasResolvedTranslations &&
    !payload.sourceLemma?.trim() &&
    normalizeWord(payload.sourcePartOfSpeech ?? "") === "unknown"
  );
}

function normalizeStreamingPayload(payload: TranslationPayload, targetLanguages: string[]): TranslationPayload {
  return {
    ...payload,
    suggestedSourceWords: Array.from(new Set(payload.suggestedSourceWords ?? [])).slice(0, 5),
    translations: targetLanguages.map((targetLanguage) => {
      const item = payload.translations.find((entry) => entry.targetLanguage === targetLanguage);
      return {
        targetLanguage,
        directTranslation: item?.directTranslation ?? "",
        similarWords: Array.from(new Set(item?.similarWords ?? [])).slice(0, 3)
      };
    })
  };
}

export default function HomePage() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const lastUrlQueryRef = useRef("");
  const [ready, setReady] = useState(false);
  const [sourceWord, setSourceWord] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState("de");
  const [targetLanguages, setTargetLanguages] = useState(DEFAULT_SETTINGS.targetLanguages);
  const [customLanguages, setCustomLanguages] = useState(DEFAULT_SETTINGS.customLanguages);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [response, setResponse] = useState<TranslateApiResponse | null>(null);
  const getGenderLabel = (value: string): string => {
    switch (value.toLowerCase()) {
      case "masculine":
        return t("gender.masculine");
      case "feminine":
        return t("gender.feminine");
      case "neuter":
        return t("gender.neuter");
      default:
        return value;
    }
  };
  const getPartOfSpeechLabel = (value: string): string => {
    switch (value.toLowerCase()) {
      case "noun":
        return t("pos.noun");
      case "verb":
        return t("pos.verb");
      case "adjective":
        return t("pos.adjective");
      case "adverb":
        return t("pos.adverb");
      case "pronoun":
        return t("pos.pronoun");
      case "preposition":
        return t("pos.preposition");
      case "conjunction":
        return t("pos.conjunction");
      case "interjection":
        return t("pos.interjection");
      case "numeral":
        return t("pos.numeral");
      case "particle":
        return t("pos.particle");
      case "determiner":
        return t("pos.determiner");
      default:
        return t("pos.unknown");
    }
  };

  useEffect(() => {
    const settings = readSettings();
    setTargetLanguages(settings.targetLanguages);
    setCustomLanguages(settings.customLanguages);

    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem(QUERY_PAGE_STATE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<QueryPagePersistedState>;
          if (typeof parsed.sourceWord === "string") {
            setSourceWord(parsed.sourceWord);
          }
          if (typeof parsed.sourceLanguage === "string") {
            setSourceLanguage(parsed.sourceLanguage);
          }
          if (typeof parsed.error === "string") {
            setError(parsed.error);
          }
          if (parsed.response && typeof parsed.response === "object") {
            setResponse(parsed.response as TranslateApiResponse);
          }
        } catch {
          // Ignore invalid persisted state.
        }
      }
    }

    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || typeof window === "undefined") {
      return;
    }

    const snapshot: QueryPagePersistedState = {
      sourceWord,
      sourceLanguage,
      response,
      error
    };

    window.localStorage.setItem(QUERY_PAGE_STATE_KEY, JSON.stringify(snapshot));
  }, [ready, sourceWord, sourceLanguage, response, error]);

  const languageOptions = useMemo(() => getAllLanguageOptions(customLanguages), [customLanguages]);
  const hasResponse = Boolean(response);

  const resolveVisibleTargets = useCallback((languageCode: string) => {
    const normalized = Array.from(new Set(targetLanguages.map((code) => code.trim().toLowerCase()).filter(Boolean)));
    return normalized.filter((code) => code !== languageCode);
  }, [targetLanguages]);

  const visibleTargets = useMemo(() => resolveVisibleTargets(sourceLanguage), [resolveVisibleTargets, sourceLanguage]);

  const speakWord = (word: string, langCode: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !word.trim()) {
      return;
    }

    const utterance = new SpeechSynthesisUtterance(word);
    const lang = resolveSpeechLang(langCode);
    utterance.lang = lang;

    const baseLang = lang.toLowerCase().split("-")[0];
    const voice = window.speechSynthesis
      .getVoices()
      .find((item) => item.lang.toLowerCase().startsWith(baseLang));
    if (voice) {
      utterance.voice = voice;
    }

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const renderSpeakableWord = (
    word: string,
    langCode: string,
    tone: WordTone,
    size: WordSize,
    key: string,
    options?: {
      queryHref?: string;
    }
  ) => (
    <div key={key} className={`word-token word-tone-${tone} word-size-${size}`}>
      {options?.queryHref ? (
        <button
          type="button"
          className="word-text-btn"
          aria-label={t("home.aria.queryWord", { word })}
          onClick={() => router.push(options.queryHref as string)}
        >
          {word}
        </button>
      ) : (
        <span>{word}</span>
      )}
      <button type="button" className="word-speak-btn" aria-label={t("home.aria.speakWord", { word })} onClick={() => speakWord(word, langCode)}>
        <SpeakerLoudIcon />
      </button>
    </div>
  );

  const filledTranslations = useMemo(() => {
    const map = new Map(response?.data.translations.map((item) => [item.targetLanguage, item]) ?? []);
    return visibleTargets.map((code) => {
      return (
        map.get(code) ?? {
          targetLanguage: code,
          directTranslation: "",
          similarWords: []
        }
      );
    });
  }, [response, visibleTargets]);

  const sourcePhonetic = useMemo(() => {
    if (!response) {
      return "";
    }

    return response.data.sourcePhonetic?.trim() ?? "";
  }, [response]);

  const correctedSourceWord = useMemo(() => {
    if (!response) {
      return "";
    }

    const corrected = response.data.correctedSourceWord?.trim() ?? "";
    if (!corrected) {
      return "";
    }

    return normalizeWord(corrected) === normalizeWord(response.data.sourceWord) ? "" : corrected;
  }, [response]);

  const sourcePartOfSpeech = response?.data.sourcePartOfSpeech ?? "";
  const sourceLemma = response?.data.sourceLemma?.trim() ?? "";
  const sourcePluralForm = response?.data.sourcePluralForm?.trim() ?? "";
  const suggestedSourceWords = useMemo(() => {
    if (!response || !shouldShowSourceSuggestions(response.data)) {
      return [];
    }

    return response.data.suggestedSourceWords ?? [];
  }, [response]);
  const sourceMorphology = response?.data.sourceMorphology?.trim() ?? "";
  const allowGenderDisplay = supportsGrammaticalGender(sourceLanguage);
  const sourceGenderHints =
    sourcePartOfSpeech.toLowerCase() === "noun" && allowGenderDisplay ? (response?.data.sourceGenderHints ?? []) : [];
  const displaySourceWord = useMemo(() => {
    if (correctedSourceWord) {
      return correctedSourceWord;
    }

    const queriedSourceWord = response?.data.sourceWord?.trim() ?? "";
    if (queriedSourceWord) {
      return queriedSourceWord;
    }

    return sourceWord.trim();
  }, [correctedSourceWord, response, sourceWord]);
  const displaySourceGender = useMemo(() => {
    if (sourcePartOfSpeech.toLowerCase() !== "noun" || sourceGenderHints.length === 0 || !displaySourceWord) {
      return "";
    }

    const matchedHint =
      sourceGenderHints.find((hint) => normalizeWord(hint.word) === normalizeWord(displaySourceWord)) ?? sourceGenderHints[0];

    return getGenderLabel(matchedHint.gender);
  }, [sourcePartOfSpeech, sourceGenderHints, displaySourceWord, t]);

  const sourceMetaLine = useMemo(() => {
    if (!response) {
      return "";
    }

    const chunks: string[] = [];
    if (sourcePartOfSpeech && sourcePartOfSpeech !== "unknown") {
      const isInflectedForm =
        Boolean(sourceLemma) && normalizeWord(sourceLemma) !== normalizeWord(displaySourceWord);

      const posLabel = getPartOfSpeechLabel(sourcePartOfSpeech);
      chunks.push(
        isInflectedForm
          ? t("home.meta.posWithLemma", { pos: posLabel, lemma: sourceLemma })
          : t("home.meta.pos", { pos: posLabel })
      );
    } else if (sourceLemma && normalizeWord(sourceLemma) !== normalizeWord(displaySourceWord)) {
      chunks.push(t("home.meta.lemma", { lemma: sourceLemma }));
    }

    if (sourcePartOfSpeech.toLowerCase() === "noun" && sourcePluralForm) {
      chunks.push(t("home.meta.plural", { plural: sourcePluralForm }));
    }

    if (displaySourceGender) {
      chunks.push(t("home.meta.gender", { gender: displaySourceGender }));
    }

    if (!displaySourceGender && allowGenderDisplay && sourcePartOfSpeech.toLowerCase() === "noun") {
      chunks.push(t("home.meta.genderUnknown"));
    }

    return chunks.join(" · ");
  }, [response, sourcePartOfSpeech, sourceLemma, sourcePluralForm, displaySourceGender, displaySourceWord, allowGenderDisplay, t]);
  const displaySourceMorphology = useMemo(() => {
    if (!sourceMorphology) {
      return "";
    }

    const normalizedMorphology = normalizeWord(sourceMorphology).replace(/['"`]/g, "");
    const normalizedPluralForm = normalizeWord(sourcePluralForm).replace(/['"`]/g, "");
    const repeatsPluralInfo =
      sourcePartOfSpeech.toLowerCase() === "noun" &&
      Boolean(normalizedPluralForm) &&
      normalizedMorphology.includes("plural") &&
      normalizedMorphology.includes(normalizedPluralForm);

    return repeatsPluralInfo ? "" : sourceMorphology;
  }, [sourceMorphology, sourcePluralForm, sourcePartOfSpeech]);
  const conjugationSourceWord = useMemo(() => {
    if (sourcePartOfSpeech.toLowerCase() !== "verb") {
      return "";
    }

    return sourceLemma || correctedSourceWord || displaySourceWord;
  }, [sourcePartOfSpeech, sourceLemma, correctedSourceWord, displaySourceWord]);
  const showVerbConjugationLink = Boolean(
    conjugationSourceWord && supportsVerbConjugationLanguage(sourceLanguage) && sourcePartOfSpeech.toLowerCase() === "verb"
  );
  const isTimeoutError = useMemo(() => {
    return error.toLowerCase().includes("timed out");
  }, [error]);

  const runQuery = useCallback(async (word: string, languageCode: string) => {
    setError("");
    setResponse(null);
    if (!word) {
      setError(t("home.error.enterWord"));
      return;
    }
    if (word.length > 32) {
      setError(t("home.error.wordTooLong"));
      return;
    }

    const targets = resolveVisibleTargets(languageCode);
    const cacheKey = buildTranslationCacheKey(word, languageCode, targets);

    if (targets.length === 0) {
      setError(t("home.error.needTargets"));
      return;
    }

    setLoading(true);

    try {
      const localCached = await getTranslationCacheEntry(cacheKey);
      if (localCached) {
        if (!hasAnyDirectTranslation(localCached.data, targets)) {
          // Ignore stale/invalid cache entries that miss direct translations.
        } else {
          const cachedResponse: TranslateApiResponse = {
            fromCache: true,
            cachedAt: localCached.cachedAt,
            data: localCached.data
          };

          addQueryHistory({
            sourceWord: resolveHistorySourceWord(cachedResponse.data, word),
            sourceLanguage: languageCode,
            targetLanguages: targets,
            targetTranslations: buildHistoryTranslations(cachedResponse.data, targets)
          });

          setResponse(cachedResponse);
          return;
        }
      }

      const res = await fetch("/api/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sourceWord: word,
          sourceLanguage: languageCode,
          targetLanguages: targets
        })
      });

      const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
      const isJson = contentType.includes("application/json");
      const fromCache = (res.headers.get("x-polyglot-from-cache") ?? "").toLowerCase() === "true";

      if (!res.ok) {
        const rawBody = isJson ? "" : await res.text();
        const data = (isJson ? await res.json() : null) as ({ error?: string } | null);
        if (data?.error) {
          throw new Error(data.error);
        }

        if (rawBody) {
          const snippet = rawBody.replace(/\s+/g, " ").slice(0, 180);
          throw new Error(`API ${res.status}: ${snippet}`);
        }

        throw new Error(t("home.error.queryFailed"));
      }

      let currentPayload = createEmptyWordPayload({
        sourceWord: word,
        sourceLanguage: languageCode,
        targetLanguages: targets
      });

      const applyProtocolLine = (line: string) => {
        const event = parseWordProtocolLine(line);
        if (!event) {
          return;
        }

        currentPayload = applyWordProtocolEvent(currentPayload, event);
        setResponse({
          fromCache,
          data: currentPayload
        });
      };

      setResponse({
        fromCache,
        data: currentPayload
      });

      if (!res.body) {
        const rawBody = isJson ? "" : await res.text();
        if (!rawBody) {
          throw new Error(`API ${res.status} returned an empty response.`);
        }

        for (const line of rawBody.split(/\r?\n/)) {
          applyProtocolLine(line);
        }
      } else {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value: chunk, done } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(chunk, { stream: true });

          let lineBreakIndex = buffer.indexOf("\n");
          while (lineBreakIndex !== -1) {
            const line = buffer.slice(0, lineBreakIndex);
            applyProtocolLine(line);
            buffer = buffer.slice(lineBreakIndex + 1);
            lineBreakIndex = buffer.indexOf("\n");
          }
        }

        buffer += decoder.decode();
        if (buffer.trim()) {
          applyProtocolLine(buffer);
        }
      }

      const normalizedPayload = normalizeStreamingPayload(currentPayload, targets);
      setResponse({
        fromCache,
        data: normalizedPayload
      });

      const hasDirectTranslation = hasAnyDirectTranslation(normalizedPayload, targets);
      const hasResolvedWordData =
        hasDirectTranslation ||
        normalizedPayload.sourcePartOfSpeech !== "unknown" ||
        Boolean(normalizedPayload.correctedSourceWord?.trim()) ||
        Boolean(normalizedPayload.sourceLemma?.trim()) ||
        Boolean(normalizedPayload.sourcePluralForm?.trim()) ||
        Boolean(normalizedPayload.sourceMorphology?.trim()) ||
        (normalizedPayload.sourceGenderHints?.length ?? 0) > 0;

      if (hasDirectTranslation) {
        await setTranslationCacheEntry(cacheKey, normalizedPayload);
      }

      if (hasResolvedWordData) {
        addQueryHistory({
          sourceWord: resolveHistorySourceWord(normalizedPayload, word),
          sourceLanguage: languageCode,
          targetLanguages: targets,
          targetTranslations: buildHistoryTranslations(normalizedPayload, targets)
        });
      }
    } catch (queryError) {
      const message = queryError instanceof Error ? queryError.message : t("home.error.queryFailed");
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [resolveVisibleTargets, t]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await runQuery(sourceWord.trim(), sourceLanguage);
  };

  const handleSourceLanguageChange = (nextLanguage: string) => {
    setSourceLanguage(nextLanguage);
    setResponse(null);
    setError("");
  };

  useEffect(() => {
    if (!ready) {
      return;
    }

    const queryWord = (searchParams.get("q") ?? searchParams.get("word") ?? "").trim();
    if (!queryWord) {
      return;
    }

    const queryCode = (searchParams.get("code") ?? "").trim().toLowerCase();
    const signature = `q=${queryWord.toLowerCase()}|code=${queryCode}`;
    if (lastUrlQueryRef.current === signature) {
      return;
    }
    lastUrlQueryRef.current = signature;

    const availableCodes = new Set(languageOptions.map((item) => item.code));
    const nextLanguage = queryCode && availableCodes.has(queryCode) ? queryCode : sourceLanguage;

    setSourceWord(queryWord);
    if (nextLanguage !== sourceLanguage) {
      setSourceLanguage(nextLanguage);
    }

    void runQuery(queryWord, nextLanguage);
  }, [ready, searchParams, languageOptions, sourceLanguage, runQuery]);

  return (
    <Flex direction="column" gap="4">
      <Card size="2" className="query-topbar">
        <form onSubmit={handleSubmit}>
          <div className="query-omni">
            <Select.Root value={sourceLanguage} onValueChange={handleSourceLanguageChange}>
              <Select.Trigger className="query-omni-lang">
                <span className="query-omni-lang-content">
                  <span>{getLanguageFlag(sourceLanguage)}</span>
                  <span>{sourceLanguage.toUpperCase()}</span>
                </span>
              </Select.Trigger>
              <Select.Content position="popper">
                {BUILTIN_LANGUAGES.map((item) => (
                  <Select.Item key={item.code} value={item.code}>
                    {getLanguageFlag(item.code)} {item.name}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>

            <input
              className="query-omni-input"
              type="text"
              inputMode="text"
              autoComplete="off"
              maxLength={32}
              placeholder={t("home.input.placeholder")}
              value={sourceWord}
              onChange={(event) => setSourceWord(event.target.value)}
            />

            <button className="query-omni-submit" type="submit" disabled={loading || !ready} aria-label={loading ? t("home.searching") : t("home.search")}>
              {loading ? <span className="query-btn-spinner" aria-hidden="true" /> : <MagnifyingGlassIcon />}
            </button>
          </div>
        </form>
      </Card>

      <Text color="gray" size="2">
        {t("home.targetSummary", {
          languages: visibleTargets.map((code) => getLanguageName(code, languageOptions)).join(" / ")
        })}
      </Text>

      {error ? (
        <Callout.Root color={isTimeoutError ? "blue" : "gray"} variant="soft">
          <Callout.Icon>
            <InfoCircledIcon />
          </Callout.Icon>
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      ) : null}

      <Flex direction="column" gap="4">
        <Flex align="center" justify="between" gap="3">
          <Heading size="5">{t("home.result")}</Heading>
          <Badge size="2" color="gray" variant="soft">
            {hasResponse ? (response?.fromCache ? t("badge.fromCache") : t("badge.live")) : t("badge.waitingQuery")}
          </Badge>
        </Flex>

        <Card>
          <Flex direction="column" gap="3">
            <Flex align="center" gap="2" wrap="wrap">
              <Text className="word-label">{t("home.queryWord")}</Text>
              {displaySourceWord
                ? renderSpeakableWord(displaySourceWord, sourceLanguage, "gray", "lg", `source:${displaySourceWord}`)
                : (
                  <Badge variant="soft" color="gray">
                    {t("home.pendingInput")}
                  </Badge>
                )}
              <Text className="word-phonetic-inline">{sourcePhonetic ? `/${sourcePhonetic}/` : t("home.phoneticPending")}</Text>
            </Flex>
            {sourceMetaLine ? <Text className="query-analysis-hint">{sourceMetaLine}</Text> : null}
            {displaySourceMorphology ? <Text className="query-analysis-hint">{t("home.morphology", { value: displaySourceMorphology })}</Text> : null}
            {showVerbConjugationLink ? (
              <Text className="query-analysis-hint">
                <Link
                  className="query-conjugation-link"
                  href={`/conjugation?q=${encodeURIComponent(conjugationSourceWord)}&code=${encodeURIComponent(sourceLanguage)}`}
                >
                  {t("home.showConjugation")}
                </Link>
              </Text>
            ) : null}
            {suggestedSourceWords.length > 0 ? (
              <Box>
                <Text className="word-label" mb="2">
                  {t("home.suggestions")}
                </Text>
                <div className="word-block">
                  {suggestedSourceWords.map((word, index) =>
                    renderSpeakableWord(
                      word,
                      sourceLanguage,
                      "similar",
                      "md",
                      `suggested:${index}:${word}`,
                      {
                        queryHref: `/?q=${encodeURIComponent(word)}&code=${encodeURIComponent(sourceLanguage)}`
                      }
                    )
                  )}
                </div>
              </Box>
            ) : null}

          </Flex>
        </Card>

        <Grid columns={{ initial: "1", md: "2" }} gap="4">
          {filledTranslations.map((item) => {
            const rawLanguageName = getLanguageName(item.targetLanguage, languageOptions);
            const cardTitle = `${getLanguageFlag(item.targetLanguage)} ${getSelfLanguageLabel(item.targetLanguage, rawLanguageName)}`;
            const similarWords = item.similarWords.filter(
              (word) => normalizeWord(word) !== normalizeWord(item.directTranslation)
            ).slice(0, 3);

            return (
              <Card key={item.targetLanguage}>
                <Flex direction="column" gap="3">
                  <Heading size="4">{cardTitle}</Heading>
                  <Box>
                    <Text className="word-label" mb="2">
                      {t("home.direct")}
                    </Text>
                    {item.directTranslation ? (
                      <div className="word-block">
                        {renderSpeakableWord(
                          item.directTranslation,
                          item.targetLanguage,
                          "direct",
                          "lg",
                          `direct:${item.targetLanguage}:${item.directTranslation}`,
                          {
                            queryHref: `/?q=${encodeURIComponent(item.directTranslation)}&code=${encodeURIComponent(item.targetLanguage)}`
                          }
                        )}
                      </div>
                    ) : (
                      <Badge variant="soft" color="gray">
                        {t("home.pendingQuery")}
                      </Badge>
                    )}
                  </Box>

                  <Box>
                    <Text className="word-label" mb="2">
                      {t("home.similar")}
                    </Text>
                    <div className="word-block">
                      {similarWords.length > 0 ? (
                        similarWords.map((word, index) =>
                          renderSpeakableWord(
                            word,
                            item.targetLanguage,
                            "similar",
                            "md",
                            `similar:${item.targetLanguage}:${index}:${word}`,
                            {
                              queryHref: `/?q=${encodeURIComponent(word)}&code=${encodeURIComponent(item.targetLanguage)}`
                            }
                          )
                        )
                      ) : (
                        <Badge variant="soft" color="gray">
                          {t("home.pendingQuery")}
                        </Badge>
                      )}
                    </div>
                  </Box>

                </Flex>
              </Card>
            );
          })}
        </Grid>
      </Flex>
    </Flex>
  );
}
