import { handleTranslateWordRequest } from "@/lib/server/translate-word-handler";
import { handleTranslateTextRequest } from "@/lib/server/translate-text-handler";
import { encodeSseEventMessage } from "@/lib/sse";

type FunctionUrlEvent = {
  rawPath?: string;
  rawQueryString?: string;
  headers?: Record<string, string | undefined>;
  requestContext?: {
    http?: {
      method?: string;
    };
  };
};

type StreamResponseMetadata = {
  statusCode: number;
  headers?: Record<string, string>;
};

type LambdaResponseStream = {
  write(chunk: string | Uint8Array): void;
  end(chunk?: string | Uint8Array): void;
};

declare const awslambda: {
  HttpResponseStream: {
    from(stream: LambdaResponseStream, metadata: StreamResponseMetadata): LambdaResponseStream;
  };
  streamifyResponse<T extends (event: FunctionUrlEvent, responseStream: LambdaResponseStream, context: unknown) => Promise<void>>(
    handler: T
  ): T;
};

function normalizeHeaders(headers: Record<string, string | undefined> | undefined): Record<string, string> {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers ?? {})) {
    if (typeof value === "string") {
      normalized[key] = value;
    }
  }

  return normalized;
}

function buildRequestUrl(event: FunctionUrlEvent): string {
  const headers = normalizeHeaders(event.headers);
  const protocol = headers["x-forwarded-proto"] || "https";
  const host = headers.host || "lambda.local";
  const path = event.rawPath || "/";
  const query = event.rawQueryString ? `?${event.rawQueryString}` : "";

  return `${protocol}://${host}${path}${query}`;
}

function createWebRequest(event: FunctionUrlEvent): Request {
  return new Request(buildRequestUrl(event), {
    method: event.requestContext?.http?.method || "GET",
    headers: normalizeHeaders(event.headers)
  });
}

function resolveRouteHandler(pathname: string): (request: Request) => Promise<Response> {
  if (pathname === "/" || pathname === "/translate") {
    return handleTranslateWordRequest;
  }

  if (pathname === "/translate-text") {
    return handleTranslateTextRequest;
  }

  throw new Error(`Unsupported route: ${pathname}`);
}

function withCorsHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });

  const allowOrigin = process.env.CORS_ALLOW_ORIGIN?.trim() || "*";
  result["access-control-allow-origin"] = allowOrigin;
  result["access-control-allow-methods"] = "GET, OPTIONS";
  result["access-control-expose-headers"] = "content-type,x-polyglot-from-cache";

  return result;
}

async function pipeWebResponseBody(response: Response, responseStream: LambdaResponseStream): Promise<void> {
  if (!response.body) {
    const bodyText = await response.text();
    if (bodyText) {
      responseStream.write(bodyText);
    }
    responseStream.end();
    return;
  }

  const reader = response.body.getReader();

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    if (value) {
      responseStream.write(value);
    }
  }

  responseStream.end();
}

export const handler = awslambda.streamifyResponse(async (event, responseStream) => {
  try {
    const request = createWebRequest(event);
    const routeHandler = resolveRouteHandler(new URL(request.url).pathname);
    const response = await routeHandler(request);
    responseStream = awslambda.HttpResponseStream.from(responseStream, {
      statusCode: response.status,
      headers: withCorsHeaders(response.headers)
    });

    await pipeWebResponseBody(response, responseStream);
  } catch (error) {
    const message = error instanceof Error && error.message.trim() ? error.message : "Request failed.";
    responseStream = awslambda.HttpResponseStream.from(responseStream, {
      statusCode: 500,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        "access-control-allow-origin": process.env.CORS_ALLOW_ORIGIN?.trim() || "*",
        "access-control-allow-methods": "GET, OPTIONS"
      }
    });
    responseStream.write(encodeSseEventMessage("failure", message));
    responseStream.write(encodeSseEventMessage("done", "failed"));
    responseStream.end();
  }
});
