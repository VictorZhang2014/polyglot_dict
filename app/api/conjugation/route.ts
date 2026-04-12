import { NextRequest, NextResponse } from "next/server";
import { buildVerbConjugationResponse } from "@/lib/lang-conjugation/verb-conjugation-server";
import { supportsVerbConjugationLanguage } from "@/lib/verb-conjugation";

export async function GET(request: NextRequest) {
  const sourceWord = request.nextUrl.searchParams.get("q") ?? "";
  const sourceLanguage = (request.nextUrl.searchParams.get("code") ?? "").trim().toLowerCase();

  if (!supportsVerbConjugationLanguage(sourceLanguage)) {
    return NextResponse.json(
      {
        normalizedVerb: sourceWord.trim().toLowerCase(),
        reason: "invalid",
        status: "pending_backend"
      },
      {
        status: 200
      }
    );
  }

  const result = buildVerbConjugationResponse(sourceLanguage, sourceWord);

  return NextResponse.json(result, {
    status: 200
  });
}
