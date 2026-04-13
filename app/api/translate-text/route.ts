import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  normalizeTextPayloadFromStreamContent,
  serializeTextTranslationPayload,
  streamTextTranslationWithOpenAI
} from "@/lib/openai-translate";
import { resolveApiErrorStatus, toEnglishApiErrorMessage } from "@/lib/api-error-message";
import { checkIpRateLimit } from "@/lib/ip-rate-limit";
import { getCachedTranslation, cacheTranslation } from "@/lib/dynamodb";
import { runInBackground } from "@/lib/background-task";

export const runtime = "nodejs";
export const dynamic = 'force-dynamic'; // To prevent errors while building
export const maxDuration = 60;          // Timeout setup for Amplify v2, the maximum is 60s

type TranslateTextRequest = {
  sourceText?: unknown;
  sourceLanguage?: unknown;
  targetLanguages?: unknown;
};

type ParsedRequest = { sourceText: string; sourceLanguage: string; targetLanguages: string[] };

function normalizeCode(value: string): string {
  return value.trim().toLowerCase();
}

function parseBody(raw: TranslateTextRequest): ParsedRequest {
  const sourceText = typeof raw.sourceText === "string" ? raw.sourceText.trim() : "";
  const sourceLanguage = typeof raw.sourceLanguage === "string" ? normalizeCode(raw.sourceLanguage) : "";

  const targetLanguages = Array.isArray(raw.targetLanguages)
    ? Array.from(
        new Set(
          raw.targetLanguages
            .filter((item): item is string => typeof item === "string")
            .map(normalizeCode)
            .filter(Boolean)
        )
      )
    : [];

  if (!sourceText) {
    throw new Error("sourceText is required");
  }

  if (sourceText.length > 300) {
    throw new Error("sourceText is too long");
  }

  if (!sourceLanguage) {
    throw new Error("sourceLanguage is required");
  }

  if (targetLanguages.length === 0) {
    throw new Error("targetLanguages is required");
  }

  return { sourceText, sourceLanguage, targetLanguages };
}

function makeCacheKey(sourceText: string, sourceLanguage: string, targetLanguages: string[]): string {
  const base = JSON.stringify({
    v: 1,
    mode: "text",
    sourceText,
    sourceLanguage,
    targetLanguages: [...targetLanguages].sort()
  });

  return createHash("sha256").update(base).digest("hex");
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

    const raw = (await request.json()) as TranslateTextRequest;
    const payload = parseBody(raw);
    const cacheKey = makeCacheKey(payload.sourceText, payload.sourceLanguage, payload.targetLanguages);
    const cachedData = await getCachedTranslation(cacheKey);
    if (cachedData) {
      console.log(`[translate:text] DynamoDB cache hit for: ${cacheKey}`);
      return new Response(serializeTextTranslationPayload(cachedData), {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
          "X-Polyglot-From-Cache": "true"
        }
      });
    }

    const encoder = new TextEncoder();
    let streamedContent = "";

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const openAiStream = await streamTextTranslationWithOpenAI(payload);
          for await (const chunk of openAiStream) {
            streamedContent += chunk;
            controller.enqueue(encoder.encode(chunk));
          }

          const translated = normalizeTextPayloadFromStreamContent(streamedContent, payload);
          controller.close();
          runInBackground(
            () =>
              cacheTranslation(
                cacheKey,
                payload.sourceText,
                payload.sourceLanguage,
                payload.targetLanguages,
                translated,
                "text"
              ),
            `cache translation for ${cacheKey}`
          );
        } catch (streamError) {
          controller.error(streamError);
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
        "X-Polyglot-From-Cache": "false"
      }
    });
  } catch (error) {
    const message = toEnglishApiErrorMessage(error);
    const status = resolveApiErrorStatus(error);
    console.error("[translate:text] Request failed:", error);

    return NextResponse.json(
      {
        error: message
      },
      { status }
    );
  }
}
