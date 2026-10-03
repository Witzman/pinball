import type { TableRules } from "./types";

/**
 * Rules for a table that runs without a flow: a drained ball is replaced at once,
 * forever. A flow brings its own ball handling and must not be combined with this.
 */
export const freePlay: TableRules = {
  modes: {},
  onDrain: (c) => c.ball.feed(),
};
