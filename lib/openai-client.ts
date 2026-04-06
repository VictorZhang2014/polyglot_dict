import OpenAI from "openai";

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

function normalizeOpenAIBaseUrl(baseUrl?: string | null): string {
  const trimmed = baseUrl?.trim();
  if (!trimmed) {
    return DEFAULT_OPENAI_BASE_URL;
  }

  return trimmed.replace(/\/(?:chat\/completions|audio\/transcriptions)\/?$/i, "");
}

export function createOpenAIClient(params: {
  apiKey: string;
  baseUrl?: string | null; 
}): OpenAI {
  const { apiKey, baseUrl } = params;

  return new OpenAI({
    apiKey,
    baseURL: normalizeOpenAIBaseUrl(baseUrl),
    maxRetries: 0,
    // timeout: timeoutMs
  });
}
