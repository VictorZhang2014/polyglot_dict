import { makeCacheKey, parseSearchParams } from "@/lib/server/translate-word-handler";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = 'force-dynamic'; // To prevent errors while building
export const maxDuration = 60;          // Timeout setup for Amplify v2, the maximum is 60s

// /api/querykey?sourceWord=gefallen&sourceLanguage=de&targetLanguages=en&targetLanguages=fr

export async function GET(request: Request) {
  const payload = parseSearchParams(new URL(request.url).searchParams);
  const cacheKey = makeCacheKey(payload.sourceWord, payload.sourceLanguage, payload.targetLanguages); 
  return NextResponse.json({
    key: cacheKey
  });
}
