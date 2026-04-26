import { createHash } from "node:crypto";
import {
  finalizeWordPayload,
  streamWordTranslationWithClaudeAI
} from "@/lib/llm/openai-translate";
import { toEnglishApiErrorMessage } from "@/lib/api-error-message";
import { getCachedTranslation, cacheTranslation } from "@/lib/dynamodb";
import type { TranslationPayload } from "@/lib/types";
import { runInBackground } from "@/lib/background-task";
import {
  parseWordProtocolContent,
  serializeWordTranslationPayload
} from "@/lib/word-stream-protocol";
import { checkIpRateLimit } from "@/lib/ip-rate-limit";
import { encodeSseDataMessage, encodeSseEventMessage } from "@/lib/sse";

type ParsedRequest = {
  sourceWord: string;
  sourceLanguage: string;
  targetLanguages: string[];
};

function normalizeCode(value: string): string {
  return value.trim().toLowerCase();
}

export function parseSearchParams(searchParams: URLSearchParams): ParsedRequest {
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

export function makeCacheKey(sourceWord: string, sourceLanguage: string, targetLanguages: string[]): string {
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

export async function handleTranslateWordRequest(request: Request): Promise<Response> {
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

          const wordStream = await streamWordTranslationWithClaudeAI(payload);
          let streamedContent = "";
          for await (const chunk of wordStream) {
            streamedContent += chunk;
            controller.enqueue(encoder.encode(encodeSseDataMessage(chunk)));
          }
          ensureProtocolLineBoundary(controller, encoder, streamedContent);

          const finalPayload = finalizeWordPayload(payload, parseWordProtocolContent(streamedContent, payload));

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
