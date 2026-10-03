import { describe, expect, it } from "vitest";
import { groups } from "../../src/app/hud";
import { validateFlow } from "../../src/rules";
import { advance, createGame, tick } from "../../src/sim/game";
import { allTables, tableSetups } from "../../src/tables";
import { colonyTable } from "../../src/tables/colony";
import { MAX_SCORE, REPLAY_SCORE, SKILL_SHOT, SUPER_SKILL_SHOT, SWITCH_POINTS } from "../../src/tables/colony-scoring";
import { colonyFlow, colonyRules } from "../../src/tables/colony-rules";
import { harness } from "../rules/harness";

/** A started game of The Colony with the ball at the plunger, on `seed`. */
function ball(seed = 1) {
  const h = harness(colonyRules, { flow: colonyFlow, shots: colonyTable.shots, seed });
  h.at(1).button("start", true).at(2).ballAtPlunger().run(3);
  h.take();
  return h;
}
const lit = (h: ReturnType<typeof ball>) => ["skill1", "skill2", "skill3"].filter((l) => h.state.lamps[l] === "lit");
const score = (h: ReturnType<typeof ball>) => h.state.player.score;

describe("the scoring scale of The Colony (#46)", () => {
  it("is the owner's: a replay at a billion, a skill shot a million, a super skill shot ten million", () => {
    expect(REPLAY_SCORE).toBe(1_000_000_000);
    expect(SKILL_SHOT).toBe(1_000_000);
    expect(SUPER_SKILL_SHOT).toBe(10_000_000);
    expect(colonyFlow.replayScore).toBe(REPLAY_SCORE);
    expect(validateFlow(colonyFlow)).toEqual([]);
    expect(tableSetups.colony?.flow).toBe(colonyFlow);
  });

  it("adds up: the super skill shot is ten skill shots, a replay a thousand, every small switch is far below a skill shot, and the numbers fit a JS integer and the HUD", () => {
    expect(SUPER_SKILL_SHOT).toBe(10 * SKILL_SHOT);
    expect(REPLAY_SCORE).toBe(1000 * SKILL_SHOT);
    for (const [sw, p] of Object.entries(SWITCH_POINTS)) {
      expect(p, sw).toBeGreaterThan(0);
      expect(p, sw).toBeLessThan(SKILL_SHOT / 10);
    }
    expect(Object.keys(SWITCH_POINTS).every((sw) => colonyTable.walls.some((w) => w.switch === sw) || (colonyTable.triggers ?? []).some((t) => t.switch === sw))).toBe(true);
    expect(REPLAY_SCORE).toBeLessThan(MAX_SCORE);
    expect(groups(REPLAY_SCORE)).toBe("1,000,000,000");
    expect(groups(REPLAY_SCORE).length).toBeLessThanOrEqual(13);
  });

  it("is checked on every table that is registered with a flow: a replay score above zero fits", () => {
    for (const t of allTables) expect(tableSetups[t.id]!.flow!.replayScore ?? 1, t.id).toBeLessThan(MAX_SCORE);
  });
});

describe("the skill shot", () => {
  it("lights exactly one skill lane at the start of a ball, and over many seeds every lane gets its turn", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const h = ball(seed);
      expect(lit(h), `seed ${seed}`).toHaveLength(1);
      seen.add(lit(h)[0]!);
    }
    expect([...seen].sort()).toEqual(["skill1", "skill2", "skill3"]);
  });

  it("tells the display which lane is lit when the ball starts", () => {
    const h = harness(colonyRules, { flow: colonyFlow, shots: colonyTable.shots });
    h.at(1).button("start", true).at(2).ballAtPlunger().run(3);
    const l = lit(h)[0]!;
    expect(h.cmds).toContainEqual({ c: "dmd", show: { id: "skillLane", args: { lane: l } } });
  });

  it("does not offer the skill shot again to a ball the saver serves again, and does to the next ball", () => {
    const h = harness(colonyRules, { flow: colonyFlow, shots: colonyTable.shots });
    h.at(1).button("start", true).at(2).ballAtPlunger().run(3);
    h.at(10).hit("slingL", 0, "kick").at(20).drain().run(21); // the saver was started by the first switch: the same ball comes back
    expect(h.cmds.some((c) => c.c === "feedBall")).toBe(true);
    h.take();
    h.at(30).ballAtPlunger().run(31);
    expect(lit(h)).toEqual([]);
    h.at(40).hit("skill1").at(50).hit("skill2").at(60).hit("skill3").run(70);
    expect(score(h)).toBe(SWITCH_POINTS.slingL);
    const next = harness(colonyRules, { flow: { ...colonyFlow, saverTicks: 0 }, shots: colonyTable.shots });
    next.at(1).button("start", true).at(2).ballAtPlunger().run(3);
    next.at(10).drain().run(11);
    next.at(4000).ballAtPlunger().run(4001);
    expect(lit(next)).toHaveLength(1);
  });

  it("awards a million for reaching the lit lane first, once, and tells the display", () => {
    const h = ball();
    const l = lit(h)[0]!;
    h.at(10).hit(l).at(20).hit(l).run(30);
    expect(score(h)).toBe(SKILL_SHOT);
    expect(h.state.lamps[l]).toBe("collected");
    expect(h.cmds.filter((c) => c.c === "dmd" && c.show.id === "skillShot")).toEqual([{ c: "dmd", show: { id: "skillShot", args: { points: SKILL_SHOT } } }]);
  });

  it("awards nothing for a lane that is not lit, and still pays the lit lane after it", () => {
    const h = ball();
    const l = lit(h)[0]!;
    const other = ["skill1", "skill2", "skill3"].find((x) => x !== l)!;
    h.at(10).hit(other).run(11);
    expect(score(h)).toBe(0);
    h.at(20).hit(l).run(21);
    expect(score(h)).toBe(SKILL_SHOT);
  });

  it("makes the whole lane, skill1 to skill3 in order, a super skill shot on top of the skill shot", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const h = ball(seed);
      h.at(10).hit("skill1").at(20).hit("skill2").at(30).hit("skill3").run(40);
      expect(score(h), `seed ${seed}`).toBe(SKILL_SHOT + SUPER_SKILL_SHOT);
      expect(h.cmds.some((c) => c.c === "dmd" && c.show.id === "superSkillShot")).toBe(true);
    }
  });

  it("does not make a super skill shot of the lane run backwards, or twice", () => {
    const h = ball();
    h.at(10).hit("skill3").at(20).hit("skill2").at(30).hit("skill1").run(40);
    expect(score(h)).toBeLessThanOrEqual(SKILL_SHOT);
    const g = ball();
    g.at(10).hit("skill1").at(20).hit("skill2").at(30).hit("skill3").at(40).hit("skill1").at(50).hit("skill2").at(60).hit("skill3").run(70);
    expect(score(g)).toBe(SKILL_SHOT + SUPER_SKILL_SHOT);
  });

  it("closes when the ball touches anything else on the table: the lamps go off and no skill shot follows", () => {
    const h = ball();
    const l = lit(h)[0]!;
    h.at(10).hit("slingL", 0, "kick").run(11);
    expect(lit(h)).toEqual([]);
    expect(score(h)).toBe(SWITCH_POINTS.slingL);
    h.at(20).hit(l).run(21);
    expect(score(h)).toBe(SWITCH_POINTS.slingL);
  });

  it("makes no super skill shot, and pays no skill shot, once the window has closed", () => {
    const h = ball();
    h.at(10).hit("slingL", 0, "kick").at(20).hit("skill1").at(30).hit("skill2").at(40).hit("skill3").run(50);
    expect(score(h)).toBe(SWITCH_POINTS.slingL);
    expect(h.cmds.some((c) => c.c === "dmd" && /skill/i.test(c.show.id) && c.show.id !== "skillLane")).toBe(false);
  });

  it("closes when the ball drains, and the next ball lights a lane again", () => {
    const h = harness(colonyRules, { flow: { ...colonyFlow, saverTicks: 0 }, shots: colonyTable.shots });
    h.at(1).button("start", true).at(2).ballAtPlunger().run(3);
    expect(lit(h)).toHaveLength(1);
    h.at(10).drain().run(11);
    expect(lit(h)).toEqual([]);
    h.at(4000).ballAtPlunger().run(4001); // after the bonus time
    expect(lit(h)).toHaveLength(1);
  });

  it("scores the small switches, and nothing for a switch with no value", () => {
    const h = ball();
    h.at(10).hit("inL", 0, "trigger").at(20).hit("slingR", 0, "kick").at(30).hit("kickbackL", 0, "trigger").run(31);
    expect(score(h)).toBe(SWITCH_POINTS.inL! + SWITCH_POINTS.slingR!);
  });

  it("pays a skill shot only for the first lane of a ball, not for a ball that comes back after the window", () => {
    const h = ball();
    const l = lit(h)[0]!;
    h.at(10).hit("outL", 0, "trigger").at(20).hit(l).run(21);
    expect(score(h)).toBe(SWITCH_POINTS.outL);
  });
});

describe("the skill shot on the physical table", () => {
  function launch(ms: number) {
    const g = createGame(colonyTable, { ...tableSetups.colony!, seed: 3 });
    g.input.start = true;
    advance(g, 5);
    g.input.start = false;
    advance(g, 5);
    g.input.plunge = true;
    advance(g, 50);
    for (let i = 0; i < ms; i++) tick(g);
    g.input.plunge = false;
    for (let i = 0; i < 3000; i++) tick(g);
    return g.rules.state.player.score;
  }

  it("pays the skill shot and the super skill shot for a full pull of the plunger", () => {
    expect(launch(600)).toBeGreaterThanOrEqual(SKILL_SHOT + SUPER_SKILL_SHOT);
  });

  it("pays no super skill shot for a short pull, which does not run the whole lane", () => {
    const s = launch(120);
    expect(s).toBeLessThan(SUPER_SKILL_SHOT);
  });

  it("runs more of the skill lane the longer the pull: none, the first lane, then all three (the pull table is pinned so a plunger tuning cannot make the super trivial or impossible unnoticed)", () => {
    const lanes = (ms: number): string[] => {
      const seen: string[] = [];
      const rules = { ...colonyRules, onSwitch: (c: Parameters<NonNullable<typeof colonyRules.onSwitch>>[0], e: Parameters<NonNullable<typeof colonyRules.onSwitch>>[1]) => { if (e.sw.startsWith("skill")) seen.push(e.sw); colonyRules.onSwitch!(c, e); } };
      const g = createGame(colonyTable, { ...tableSetups.colony!, rules, seed: 3 });
      g.input.start = true;
      advance(g, 5);
      g.input.start = false;
      advance(g, 5);
      g.input.plunge = true;
      advance(g, 50);
      for (let i = 0; i < ms; i++) tick(g);
      g.input.plunge = false;
      for (let i = 0; i < 3000; i++) tick(g);
      return seen;
    };
    expect(lanes(60)).toEqual([]);
    expect(lanes(110)[0]).toBe("skill1");
    expect(lanes(110)).not.toContain("skill3");
    expect(lanes(300).slice(0, 3)).toEqual(["skill1", "skill2", "skill3"]);
  });
});
