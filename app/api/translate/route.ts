import { createHash } from "node:crypto";
import {
  finalizeWordPayload,
  requestWordPhoneticFallbackLine,
  streamWordDetailTranslationWithOpenAI,
  streamWordFastTranslationWithOpenAI
} from "@/lib/openai-translate";
import { toEnglishApiErrorMessage } from "@/lib/api-error-message";
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
import { encodeSseDataMessage, encodeSseEventMessage } from "@/lib/sse";

export const runtime = "nodejs";
export const dynamic = 'force-dynamic'; // To prevent errors while building
export const maxDuration = 60;          // Timeout setup for Amplify v2, the maximum is 60s

type ParsedRequest = {
  sourceWord: string;
  sourceLanguage: string;
  targetLanguages: string[];
};

function normalizeCode(value: string): string {
  return value.trim().toLowerCase();
}

function parseSearchParams(searchParams: URLSearchParams): ParsedRequest {
  const sourceWord = searchParams.get("sourceWord")?.trim() ?? "";
  const sourceLanguage = normalizeCode(searchParams.get("sourceLanguage") ?? "");
  const targetLanguages = Array.from(
    new Set(searchParams.getAll("targetLanguages").map(normalizeCode).filter(Boolean))
  );

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
    controller.enqueue(encoder.encode(encodeSseDataMessage("\n")));
  }
}

function createStreamHeaders(fromCache: boolean): HeadersInit {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
    "X-Polyglot-From-Cache": String(fromCache)
  };
}

function createImmediateEventStream(events: string, fromCache: boolean): Response {
  return new Response(events, {
    headers: createStreamHeaders(fromCache)
  });
}

export async function GET(request: Request) {
  try {
    const rateLimit = await checkIpRateLimit(request);
    if (!rateLimit.allowed) {
      return createImmediateEventStream(
        `${encodeSseEventMessage("failure", rateLimit.message)}${encodeSseEventMessage("done", "failed")}`,
        false
      );
    }

    const payload = parseSearchParams(new URL(request.url).searchParams);
    const cacheKey = makeCacheKey(payload.sourceWord, payload.sourceLanguage, payload.targetLanguages);
    const cachedData = (await getCachedTranslation(cacheKey)) as TranslationPayload | null;
    if (cachedData && hasSuccessfulTranslation(cachedData)) {
      console.log(`[translate] DynamoDB cache hit for: ${cacheKey}`);
      return createImmediateEventStream(
        `${encodeSseEventMessage("meta", JSON.stringify({ fromCache: true }))}${encodeSseDataMessage(
          serializeWordTranslationPayload(cachedData)
        )}${encodeSseEventMessage("done", "complete")}`,
        true
      );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(encodeSseEventMessage("meta", JSON.stringify({ fromCache: false }))));

          const fastStream = await streamWordFastTranslationWithOpenAI(payload);
          let fastContent = "";
          for await (const chunk of fastStream) {
            fastContent += chunk;
            controller.enqueue(encoder.encode(encodeSseDataMessage(chunk)));
          }
          ensureProtocolLineBoundary(controller, encoder, fastContent);

          const fastPayload = finalizeWordPayload(payload, parseWordProtocolContent(fastContent, payload));
          const detailStream = await streamWordDetailTranslationWithOpenAI(payload, fastPayload);
          let detailContent = "";
          for await (const chunk of detailStream) {
            detailContent += chunk;
            controller.enqueue(encoder.encode(encodeSseDataMessage(chunk)));
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
              controller.enqueue(encoder.encode(encodeSseDataMessage(`${phoneticFallbackContent}\n`)));

              const phoneticPayload = phoneticFallbackContent
                .split(/\r?\n/)
                .map((line) => parseWordProtocolLine(line))
                .filter((event): event is NonNullable<ReturnType<typeof parseWordProtocolLine>> => Boolean(event))
                .reduce((current, event) => applyWordProtocolEvent(current, event), finalPayload);

              finalPayload = finalizeWordPayload(payload, phoneticPayload);
            }
          }

          controller.enqueue(encoder.encode(encodeSseEventMessage("done", "complete")));
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
          const message = toEnglishApiErrorMessage(streamError);
          controller.enqueue(encoder.encode(encodeSseEventMessage("failure", message)));
          controller.enqueue(encoder.encode(encodeSseEventMessage("done", "failed")));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: createStreamHeaders(false)
    });
  } catch (error) {
    const message = toEnglishApiErrorMessage(error);
    console.error("[translate] Request failed:", error);
    return createImmediateEventStream(
      `${encodeSseEventMessage("failure", message)}${encodeSseEventMessage("done", "failed")}`,
      false
    );
  }
}
