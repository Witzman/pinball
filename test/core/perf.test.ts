import { describe, expect, it } from "vitest";
import { step } from "../../src/core/step";
import { crowded } from "./scenes";

// Budget from #4: 20 us per ball-step with 3 balls on a full table. CI runners are
// noisy, so CI only fails at 3x the budget; locally the budget itself applies.
const BUDGET_US = process.env.CI ? 60 : 20;

describe("step cost", () => {
  it(`stays under ${BUDGET_US} us per ball-step on a 404-segment table`, () => {
    const w = crowded(400, 9);
    for (let i = 0; i < 2000; i++) step(w);
    const N = 50000;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) step(w);
    const us = ((performance.now() - t0) * 1000) / (N * w.balls.length);
    console.log(`bench: ${us.toFixed(2)} us per ball-step (404 segments, 3 balls)`);
    expect(us).toBeLessThan(BUDGET_US);
  });
});
