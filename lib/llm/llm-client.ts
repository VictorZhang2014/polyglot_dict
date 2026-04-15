import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

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
  timeoutMs?: number;
}): OpenAI {
  const { apiKey, baseUrl, timeoutMs } = params;
  return new OpenAI({
    apiKey,
    baseURL: normalizeOpenAIBaseUrl(baseUrl),
    maxRetries: 0,
    ...(typeof timeoutMs === "number" ? { timeout: timeoutMs } : {})
  });
}

export function createClaudeAIClient(params: { 
  apiKey: string;
  timeoutMs?: number;
}): Anthropic {
  const { apiKey, timeoutMs } = params;
  return new Anthropic({ 
    apiKey,
    maxRetries: 0,
    ...(typeof timeoutMs === "number" ? { timeout: timeoutMs } : {})
  }); 
}
