import { describe, expect, it } from "vitest";
import { step } from "../../src/core/step";
import { hashWorld } from "../../src/core/hash";
import { crowded } from "./scenes";

// Recorded on the brute-force collision search (before the grid, issue #42).
// If physics changes ON PURPOSE, regenerate: run the scenes, paste the new hashes
// and say why in the issue. A change that should not alter results must not
// alter these.
const GOLDEN = [
  { n: 50, seed: 7, hash: 696925914 },
  { n: 150, seed: 8, hash: 1738193386 },
  { n: 400, seed: 9, hash: 569979216 },
];

describe("golden replays", () => {
  for (const g of GOLDEN) {
    it(`scene n=${g.n} seed=${g.seed} still ends in hash ${g.hash}`, () => {
      const w = crowded(g.n, g.seed);
      for (let i = 0; i < 20000; i++) step(w);
      expect(hashWorld(w)).toBe(g.hash);
    });
  }
});
