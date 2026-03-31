import { docClient } from "./dynamodb";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const MIN_INTERVAL_MS = 3000;
const DAILY_LIMIT = 50;
const CLEANUP_EVERY = 200;
const STALE_ENTRY_MS = 3 * 24 * 60 * 60 * 1000;

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

const GLOBAL_MEMORY_STORE_KEY = "__polyglot_ip_rate_limit_memory_store__";

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

async function checkIpRateLimitDynamoDb(request: Request): Promise<IpRateLimitResult> {
  const tableName = process.env.DYNAMODB_TABLE_NAME;
  if (!tableName) {
    // Fallback to memory store if no table configured
    return checkIpRateLimitInMemory(request);
  }

  const now = Date.now();
  const ip = getClientIp(request);
  const dayKey = toDayKey(now);
  const limitKey = `RATELIMIT#${ip}#${dayKey}`;

  try {
    const getResult = await docClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { id: limitKey }
      })
    );

    const entry = getResult.Item;

    if (entry) {
      const elapsed = now - (entry.lastRequestAt || 0);
      if (elapsed < MIN_INTERVAL_MS) {
        return intervalResult(elapsed);
      }

      const count = entry.dailyCount || 0;
      if (count >= DAILY_LIMIT) {
        return dailyResult(now);
      }
    }

    // Pass first checks, now atomicaly increment and update timestamp
    await docClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { id: limitKey },
        UpdateExpression:
          "SET dailyCount = if_not_exists(dailyCount, :zero) + :inc, lastRequestAt = :now, createdAt = if_not_exists(createdAt, :now)",
        ExpressionAttributeValues: {
          ":inc": 1,
          ":zero": 0,
          ":now": now
        }
      })
    );

    return { allowed: true };
  } catch (error) {
    console.error("[ip-rate-limit] DynamoDB error:", error);
    // If DynamoDB fails, fall back softly to memory so we don't bring down the API
    return checkIpRateLimitInMemory(request);
  }
}

export async function checkIpRateLimit(request: Request): Promise<IpRateLimitResult> {
  return checkIpRateLimitDynamoDb(request);
}
