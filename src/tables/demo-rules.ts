import type { FlowConfig, TableRules } from "../rules";

/** Numbers for the proving ground. Placeholders: the real ones come with the Colony. */
export const demoFlow: FlowConfig = {
  ballsPerGame: 3,
  startCost: 1,
  startCredits: 3,
  overTicks: 5000,
  saverTicks: 8000,
  bonusTicks: 3000,
  extraBallMax: 1,
  replayScore: 20000,
  highScoreCredit: true,
  boardSize: 5,
  // placeholders, no QA to tune them: two free nudges, two warnings, the fifth in a short time is a tilt; one nudge cools in 4 s
  tilt: { free: 2, warnings: 2, decayTicks: 4000 },
  buyIn: { cost: 1, balls: 2, windowTicks: 10000 },
};

/** One standup target worth 1000 (a bonus of 500 for each hit) and two pop bumpers worth 100 each. */
export const demoRules: TableRules = {
  modes: {},
  onSwitch(c, e) {
    if (e.sw === "bumper1" || e.sw === "bumper2") c.addScore(100);
    if (e.sw === "target1") {
      c.addScore(1000);
      c.add("hits");
    }
  },
  bonus: (c) => c.count("hits") * 500,
  bonusParts: (c) => [["hits", c.count("hits") * 500]],
};
