import { TranslationPayload } from "@/lib/types";

const DB_NAME = "polyglot_dict";
const DB_VERSION = 1;
const STORE_NAME = "translation_cache";
const CACHE_TIME_INDEX = "cachedAt";
const CACHE_LIMIT = 120;

export type TranslationCacheEntry = {
  cacheKey: string;
  cachedAt: number;
  data: TranslationPayload;
};

let dbPromise: Promise<IDBDatabase | null> | null = null;

function canUseIndexedDB(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (!canUseIndexedDB()) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "cacheKey" });
        store.createIndex(CACHE_TIME_INDEX, CACHE_TIME_INDEX, { unique: false });
        return;
      }

      const tx = request.transaction;
      if (!tx) {
        return;
      }
      const store = tx.objectStore(STORE_NAME);
      if (!store.indexNames.contains(CACHE_TIME_INDEX)) {
        store.createIndex(CACHE_TIME_INDEX, CACHE_TIME_INDEX, { unique: false });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
      };
      resolve(db);
    };

    request.onerror = () => {
      resolve(null);
    };

    request.onblocked = () => {
      resolve(null);
    };
  });
}

async function getDatabase(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = openDatabase();
  }

  const db = await dbPromise;
  if (!db) {
    dbPromise = null;
  }
  return db;
}

export function buildTranslationCacheKey(sourceWord: string, sourceLanguage: string, targetLanguages: string[]): string {
  const targets = Array.from(new Set(targetLanguages.map((item) => item.trim().toLowerCase()).filter(Boolean))).sort();
  return JSON.stringify({
    v: 10,
    sourceWord: sourceWord.trim().toLowerCase(),
    sourceLanguage: sourceLanguage.trim().toLowerCase(),
    targetLanguages: targets
  });
}

export async function getTranslationCacheEntry(cacheKey: string): Promise<TranslationCacheEntry | null> {
  const db = await getDatabase();
  if (!db) {
    return null;
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(cacheKey);

      request.onsuccess = () => {
        const value = request.result as TranslationCacheEntry | undefined;
        resolve(value ?? null);
      };

      request.onerror = () => {
        resolve(null);
      };

      tx.onabort = () => {
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}

export async function setTranslationCacheEntry(cacheKey: string, data: TranslationPayload): Promise<void> {
  const db = await getDatabase();
  if (!db) {
    return;
  }

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      store.put({
        cacheKey,
        cachedAt: Date.now(),
        data
      } satisfies TranslationCacheEntry);

      const index = store.index(CACHE_TIME_INDEX);
      let count = 0;
      const cursorRequest = index.openCursor(null, "prev");

      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) {
          return;
        }

        count += 1;
        if (count > CACHE_LIMIT) {
          store.delete(cursor.primaryKey);
        }

        cursor.continue();
      };

      tx.oncomplete = () => {
        resolve();
      };
      tx.onabort = () => {
        resolve();
      };
      tx.onerror = () => {
        resolve();
      };
    } catch {
      resolve();
    }
  });
}
