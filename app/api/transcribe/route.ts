import { NextResponse } from "next/server";
import { checkIpRateLimit } from "@/lib/ip-rate-limit";
import { toEnglishApiErrorMessage } from "@/lib/api-error-message";

export const runtime = "nodejs";

const OPENAI_AUDIO_API_URL = process.env.OPENAI_AUDIO_API_URL ?? "https://api.openai.com/v1/audio/transcriptions";
const OPENAI_AUDIO_MODEL = process.env.OPENAI_AUDIO_MODEL ?? "whisper-1";
const OPENAI_AUDIO_TIMEOUT_MS = Number.parseInt(process.env.OPENAI_AUDIO_TIMEOUT_MS ?? "30000", 10);

function normalizeCode(value: string): string {
  return value.trim().toLowerCase();
}

export async function POST(request: Request) {
  try {
    const rateLimit = await checkIpRateLimit(request);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: rateLimit.message },
        {
          status: rateLimit.status,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) }
        }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const sourceLanguage = typeof formData.get("sourceLanguage") === "string"
      ? normalizeCode(formData.get("sourceLanguage") as string)
      : "";

    if (!(file instanceof File)) {
      throw new Error("audio file is required");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OPENAI_AUDIO_TIMEOUT_MS);

    try {
      const openAiFormData = new FormData();
      openAiFormData.append("file", file, file.name || "recording.webm");
      openAiFormData.append("model", OPENAI_AUDIO_MODEL);
      if (sourceLanguage) {
        openAiFormData.append("language", sourceLanguage);
      }

      const response = await fetch(OPENAI_AUDIO_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}`
        },
        body: openAiFormData,
        signal: controller.signal
      });

      const payload = (await response.json().catch(() => ({}))) as { text?: string; error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "transcription failed");
      }

      return NextResponse.json({
        text: typeof payload.text === "string" ? payload.text.trim() : ""
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`openai:transcribe timed out after ${OPENAI_AUDIO_TIMEOUT_MS} ms`);
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: toEnglishApiErrorMessage(error)
      },
      { status: 400 }
    );
  }
}
