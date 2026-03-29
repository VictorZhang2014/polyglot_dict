import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const MIN_INTERVAL_MS = 3000;
const DAILY_LIMIT = 50;
const TABLE_NAME = process.env.RATE_LIMIT_TABLE_NAME?.trim() || "parlerai_rate_limit";
const TTL_GRACE_DAYS = 2;
const FAIL_OPEN = (process.env.RATE_LIMIT_FAIL_OPEN ?? "false").trim().toLowerCase() === "true";
const DDB_REGION = process.env.RATE_LIMIT_AWS_REGION?.trim() || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
const RATE_LIMIT_BACKEND = (
  process.env.RATE_LIMIT_BACKEND ??
  (process.env.NODE_ENV === "production" ? "dynamodb" : "memory")
)
  .trim()
  .toLowerCase();
const CLEANUP_EVERY = 200;
const STALE_ENTRY_MS = 3 * 24 * 60 * 60 * 1000;

type IpRateLimitItem = {
  pk: string;
  dayKey: string;
  count: number;
  lastRequestAt: number;
  updatedAt: number;
  expiresAt: number;
};

type MemoryRateLimitEntry = {
  dayKey: string;
  count: number;
  lastRequestAt: number;
  updatedAt: number;
};

type MemoryRateLimitStore = {
  byIp: Map<string, MemoryRateLimitEntry>;
  checks: number;
};

type AllowedResult = {
  allowed: true;
};

type BlockedResult = {
  allowed: false;
  status: 429 | 503;
  code: "IP_RATE_LIMIT_INTERVAL" | "IP_RATE_LIMIT_DAILY" | "IP_RATE_LIMIT_UNAVAILABLE";
  message: string;
  retryAfterSeconds: number;
};

export type IpRateLimitResult = AllowedResult | BlockedResult;

const GLOBAL_CLIENT_KEY = "__polyglot_dynamodb_doc_client__";
const GLOBAL_MEMORY_STORE_KEY = "__polyglot_ip_rate_limit_memory_store__";

function getClient(): DynamoDBDocumentClient {
  const root = globalThis as typeof globalThis & { [GLOBAL_CLIENT_KEY]?: DynamoDBDocumentClient };
  if (!root[GLOBAL_CLIENT_KEY]) {
    const base = new DynamoDBClient({
      region: DDB_REGION
    });
    root[GLOBAL_CLIENT_KEY] = DynamoDBDocumentClient.from(base, {
      marshallOptions: {
        removeUndefinedValues: true
      }
    });
  }

  return root[GLOBAL_CLIENT_KEY] as DynamoDBDocumentClient;
}

function getMemoryStore(): MemoryRateLimitStore {
  const root = globalThis as typeof globalThis & { [GLOBAL_MEMORY_STORE_KEY]?: MemoryRateLimitStore };
  if (!root[GLOBAL_MEMORY_STORE_KEY]) {
    root[GLOBAL_MEMORY_STORE_KEY] = {
      byIp: new Map<string, MemoryRateLimitEntry>(),
      checks: 0
    };
  }

  return root[GLOBAL_MEMORY_STORE_KEY] as MemoryRateLimitStore;
}

function toDayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function secondsUntilNextUtcDay(now: number): number {
  const current = new Date(now);
  const nextDayUtc = Date.UTC(
    current.getUTCFullYear(),
    current.getUTCMonth(),
    current.getUTCDate() + 1,
    0,
    0,
    0,
    0
  );

  return Math.max(1, Math.ceil((nextDayUtc - now) / 1000));
}

function toEpochSeconds(now: number): number {
  return Math.floor(now / 1000);
}

function ttlWithGrace(now: number): number {
  return toEpochSeconds(now + TTL_GRACE_DAYS * 24 * 60 * 60 * 1000);
}

function cleanupMemoryStore(store: MemoryRateLimitStore, now: number): void {
  for (const [ip, entry] of store.byIp) {
    if (now - entry.updatedAt > STALE_ENTRY_MS) {
      store.byIp.delete(ip);
    }
  }
}

function firstNonEmpty(...values: Array<string | null>): string {
  for (const value of values) {
    if (value && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function parseForwardedHeader(forwarded: string | null): string {
  if (!forwarded) {
    return "";
  }

  const firstPart = forwarded.split(",")[0]?.trim() ?? "";
  const match = firstPart.match(/for=(?:\"?)([^;\",]+)(?:\"?)/i);
  return match?.[1]?.trim() ?? "";
}

function normalizeIp(value: string): string {
  let ip = value.trim();

  if (ip.includes(",")) {
    ip = ip.split(",")[0]?.trim() ?? ip;
  }

  if (ip.startsWith("[") && ip.includes("]")) {
    ip = ip.slice(1, ip.indexOf("]"));
  }

  if (ip.startsWith("::ffff:")) {
    ip = ip.slice(7);
  }

  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(ip)) {
    ip = ip.split(":")[0] ?? ip;
  }

  return ip || "unknown";
}

export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const cfIp = request.headers.get("cf-connecting-ip");
  const trueClientIp = request.headers.get("true-client-ip");
  const forwarded = parseForwardedHeader(request.headers.get("forwarded"));

  const candidate = firstNonEmpty(forwardedFor, realIp, cfIp, trueClientIp, forwarded);
  return normalizeIp(candidate || "unknown");
}

function makePk(ip: string, dayKey: string): string {
  return `ip#${ip}#day#${dayKey}`;
}

function intervalResult(elapsed: number): BlockedResult {
  return {
    allowed: false,
    status: 429,
    code: "IP_RATE_LIMIT_INTERVAL",
    message: "Rate limit exceeded: same IP can only send one request every 3 seconds.",
    retryAfterSeconds: Math.max(1, Math.ceil((MIN_INTERVAL_MS - elapsed) / 1000))
  };
}

function dailyResult(now: number): BlockedResult {
  return {
    allowed: false,
    status: 429,
    code: "IP_RATE_LIMIT_DAILY",
    message: "Rate limit exceeded: same IP can only send up to 50 requests per day.",
    retryAfterSeconds: secondsUntilNextUtcDay(now)
  };
}

function unavailableResult(): BlockedResult {
  return {
    allowed: false,
    status: 503,
    code: "IP_RATE_LIMIT_UNAVAILABLE",
    message: "Rate limiter is temporarily unavailable. Please retry in a few seconds.",
    retryAfterSeconds: 3
  };
}

function logRateLimitDdbError(stage: "update" | "get", error: unknown): void {
  const asRecord = (error && typeof error === "object" ? error : null) as
    | {
        name?: unknown;
        message?: unknown;
        code?: unknown;
        $metadata?: { httpStatusCode?: unknown; requestId?: unknown };
      }
    | null;

  const name = typeof asRecord?.name === "string" ? asRecord.name : "UnknownError";
  const message = typeof asRecord?.message === "string" ? asRecord.message : String(error);
  const code = typeof asRecord?.code === "string" ? asRecord.code : undefined;
  const status =
    typeof asRecord?.$metadata?.httpStatusCode === "number" ? asRecord.$metadata.httpStatusCode : undefined;
  const requestId = typeof asRecord?.$metadata?.requestId === "string" ? asRecord.$metadata.requestId : undefined;

  console.error("[rate-limit] dynamodb failure", {
    stage,
    backend: RATE_LIMIT_BACKEND,
    tableName: TABLE_NAME,
    region: DDB_REGION || "unset",
    failOpen: FAIL_OPEN,
    name,
    code,
    status,
    requestId,
    message
  });
}

function checkIpRateLimitInMemory(request: Request): IpRateLimitResult {
  const now = Date.now();
  const store = getMemoryStore();
  store.checks += 1;

  if (store.checks % CLEANUP_EVERY === 0) {
    cleanupMemoryStore(store, now);
  }

  const ip = getClientIp(request);
  const dayKey = toDayKey(now);
  const existing = store.byIp.get(ip);

  let entry: MemoryRateLimitEntry;
  if (!existing || existing.dayKey !== dayKey) {
    entry = {
      dayKey,
      count: 0,
      lastRequestAt: 0,
      updatedAt: now
    };
  } else {
    entry = existing;
  }

  const elapsed = now - entry.lastRequestAt;
  if (entry.lastRequestAt > 0 && elapsed < MIN_INTERVAL_MS) {
    entry.updatedAt = now;
    store.byIp.set(ip, entry);
    return intervalResult(elapsed);
  }

  if (entry.count >= DAILY_LIMIT) {
    entry.updatedAt = now;
    store.byIp.set(ip, entry);
    return dailyResult(now);
  }

  entry.count += 1;
  entry.lastRequestAt = now;
  entry.updatedAt = now;
  store.byIp.set(ip, entry);

  return { allowed: true };
}

function useMemoryBackend(): boolean {
  return RATE_LIMIT_BACKEND === "memory";
}

export async function checkIpRateLimit(request: Request): Promise<IpRateLimitResult> {
  if (useMemoryBackend()) {
    return checkIpRateLimitInMemory(request);
  }

  const now = Date.now();
  const ip = getClientIp(request);
  const dayKey = toDayKey(now);
  const pk = makePk(ip, dayKey);
  const client = getClient();

  try {
    await client.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { pk },
        UpdateExpression:
          "SET #dayKey = :dayKey, #lastRequestAt = :now, #updatedAt = :now, #expiresAt = :expiresAt ADD #count :one",
        ConditionExpression:
          "(attribute_not_exists(#lastRequestAt) OR #lastRequestAt <= :intervalCutoff) AND (attribute_not_exists(#count) OR #count < :dailyLimit)",
        ExpressionAttributeNames: {
          "#dayKey": "dayKey",
          "#count": "count",
          "#lastRequestAt": "lastRequestAt",
          "#updatedAt": "updatedAt",
          "#expiresAt": "expiresAt"
        },
        ExpressionAttributeValues: {
          ":dayKey": dayKey,
          ":now": now,
          ":intervalCutoff": now - MIN_INTERVAL_MS,
          ":dailyLimit": DAILY_LIMIT,
          ":one": 1,
          ":expiresAt": ttlWithGrace(now)
        }
      })
    );

    return { allowed: true };
  } catch (error) {
    const name = typeof error === "object" && error && "name" in error ? String(error.name) : "";
    if (name !== "ConditionalCheckFailedException") {
      logRateLimitDdbError("update", error);
      return FAIL_OPEN ? { allowed: true } : unavailableResult();
    }
  }

  try {
    const read = await client.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { pk },
        ConsistentRead: true
      })
    );

    const item = read.Item as IpRateLimitItem | undefined;
    if (!item) {
      return intervalResult(0);
    }

    const elapsed = now - (item.lastRequestAt || 0);
    if (item.lastRequestAt > 0 && elapsed < MIN_INTERVAL_MS) {
      return intervalResult(elapsed);
    }

    if ((item.count || 0) >= DAILY_LIMIT) {
      return dailyResult(now);
    }

    return intervalResult(0);
  } catch (error) {
    logRateLimitDdbError("get", error);
    return FAIL_OPEN ? { allowed: true } : unavailableResult();
  }
}
