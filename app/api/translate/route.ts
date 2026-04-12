import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  finalizeWordPayload,
  requestWordPhoneticFallbackLine,
  streamWordDetailTranslationWithOpenAI,
  streamWordFastTranslationWithOpenAI
} from "@/lib/openai-translate";
import { resolveApiErrorStatus, toEnglishApiErrorMessage } from "@/lib/api-error-message";
import { getCachedTranslation, cacheTranslation } from "@/lib/dynamodb";
import type { TranslationPayload } from "@/lib/types";
import { runInBackground } from "@/lib/background-task";
import {
  applyWordProtocolEvent,
  parseWordProtocolLine,
  parseWordProtocolContent,
  serializeWordTranslationPayload
} from "@/lib/word-stream-protocol";
import { checkIpRateLimit } from "@/lib/ip-rate-limit";

export const runtime = "nodejs";

type TranslateRequest = {
  sourceWord?: unknown;
  sourceLanguage?: unknown;
  targetLanguages?: unknown;
};

type ParsedRequest = {
  sourceWord: string;
  sourceLanguage: string;
  targetLanguages: string[];
};

function normalizeCode(value: string): string {
  return value.trim().toLowerCase();
}

function parseBody(raw: TranslateRequest): ParsedRequest {
  const sourceWord = typeof raw.sourceWord === "string" ? raw.sourceWord.trim() : "";
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

  if (!sourceWord) {
    throw new Error("sourceWord is required");
  }

  if (sourceWord.length > 32) {
    throw new Error("sourceWord is too long");
  }

  if (!sourceLanguage) {
    throw new Error("sourceLanguage is required");
  }

  if (targetLanguages.length === 0) {
    throw new Error("targetLanguages is required");
  }

  return {
    sourceWord,
    sourceLanguage,
    targetLanguages
  };
}

function makeCacheKey(sourceWord: string, sourceLanguage: string, targetLanguages: string[]): string {
  const base = JSON.stringify({
    v: 19,
    sourceWord: sourceWord.toLowerCase(),
    sourceLanguage,
    targetLanguages: [...targetLanguages].sort()
  });

  return createHash("sha256").update(base).digest("hex");
}

function resolveStoredSourceWord(payload: TranslationPayload, fallbackWord: string): string {
  const corrected = payload.correctedSourceWord?.trim() ?? "";
  if (corrected) {
    return corrected;
  }

  const sourceWord = payload.sourceWord?.trim() ?? "";
  if (sourceWord) {
    return sourceWord;
  }

  return fallbackWord.trim();
}

function hasSuccessfulTranslation(payload: TranslationPayload): boolean {
  return payload.translations.some((item) => Boolean(item.directTranslation?.trim()));
}

function extractPhoneticProtocolLine(content: string): string {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    if (/^PHONETIC(?:\||:)/i.test(trimmed)) {
      return trimmed.replace(/^PHONETIC:/i, "PHONETIC|");
    }
  }

  return "";
}

function ensureProtocolLineBoundary(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  content: string
): void {
  if (content && !content.endsWith("\n")) {
    controller.enqueue(encoder.encode("\n"));
  }
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

    const raw = (await request.json()) as TranslateRequest;
    const payload = parseBody(raw);
    const cacheKey = makeCacheKey(payload.sourceWord, payload.sourceLanguage, payload.targetLanguages);
    const cachedData = (await getCachedTranslation(cacheKey)) as TranslationPayload | null;
    if (cachedData && hasSuccessfulTranslation(cachedData)) {
      console.log(`[translate] DynamoDB cache hit for: ${cacheKey}`);
      return new Response(serializeWordTranslationPayload(cachedData), {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
          "X-Polyglot-From-Cache": "true"
        }
      });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const fastStream = await streamWordFastTranslationWithOpenAI(payload);
          let fastContent = "";
          for await (const chunk of fastStream) {
            fastContent += chunk;
            controller.enqueue(encoder.encode(chunk));
          }
          ensureProtocolLineBoundary(controller, encoder, fastContent);

          const fastPayload = finalizeWordPayload(payload, parseWordProtocolContent(fastContent, payload));
          const detailStream = await streamWordDetailTranslationWithOpenAI(payload, fastPayload);
          let detailContent = "";
          for await (const chunk of detailStream) {
            detailContent += chunk;
            controller.enqueue(encoder.encode(chunk));
          }
          ensureProtocolLineBoundary(controller, encoder, detailContent);

          const mergedPayload = finalizeWordPayload(
            payload,
            parseWordProtocolContent(`${fastContent}\n${detailContent}`, payload)
          );

          let finalPayload = mergedPayload;
          if (!finalPayload.sourcePhonetic?.trim()) {
            const phoneticFallbackContent = extractPhoneticProtocolLine(
              await requestWordPhoneticFallbackLine(payload, fastPayload)
            );
            if (phoneticFallbackContent) {
              controller.enqueue(encoder.encode(`${phoneticFallbackContent}\n`));

              const phoneticPayload = phoneticFallbackContent
                .split(/\r?\n/)
                .map((line) => parseWordProtocolLine(line))
                .filter((event): event is NonNullable<ReturnType<typeof parseWordProtocolLine>> => Boolean(event))
                .reduce((current, event) => applyWordProtocolEvent(current, event), finalPayload);

              finalPayload = finalizeWordPayload(payload, phoneticPayload);
            }
          }

          controller.close();

          if (hasSuccessfulTranslation(finalPayload)) {
            runInBackground(
              () =>
                cacheTranslation(
                  cacheKey,
                  resolveStoredSourceWord(finalPayload, payload.sourceWord),
                  payload.sourceLanguage,
                  payload.targetLanguages,
                  finalPayload
                ),
              `cache word translation for ${cacheKey}`
            );
          }
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
    console.error("[translate] Request failed:", error);

    return NextResponse.json(
      {
        error: message
      },
      { status }
    );
  }
}
