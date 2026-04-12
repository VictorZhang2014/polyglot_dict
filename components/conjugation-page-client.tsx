"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeftIcon, EnvelopeClosedIcon, InfoCircledIcon } from "@radix-ui/react-icons";
import { Badge, Box, Callout, Flex, Heading, IconButton } from "@radix-ui/themes";
import { VerbConjugationPanel } from "@/components/verb-conjugation-panel";
import type { VerbConjugationApiResponse } from "@/lib/lang-conjugation/types";
import { BUILTIN_LANGUAGES, getLanguageName } from "@/lib/languages";
import { useI18n } from "@/lib/use-i18n";
import {
  getConjugationMoodLabelKeys,
  getConjugationTenseLabelKeys,
  supportsVerbConjugationLanguage
} from "@/lib/verb-conjugation";

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
const CONTACT_EMAIL = "contact@parlerai.app";

type ConjugationPageClientProps = {
  sourceWord: string;
  sourceLanguage: string;
};

export function ConjugationPageClient({
  sourceWord,
  sourceLanguage
}: ConjugationPageClientProps) {
  const { t } = useI18n();
  const isSupported = supportsVerbConjugationLanguage(sourceLanguage);
  const languageName = sourceLanguage ? getLanguageName(sourceLanguage, BUILTIN_LANGUAGES) : "";
  const selfLanguageName = sourceLanguage
    ? SELF_LANGUAGE_LABELS[sourceLanguage] ?? languageName.replace(/\s*\(.+\)\s*$/, "")
    : "";
  const normalizedWord = useMemo(() => sourceWord.trim(), [sourceWord]);
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [response, setResponse] = useState<VerbConjugationApiResponse | null>(null);

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
          <IconButton asChild variant="soft" color="gray" radius="full" size="3" className="conjugation-float-button">
            <Link href="/" aria-label="Back to home">
              <ChevronLeftIcon />
            </Link>
          </IconButton>
          <div className="conjugation-page-title-wrap">
            <Heading size="5" align="center" className="conjugation-page-title">
              动词变位{selfLanguageName ? ` · ${selfLanguageName}` : ""}
            </Heading>
            {normalizedWord ? (
              <Badge variant="soft" className="conjugation-query-word-badge">
                {normalizedWord}
              </Badge>
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
