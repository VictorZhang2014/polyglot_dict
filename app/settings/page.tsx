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
import { AppSettings, ThemeMode } from "@/lib/types";
import packageJson from "@/package.json";

const BUILTIN_CODE_SET = new Set(BUILTIN_LANGUAGES.map((item) => item.code));

type MessageState = "" | "saved" | "copied";
const CONTACT_EMAIL = "contact@parlerai.app";
const MOBILE_WEB_APP_URL = "https://www.parlerai.app";
const ANDROID_APP_URL = "https://play.google.com/store/apps/details?id=parlerai.app";
const X_PROFILE_URL = "https://x.com/ParlerAIApp";
const LINKEDIN_PROFILE_URL = "https://www.linkedin.com/company/ParlerAI";
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

function XIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.9 2H22l-6.78 7.75L23.2 22h-6.26l-4.9-7.42L5.55 22H2.44l7.25-8.29L1.99 2h6.42l4.43 6.77L18.9 2Zm-1.1 18h1.73L7.46 3.9H5.6L17.8 20Z" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4.98 3.5A2.48 2.48 0 1 1 5 8.46a2.48 2.48 0 0 1-.02-4.96ZM2.75 9.5h4.5V21h-4.5V9.5Zm7.25 0h4.31v1.57h.06c.6-1.08 2.07-2.22 4.25-2.22 4.54 0 5.38 2.99 5.38 6.88V21h-4.5v-4.84c0-1.15-.02-2.63-1.6-2.63-1.6 0-1.84 1.25-1.84 2.54V21h-4.5V9.5Z" />
    </svg>
  );
}

function H5Icon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3C7.03 3 3 7.03 3 12s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9Zm6.92 8h-3.05a15.2 15.2 0 0 0-1.37-4.03A7.03 7.03 0 0 1 18.92 11ZM12 5.06c.88 1.07 1.76 3.03 2.16 5.94H9.84C10.24 8.09 11.12 6.13 12 5.06ZM5.08 13h3.05c.14 1.45.58 2.82 1.37 4.03A7.03 7.03 0 0 1 5.08 13Zm3.05-2H5.08a7.03 7.03 0 0 1 4.42-4.03A15.2 15.2 0 0 0 8.13 11ZM12 18.94c-.88-1.07-1.76-3.03-2.16-5.94h4.32c-.4 2.91-1.28 4.87-2.16 5.94ZM14.5 17.03A15.2 15.2 0 0 0 15.87 13h3.05a7.03 7.03 0 0 1-4.42 4.03Z"
        fill="currentColor"
      />
    </svg>
  );
}

function AndroidIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16.61 15.15c.58 0 1.05.47 1.05 1.05v3.3a1.05 1.05 0 1 1-2.1 0v-3.3c0-.58.47-1.05 1.05-1.05Zm-9.22 0c.58 0 1.05.47 1.05 1.05v3.3a1.05 1.05 0 1 1-2.1 0v-3.3c0-.58.47-1.05 1.05-1.05Zm1.11-7.05h7c1.9 0 3.45 1.55 3.45 3.45v4.25H5.05v-4.25c0-1.9 1.55-3.45 3.45-3.45Zm6.49-2.78.95-1.63a.5.5 0 0 0-.86-.5l-.98 1.68a8.14 8.14 0 0 0-4.2 0l-.98-1.68a.5.5 0 1 0-.86.5l.95 1.63A5.28 5.28 0 0 0 6.2 7.6h11.6a5.28 5.28 0 0 0-2.81-2.28ZM9.5 6.42a.63.63 0 1 1 0-1.26.63.63 0 0 1 0 1.26Zm5 0a.63.63 0 1 1 0-1.26.63.63 0 0 1 0 1.26ZM6.1 16.3h2.1v4.05c0 .91.74 1.65 1.65 1.65h4.3c.91 0 1.65-.74 1.65-1.65V16.3h2.1V9.1H6.1v7.2Z" />
    </svg>
  );
}

function FeedbackIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4 5.75A2.75 2.75 0 0 1 6.75 3h10.5A2.75 2.75 0 0 1 20 5.75v12.5A2.75 2.75 0 0 1 17.25 21H6.75A2.75 2.75 0 0 1 4 18.25V5.75Zm2.75-1.25c-.69 0-1.25.56-1.25 1.25v.27l6.5 4.33 6.5-4.33v-.27c0-.69-.56-1.25-1.25-1.25H6.75Zm11.75 3.33-6.08 4.05a.75.75 0 0 1-.84 0L5.5 7.83v10.42c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25V7.83Z" />
    </svg>
  );
}

export default function SettingsPage() {
  const { t } = useI18n();
  const [targetLanguages, setTargetLanguages] = useState(DEFAULT_SETTINGS.targetLanguages);
  const [uiLanguage, setUiLanguage] = useState(DEFAULT_SETTINGS.uiLanguage);
  const [themeMode, setThemeMode] = useState<ThemeMode>(DEFAULT_SETTINGS.themeMode);
  const [message, setMessage] = useState<MessageState>("");

  useEffect(() => {
    const settings = readSettings();
    const normalized = sanitizeTargets(settings.targetLanguages);
    const finalTargets = normalized.length > 0 ? normalized : DEFAULT_SETTINGS.targetLanguages;
    const finalUi = BUILTIN_CODE_SET.has(settings.uiLanguage) ? settings.uiLanguage : DEFAULT_SETTINGS.uiLanguage;
    const finalTheme = settings.themeMode ?? DEFAULT_SETTINGS.themeMode;
    setTargetLanguages(finalTargets);
    setUiLanguage(finalUi);
    setThemeMode(finalTheme);
  }, []);

  const updateAndPersist = (nextTargets: string[], nextUiLanguage?: string, nextThemeMode?: ThemeMode) => {
    const normalized = sanitizeTargets(nextTargets);
    const finalTargets = normalized.length > 0 ? normalized : DEFAULT_SETTINGS.targetLanguages;
    const candidateUi = normalizeCode(nextUiLanguage ?? uiLanguage);
    const finalUi = BUILTIN_CODE_SET.has(candidateUi) ? candidateUi : DEFAULT_SETTINGS.uiLanguage;
    const finalTheme = nextThemeMode ?? themeMode;

    const saved = writeSettings({
      targetLanguages: finalTargets,
      customLanguages: [],
      uiLanguage: finalUi,
      themeMode: finalTheme
    } satisfies AppSettings);

    setTargetLanguages(saved.targetLanguages);
    setUiLanguage(saved.uiLanguage);
    setThemeMode(saved.themeMode);
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

          <Heading size="4">{t("settings.themeMode")}</Heading>
          <Text size="2" color="gray">
            {t("settings.themeModeHint")}
          </Text>
          <Select.Root
            value={themeMode}
            onValueChange={(value) => {
              updateAndPersist(targetLanguages, uiLanguage, value as ThemeMode);
            }}
          >
            <Select.Trigger />
            <Select.Content position="popper">
              <Select.Item value="system">{t("settings.themeOptionSystem")}</Select.Item>
              <Select.Item value="light">{t("settings.themeOptionLight")}</Select.Item>
              <Select.Item value="dark">{t("settings.themeOptionDark")}</Select.Item>
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
                    color={targetLanguages.includes(item.code) ? "grass" : "gray"}
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
            <Flex align="center" gap="2">
              <FeedbackIcon />
              <Text size="3">{t("settings.contact")}</Text>
            </Flex>
            <Flex align="center" gap="1">
              <Text size="2" color="gray">
                {CONTACT_EMAIL}
              </Text> 
            </Flex>
          </Flex>
        </button>
      </Card>

      <Card>
        <Flex direction="column" gap="4">
          <Heading size="4">{t("settings.appDownloads")}</Heading>
          <Flex direction="column" gap="3">
            <Text asChild size="3">
              <a href={MOBILE_WEB_APP_URL} target="_blank" rel="noreferrer">
                <Flex align="center" justify="between" gap="3">
                  <Flex align="center" gap="2">
                    <H5Icon />
                    <Text size="3">{t("settings.appDownloadsH5")}</Text>
                  </Flex>
                  <Text size="2" color="gray" aria-hidden>
                    <ChevronRightIcon />
                  </Text>
                </Flex>
              </a>
            </Text>
            <Text asChild size="3">
              <a href={ANDROID_APP_URL} target="_blank" rel="noreferrer">
                <Flex align="center" justify="between" gap="3">
                  <Flex align="center" gap="2">
                    <AndroidIcon />
                    <Text size="3">{t("settings.appDownloadsAndroid")}</Text>
                  </Flex>
                  <Text size="2" color="gray" aria-hidden>
                    <ChevronRightIcon />
                  </Text>
                </Flex>
              </a>
            </Text>
          </Flex>
        </Flex>
      </Card>

      <Card>
        <Flex direction="column" gap="4">
          <Heading size="4">{t("settings.socialAccounts")}</Heading>
          <Text size="2" color="gray">
            {t("settings.socialAccountsHint")}
          </Text>
          <Flex direction="column" gap="3">
            <Text asChild size="3">
              <a href={X_PROFILE_URL} target="_blank" rel="noreferrer">
                <Flex align="center" justify="between" gap="3">
                  <Flex align="center" gap="2">
                    <XIcon />
                    <Text size="3">X (formerly Twitter)</Text>
                  </Flex>
                  <Text size="2" color="gray">
                    @ParlerAIApp
                  </Text>
                </Flex>
              </a>
            </Text>
            <Text asChild size="3">
              <a href={LINKEDIN_PROFILE_URL} target="_blank" rel="noreferrer">
                <Flex align="center" justify="between" gap="3">
                  <Flex align="center" gap="2">
                    <LinkedInIcon />
                    <Text size="3">LinkedIn</Text>
                  </Flex>
                  <Text size="2" color="gray">
                    ParlerAI
                  </Text>
                </Flex>
              </a>
            </Text>
          </Flex>
        </Flex>
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
