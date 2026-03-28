const MIN_INTERVAL_MS = 3000;
const DAILY_LIMIT = 50;
const CLEANUP_EVERY = 200;
const STALE_ENTRY_MS = 3 * 24 * 60 * 60 * 1000;

type IpRateLimitEntry = {
  dayKey: string;
  count: number;
  lastRequestAt: number;
  updatedAt: number;
};

type IpRateLimitStore = {
  byIp: Map<string, IpRateLimitEntry>;
  checks: number;
};

type AllowedResult = {
  allowed: true;
};

type BlockedResult = {
  allowed: false;
  status: 429;
  code: "IP_RATE_LIMIT_INTERVAL" | "IP_RATE_LIMIT_DAILY";
  message: string;
  retryAfterSeconds: number;
};

export type IpRateLimitResult = AllowedResult | BlockedResult;

const GLOBAL_STORE_KEY = "__polyglot_ip_rate_limit_store__";

function getStore(): IpRateLimitStore {
  const root = globalThis as typeof globalThis & { [GLOBAL_STORE_KEY]?: IpRateLimitStore };
  if (!root[GLOBAL_STORE_KEY]) {
    root[GLOBAL_STORE_KEY] = {
      byIp: new Map<string, IpRateLimitEntry>(),
      checks: 0
    };
  }

  return root[GLOBAL_STORE_KEY] as IpRateLimitStore;
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

function cleanupStore(store: IpRateLimitStore, now: number): void {
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

export function checkIpRateLimit(request: Request): IpRateLimitResult {
  const now = Date.now();
  const store = getStore();
  store.checks += 1;

  if (store.checks % CLEANUP_EVERY === 0) {
    cleanupStore(store, now);
  }

  const ip = getClientIp(request);
  const dayKey = toDayKey(now);
  const existing = store.byIp.get(ip);

  let entry: IpRateLimitEntry;
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
    return {
      allowed: false,
      status: 429,
      code: "IP_RATE_LIMIT_INTERVAL",
      message: "Rate limit exceeded: same IP can only send one request every 3 seconds.",
      retryAfterSeconds: Math.max(1, Math.ceil((MIN_INTERVAL_MS - elapsed) / 1000))
    };
  }

  if (entry.count >= DAILY_LIMIT) {
    entry.updatedAt = now;
    store.byIp.set(ip, entry);
    return {
      allowed: false,
      status: 429,
      code: "IP_RATE_LIMIT_DAILY",
      message: "Rate limit exceeded: same IP can only send up to 50 requests per day.",
      retryAfterSeconds: secondsUntilNextUtcDay(now)
    };
  }

  entry.count += 1;
  entry.lastRequestAt = now;
  entry.updatedAt = now;
  store.byIp.set(ip, entry);

  return { allowed: true };
}
