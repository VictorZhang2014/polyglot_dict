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
import { encodeSseDataMessage } from "@/lib/sse";

export const runtime = "nodejs";
export const dynamic = 'force-dynamic'; // To prevent errors while building
export const maxDuration = 60;          // Timeout setup for Amplify v2, the maximum is 60s

type ParsedRequest = { sourceText: string; sourceLanguage: string; targetLanguages: string[] };

function normalizeCode(value: string): string {
  return value.trim().toLowerCase();
}

function parseSearchParams(searchParams: URLSearchParams): ParsedRequest {
  const sourceText = searchParams.get("sourceText")?.trim() ?? "";
  const sourceLanguage = normalizeCode(searchParams.get("sourceLanguage") ?? "");
  const targetLanguages = Array.from(
    new Set(searchParams.getAll("targetLanguages").map(normalizeCode).filter(Boolean))
  );

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

export async function GET(request: Request) {
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

    const payload = parseSearchParams(new URL(request.url).searchParams);
    const cacheKey = makeCacheKey(payload.sourceText, payload.sourceLanguage, payload.targetLanguages);
    const cachedData = await getCachedTranslation(cacheKey);
    if (cachedData) {
      console.log(`[translate:text] DynamoDB cache hit for: ${cacheKey}`);
      return new Response(encodeSseDataMessage(serializeTextTranslationPayload(cachedData)), {
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
            controller.enqueue(encoder.encode(encodeSseDataMessage(chunk)));
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
