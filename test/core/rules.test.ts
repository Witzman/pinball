import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { slopeGravity } from "../../src/core/world";

describe("slope gravity", () => {
  it("projects 9.81 m/s^2 onto a 6.5 degree playfield", () => {
    expect(slopeGravity(6.5)).toBeCloseTo(9.81 * Math.sin((6.5 * Math.PI) / 180), 9);
    expect(slopeGravity(0)).toBe(0);
  });
});

describe("core purity (decision in #4)", () => {
  const dir = fileURLToPath(new URL("../../src/core", import.meta.url));
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));

  it("has files to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const f of files) {
    const code = readFileSync(join(dir, f), "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

    it(`${f} touches no DOM and no clock or randomness`, () => {
      expect(code).not.toMatch(/\b(document|window|navigator|performance)\b/);
      expect(code).not.toMatch(/Date\.now|Math\.random/);
    });

    if (f !== "world.ts") {
      it(`${f} uses no trigonometry or pow outside load time`, () => {
        expect(code).not.toMatch(/Math\.(sin|cos|tan|atan2?|asin|acos|pow|exp|log)\b/);
        expect(code).not.toMatch(/\*\*/);
      });
    }
  }
});
