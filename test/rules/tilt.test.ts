import { describe, expect, it } from "vitest";
import { createRules, hashRules, restore, serialize, validateFlow } from "../../src/rules";
import type { FlowConfig, RulesEvent, TableRules } from "../../src/rules";
import { harness } from "./harness";

const cfg: FlowConfig = {
  ballsPerGame: 3, startCost: 1, startCredits: 3, overTicks: 100, saverTicks: 1000, bonusTicks: 10, extraBallMax: 1,
  tilt: { free: 1, warnings: 2, decayTicks: 2000 },
};

const seen: string[] = [];
const table: TableRules = {
  modes: { m: { start: "p", phases: { p: { on: { nudge: () => { seen.push("mode saw a nudge"); } } } } } },
  onSwitch(c, e) {
    if (e.sw === "loop") c.add("loops");
    if (e.sw === "mode") c.start("m");
    if (e.sw === "extra") c.game.extraBall();
    if (e.sw === "lock") c.ball.lock("saucer");
  },
  bonus: (c) => c.count("loops") * 1000,
};

type H = ReturnType<typeof harness>;

function game(over: Partial<FlowConfig> = {}): H {
  const h = harness(table, { flow: { ...cfg, ...over } });
  h.at(1).button("start", true).at(2).ballAtPlunger();
  return h.run(3);
}

const cues = (h: H) => h.cmds.filter((c) => c.c === "dmd" || c.c === "sound").map((c) => (c.c === "dmd" ? `${c.show.id}${c.show.args ? JSON.stringify(c.show.args) : ""}` : `sound ${c.play}`));

describe("tilt", () => {
  it("is quiet up to the free nudges, warns for the next ones with their count, and tilts after that", () => {
    const h = game();
    h.take();
    h.at(10).nudge().run(11);
    expect(cues(h)).toEqual([]);
    expect(h.state.game).toMatchObject({ tiltHeat: 1, tilted: false });
    h.at(300).nudge().run(301);
    expect(cues(h)).toEqual(['tiltWarning{"n":1}', "sound warn"]);
    h.take();
    h.at(600).nudge().run(601);
    expect(cues(h)).toEqual(['tiltWarning{"n":2}', "sound warn"]);
    expect(h.state.game!.tilted).toBe(false);
    h.take();
    h.at(900).nudge().run(901);
    expect(cues(h)).toEqual(["tilt", "sound tilt"]);
    expect(h.state.game!.tilted).toBe(true);
  });

  it("cools down: nudges far enough apart never tilt, and the remainder of the time is not lost", () => {
    const h = game();
    for (let i = 0; i < 12; i++) h.at(10 + i * 2000).nudge().run(11 + i * 2000);
    expect(h.state.game!.tilted).toBe(false);
    expect(h.state.game!.tiltHeat).toBe(1);
    const slow = game();
    // heat 1 at tick 10, cooled one unit at 2010; a nudge at 2005 finds heat 1, makes 2 (a warning), and the clock stays at 10
    slow.at(10).nudge().at(2005).nudge().run(2006);
    expect(slow.state.game).toMatchObject({ tiltHeat: 2, tiltAt: 10 });
    slow.at(2010).nudge().run(2011); // one unit cooled: 2 - 1 + 1 = 2, clock moved by one period
    expect(slow.state.game).toMatchObject({ tiltHeat: 2, tiltAt: 2010 });
    const off = game();
    off.at(10).nudge().at(2005).nudge().at(2500).nudge().run(2501); // off the boundary: the clock moves to 2010, not to 2500
    expect(off.state.game).toMatchObject({ tiltHeat: 2, tiltAt: 2010 });
  });

  it("a long wait cools everything, and the next nudge starts the clock afresh", () => {
    const h = game();
    h.at(10).nudge().at(20).nudge().run(21);
    expect(h.state.game!.tiltHeat).toBe(2);
    h.at(10000).nudge().run(10001);
    expect(h.state.game).toMatchObject({ tiltHeat: 1, tiltAt: 10000 });
  });

  it("stops listening once tilted: more nudges add no cues", () => {
    const h = game({ tilt: { free: 0, warnings: 0, decayTicks: 2000 } });
    h.take();
    h.at(10).nudge().at(20).nudge().at(30).nudge().run(31);
    expect(cues(h)).toEqual(["tilt", "sound tilt"]);
    expect(h.state.game!.tiltHeat).toBe(1);
  });

  it("ends the ball without a bonus and without the saver, then serves the next ball clean", () => {
    const h = game({ tilt: { free: 0, warnings: 0, decayTicks: 2000 } });
    h.at(5).hit("loop").at(6).hit("loop").at(10).nudge().run(11);
    expect(h.state.game!.tilted).toBe(true);
    expect(h.state.balls.saver.until).toBeGreaterThan(11); // the saver was running
    h.take();
    h.at(20).drain().run(21);
    expect(h.state.game!.phase).toBe("bonus");
    expect(h.state.player.score).toBe(0); // 2000 bonus skipped
    expect(cues(h)).toEqual([]);
    h.run(31).at(32).ballAtPlunger().run(33);
    expect(h.state.game).toMatchObject({ phase: "play", tilted: false, tiltHeat: 0, tiltAt: 0 });
    expect(h.state.player.ballNo).toBe(2);
  });

  it("still serves an extra ball that was earned before the tilt", () => {
    const h = game({ tilt: { free: 0, warnings: 0, decayTicks: 2000 } });
    h.at(5).hit("extra").at(10).nudge().at(20).drain().run(21);
    expect(h.state.game).toMatchObject({ tilted: true, shootAgain: 1 });
    h.run(31).at(32).ballAtPlunger().run(33);
    expect(h.state.player.ballNo).toBe(1); // the extra ball: the same ball number
    expect(h.state.game!.tilted).toBe(false);
  });

  it("lets go of locked balls, so a tilted ball cannot be stuck in a lock", () => {
    const h = game({ tilt: { free: 0, warnings: 0, decayTicks: 2000 } });
    h.at(5).hit("lock", 0, "capture").run(6);
    expect(h.state.balls).toMatchObject({ inPlay: 0, locked: { saucer: 1 } });
    h.take();
    h.at(10).nudge().run(11);
    expect(h.state.game!.tilted).toBe(true);
    expect(h.state.balls).toMatchObject({ inPlay: 1, locked: {} });
    expect(h.cmds.filter((c) => c.c === "releaseBall")).toEqual([{ c: "releaseBall", lock: "saucer" }]);
    h.at(20).drain().run(21); // the ball can end: nothing is locked any more
    expect(h.state.game!.phase).toBe("bonus");
  });

  it("keeps a locked ball locked, and does not throw, when the table has no room to release it", () => {
    const h = game({ tilt: { free: 0, warnings: 0, decayTicks: 2000 } });
    h.state.balls.locked = { saucer: 1 }; // a ball in play and one locked, with a capacity of 1
    h.take();
    expect(() => h.at(10).nudge().run(11)).not.toThrow();
    expect(h.state.game!.tilted).toBe(true);
    expect(h.state.balls).toMatchObject({ inPlay: 1, locked: { saucer: 1 } });
    expect(h.cmds.filter((c) => c.c === "releaseBall")).toEqual([]);
  });

  it("only counts nudges while a ball is played: not in attract, bonus or over", () => {
    const attract = harness(table, { flow: cfg });
    attract.at(5).nudge().at(6).nudge().run(7);
    expect(attract.state.game).toMatchObject({ tiltHeat: 0, tilted: false });
    const h = game({ saverTicks: 0 });
    h.at(20).drain().at(21).nudge().at(22).nudge().at(23).nudge().run(24);
    expect(h.state.game!.phase).toBe("bonus");
    expect(h.state.game).toMatchObject({ tiltHeat: 0, tilted: false });
  });

  it("does nothing without a tilt in the config, and not without a flow", () => {
    const h = game({ tilt: undefined });
    h.at(10).nudge().at(20).nudge().at(30).nudge().at(40).nudge().run(41);
    expect(h.state.game).toMatchObject({ tiltHeat: 0, tilted: false });
    expect(cues(h)).toEqual([]);
    const free = harness(table);
    free.at(1).nudge().run(2);
    expect(free.state.game).toBeNull();
  });

  it("never shows a nudge to modes or the table", () => {
    seen.length = 0;
    const h = game();
    h.at(5).hit("mode").at(10).nudge().run(11);
    expect(h.state.modes.m).toBeDefined();
    expect(seen).toEqual([]);
  });

  it("clears the heat when a new game starts", () => {
    const h = game();
    h.at(10).nudge().at(20).nudge().run(21);
    expect(h.state.game!.tiltHeat).toBe(2);
    h.at(30).drain().run(31);
    h.run(41).at(42).ballAtPlunger().run(43);
    expect(h.state.game).toMatchObject({ tiltHeat: 0, tiltAt: 0 });
  });

  it("keeps the same ball's heat when the saver serves it again", () => {
    const h = game();
    h.at(5).hit("loop").at(10).nudge().run(11);
    expect(h.state.game!.tiltHeat).toBe(1);
    h.at(20).drain().run(21);
    expect(h.state.game!.phase).toBe("play"); // saved: the same ball
    expect(h.state.game!.tiltHeat).toBe(1);
  });
});

describe("tilt in saved state", () => {
  it("writes a quiet game exactly as before tilt existed, and reads such a save back as quiet", () => {
    const h = game();
    expect(serialize(h.state)).not.toMatch(/tiltHeat|tiltAt/);
    const back = restore(serialize(h.state));
    expect(back.game).toMatchObject({ tiltHeat: 0, tiltAt: 0 });
    expect(hashRules(back)).toBe(hashRules(h.state));
  });

  it("saves the heat while there is some, and resumes with it", () => {
    const h = game();
    h.at(10).nudge().at(20).nudge().run(21);
    const text = serialize(h.state);
    expect(text).toContain('"tiltHeat":2');
    const saved = restore(text);
    expect(saved.game).toMatchObject({ tiltHeat: 2, tiltAt: 10 });
    const a = createRules(table, { seed: 1, flow: cfg, state: saved });
    const b = createRules(table, { seed: 1, flow: cfg, state: restore(text) });
    const ev = (t: number): RulesEvent[] => [{ t: "nudge", tick: t, dir: "left" }];
    for (const r of [a, b]) {
      r.step(30, ev(30), []);
      r.step(40, ev(40), []);
    }
    expect(a.state.game!.tilted).toBe(true);
    expect(hashRules(a.state)).toBe(hashRules(b.state));
  });

  it("refuses a bad heat in a save", () => {
    const h = game();
    const bad = (edit: (g: Record<string, unknown>) => void) => () => {
      const s = JSON.parse(serialize(h.state));
      edit(s.game);
      return restore(JSON.stringify(s));
    };
    expect(bad((g) => { g.tiltHeat = -1; })).toThrow(/game must be/);
    expect(bad((g) => { g.tiltAt = 1.5; })).toThrow(/game must be/);
  });
});

describe("tilt config", () => {
  it("rejects bad numbers", () => {
    const bad = (t: object) => validateFlow({ ...cfg, tilt: t as never }).join();
    expect(bad({ free: -1, warnings: 2, decayTicks: 10 })).toMatch(/tilt.free/);
    expect(bad({ free: 1, warnings: 1.5, decayTicks: 10 })).toMatch(/tilt.warnings/);
    expect(bad({ free: 1, warnings: 2, decayTicks: 0 })).toMatch(/tilt.decayTicks/);
    expect(validateFlow(cfg)).toEqual([]);
  });
});
