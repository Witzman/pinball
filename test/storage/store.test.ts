import { describe, expect, it } from "vitest";
import { localStore, memoryStore } from "../../src/storage";

describe("memory store", () => {
  it("gives null for a key never set, and what was set after", async () => {
    const s = memoryStore();
    expect(await s.get("a")).toBeNull();
    await s.set("a", "1");
    expect(await s.get("a")).toBe("1");
    await s.set("a", "2");
    expect(await s.get("a")).toBe("2");
    expect(await s.get("b")).toBeNull();
  });

  it("keeps stores apart", async () => {
    const a = memoryStore();
    const b = memoryStore();
    await a.set("k", "x");
    expect(await b.get("k")).toBeNull();
  });
});

describe("local store", () => {
  const fake = () => {
    const data = new Map<string, string>();
    return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  };

  it("reads and writes through the browser storage it is given", async () => {
    const backend = fake();
    const s = localStore(backend);
    expect(await s.get("k")).toBeNull();
    await s.set("k", "v");
    expect(backend.data.get("k")).toBe("v");
    expect(await s.get("k")).toBe("v");
  });

  it("reads null instead of throwing when the storage cannot be read, and rejects a write that fails", async () => {
    const broken = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("quota"); },
    };
    const s = localStore(broken);
    expect(await s.get("k")).toBeNull();
    await expect(s.set("k", "v")).rejects.toThrow(/quota/);
  });

  it("falls back to memory when the browser has no storage, or reading it throws", async () => {
    const s = localStore(); // vitest runs in node: no localStorage
    await s.set("k", "v");
    expect(await s.get("k")).toBe("v");
    const g = globalThis as Record<string, unknown>;
    Object.defineProperty(g, "localStorage", { get() { throw new Error("SecurityError"); }, configurable: true });
    try {
      const blocked = localStore();
      await blocked.set("a", "b");
      expect(await blocked.get("a")).toBe("b");
    } finally {
      delete g.localStorage;
    }
  });
});
