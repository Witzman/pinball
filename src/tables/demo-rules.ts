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
  buyIn: { cost: 1, balls: 2, windowTicks: 10000 },
};

/** One standup target worth 1000, and a bonus of 500 for each hit. */
export const demoRules: TableRules = {
  modes: {},
  onSwitch(c, e) {
    if (e.sw === "target1") {
      c.addScore(1000);
      c.add("hits");
    }
  },
  bonus: (c) => c.count("hits") * 500,
  bonusParts: (c) => [["hits", c.count("hits") * 500]],
};
