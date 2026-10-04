import type { FlowConfig, TableRules } from "../rules";
import { demoFlow } from "./demo-rules";
import { TRAIL_AWARD, TRAIL_NAMES, TRAIL_SHOTS, TRAIL_WINDOW, BRIDGE_HOLD, LOOP_SHOT, TRAIL_SHOT, CHAMBER_HOLD, FUNGUS_BANK, FUNGUS_RESET, CHAMBER_POINTS, KICK_ONLY, RAMP_SHOT, REPLAY_SCORE, SKILL_SHOT, SUPER_SKILL_SHOT, SWITCH_POINTS } from "./colony-scoring";

/** The proving ground's flow with the Colony's replay score; the rest are still placeholders. */
export const colonyFlow: FlowConfig = { ...demoFlow, replayScore: REPLAY_SCORE };

const LANES = ["skill1", "skill2", "skill3"] as const;

/** The skill shot window is open from the start of a ball until it touches anything but the skill lanes, or drains. */
function closeSkill(c: Parameters<NonNullable<TableRules["onBallStart"]>>[0]): void {
  c.reset("skillOpen");
  for (const l of LANES) if (c.lamp(l) === "lit") c.setLamp(l, "off");
}

/**
 * A ramp shot (the Leaf or the Root Ramp): the ball crosses the mouth gate going up (kind gateAB)
 * and later the exit gate going out (gateAB). A ball that rolls back out of the mouth (gateBA)
 * loses its trip, and a ball that falls onto the exit from the dome (gateBA) pays nothing.
 */
const RAMPS = { leafEnter: ["leaf", "enter"], leafExit: ["leaf", "exit"], rootEnter: ["root", "enter"], rootExit: ["root", "exit"] } as const;
function ramp(c: Parameters<NonNullable<TableRules["onBallStart"]>>[0], e: { sw: string; kind: string }): void {
  if (!Object.hasOwn(RAMPS, e.sw)) return;
  const [name, end] = RAMPS[e.sw as keyof typeof RAMPS];
  const key = `${name}In`;
  if (end === "enter") {
    if (e.kind === "gateAB") c.add(key);
    else c.reset(key); // back out of the mouth: the trip is off
  } else if (e.kind === "gateAB" && c.count(key) > 0) {
    c.reset(key);
    c.addScore(RAMP_SHOT);
    c.emit({ c: "dmd", show: { id: `${name}Ramp`, args: { points: RAMP_SHOT } } });
  }
}

/** A ball captured by a chamber is locked, pays, and is let go again after CHAMBER_HOLD ticks. */
function chamber(c: Parameters<NonNullable<TableRules["onBallStart"]>>[0], e: { sw: string; kind: string }): void {
  if (e.kind !== "capture" || !Object.hasOwn(CHAMBER_POINTS, e.sw)) return;
  c.ball.lock(e.sw);
  c.add(`held:${e.sw}`);
  c.addScore(CHAMBER_POINTS[e.sw]!);
  c.emit({ c: "dmd", show: { id: e.sw, args: { points: CHAMBER_POINTS[e.sw]! } } });
  c.after(e.sw, CHAMBER_HOLD);
}

/** A standup of the Fungus Farm that is hit goes down; the third of a bank pays the bank and brings it up again after FUNGUS_RESET ticks. */
const FUNGUS = /^fungus([LR])([123])$/;
function fungus(c: Parameters<NonNullable<TableRules["onBallStart"]>>[0], e: { sw: string; kind: string }): void {
  const m = FUNGUS.exec(e.sw);
  if (!m || e.kind === "gateBA") return;
  const bank = `fungus${m[1]}`;
  if (c.count(`down:${e.sw}`) > 0) return; // one hit per target, until the bank is up again
  c.add(`down:${e.sw}`);
  c.emit({ c: "dropTarget", id: e.sw, state: "down" });
  c.add(bank);
  if (c.count(bank) === 3) {
    c.addScore(FUNGUS_BANK);
    c.emit({ c: "dmd", show: { id: "fungusBank", args: { bank, points: FUNGUS_BANK } } });
    c.after(bank, FUNGUS_RESET);
  }
}

function bankUp(c: Parameters<NonNullable<TableRules["onBallStart"]>>[0], bank: string): void {
  for (let i = 1; i <= 3; i++) c.reset(`down:${bank}${i}`);
  c.reset(bank);
  c.emit({ c: "dropBank", bank });
}

/**
 * The Pheromone Trail (#26): a trail shot that is not the one just made, within TRAIL_WINDOW of it, lengthens the chain;
 * the same shot again only keeps the window open, and a shot after the window starts a new chain. The second shot makes a
 * trail (one more `scent`, which lasts the game); from there each shot pays the award of its length (the 5th and later: Super).
 */
function trailShot(c: Parameters<NonNullable<TableRules["onBallStart"]>>[0], shot: string): void {
  const which = TRAIL_SHOTS.indexOf(shot as (typeof TRAIL_SHOTS)[number]) + 1;
  if (which === 0) return;
  const running = c.count("trailLen") > 0;
  c.cancel("trail");
  c.after("trail", TRAIL_WINDOW);
  if (running && c.count("trailLast") === which) return;
  c.reset("trailLast");
  c.add("trailLast", which);
  const length = c.add("trailLen");
  if (length < 2) return;
  if (length === 2) c.add("scent");
  const level = Math.min(length, 5);
  c.addScore(TRAIL_AWARD[level]!);
  c.emit({ c: "dmd", show: { id: "trail", args: { name: TRAIL_NAMES[level]!, length, scent: c.count("scent"), points: TRAIL_AWARD[level]! } } });
}

/** The kickback: a ball at the foot of the left outlane is kicked up the lane once per ball (the lamp is lit at the start of the ball), else let go to drain. */
function kickbackShot(c: Parameters<NonNullable<TableRules["onBallStart"]>>[0], e: { sw: string; kind: string }): void {
  if (e.sw !== "kickbackL" || e.kind !== "capture") return;
  if (c.lamp("kickbackL") === "lit") {
    c.setLamp("kickbackL", "off");
    c.emit({ c: "fireSolenoid", id: "kickbackL" });
    c.emit({ c: "dmd", show: { id: "kickback" } });
  } else c.emit({ c: "releaseBall", lock: "kickbackL", speed: 0 });
}

/**
 * The Colony so far: the skill shot. Each ball lights one of the three lanes up the plunger
 * lane at random (seeded, part of the state); reaching the lit lane before anything else on
 * the table is the skill shot (1,000,000); running the whole lane, skill1 to skill3 in order,
 * is the super skill shot (10,000,000). The small switches score a little. The rest of the
 * rules (trails, levels, missions) come with #26 to #41.
 */
export const colonyRules: TableRules = {
  modes: {},
  onBallStart(c) {
    // a ball the saver serves again is the same ball: no second skill shot (a new ball clears the counters)
    if (c.count("skillTried") > 0) return;
    c.add("skillTried");
    c.setLamp("kickbackL", "lit");
    c.add("skillOpen");
    const lit = LANES[Math.floor(c.rnd() * LANES.length)]!;
    for (const l of LANES) c.setLamp(l, l === lit ? "lit" : "off");
    c.emit({ c: "dmd", show: { id: "skillLane", args: { lane: lit } } });
  },
  onSwitch(c, e) {
    if ((LANES as readonly string[]).includes(e.sw)) {
      if (c.lamp(e.sw) === "lit") { // lit only while the window is open and until it is collected
        c.setLamp(e.sw, "collected");
        c.addScore(SKILL_SHOT);
        c.emit({ c: "dmd", show: { id: "skillShot", args: { points: SKILL_SHOT } } });
      }
      return;
    }
    closeSkill(c);
    ramp(c, e);
    chamber(c, e);
    fungus(c, e);
    kickbackShot(c, e);
    const points = Object.hasOwn(SWITCH_POINTS, e.sw) ? SWITCH_POINTS[e.sw]! : 0;
    if (points > 0 && (e.kind === "kick" || !KICK_ONLY.has(e.sw))) c.addScore(points);
  },
  onShot(c, shot) {
    trailShot(c, shot);
    if (shot === "trailWest" || shot === "trailEast" || shot === "pheromoneLoop") {
      const points = shot === "pheromoneLoop" ? LOOP_SHOT : TRAIL_SHOT;
      c.addScore(points);
      c.emit({ c: "dmd", show: { id: shot, args: { points } } });
    }
    if (shot === "leafRamp") { // the ball comes back down the left side: the Pull Bridge holds it at the upper flipper for the Dig Ramp shot
      c.emit({ c: "magnet", id: "pullBridge", on: true });
      c.after("pullBridge", BRIDGE_HOLD);
    }
    if (shot === "skillShot" && c.count("skillOpen") > 0 && c.count("superDone") === 0) {
      c.add("superDone");
      c.addScore(SUPER_SKILL_SHOT);
      c.emit({ c: "dmd", show: { id: "superSkillShot", args: { points: SUPER_SKILL_SHOT } } });
    }
  },
  onTimer(c, id) {
    if (id === "trail") {
      c.reset("trailLen");
      c.reset("trailLast");
      return;
    }
    if (id === "fungusL" || id === "fungusR") {
      bankUp(c, id);
      return;
    }
    if (id === "pullBridge") {
      c.emit({ c: "magnet", id: "pullBridge", on: false });
      return;
    }
    if (!Object.hasOwn(CHAMBER_POINTS, id) || c.count(`held:${id}`) === 0) return;
    c.reset(`held:${id}`);
    try {
      c.ball.release(id);
    } catch {
      // a tilt let the ball go already: there is nothing to release
    }
  },
  onDrain(c) {
    closeSkill(c);
    for (const id of Object.keys(CHAMBER_POINTS)) {
      c.reset(`held:${id}`);
      c.cancel(id);
    }
    for (const bank of ["fungusL", "fungusR"]) {
      c.cancel(bank);
      bankUp(c, bank);
    }
    c.cancel("trail");
    c.reset("trailLen");
    c.reset("trailLast");
    c.cancel("pullBridge");
    c.emit({ c: "magnet", id: "pullBridge", on: false });
    c.reset("leafIn");
    c.reset("rootIn");
  },
  persist: ["scent"],
  bonus: () => 0,
};
