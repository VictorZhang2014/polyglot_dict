import { NextRequest, NextResponse } from "next/server";
import { buildFrenchConjugationResponse } from "@/lib/lang-conjugation/french-conjugation-server";

export async function GET(request: NextRequest) {
  const sourceWord = request.nextUrl.searchParams.get("q") ?? "";
  const sourceLanguage = (request.nextUrl.searchParams.get("code") ?? "").trim().toLowerCase();

  if (sourceLanguage !== "fr") {
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

  const result = buildFrenchConjugationResponse(sourceWord);

  return NextResponse.json(result, {
    status: 200
  });
}
