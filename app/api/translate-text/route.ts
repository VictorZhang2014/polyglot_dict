import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { translateTextWithOpenAI } from "@/lib/openai-translate";
import { toEnglishApiErrorMessage } from "@/lib/api-error-message";

export const runtime = "nodejs";

type TranslateTextRequest = {
  sourceText?: unknown;
  sourceLanguage?: unknown;
  targetLanguages?: unknown;
};

type ParsedRequest = { sourceText: string; sourceLanguage: string; targetLanguages: string[] };

const inFlightTranslations = new Map<string, ReturnType<typeof translateTextWithOpenAI>>();

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

async function getOrCreateTranslation(cacheKey: string, payload: ParsedRequest) {
  const existing = inFlightTranslations.get(cacheKey);
  if (existing) {
    return existing;
  }

  const task = (async () => {
    const translated = await translateTextWithOpenAI(payload);
    return translated;
  })().finally(() => {
    inFlightTranslations.delete(cacheKey);
  });

  inFlightTranslations.set(cacheKey, task);
  return task;
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
  const startedAt = performance.now();
  try {
    const raw = (await request.json()) as TranslateTextRequest;
    const payload = parseBody(raw);
    const cacheKey = makeCacheKey(payload.sourceText, payload.sourceLanguage, payload.targetLanguages);

    const translated = await getOrCreateTranslation(cacheKey, payload);
    const totalMs = performance.now() - startedAt;
    console.log(`[translate:text] total=${totalMs.toFixed(2)}ms`);

    return NextResponse.json({
      fromCache: false,
      data: translated
    });
  } catch (error) {
    const message = toEnglishApiErrorMessage(error);

    return NextResponse.json(
      {
        error: message
      },
      { status: 400 }
    );
  }
}
