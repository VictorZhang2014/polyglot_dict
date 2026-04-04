import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { translateWithOpenAI } from "@/lib/openai-translate";
import { resolveApiErrorStatus, toEnglishApiErrorMessage } from "@/lib/api-error-message";
import { getCachedTranslation, cacheTranslation } from "@/lib/dynamodb";
import { checkIpRateLimit } from "@/lib/ip-rate-limit";
import type { TranslationPayload } from "@/lib/types";

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

const inFlightTranslations = new Map<string, ReturnType<typeof translateWithOpenAI>>();

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

async function getOrCreateTranslation(
  inFlightKey: string,
  payload: ParsedRequest
) {
  const existing = inFlightTranslations.get(inFlightKey);
  if (existing) {
    return existing;
  }

  const task = (async () => {
    const translated = await translateWithOpenAI(payload);
    return translated;
  })()
  .catch((e) => { 
      throw new Error(`[translation:task] Failed to translate word ${e instanceof Error && e.message ? `: ${e.message}` : ""}`);
  })
  .finally(() => { 
    try {
      inFlightTranslations.delete(inFlightKey);
    } catch (e) { 
      throw new Error(`[translation:task] Failed to clean up this task ${e instanceof Error && e.message ? `: ${e.message}` : ""}`);
    }
  });

  inFlightTranslations.set(inFlightKey, task);
  return task;
}

function makeCacheKey(sourceWord: string, sourceLanguage: string, targetLanguages: string[]): string {
  const base = JSON.stringify({
    v: 18,
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

export async function POST(request: Request) {
  try {
    // const rateLimit = await checkIpRateLimit(request);
    // if (!rateLimit.allowed) {
    //   return NextResponse.json(
    //     { error: rateLimit.message },
    //     {
    //       status: rateLimit.status,
    //       headers: { "Retry-After": String(rateLimit.retryAfterSeconds) }
    //     }
    //   );
    // }

    const raw = (await request.json()) as TranslateRequest;
    const payload = parseBody(raw);
    const cacheKey = makeCacheKey(payload.sourceWord, payload.sourceLanguage, payload.targetLanguages);
    const inFlightKey = cacheKey;
    // const cachedData = (await getCachedTranslation(cacheKey)) as TranslationPayload | null;
    // if (cachedData && hasSuccessfulTranslation(cachedData)) {
    //   console.log(`[translate] DynamoDB cache hit for: ${cacheKey}`);
    //   return NextResponse.json({
    //     fromCache: true,
    //     data: cachedData
    //   });
    // }

    const translated = await getOrCreateTranslation(inFlightKey, payload);
    // if (hasSuccessfulTranslation(translated)) {
    //   cacheTranslation(
    //     cacheKey,
    //     resolveStoredSourceWord(translated, payload.sourceWord),
    //     payload.sourceLanguage,
    //     payload.targetLanguages,
    //     translated
    //   );
    // }

    return NextResponse.json({
      fromCache: false,
      data: translated
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
