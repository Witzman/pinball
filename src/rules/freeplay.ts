import type { TableRules } from "./types";

/**
 * Rules for a table without its own: a drained ball is replaced at once, forever.
 * The placeholder until ball flow, balls per game and the end of the game (#11).
 */
export const freePlay: TableRules = {
  modes: {},
  onDrain: (c) => c.ball.feed(),
};
