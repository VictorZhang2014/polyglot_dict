"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircledIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  InfoCircledIcon
} from "@radix-ui/react-icons";
import { Badge, Button, Callout, Card, Checkbox, Flex, Grid, Heading, Select, Text } from "@radix-ui/themes";
import { BUILTIN_LANGUAGES } from "@/lib/languages";
import { useI18n } from "@/lib/use-i18n";
import { DEFAULT_SETTINGS, readSettings, writeSettings } from "@/lib/settings-storage";
import { AppSettings } from "@/lib/types";
import packageJson from "@/package.json";

const BUILTIN_CODE_SET = new Set(BUILTIN_LANGUAGES.map((item) => item.code));

type MessageState = "" | "saved" | "copied";
const CONTACT_EMAIL = "contact@parlerai.app";
const APP_VERSION = packageJson.version;

function normalizeCode(value: string): string {
  return value.trim().toLowerCase();
}

function sanitizeTargets(codes: string[]): string[] {
  return Array.from(new Set(codes.map(normalizeCode))).filter((code) => BUILTIN_CODE_SET.has(code));
}

function getLanguageLabel(code: string): string {
  return BUILTIN_LANGUAGES.find((item) => item.code === code)?.name ?? code;
}

export default function SettingsPage() {
  const { t } = useI18n();
  const [targetLanguages, setTargetLanguages] = useState(DEFAULT_SETTINGS.targetLanguages);
  const [uiLanguage, setUiLanguage] = useState(DEFAULT_SETTINGS.uiLanguage);
  const [message, setMessage] = useState<MessageState>("");

  useEffect(() => {
    const settings = readSettings();
    const normalized = sanitizeTargets(settings.targetLanguages);
    const finalTargets = normalized.length > 0 ? normalized : DEFAULT_SETTINGS.targetLanguages;
    const finalUi = BUILTIN_CODE_SET.has(settings.uiLanguage) ? settings.uiLanguage : DEFAULT_SETTINGS.uiLanguage;
    setTargetLanguages(finalTargets);
    setUiLanguage(finalUi);
  }, []);

  const updateAndPersist = (nextTargets: string[], nextUiLanguage?: string) => {
    const normalized = sanitizeTargets(nextTargets);
    const finalTargets = normalized.length > 0 ? normalized : DEFAULT_SETTINGS.targetLanguages;
    const candidateUi = normalizeCode(nextUiLanguage ?? uiLanguage);
    const finalUi = BUILTIN_CODE_SET.has(candidateUi) ? candidateUi : DEFAULT_SETTINGS.uiLanguage;

    const saved = writeSettings({
      targetLanguages: finalTargets,
      customLanguages: [],
      uiLanguage: finalUi
    } satisfies AppSettings);

    setTargetLanguages(saved.targetLanguages);
    setUiLanguage(saved.uiLanguage);
    setMessage("saved");
    window.setTimeout(() => setMessage(""), 1200);
  };

  const toggleLanguage = (code: string, checked: boolean) => {
    const normalized = normalizeCode(code);
    const nextTargets = checked
      ? Array.from(new Set([...targetLanguages, normalized]))
      : targetLanguages.filter((item) => item !== normalized);

    updateAndPersist(nextTargets);
  };

  const moveLanguage = (code: string, direction: "up" | "down") => {
    const index = targetLanguages.indexOf(code);
    if (index < 0) {
      return;
    }

    const delta = direction === "up" ? -1 : 1;
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= targetLanguages.length) {
      return;
    }

    const next = [...targetLanguages];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    updateAndPersist(next);
  };

  const copyContactEmail = async () => {
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL);
    } catch {
      const input = document.createElement("textarea");
      input.value = CONTACT_EMAIL;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
    setMessage("copied");
    window.setTimeout(() => setMessage(""), 1200);
  };

  return (
    <Flex direction="column" gap="5">
      <Card size="4">
        <Flex direction="column" gap="2">
          <Heading size="7">{t("settings.title")}</Heading>
          <Text size="3" color="gray">
            {t("settings.desc")}
          </Text>
        </Flex>
      </Card>

      <Card>
        <Flex direction="column" gap="4">
          <Heading size="4">{t("settings.uiLanguage")}</Heading>
          <Text size="2" color="gray">
            {t("settings.uiLanguageHint")}
          </Text>
          <Select.Root
            value={uiLanguage}
            onValueChange={(value) => {
              updateAndPersist(targetLanguages, value);
            }}
          >
            <Select.Trigger />
            <Select.Content position="popper">
              {BUILTIN_LANGUAGES.map((item) => (
                <Select.Item key={item.code} value={item.code}>
                  {item.name} ({item.code})
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </Flex>
      </Card>

      <Card>
        <Flex direction="column" gap="4">
          <Heading size="4">{t("settings.target")}</Heading>
          <Grid columns={{ initial: "1", sm: "2" }} gap="3">
            {BUILTIN_LANGUAGES.map((item) => (
              <label key={item.code}>
                <Flex align="center" gap="2">
                  <Checkbox
                    checked={targetLanguages.includes(item.code)}
                    onCheckedChange={(checked) => toggleLanguage(item.code, checked === true)}
                  />
                  <Text size="2">
                    {item.name} ({item.code})
                  </Text>
                </Flex>
              </label>
            ))}
          </Grid>
        </Flex>
      </Card>

      <Card>
        <Flex direction="column" gap="4">
          <Heading size="4">{t("settings.order")}</Heading>
          <Text size="2" color="gray">
            {t("settings.orderHint")}
          </Text>
          <Flex direction="column" gap="2">
            {targetLanguages.map((code, index) => (
              <Card key={code} size="1">
                <Flex align="center" justify="between" gap="3">
                  <Flex align="center" gap="2">
                    <Badge color="gray" variant="soft">
                      {index + 1}
                    </Badge>
                    <Text size="2">{getLanguageLabel(code)}</Text>
                    <Text size="1" color="gray">
                      ({code})
                    </Text>
                  </Flex>
                  <Flex align="center" gap="1">
                    <Button
                      type="button"
                      size="1"
                      variant="soft"
                      color="gray"
                      disabled={index === 0}
                      onClick={() => moveLanguage(code, "up")}
                    >
                      <ChevronUpIcon />
                    </Button>
                    <Button
                      type="button"
                      size="1"
                      variant="soft"
                      color="gray"
                      disabled={index === targetLanguages.length - 1}
                      onClick={() => moveLanguage(code, "down")}
                    >
                      <ChevronDownIcon />
                    </Button>
                  </Flex>
                </Flex>
              </Card>
            ))}
          </Flex>
        </Flex>
      </Card>

      {message ? (
        <Callout.Root color="gray" variant="soft">
          <Callout.Icon>{message === "saved" ? <CheckCircledIcon /> : <InfoCircledIcon />}</Callout.Icon>
          <Callout.Text>{message === "saved" ? t("settings.saved") : t("settings.contactCopied")}</Callout.Text>
        </Callout.Root>
      ) : null}

      <Card>
        <button
          type="button"
          onClick={copyContactEmail}
          aria-label={t("settings.contact")}
          style={{
            all: "unset",
            width: "100%",
            cursor: "pointer"
          }}
        >
          <Flex align="center" justify="between" gap="3">
            <Text size="3">{t("settings.contact")}</Text>
            <Flex align="center" gap="1">
              <Text size="2" color="gray">
                {CONTACT_EMAIL}
              </Text> 
            </Flex>
          </Flex>
        </button>
      </Card>

      <Card>
        <Flex direction="column" gap="3">
          <Text asChild size="3">
            <Link href="/privacy-policy">
              <Flex align="center" justify="between" gap="3">
                <Text size="3">{t("settings.privacyPolicy")}</Text>
                <Text size="2" color="gray" aria-hidden>
                  <ChevronRightIcon />
                </Text>
              </Flex>
            </Link>
          </Text>
          <Text asChild size="3">
            <Link href="/user-agreement">
              <Flex align="center" justify="between" gap="3">
                <Text size="3">{t("settings.userAgreement")}</Text>
                <Text size="2" color="gray" aria-hidden>
                  <ChevronRightIcon />
                </Text>
              </Flex>
            </Link>
          </Text>
          <Flex align="center" justify="between" gap="3">
            <Text size="3">{t("settings.version")}</Text>
            <Text size="2" color="gray">
              {APP_VERSION}
            </Text>
          </Flex>
        </Flex>
      </Card>
    </Flex>
  );
}
