import type { FlowConfig, TableRules } from "../rules";
import { demoFlow } from "./demo-rules";
import { KICK_ONLY, RAMP_SHOT, REPLAY_SCORE, SKILL_SHOT, SUPER_SKILL_SHOT, SWITCH_POINTS } from "./colony-scoring";

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
    const points = Object.hasOwn(SWITCH_POINTS, e.sw) ? SWITCH_POINTS[e.sw]! : 0;
    if (points > 0 && (e.kind === "kick" || !KICK_ONLY.has(e.sw))) c.addScore(points);
  },
  onShot(c, shot) {
    if (shot === "skillShot" && c.count("skillOpen") > 0 && c.count("superDone") === 0) {
      c.add("superDone");
      c.addScore(SUPER_SKILL_SHOT);
      c.emit({ c: "dmd", show: { id: "superSkillShot", args: { points: SUPER_SKILL_SHOT } } });
    }
  },
  onDrain(c) {
    closeSkill(c);
    c.reset("leafIn");
    c.reset("rootIn");
  },
  bonus: () => 0,
};
