"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { DiscIcon, InfoCircledIcon, SpeakerLoudIcon, StopIcon } from "@radix-ui/react-icons";
import { Badge, Button, Callout, Card, Flex, Grid, Heading, Select, Text, TextArea } from "@radix-ui/themes";
import { BUILTIN_LANGUAGES, getLanguageName } from "@/lib/languages";
import { DEFAULT_SETTINGS, getAllLanguageOptions, readSettings } from "@/lib/settings-storage";
import { TranslateTextApiResponse } from "@/lib/types";
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

function getLanguageFlag(code: string): string {
  return LANGUAGE_FLAGS[code] ?? "🌐";
}

function normalizeCode(code: string): string {
  return code.trim().toLowerCase();
}

function resolveSpeechLang(code: string): string {
  return SPEECH_LANG_MAP[code] ?? code;
}

function resolveRecordingMimeType(): string {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    return "";
  }

  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function resolveRecordingExtension(mimeType: string): string {
  if (mimeType.includes("mp4")) {
    return "mp4";
  }
  if (mimeType.includes("ogg")) {
    return "ogg";
  }
  return "webm";
}

type RecordingState = "idle" | "recording" | "transcribing";

export default function TranslatePage() {
  const { t } = useI18n();
  const [sourceLanguage, setSourceLanguage] = useState("de");
  const [sourceText, setSourceText] = useState("");
  const [targetLanguages, setTargetLanguages] = useState(DEFAULT_SETTINGS.targetLanguages);
  const [customLanguages, setCustomLanguages] = useState(DEFAULT_SETTINGS.customLanguages);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [response, setResponse] = useState<TranslateTextApiResponse | null>(null);
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    const settings = readSettings();
    setTargetLanguages(settings.targetLanguages);
    setCustomLanguages(settings.customLanguages);
  }, []);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const languageOptions = useMemo(() => getAllLanguageOptions(customLanguages), [customLanguages]);

  const visibleTargets = useMemo(() => {
    const dedup = Array.from(new Set(targetLanguages.map(normalizeCode))).filter(Boolean);
    return dedup.filter((code) => code !== sourceLanguage);
  }, [targetLanguages, sourceLanguage]);

  const targetTextMap = useMemo(
    () => new Map(response?.data.translations.map((item) => [item.targetLanguage, item.translatedText]) ?? []),
    [response]
  );
  const showSourcePlayButton = Boolean(sourceText.trim());

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = sourceText.trim();
    setError("");
    setResponse(null);

    if (!value) {
      setError(t("translate.error.enterText"));
      return;
    }
    if (value.length > 300) {
      setError(t("translate.error.textTooLong"));
      return;
    }

    if (visibleTargets.length === 0) {
      setError(t("translate.error.needTargets"));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/translate-text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sourceText: value,
          sourceLanguage,
          targetLanguages: visibleTargets
        })
      });

      const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
      const isJson = contentType.includes("application/json");
      const rawBody = isJson ? "" : await res.text();
      const data = (isJson ? await res.json() : null) as (TranslateTextApiResponse & { error?: string }) | null;

      if (!res.ok) {
        if (data?.error) {
          throw new Error(data.error);
        }

        if (rawBody) {
          const snippet = rawBody.replace(/\s+/g, " ").slice(0, 180);
          throw new Error(`API ${res.status}: ${snippet}`);
        }

        throw new Error(t("translate.error.failed"));
      }

      if (!data) {
        throw new Error(`API ${res.status} returned non-JSON response.`);
      }

      setResponse(data);
    } catch (translateError) {
      setError(translateError instanceof Error ? translateError.message : t("translate.error.failed"));
    } finally {
      setLoading(false);
    }
  };

  const speakText = (text: string, langCode: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !text.trim()) {
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text.trim());
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

  const transcribeAudio = async (blob: Blob) => {
    const formData = new FormData();
    const mimeType = blob.type || "audio/webm";
    const extension = resolveRecordingExtension(mimeType);
    formData.append("file", blob, `recording.${extension}`);
    formData.append("sourceLanguage", sourceLanguage);

    const res = await fetch("/api/transcribe", {
      method: "POST",
      body: formData
    });

    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    const isJson = contentType.includes("application/json");
    const data = (isJson ? await res.json() : null) as { text?: string; error?: string } | null;

    if (!res.ok) {
      throw new Error(data?.error || t("translate.error.transcribeFailed"));
    }

    const transcript = data?.text?.trim() ?? "";
    if (!transcript) {
      throw new Error(t("translate.error.transcribeFailed"));
    }

    setSourceText(transcript);
    setResponse(null);
    setError("");
  };

  const handleStartRecording = async () => {
    if (
      typeof window === "undefined" ||
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError(t("translate.error.recordUnavailable"));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = resolveRecordingMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      audioChunksRef.current = [];
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setRecordingState("idle");
        setError(t("translate.error.transcribeFailed"));
      };

      recorder.onstop = async () => {
        const recordedMimeType = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type: recordedMimeType });
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;

        if (blob.size === 0) {
          setRecordingState("idle");
          return;
        }

        setRecordingState("transcribing");

        try {
          await transcribeAudio(blob);
        } catch (transcribeError) {
          setError(transcribeError instanceof Error ? transcribeError.message : t("translate.error.transcribeFailed"));
        } finally {
          setRecordingState("idle");
        }
      };

      setError("");
      setResponse(null);
      recorder.start();
      setRecordingState("recording");
    } catch (recordError) {
      setError(recordError instanceof Error ? recordError.message : t("translate.error.recordUnavailable"));
      setRecordingState("idle");
    }
  };

  const handleRecordToggle = async () => {
    if (recordingState === "transcribing") {
      return;
    }

    if (recordingState === "recording") {
      mediaRecorderRef.current?.stop();
      return;
    }

    await handleStartRecording();
  };

  return (
    <Flex direction="column" gap="4">
      <Card>
        <form onSubmit={handleSubmit}>
          <Flex direction="column" gap="3">
            <Flex align="center" justify="between" gap="3" wrap="wrap">
              <Heading size="5">{t("translate.title")}</Heading>
              <Select.Root
                value={sourceLanguage}
                onValueChange={(value) => {
                  setSourceLanguage(value);
                  setResponse(null);
                  setError("");
                }}
              >
                <Select.Trigger />
                <Select.Content position="popper">
                  {BUILTIN_LANGUAGES.map((item) => (
                    <Select.Item key={item.code} value={item.code}>
                      {getLanguageFlag(item.code)} {item.name}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Flex>

            <div className="translation-source-field">
              <TextArea
                rows={3}
                className="translation-source-area"
                maxLength={300}
                placeholder={t("translate.sourcePlaceholder")}
                value={sourceText}
                onChange={(event) => {
                  setSourceText(event.target.value);
                  setResponse(null);
                }}
              />
              {showSourcePlayButton ? (
                <Button
                  type="button"
                  variant="soft"
                  color="gray"
                  className="translation-source-play-btn"
                  onClick={() => speakText(sourceText, sourceLanguage)}
                  disabled={!sourceText.trim()}
                  aria-label={t("translate.sourcePlay")}
                  title={t("translate.sourcePlay")}
                >
                  <SpeakerLoudIcon />
                </Button>
              ) : null}
            </div>

            <Flex align="center" justify="between" gap="3" wrap="wrap">
              <Flex align="center" gap="2" wrap="wrap">
                <Button
                  type="button"
                  variant="soft"
                  color={recordingState === "recording" ? "red" : "gray"}
                  className="translation-audio-btn"
                  onClick={() => void handleRecordToggle()}
                  disabled={loading || recordingState === "transcribing"}
                >
                  {recordingState === "recording" ? <StopIcon /> : <DiscIcon />}
                  {recordingState === "recording"
                    ? t("translate.recordStop")
                    : recordingState === "transcribing"
                      ? t("translate.transcribing")
                      : t("translate.recordStart")}
                </Button>
              </Flex>
              <Button type="submit" color="gray" className="translation-submit-btn" disabled={loading}>
                {loading ? <span className="query-btn-spinner" aria-hidden="true" /> : t("translate.submit")}
              </Button>
            </Flex>
          </Flex>
        </form>
      </Card>

      {error ? (
        <Callout.Root color="gray" variant="soft">
          <Callout.Icon>
            <InfoCircledIcon />
          </Callout.Icon>
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      ) : null}

      <Flex align="center" justify="between" gap="3">
        <Heading size="4">{t("translate.result")}</Heading>
        <Badge size="2" color="gray" variant="soft">
          {response ? (response.fromCache ? t("badge.fromCache") : t("badge.live")) : t("badge.waitingTranslate")}
        </Badge>
      </Flex>

      <Grid columns={{ initial: "1", md: "2" }} gap="4">
        {visibleTargets.length > 0 ? (
          visibleTargets.map((code) => (
            <Card key={code}>
              <Flex direction="column" gap="3">
                <Flex align="center" justify="between" gap="3">
                  <Text size="2" color="gray">
                    {getLanguageFlag(code)} {getLanguageName(code, languageOptions)}
                  </Text>
                  <Button
                    type="button"
                    variant="soft"
                    color="gray"
                    className="translation-audio-btn"
                    onClick={() => speakText(targetTextMap.get(code) ?? "", code)}
                    disabled={!(targetTextMap.get(code) ?? "").trim()}
                  >
                    <SpeakerLoudIcon />
                  </Button>
                </Flex>
                <TextArea
                  rows={3}
                  className="translation-target-area"
                  readOnly
                  value={targetTextMap.get(code) ?? ""}
                  placeholder={t("translate.resultPlaceholder")}
                />
              </Flex>
            </Card>
          ))
        ) : (
          <Card>
            <Text size="2" color="gray">
              {t("translate.noTargets")}
            </Text>
          </Card>
        )}
      </Grid>
    </Flex>
  );
}
