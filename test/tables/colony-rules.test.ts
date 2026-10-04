import { describe, expect, it } from "vitest";
import { groups } from "../../src/app/hud";
import { validateFlow } from "../../src/rules";
import { advance, createGame, tick } from "../../src/sim/game";
import { allTables, tableSetups } from "../../src/tables";
import { colonyTable } from "../../src/tables/colony";
import { TRAIL_AWARD, TRAIL_WINDOW, CHAMBER_HOLD, CHAMBER_POINTS, FUNGUS_BANK, FUNGUS_RESET, KICK_ONLY, MAX_SCORE, RAMP_SHOT, REPLAY_SCORE, SKILL_SHOT, SUPER_SKILL_SHOT, SWITCH_POINTS } from "../../src/tables/colony-scoring";
import { colonyFlow, colonyRules } from "../../src/tables/colony-rules";
import { harness } from "../rules/harness";

/** A started game of The Colony with the ball at the plunger, on `seed`. */
function ball(seed = 1) {
  const h = harness(colonyRules, { flow: colonyFlow, shots: colonyTable.shots, seed });
  h.at(1).button("start", true).at(2).ballAtPlunger().run(3);
  h.take();
  return h;
}
const lit = (h: ReturnType<typeof ball>) => ["skill1", "skill2", "skill3"].filter((l) => h.state.lamps[l] === "flash");
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
    expect(Object.keys(SWITCH_POINTS).every((sw) => colonyTable.walls.some((w) => w.switch === sw) || colonyTable.posts.some((p) => p.switch === sw) || (colonyTable.triggers ?? []).some((t) => t.switch === sw))).toBe(true);
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

  it("shows the open lane as flashing to the leaves, and stops the flash when the window closes", () => {
    const h = harness(colonyRules, { flow: colonyFlow, shots: colonyTable.shots });
    h.at(1).button("start", true).at(2).ballAtPlunger().run(3);
    const l = lit(h)[0]!;
    expect(h.cmds).toContainEqual({ c: "setLamp", lamp: l, state: "flash" });
    h.at(10).hit("slingL", 0, "kick").run(11);
    expect(h.cmds).toContainEqual({ c: "setLamp", lamp: l, state: "off" });
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

  it("has points for every switch of the table except the skill lanes (they pay the skill shot) and the kickback lane", () => {
    const all = [...(colonyTable.triggers ?? []).map((t) => t.switch), ...colonyTable.walls.flatMap((w) => (w.switch ? [w.switch] : [])), ...colonyTable.posts.flatMap((p) => (p.switch ? [p.switch] : [])), ...(colonyTable.gates ?? []).flatMap((g) => (g.switch ? [g.switch] : []))];
    const paid = all.filter((sw) => !sw.startsWith("skill") && sw !== "kickbackL" && !/^(leaf|root)(Enter|Exit)$|^digEnter$|^orbit[WE](In|Out)$|^loop[LR]$/.test(sw) && !Object.hasOwn(CHAMBER_POINTS, sw)).sort(); // the ramps pay for the shot, not for the gates
    expect(Object.keys(SWITCH_POINTS).sort()).toEqual(paid);
    // the placeholders as they are now: a change is deliberate
    expect(SWITCH_POINTS).toEqual({ slingL: 10_000, slingR: 10_000, inL: 25_000, inR: 25_000, outL: 5_000, outR: 5_000, bumper1: 5_000, bumper2: 5_000, bumper3: 5_000, scout: 50_000, spinW: 5_000, spinE: 5_000, fungusL1: 25_000, fungusL2: 25_000, fungusL3: 25_000, fungusR1: 25_000, fungusR2: 25_000, fungusR3: 25_000, rollW: 10_000, rollO: 10_000, rollR: 10_000 });
  });

  it("pays each switch of the table exactly its points, a kicker switch only for a real kick, and closes the skill shot on every one of them", () => {
    for (const [sw, points] of Object.entries(SWITCH_POINTS)) {
      const kind = KICK_ONLY.has(sw) ? "kick" : "trigger";
      const h = ball();
      const l = lit(h)[0]!;
      h.at(10).hit(sw, 0, kind).run(11);
      expect(score(h), sw).toBe(points);
      expect(lit(h), `${sw} closes the skill shot`).toEqual([]);
      h.at(20).hit(l).run(21);
      expect(score(h), `${sw}: no skill shot after it`).toBe(points);
    }
  });

  it("pays a ramp shot for going up a ramp and out at the top, once for each trip, and closes the skill shot at the mouth", () => {
    const h = ball();
    const l = lit(h)[0]!;
    h.at(10).hit("leafEnter", 0, "gateAB").run(11);
    expect(lit(h)).toEqual([]);
    expect(score(h)).toBe(0); // the mouth alone pays nothing
    h.at(20).hit("leafExit", 0, "gateAB").run(21);
    expect(score(h)).toBe(RAMP_SHOT);
    h.at(30).hit("rootEnter", 0, "gateAB").at(40).hit("rootExit", 0, "gateAB").run(41); // the two ramps in a row are also a trail (#26)
    expect(score(h)).toBe(2 * RAMP_SHOT + TRAIL_AWARD[2]);
    h.at(50).hit(l).run(51); // the window is closed
    expect(score(h)).toBe(2 * RAMP_SHOT + TRAIL_AWARD[2]);
    expect(h.cmds.filter((c) => c.c === "dmd" && (c.show.id === "leafRamp" || c.show.id === "rootRamp"))).toHaveLength(2);
  });

  it("pays nothing for a ball that falls onto the exit from above, or that rolled back out of the mouth before it", () => {
    for (const [enter, exit] of [["leafEnter", "leafExit"], ["rootEnter", "rootExit"]] as const) {
      const h = ball();
      h.at(10).hit(exit, 0, "gateBA").run(11); // dropped onto the exit line from the dome: zone 0 into the ramp
      h.at(20).hit(enter, 0, "gateAB").at(30).hit(enter, 0, "gateBA").at(40).hit(exit, 0, "gateBA").run(41); // in, back out of the mouth, then a drop from the top
      expect(score(h), enter).toBe(0);
      h.at(50).hit(exit, 0, "gateAB").run(51); // an exit without a trip in
      expect(score(h), enter).toBe(0);
    }
  });

  it("does not let a player farm a ramp by rocking in and out of the mouth: only a complete trip pays, and only once", () => {
    const h = ball();
    for (let t = 10; t < 200; t += 20) h.at(t).hit("leafEnter", 0, "gateAB").at(t + 10).hit("leafEnter", 0, "gateBA");
    h.run(200);
    expect(score(h)).toBe(0);
    h.at(210).hit("leafEnter", 0, "gateAB").at(220).hit("leafExit", 0, "gateAB").at(230).hit("leafExit", 0, "gateAB").run(231);
    expect(score(h)).toBe(RAMP_SHOT); // the second exit has no trip behind it
  });

  it("forgets a trip when the ball drains", () => {
    const h = harness(colonyRules, { flow: { ...colonyFlow, saverTicks: 0 }, shots: colonyTable.shots });
    h.at(1).button("start", true).at(2).ballAtPlunger().run(3);
    h.at(10).hit("rootEnter", 0, "gateAB").at(20).drain().run(21);
    h.at(4000).ballAtPlunger().at(4010).hit("rootExit", 0, "gateAB").run(4011);
    expect(score(h)).toBe(0);
  });

  it("pins the ramp shot at a tenth of a skill shot", () => {
    expect(RAMP_SHOT).toBe(100_000);
    expect(RAMP_SHOT).toBe(SKILL_SHOT / 10);
  });

  it("pays nothing for the touches of a ball that rests on a kicker without kicking it", () => {
    for (const sw of KICK_ONLY) {
      const h = ball();
      for (let t = 10; t < 200; t += 5) h.at(t).hit(sw, 0, "hit");
      h.run(200);
      expect(score(h), sw).toBe(0);
    }
  });

  it("pays a skill shot only for the first lane of a ball, not for a ball that comes back after the window", () => {
    const h = ball();
    const l = lit(h)[0]!;
    h.at(10).hit("outL", 0, "trigger").at(20).hit(l).run(21);
    expect(score(h)).toBe(SWITCH_POINTS.outL);
  });
});

describe("the chambers (step 3b)", () => {
  it("pins the placeholders: what a chamber pays and how long it holds the ball", () => {
    expect(CHAMBER_POINTS).toEqual({ brood: 100_000, queen: 150_000, mushroom: 100_000, digSite: 200_000 });
    expect(CHAMBER_HOLD).toBe(700);
    for (const p of Object.values(CHAMBER_POINTS)) expect(p).toBeLessThan(SKILL_SHOT);
  });

  it("is one sinkhole of the table for each chamber, with its name as the switch, and a shot for it", () => {
    for (const id of Object.keys(CHAMBER_POINTS)) {
      const t = (colonyTable.triggers ?? []).find((x) => x.id === id);
      expect(t?.switch, id).toBe(id);
      expect(t?.hold, id).toBeDefined();
    }
    expect(colonyTable.shots.broodChamber).toEqual(["brood"]);
    expect(colonyTable.shots.queensChamber).toEqual(["queen"]);
    expect(colonyTable.shots.mushroomHole).toEqual(["mushroom"]);
  });

  it("locks the ball a chamber captured, pays for it, and lets it go after the hold time", () => {
    for (const [id, points] of Object.entries(CHAMBER_POINTS)) {
      const h = ball();
      const before = score(h);
      h.at(10).hit(id, 0, "capture").run(11);
      expect(h.cmds, id).toContainEqual({ c: "lockBall", ball: 0, lock: id });
      expect(score(h) - before, id).toBe(points);
      h.run(10 + CHAMBER_HOLD - 1);
      expect(h.cmds.some((c) => c.c === "releaseBall"), `${id}: not yet`).toBe(false);
      h.run(10 + CHAMBER_HOLD + 2);
      expect(h.cmds, id).toContainEqual({ c: "releaseBall", lock: id });
    }
  });

  it("closes the skill shot like any other switch, and ignores a chamber switch that is not a capture", () => {
    const h = ball();
    const l = lit(h)[0]!;
    h.at(10).hit("queen", 0, "hit").run(11);
    expect(h.cmds.some((c) => c.c === "lockBall")).toBe(false);
    expect(h.state.lamps[l]).toBe("off");
  });

  it("lets a ball go once: nothing is released twice, and a held ball is not held again after it left", () => {
    const h = ball();
    h.at(10).hit("mushroom", 0, "capture").run(10 + CHAMBER_HOLD + 2);
    h.take();
    h.run(10 + 3 * CHAMBER_HOLD);
    expect(h.cmds.some((c) => c.c === "releaseBall")).toBe(false);
  });
});

describe("the Fungus Farm and the kickback (step 4)", () => {
  it("puts a target down when it is hit and pays it, and pays the bank when the third is down, once, then brings the bank up after the reset time", () => {
    const h = ball();
    const before = score(h);
    h.at(10).hit("fungusL1", 0, "hit").at(20).hit("fungusL2", 0, "hit").run(21);
    expect(h.cmds).toContainEqual({ c: "dropTarget", id: "fungusL1", state: "down" });
    expect(h.cmds).toContainEqual({ c: "dropTarget", id: "fungusL2", state: "down" });
    expect(score(h) - before).toBe(2 * SWITCH_POINTS.fungusL1!);
    h.at(30).hit("fungusL3", 0, "hit").run(31);
    expect(score(h) - before).toBe(3 * SWITCH_POINTS.fungusL1! + FUNGUS_BANK);
    h.take();
    h.run(30 + FUNGUS_RESET - 1);
    expect(h.cmds.some((c) => c.c === "dropBank")).toBe(false);
    h.run(30 + FUNGUS_RESET + 2);
    expect(h.cmds).toContainEqual({ c: "dropBank", bank: "fungusL" });
  });

  it("counts the two banks apart, and brings both up at a drain", () => {
    const h = ball();
    h.at(10).hit("fungusL1", 0, "hit").at(11).hit("fungusR1", 0, "hit").at(12).hit("fungusR2", 0, "hit").run(13);
    const before = score(h);
    h.at(14).hit("fungusL2", 0, "hit").run(15);
    expect(score(h) - before).toBe(SWITCH_POINTS.fungusL2); // no bank bonus: two on the left, two on the right
    h.take();
    h.at(20).drain().run(21);
    expect(h.cmds.filter((c) => c.c === "dropBank").map((c) => (c as { bank: string }).bank).sort()).toEqual(["fungusL", "fungusR"]);
  });

  it("kicks the ball up the lane at the kickback once per ball, and lets the next one go without a kick", () => {
    const h = ball();
    expect(h.state.lamps.kickbackL).toBe("lit");
    h.at(10).hit("kickbackL", 0, "capture").run(11);
    expect(h.cmds).toContainEqual({ c: "fireSolenoid", id: "kickbackL" });
    expect(h.state.lamps.kickbackL).toBe("off");
    h.take();
    h.at(20).hit("kickbackL", 0, "capture").run(21);
    expect(h.cmds).toContainEqual({ c: "releaseBall", lock: "kickbackL", speed: 0 });
    expect(h.cmds.some((c) => c.c === "fireSolenoid")).toBe(false);
  });
});

describe("scoring on the physical table", () => {
  it("does not score for ever for a ball balanced on top of a bumper", () => {
    const g = createGame(colonyTable, { ...tableSetups.colony!, seed: 3 });
    g.input.start = true;
    advance(g, 5);
    g.input.start = false;
    advance(g, 5);
    Object.assign(g.table.world.balls[0]!, { x: 0.26, y: 0.3205 - 0.018 - 0.0135, vx: 0, vy: 0 }); // at rest exactly on the top of bumper1
    for (let i = 0; i < 20000; i++) tick(g);
    expect(g.rules.state.player.score).toBeLessThan(10 * SWITCH_POINTS.bumper1!);
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

describe("the Pheromone Trail (#26)", () => {
  const W = ["orbitWIn", "spinW"] as const;
  const E = ["orbitEIn", "spinE"] as const;
  const L = ["loopL", "loopR"] as const;
  const trails = (h: ReturnType<typeof ball>) => h.cmds.flatMap((c) => (c.c === "dmd" && c.show.id === "trail" ? [c.show.args as { name: string; length: number; scent: number; points: number }] : []));
  /** Plays the shots one after the other, `gap` ticks apart. */
  const play = (h: ReturnType<typeof ball>, shots: (readonly string[])[], gap: number) => {
    let t = 10;
    for (const sh of shots) {
      sh.forEach((sw, i) => h.at(t + i).hit(sw));
      t += gap;
    }
    h.run(t + 10);
  };

  it("builds from the second shot: Trail, Double, Triple, then Super for every further shot", () => {
    const h = ball();
    play(h, [W, L, E, W, L, E], 500);
    expect(trails(h).map((t) => [t.name, t.length, t.points])).toEqual([
      ["trail", 2, TRAIL_AWARD[2]], ["double", 3, TRAIL_AWARD[3]], ["triple", 4, TRAIL_AWARD[4]], ["super", 5, TRAIL_AWARD[5]], ["super", 6, TRAIL_AWARD[5]],
    ]);
  });

  it("pays nothing for a lone shot, and the same shot twice does not lengthen the chain", () => {
    const h = ball();
    play(h, [W, W, W], 500);
    expect(trails(h)).toEqual([]);
    const g = ball();
    play(g, [W, W, E], 500);
    expect(trails(g).map((t) => t.length)).toEqual([2]);
  });

  it("starts over after the window: a shot later than TRAIL_WINDOW is a new chain", () => {
    const h = ball();
    play(h, [W, E], TRAIL_WINDOW + 500);
    expect(trails(h)).toEqual([]);
    const g = ball();
    play(g, [W, E], TRAIL_WINDOW - 500);
    expect(trails(g).map((t) => t.length)).toEqual([2]);
  });

  it("keeps the window open from each shot, not only from the first: a slow chain goes on", () => {
    const h = ball();
    play(h, [W, E, L, W], TRAIL_WINDOW - 500); // four shots, much longer in all than one window
    expect(trails(h).map((t) => t.length)).toEqual([2, 3, 4]);
  });

  it("counts one scent for a trail of just two shots, and not another while it grows", () => {
    const h = ball();
    play(h, [W, E], 500);
    expect(h.state.counters.scent).toBe(1);
    const g = ball();
    play(g, [W, E, L, W], 500);
    expect(g.state.counters.scent).toBe(1);
    const k = ball();
    play(k, [W], 500);
    expect(k.state.counters.scent ?? 0).toBe(0);
  });

  it("counts a scent for every trail made, and keeps it to the next ball while the chain starts over", () => {
    const h = harness(colonyRules, { flow: { ...colonyFlow, saverTicks: 0 }, shots: colonyTable.shots });
    h.at(1).button("start", true).at(2).ballAtPlunger().run(3);
    play(h, [W, E, W], 500); // one trail, however long it grows
    expect(h.state.counters.scent).toBe(1);
    h.at(4000).drain().run(4001);
    h.at(9000).ballAtPlunger().run(9001);
    expect(h.state.counters.scent).toBe(1);
    expect(h.state.counters.trailLen ?? 0).toBe(0);
  });

  it("ends the chain at the drain", () => {
    const h = ball();
    play(h, [W], 500);
    h.at(1000).drain().run(1100);
    expect(h.state.counters.trailLen ?? 0).toBe(0);
    expect(h.state.timers.trail).toBeUndefined();
  });
});
