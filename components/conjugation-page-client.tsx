"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeftIcon, EnvelopeClosedIcon, InfoCircledIcon } from "@radix-ui/react-icons";
import { Badge, Box, Callout, Flex, IconButton } from "@radix-ui/themes";
import { VerbConjugationPanel } from "@/components/verb-conjugation-panel";
import type { VerbConjugationApiResponse } from "@/lib/lang-conjugation/types";
import { BUILTIN_LANGUAGES, getLanguageName } from "@/lib/languages";
import { useI18n } from "@/lib/use-i18n";
import {
  getConjugationMoodLabelKeys,
  getConjugationTenseLabelKeys,
  supportsVerbConjugationLanguage
} from "@/lib/verb-conjugation";

const CONJUGATION_LANGUAGE_LABELS: Record<string, string> = {
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

const CONTACT_EMAIL = "contact@parlerai.app";

function normalizeConjugationEntry(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ").normalize("NFC");
}

type ConjugationPageClientProps = {
  relatedEntries: string[];
  sourceWord: string;
  sourceLanguage: string;
};

export function ConjugationPageClient({
  relatedEntries,
  sourceWord,
  sourceLanguage
}: ConjugationPageClientProps) {
  const { t } = useI18n();
  const isSupported = supportsVerbConjugationLanguage(sourceLanguage);
  const languageName = sourceLanguage ? getLanguageName(sourceLanguage, BUILTIN_LANGUAGES) : "";
  const queryLanguageLabel = sourceLanguage
    ? CONJUGATION_LANGUAGE_LABELS[sourceLanguage] ?? languageName.replace(/\s*\(.+\)\s*$/, "")
    : "";
  const normalizedWord = useMemo(() => sourceWord.trim(), [sourceWord]);
  const normalizedWordKey = useMemo(() => normalizeConjugationEntry(sourceWord), [sourceWord]);
  const normalizedRelatedEntries = useMemo(
    () => relatedEntries.map((entry) => entry.trim()).filter(Boolean),
    [relatedEntries]
  );
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [response, setResponse] = useState<VerbConjugationApiResponse | null>(null);
  const pendingReasonMessage = useMemo(() => {
    if (!response || response.status !== "pending_backend") {
      return "";
    }

    switch (response.reason) {
      case "invalid":
        return t("conjugation.pending.invalid");
      case "irregular":
        return t("conjugation.pending.irregular");
      case "pronominal":
        return t("conjugation.pending.pronominal");
      case "spelling":
        return t("conjugation.pending.spelling");
      case "not_found":
      default:
        return t("conjugation.pendingBackend");
    }
  }, [response, t]);

  useEffect(() => {
    if (!normalizedWord || !sourceLanguage || !isSupported) {
      setLoading(false);
      setRequestError("");
      setResponse(null);
      return;
    }

    const controller = new AbortController();

    async function loadConjugation() {
      setLoading(true);
      setRequestError("");

      try {
        const res = await fetch(
          `/api/conjugation?q=${encodeURIComponent(normalizedWord)}&code=${encodeURIComponent(sourceLanguage)}`,
          {
            cache: "no-store",
            signal: controller.signal
          }
        );
        const data = (await res.json()) as VerbConjugationApiResponse;
        setResponse(data);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        console.error("[conjugation] failed to load verb conjugation:", error);
        setRequestError(t("conjugation.error"));
        setResponse(null);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadConjugation();

    return () => {
      controller.abort();
    };
  }, [isSupported, normalizedWord, sourceLanguage, t]);

  return (
    <Flex direction="column" gap="4">
      <Box className="conjugation-page-header">
        <div className="conjugation-page-header-top">
          <div className="conjugation-page-header-left">
            <IconButton asChild variant="ghost" color="gray" radius="none" size="3" className="conjugation-back-button">
              <Link href="/" aria-label="Back to home">
                <ChevronLeftIcon className="conjugation-back-icon" />
              </Link>
            </IconButton>
            {normalizedWord ? (
              <div className="conjugation-query-badge-wrap">
                <Badge variant="soft" className="conjugation-query-word-badge">
                  {normalizedWord}
                </Badge>
                {queryLanguageLabel ? (
                  <span className="conjugation-query-language-tag">{queryLanguageLabel}</span>
                ) : null}
              </div>
            ) : null}
          </div>
          <IconButton
            asChild
            variant="soft"
            color="gray"
            radius="full"
            size="3"
            className="conjugation-float-button"
          >
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
                `Conjugation feedback${normalizedWord ? `: ${normalizedWord}` : ""}`
              )}`}
              aria-label="Send feedback email"
              title="Send feedback email"
            >
              <EnvelopeClosedIcon />
            </a>
          </IconButton>
        </div>

        {normalizedRelatedEntries.length > 1 ? (
          <div className="conjugation-related-switch" aria-label={t("conjugation.relatedEntries")}>
            {normalizedRelatedEntries.map((entry) => {
              const isActive = normalizeConjugationEntry(entry) === normalizedWordKey;
              const href = `/conjugation?q=${encodeURIComponent(entry)}&code=${encodeURIComponent(sourceLanguage)}`;

              return (
                <Link
                  key={entry}
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={`conjugation-related-chip${isActive ? " is-active" : ""}`}
                >
                  {entry}
                </Link>
              );
            })}
          </div>
        ) : null}
      </Box>

      {!sourceWord || !sourceLanguage ? (
        <Callout.Root color="gray" variant="soft">
          <Callout.Icon>
            <InfoCircledIcon />
          </Callout.Icon>
          <Callout.Text>
            {t("conjugation.emptyPrefix")} <Link href="/">{t("conjugation.emptyLink")}</Link>
          </Callout.Text>
        </Callout.Root>
      ) : !isSupported ? (
        <Callout.Root color="gray" variant="soft">
          <Callout.Icon>
            <InfoCircledIcon />
          </Callout.Icon>
          <Callout.Text>{t("conjugation.unsupported", { language: languageName || sourceLanguage.toUpperCase() })}</Callout.Text>
        </Callout.Root>
      ) : requestError ? (
        <Callout.Root color="gray" variant="soft">
          <Callout.Icon>
            <InfoCircledIcon />
          </Callout.Icon>
          <Callout.Text>{requestError}</Callout.Text>
        </Callout.Root>
      ) : pendingReasonMessage ? (
        <Callout.Root color="gray" variant="soft">
          <Callout.Icon>
            <InfoCircledIcon />
          </Callout.Icon>
          <Callout.Text>{pendingReasonMessage}</Callout.Text>
        </Callout.Root>
      ) : loading && !response ? (
        <Flex align="center" justify="center" className="conjugation-loading-wrap">
          <div className="conjugation-loading-spinner" aria-label={t("conjugation.loading")} />
        </Flex>
      ) : response?.status === "ok" ? (
        <VerbConjugationPanel
          moodLabelKeys={getConjugationMoodLabelKeys(response.result.language)}
          result={response.result}
          tenseLabelKeys={getConjugationTenseLabelKeys(response.result.language)}
        />
      ) : (
        <Flex align="center" justify="center" className="conjugation-loading-wrap">
          <div className="conjugation-loading-spinner" aria-label={t("conjugation.loading")} />
        </Flex>
      )}
    </Flex>
  );
}
