// The one place the game touches browser storage. Everything else asks a Store: a
// real server with a database can implement it later (#22) without the game changing.

export interface Store {
  /** The stored text for a key, or null when there is none (or storage cannot be read). */
  get(key: string): Promise<string | null>;
  /** Stores text under a key; rejects when it cannot be stored. */
  set(key: string, value: string): Promise<void>;
}

/** Keeps everything in memory: tests, and the fallback when the browser gives no storage. */
export function memoryStore(): Store {
  const data = new Map<string, string>();
  return {
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => {
      data.set(key, value);
    },
  };
}

type Backend = Pick<Storage, "getItem" | "setItem">;

/** The browser's localStorage, or memory when it is missing or blocked (private windows, blocked site data). */
export function localStore(backend?: Backend): Store {
  let storage: Backend | undefined = backend;
  if (!storage) {
    try {
      storage = (globalThis as { localStorage?: Backend }).localStorage;
    } catch {
      storage = undefined; // reading the property itself can throw
    }
  }
  if (!storage) return memoryStore();
  const s = storage;
  return {
    get: async (key) => {
      try {
        return s.getItem(key);
      } catch {
        return null;
      }
    },
    set: async (key, value) => {
      s.setItem(key, value);
    },
  };
}
