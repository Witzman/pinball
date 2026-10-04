// The scoring scale of The Colony (issue #46):
// a good player reaches a replay credit at about a billion points in one game; a skill shot
// is a million, a super skill shot ten million. Everything else is a placeholder that gets
// its place on that scale as the missions of #29 to #41 arrive.

export const REPLAY_SCORE = 1_000_000_000;
export const SKILL_SHOT = 1_000_000;
export const SUPER_SKILL_SHOT = 10_000_000;

/** A ramp shot: up the Leaf Ramp or the Root Ramp and out at the top (placeholder, a tenth of a skill shot). */
export const RAMP_SHOT = 100_000;

/** A ball in a chamber (Brood, Queen's, Mushroom, the Dig Site): what it pays and how long it sits there before the rules kick it out (ticks, 1 ms each). Placeholders. */
export const CHAMBER_POINTS: Record<string, number> = { brood: 100_000, queen: 150_000, mushroom: 100_000, digSite: 200_000 };
export const CHAMBER_HOLD = 700;

/** Points for the small things of the outline; placeholders, far below the scale of a mission. */
export const SWITCH_POINTS: Record<string, number> = {
  slingL: 10_000,
  slingR: 10_000,
  inL: 25_000,
  inR: 25_000,
  outL: 5_000,
  outR: 5_000,
  bumper1: 5_000,
  bumper2: 5_000,
  bumper3: 5_000,
  scout: 50_000,
  fungusL1: 25_000,
  fungusL2: 25_000,
  fungusL3: 25_000,
  fungusR1: 25_000,
  fungusR2: 25_000,
  fungusR3: 25_000,
  spinW: 5_000,
  spinE: 5_000,
  rollW: 10_000,
  rollO: 10_000,
  rollR: 10_000,
};

/**
 * Switches that pay only when a kicker really kicked (event kind "kick"): a ball balanced
 * on the top of a bumper touches it every tick without kicking, and must not score for ever.
 */
export const KICK_ONLY: ReadonlySet<string> = new Set(["slingL", "slingR", "bumper1", "bumper2", "bumper3"]);

/** Biggest score a table may use: JS numbers are exact up to 2^53, the HUD groups the digits. */
export const MAX_SCORE = Number.MAX_SAFE_INTEGER;

/** The Pull Bridge holds the ball at the upper flipper this long after a Leaf Ramp shot (ticks, 1 ms each). Placeholder. */
export const BRIDGE_HOLD = 1500;

/** A whole bank of the Fungus Farm down (three targets): the bonus, and how long the bank stays down before it comes up again (ticks, 1 ms each). Placeholders. */
export const FUNGUS_BANK = 250_000;
export const FUNGUS_RESET = 1200;

/** The kickback: how fast it sends the ball up the left outlane (m/s). Placeholder: enough to clear the lane (swept in the tests). */
export const KICKBACK_SPEED = 2.4;

/** A trail shot (up an orbit past its spinner) and the Pheromone Loop (left to right under the dome); placeholders. */
export const TRAIL_SHOT = 100_000;
export const LOOP_SHOT = 150_000;
