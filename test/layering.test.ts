import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Decision in #4: dependencies point downward only.
// core -> table -> rules -> sim -> leaves. Each layer may import only these.
const ALLOWED: Record<string, string[]> = {
  core: ["core"],
  table: ["core", "table"],
  tables: ["table", "tables"],
  sim: ["core", "table", "sim"],
  input: ["input", "sim"],
  render: ["core", "table", "sim", "render"],
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

describe("layering", () => {
  for (const [layer, allowed] of Object.entries(ALLOWED)) {
    for (const f of files(join(root, layer))) {
      const rel = f.slice(root.length + 1);
      const code = strip(readFileSync(f, "utf8"));

      it(`${rel} imports only ${allowed.join(", ")}`, () => {
        for (const m of code.matchAll(/from\s+"(\.[^"]+)"/g)) {
          const target = join(f, "..", m[1]!).slice(root.length + 1).split(/[\\/]/)[0]!;
          expect(allowed, `${rel} imports ${m[1]}`).toContain(target);
        }
      });

      if (["table", "tables", "sim", "input", "render"].includes(layer)) {
        it(`${rel} touches no DOM, clock or randomness`, () => {
          if (layer !== "render") expect(code).not.toMatch(/\b(document|window|navigator|performance)\b/);
          expect(code).not.toMatch(/Date\.now|Math\.random/);
        });
      }
    }
  }
});
