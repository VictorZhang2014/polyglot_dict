"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ClockIcon, TrashIcon } from "@radix-ui/react-icons";
import { Badge, Button, Card, Flex, Heading, Text } from "@radix-ui/themes";
import { clearQueryHistory, QueryHistoryItem, readQueryHistory } from "@/lib/history-storage";
import { BUILTIN_LANGUAGES, getLanguageName } from "@/lib/languages";
import { readSettings } from "@/lib/settings-storage";
import { useI18n } from "@/lib/use-i18n";

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

function getLanguageFlag(code: string): string {
  return LANGUAGE_FLAGS[code] ?? "🌐";
}

export default function HistoryPage() {
  const { t, dateTimeLocale } = useI18n();
  const [history, setHistory] = useState<QueryHistoryItem[]>([]);
  const [customLanguages, setCustomLanguages] = useState(readSettings().customLanguages);

  useEffect(() => {
    setHistory(readQueryHistory());
    setCustomLanguages(readSettings().customLanguages);
  }, []);

  const languageOptions = useMemo(() => [...BUILTIN_LANGUAGES, ...customLanguages], [customLanguages]);

  const handleClear = () => {
    clearQueryHistory();
    setHistory([]);
  };

  const formatTime = (timestamp: number): string => {
    return new Intl.DateTimeFormat(dateTimeLocale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(timestamp));
  };

  return (
    <Flex direction="column" gap="4">
      <Card size="4">
        <Flex align="center" justify="between" gap="3" wrap="wrap">
          <Flex direction="column" gap="1">
            <Heading size="6">{t("history.title")}</Heading>
            <Text size="2" color="gray">
              {t("history.desc")}
            </Text>
          </Flex>
          <Button variant="soft" color="gray" onClick={handleClear} disabled={history.length === 0}>
            <TrashIcon />
            {t("history.clear")}
          </Button>
        </Flex>
      </Card>

      {history.length === 0 ? (
        <Card>
          <Flex align="center" gap="2">
            <ClockIcon />
            <Text color="gray">{t("history.empty")}</Text>
          </Flex>
        </Card>
      ) : (
        history.map((item) => (
          <Card key={item.id}>
            <Flex direction="column" gap="2">
              <Flex align="start" justify="between" gap="3">
                <Flex align="center" gap="2" wrap="wrap">
                  <Heading size="4">
                    <Link href={`/?q=${encodeURIComponent(item.sourceWord)}&code=${encodeURIComponent(item.sourceLanguage)}`}>
                      {item.sourceWord}
                    </Link>
                  </Heading>
                  <Badge variant="soft" color="gray">
                    {getLanguageFlag(item.sourceLanguage)} {getLanguageName(item.sourceLanguage, languageOptions)}
                  </Badge>
                </Flex>
                <Text size="1" color="gray">
                  {formatTime(item.queriedAt)}
                </Text>
              </Flex>

              {(item.targetTranslations.length > 0
                ? item.targetTranslations
                : item.targetLanguages.map((targetLanguage) => ({ targetLanguage, directTranslation: "" }))
              )
                .slice(0, 3)
                .map((entry, index) => (
                  <Text key={`${item.id}:${entry.targetLanguage}:${index}`} size="2" color="gray">
                    {getLanguageFlag(entry.targetLanguage)} {getLanguageName(entry.targetLanguage, languageOptions)}:{" "}
                    {entry.directTranslation || "-"}
                  </Text>
                ))}
            </Flex>
          </Card>
        ))
      )}
    </Flex>
  );
}
