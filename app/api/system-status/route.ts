import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
const OPENAI_TIMEOUT_MS = Number.parseInt(process.env.OPENAI_TIMEOUT_MS ?? "12000", 10);
const RATE_LIMIT_BACKEND = (
  process.env.RATE_LIMIT_BACKEND ??
  (process.env.NODE_ENV === "production" ? "dynamodb" : "memory")
)
  .trim()
  .toLowerCase();
const RATE_LIMIT_TABLE_NAME = process.env.RATE_LIMIT_TABLE_NAME?.trim() || "parlerai_rate_limit";
const RATE_LIMIT_AWS_REGION =
  process.env.RATE_LIMIT_AWS_REGION?.trim() || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;

type CheckError = {
  name: string;
  message: string;
  code?: string;
  status?: number;
};

type ServiceCheck = {
  ok: boolean;
  latencyMs: number;
  details?: Record<string, boolean>;
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

async function checkDynamoDbConnectivity(): Promise<ServiceCheck> {
  const startedAt = performance.now();
  const details: Record<string, boolean> = {
    updateItem: false,
    getItem: false
  };

  try {
    const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: RATE_LIMIT_AWS_REGION }), {
      marshallOptions: { removeUndefinedValues: true }
    });

    const now = Date.now();
    await client.send(
      new UpdateCommand({
        TableName: RATE_LIMIT_TABLE_NAME,
        Key: { pk: "__healthcheck__" },
        UpdateExpression: "SET #updatedAt = :now, #expiresAt = :expiresAt",
        ExpressionAttributeNames: {
          "#updatedAt": "updatedAt",
          "#expiresAt": "expiresAt"
        },
        ExpressionAttributeValues: {
          ":now": now,
          ":expiresAt": Math.floor((now + 60 * 60 * 1000) / 1000)
        }
      })
    );
    details.updateItem = true;

    await client.send(
      new GetCommand({
        TableName: RATE_LIMIT_TABLE_NAME,
        Key: { pk: "__healthcheck__" },
        ConsistentRead: false
      })
    );
    details.getItem = true;

    return {
      ok: true,
      latencyMs: Number((performance.now() - startedAt).toFixed(2)),
      details
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Number((performance.now() - startedAt).toFixed(2)),
      details,
      error: serializeError(error)
    };
  }
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
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
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
  const [dynamodb, openai] = await Promise.all([checkDynamoDbConnectivity(), checkOpenAiConnectivity()]);

  const ok = dynamodb.ok && openai.ok;

  return NextResponse.json(
    {
      ok,
      timestamp: new Date().toISOString(),
      config: {
        nodeEnv: process.env.NODE_ENV || "unknown",
        rateLimitBackend: RATE_LIMIT_BACKEND,
        rateLimitTableName: RATE_LIMIT_TABLE_NAME,
        rateLimitAwsRegion: RATE_LIMIT_AWS_REGION || "",
        openaiModel: OPENAI_MODEL,
        hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY)
      },
      checks: {
        dynamodb,
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
