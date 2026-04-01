const ERROR_MESSAGE_MAP: Record<string, string> = {
  "sourceWord is required": "sourceWord is required",
  "sourceWord is too long": "sourceWord is too long",
  "sourceLanguage is required": "sourceLanguage is required",
  "targetLanguages is required": "targetLanguages is required",
  "sourceText is required": "sourceText is required",
  "sourceText is too long": "sourceText is too long",
  "OPENAI_API_KEY is missing": "OPENAI_API_KEY is missing"
};

const DEFAULT_ERROR_MESSAGE = "Request failed. Please try again later.";

function hasNonAscii(value: string): boolean {
  return /[^\x00-\x7F]/.test(value);
}

export function toEnglishApiErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const message = raw.trim();

  if (!message) {
    return DEFAULT_ERROR_MESSAGE;
  }

  const mapped = ERROR_MESSAGE_MAP[message];
  if (mapped) {
    return mapped;
  }

  if (hasNonAscii(message)) {
    return DEFAULT_ERROR_MESSAGE;
  }

  return message;
}

export function resolveApiErrorStatus(error: unknown): number {
  const message = toEnglishApiErrorMessage(error);

  if (message === "OPENAI_API_KEY is missing") {
    return 503;
  }

  if (
    message.includes("timed out") ||
    message.includes("request time budget was exhausted")
  ) {
    return 504;
  }

  return 400;
}
