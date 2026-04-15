import { NextResponse } from "next/server";
import { checkIpRateLimit } from "@/lib/ip-rate-limit";
import { toEnglishApiErrorMessage } from "@/lib/api-error-message";
import { createOpenAIClient } from "@/lib/llm/llm-client";

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
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY is missing");
      }

      const client = createOpenAIClient({
        apiKey,
        baseUrl: OPENAI_AUDIO_API_URL,
        timeoutMs: OPENAI_AUDIO_TIMEOUT_MS
      });

      const payload = await client.audio.transcriptions.create(
        {
          file,
          model: OPENAI_AUDIO_MODEL,
          ...(sourceLanguage ? { language: sourceLanguage } : {})
        },
        {
          signal: controller.signal
        }
      );

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
