import type { RulesState } from "../rules";

/** 12345 -> "12,345": the same in every locale. */
export function groups(n: number): string {
  return Math.trunc(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * What the player reads, as text lines: a stand-in until the dot-matrix display (#14).
 * Pure: the same state gives the same lines. `startCost` decides between PRESS START
 * and INSERT COIN.
 */
export function hudLines(s: RulesState, startCost: number): string[] {
  const g = s.game;
  if (g === null) return ["FREE PLAY"];
  const credits = `CREDITS ${g.credits}`;
  const score = `SCORE ${groups(s.player.score)}`;
  switch (g.phase) {
    case "attract": {
      const top = g.board.main[0];
      return [g.credits >= startCost ? "PRESS START" : "INSERT COIN", credits, ...(top !== undefined ? [`HIGH SCORE ${groups(top)}`] : [])];
    }
    case "play":
      return [`BALL ${s.player.ballNo}   ${score}`, credits];
    case "bonus":
      return ["BONUS", score, credits];
    case "over":
      return ["GAME OVER", score, credits];
    case "buyin":
      return ["BUY MORE BALLS?", `${score}   PRESS B`, credits];
  }
}
