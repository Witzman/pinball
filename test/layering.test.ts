import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Decision in #4: dependencies point downward only.
// core -> table -> rules -> sim -> leaves. Each layer may import only these.
const ALLOWED: Record<string, string[]> = {
  core: ["core"],
  table: ["core", "table"],
  rules: ["table", "rules"],
  tables: ["table", "rules", "tables"],
  sim: ["core", "table", "rules", "sim"],
  input: ["input", "sim"],
  render: ["sim", "render"],
  storage: ["storage"],
  app: ["app", "input", "render", "sim", "rules", "tables", "table", "core", "storage"],
};

const root = fileURLToPath(new URL("../src", import.meta.url));

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith(".ts") ? [join(dir, e.name)] : [],
  );
}

function strip(code: string): string {
  return code.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Every module a piece of source asks for: `from "x"`, `import "x"`, `import("x")`, `require("x")`, either quote. */
export function importsOf(code: string): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(/(?:\bfrom|\bimport|\brequire)\s*\(?\s*(["'`])([^"'`]+)\1/g)) out.push(m[2]!);
  return out;
}

/** What is wrong with the imports of the file `rel` (relative to src) in `layer`: anything outside the allowed layers, or not a relative path at all. */
export function violations(rel: string, code: string, allowed: string[]): string[] {
  const bad: string[] = [];
  for (const spec of importsOf(strip(code))) {
    if (!spec.startsWith(".")) {
      bad.push(`${rel} imports "${spec}": no runtime dependencies`);
      continue;
    }
    const target = join("/src", rel, "..", spec).slice("/src/".length).split(/[\\/]/)[0]!;
    if (!allowed.includes(target)) bad.push(`${rel} imports "${spec}" (layer ${target})`);
  }
  return bad;
}

describe("the layering check itself", () => {
  const allowed = ["sim"];

  it("sees every way of importing a module, with either quote", () => {
    const code = [
      'import { a } from "../storage";', "import { b } from '../storage';", 'import "../storage";', 'const m = import("../storage");',
      'export * from "../storage";', 'export type { T } from "../storage";', "const r = require('../storage');",
    ].join("\n");
    expect(importsOf(code)).toEqual(Array(7).fill("../storage"));
  });

  it("fails an import outside the allowed layers, in any of those forms", () => {
    for (const line of ['import { a } from "../storage";', "import { b } from '../storage';", 'import "../storage";', 'const m = import("../storage");', "const r = require('../storage');"]) {
      expect(violations("sim/x.ts", line, allowed), line).toEqual(['sim/x.ts imports "../storage" (layer storage)']);
    }
  });

  it("fails a package import: the game has no runtime dependencies", () => {
    expect(violations("sim/x.ts", 'import left from "left-pad";', allowed)).toEqual(['sim/x.ts imports "left-pad": no runtime dependencies']);
  });

  it("lets allowed imports through, resolves paths up and down, and ignores commented-out code", () => {
    expect(violations("sim/x.ts", 'import { a } from "./game";\nimport { b } from "./deep/er";', allowed)).toEqual([]);
    expect(violations("sim/a/b.ts", 'import { a } from "../game";', allowed)).toEqual([]);
    expect(violations("sim/x.ts", '// import { a } from "../storage";\n/* import "../storage"; */', allowed)).toEqual([]);
    expect(violations("sim/x.ts", 'import { a } from "../core/types";', allowed)).toEqual(['sim/x.ts imports "../core/types" (layer core)']);
  });
});

describe("storage", () => {
  // Decision in #11: all storage goes through one interface, so a server can replace localStorage later.
  // The word check is a tripwire, not a guarantee: code can build the name from pieces.
  it("is not named outside src/storage", () => {
    let scanned = 0;
    for (const f of files(root)) {
      const rel = f.slice(root.length + 1);
      if (rel.startsWith("storage")) continue;
      scanned++;
      expect(strip(readFileSync(f, "utf8")), rel).not.toMatch(/localStorage|sessionStorage|indexedDB/);
    }
    expect(scanned).toBeGreaterThan(20);
  });

  it("is imported only by the app", () => {
    let scanned = 0;
    for (const f of files(root)) {
      const rel = f.slice(root.length + 1);
      const top = rel.split(/[\\/]/)[0]!;
      if (top === "app" || top === "storage") continue;
      scanned++;
      for (const spec of importsOf(strip(readFileSync(f, "utf8")))) {
        if (!spec.startsWith(".")) continue;
        const target = join("/src", rel, "..", spec).slice("/src/".length).split(/[\\/]/)[0]!;
        expect(target, `${rel} imports ${spec}`).not.toBe("storage");
      }
    }
    expect(scanned).toBeGreaterThan(20);
  });
});

describe("layering", () => {
  for (const [layer, allowed] of Object.entries(ALLOWED)) {
    for (const f of files(join(root, layer))) {
      const rel = f.slice(root.length + 1);
      const code = strip(readFileSync(f, "utf8"));

      it(`${rel} imports only ${allowed.join(", ")}`, () => {
        expect(violations(rel, code, allowed)).toEqual([]);
      });

      if (["table", "rules", "tables", "sim", "input", "render"].includes(layer)) {
        it(`${rel} touches no DOM, clock or randomness`, () => {
          if (layer !== "render") expect(code).not.toMatch(/\b(document|window|navigator|performance)\b/);
          expect(code).not.toMatch(/Date\.now|Math\.random/);
        });
      }
    }
  }
});
