import { handleTranslateTextRequest } from "@/lib/server/translate-text-handler";

export const runtime = "nodejs";
export const dynamic = 'force-dynamic'; // To prevent errors while building
export const maxDuration = 60;          // Timeout setup for Amplify v2, the maximum is 60s

export async function GET(request: Request) {
  return handleTranslateTextRequest(request);
}
