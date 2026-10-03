import { describe, expect, it } from "vitest";
import { advance, createGame, takeCommands } from "../../src/sim/game";
import { allTables, tableSetups } from "../../src/tables";
import { demoTable } from "../../src/tables/demo";
import { demoFlow } from "../../src/tables/demo-rules";
import { validateFlow } from "../../src/rules";

describe("the shipping tables' setups", () => {
  it("has a setup for every table, with a valid flow", () => {
    for (const t of allTables) {
      const setup = tableSetups[t.id];
      expect(setup, t.id).toBeDefined();
      expect(setup!.flow, t.id).toBeDefined();
      expect(validateFlow(setup!.flow!), t.id).toEqual([]);
    }
  });

  it("plays a game on the demo table: start, hit the target for 1000, a drain inside the saver window brings the ball back", () => {
    const g = createGame(demoTable, tableSetups.demo!);
    expect(g.rules.state.game).toMatchObject({ phase: "attract", credits: demoFlow.startCredits });
    g.input.start = true;
    advance(g, 5);
    g.input.start = false;
    advance(g, 5);
    expect(g.rules.state.game).toMatchObject({ phase: "play", credits: demoFlow.startCredits - demoFlow.startCost });
    g.table.world.gravity = 0;
    const b = g.table.world.balls[0]!;
    b.x = 0.34;
    b.y = 0.55;
    b.vx = 0;
    b.vy = -3;
    advance(g, 50);
    expect(g.rules.state.player.score).toBe(1000);
    g.table.world.gravity = 1.1;
    b.y = 1.2; // drains; the target was the ball's first switch, so the saver is on
    advance(g, 10);
    expect(g.rules.state.game!.phase).toBe("play");
    expect(g.rules.state.player.ballNo).toBe(1);
    expect(takeCommands(g).map((c) => c.c)).toContain("feedBall");
  });
});
