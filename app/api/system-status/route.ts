import { NextResponse } from "next/server";

export const runtime = "nodejs";

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
const OPENAI_TIMEOUT_MS = Number.parseInt(process.env.OPENAI_TIMEOUT_MS ?? "12000", 10);
const OPENAI_API_BASE_URL = process.env.OPENAI_API_BASE_URL ?? "https://api.openai.com/v1/chat/completions";

type CheckError = {
  name: string;
  message: string;
  code?: string;
  status?: number;
};

type ServiceCheck = {
  ok: boolean;
  latencyMs: number;
  error?: CheckError;
};

function serializeError(error: unknown): CheckError {
  const source = (error && typeof error === "object" ? error : null) as
    | {
        name?: unknown;
        message?: unknown;
        code?: unknown;
        $metadata?: { httpStatusCode?: unknown };
      }
    | null;

  return {
    name: typeof source?.name === "string" ? source.name : "UnknownError",
    message: typeof source?.message === "string" ? source.message : String(error),
    code: typeof source?.code === "string" ? source.code : undefined,
    status: typeof source?.$metadata?.httpStatusCode === "number" ? source.$metadata.httpStatusCode : undefined
  };
}

async function checkOpenAiConnectivity(): Promise<ServiceCheck> {
  const startedAt = performance.now();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      latencyMs: Number((performance.now() - startedAt).toFixed(2)),
      error: {
        name: "ConfigError",
        message: "OPENAI_API_KEY is missing"
      }
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_API_BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0,
        max_tokens: 2,
        messages: [
          { role: "system", content: "You are a health check assistant. Reply with OK only." },
          { role: "user", content: "OK?" }
        ]
      })
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      return {
        ok: false,
        latencyMs: Number((performance.now() - startedAt).toFixed(2)),
        error: {
          name: "OpenAIHttpError",
          message: payload.error?.message || `OpenAI status ${response.status}`,
          status: response.status
        }
      };
    }

    return {
      ok: true,
      latencyMs: Number((performance.now() - startedAt).toFixed(2))
    };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      latencyMs: Number((performance.now() - startedAt).toFixed(2)),
      error: isAbort
        ? {
            name: "TimeoutError",
            message: `OpenAI timed out after ${OPENAI_TIMEOUT_MS} ms`
          }
        : serializeError(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  const openai = await checkOpenAiConnectivity();
  const ok = openai.ok;

  return NextResponse.json(
    {
      ok,
      timestamp: new Date().toISOString(),
      config: {
        nodeEnv: process.env.NODE_ENV || "unknown",
        openaiModel: OPENAI_MODEL,
        hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY)
      },
      checks: {
        openai
      }
    },
    {
      status: ok ? 200 : 503,
      headers: {
        "Cache-Control": "no-store, max-age=0"
      }
    }
  );
}
