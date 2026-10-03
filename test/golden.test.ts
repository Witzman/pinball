import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { step } from "../src/core/step";
import { hashWorld } from "../src/core/hash";
import { runReplay } from "../src/sim/replay";
import type { Replay } from "../src/sim/replay";
import { allTables, tableSetups } from "../src/tables";
import { crowded } from "./core/scenes";
import { saucerReplay, saucerRules, saucerTable } from "./sim/fixtures";

// Golden hashes: the exact end state of fixed scenes and replays. A change that
// should not alter results must not alter these. If physics or the hash change
// ON PURPOSE, regenerate with `npm run golden:update`, review the diff of
// test/golden/hashes.json and say why in the issue.
//
// Add a replay: drop a JSON file into test/replays/ (format: src/sim/replay.ts),
// then run the update command to record its hash.
const HASHES = fileURLToPath(new URL("./golden/hashes.json", import.meta.url));
const REPLAYS = new URL("./replays/", import.meta.url);

const SCENES = [
  { n: 50, seed: 7 },
  { n: 150, seed: 8 },
  { n: 400, seed: 9 },
];

function compute(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of SCENES) {
    const w = crowded(s.n, s.seed);
    for (let i = 0; i < 20000; i++) step(w);
    out[`scene/crowded-${s.n}-${s.seed}`] = hashWorld(w);
  }
  for (const f of readdirSync(REPLAYS).filter((n) => n.endsWith(".json")).sort()) {
    const replay = JSON.parse(readFileSync(new URL(f, REPLAYS), "utf8")) as Replay;
    const result = runReplay(replay, allTables);
    out[`replay/${f.slice(0, -5)}`] = result.hash;
    out[`replay/${f.slice(0, -5)}/rules`] = result.rulesHash;
  }
  // a sinkhole scenario with rules: capture, lock, timed release, seeded random
  for (const seed of [5, 6]) {
    const r = runReplay(saucerReplay(seed), [saucerTable], { "saucer-demo": { rules: saucerRules } });
    out[`rules/saucer-seed${seed}`] = r.hash;
    out[`rules/saucer-seed${seed}/rules`] = r.rulesHash;
  }
  // a game on the demo table with its real rules: coin and start from the buttons, a launch
  const game = runReplay(
    {
      header: { format: 1, tableId: "demo", dt: 0.001, seed: 3, ticks: 3000, credits: 2, boards: { main: [4000], bought: [] } },
      inputs: [
        { tick: 10, action: "coin_down" }, { tick: 20, action: "coin_up" }, { tick: 30, action: "start_down" }, { tick: 40, action: "start_up" },
        { tick: 400, action: "plunge_down" }, { tick: 800, action: "plunge_up" },
      ],
    },
    allTables,
    tableSetups,
  );
  out["game/demo-start"] = game.hash;
  out["game/demo-start/rules"] = game.rulesHash;
  return out;
}

describe("golden hashes", () => {
  const actual = compute();

  if (process.env.GOLDEN_UPDATE === "1") {
    it("rewrites test/golden/hashes.json", () => {
      writeFileSync(HASHES, JSON.stringify(actual, null, 2) + "\n");
    });
    return;
  }

  const golden = JSON.parse(readFileSync(HASHES, "utf8")) as Record<string, number>;
  for (const [name, hash] of Object.entries(actual)) {
    it(`${name} still ends in hash ${golden[name] ?? "(none recorded)"}`, () => {
      expect(golden[name], `no golden hash for ${name}: run npm run golden:update`).toBeDefined();
      expect(hash).toBe(golden[name]);
    });
  }
  it("has no golden hash for a scene or replay that no longer exists", () => {
    expect(Object.keys(golden).sort()).toEqual(Object.keys(actual).sort());
  });
});
