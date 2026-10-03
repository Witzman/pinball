import { describe, expect, it } from "vitest";
import { groups, hudLines } from "../../src/app/hud";
import { createState } from "../../src/rules";
import type { GameState, RulesState } from "../../src/rules";

function state(over: Partial<GameState> = {}, score = 0, ballNo = 0): RulesState {
  const s = createState(1);
  s.game = { phase: "attract", credits: 2, shootAgain: 0, bought: false, tilted: false, replayDone: false, extraBalls: 0, saverWait: false, board: { main: [], bought: [] }, ...over };
  s.player.score = score;
  s.player.ballNo = ballNo;
  return s;
}

describe("number groups", () => {
  it("separates thousands with commas whatever the locale", () => {
    expect([0, 7, 999, 1000, 12345, 1234567, 1000000000].map(groups)).toEqual(["0", "7", "999", "1,000", "12,345", "1,234,567", "1,000,000,000"]);
    expect(groups(1234.9)).toBe("1,234");
  });
});

describe("hud lines", () => {
  it("says FREE PLAY for a table without a flow", () => {
    expect(hudLines(createState(1), 1)).toEqual(["FREE PLAY"]);
  });

  it("invites a start in attract when the credits cover it, and a coin when they do not", () => {
    expect(hudLines(state({ credits: 1 }), 1)[0]).toBe("PRESS START");
    expect(hudLines(state({ credits: 0 }), 1)[0]).toBe("INSERT COIN");
    expect(hudLines(state({ credits: 0 }), 0)[0]).toBe("PRESS START");
  });

  it("shows the credits, and the best score of the machine when there is one", () => {
    expect(hudLines(state({ credits: 5 }), 1)).toEqual(["PRESS START", "CREDITS 5"]);
    expect(hudLines(state({ credits: 5, board: { main: [123456, 100], bought: [] } }), 1)).toEqual(["PRESS START", "CREDITS 5", "HIGH SCORE 123,456"]);
  });

  it("shows ball number and score while playing", () => {
    expect(hudLines(state({ phase: "play", credits: 1 }, 12500, 2), 1)).toEqual(["BALL 2   SCORE 12,500", "CREDITS 1"]);
  });

  it("shows the bonus, game over and the buy-in offer with the score", () => {
    expect(hudLines(state({ phase: "bonus" }, 900, 1), 1)).toEqual(["BONUS", "SCORE 900", "CREDITS 2"]);
    expect(hudLines(state({ phase: "over" }, 900, 3), 1)).toEqual(["GAME OVER", "SCORE 900", "CREDITS 2"]);
    expect(hudLines(state({ phase: "buyin" }, 900, 3), 1)).toEqual(["BUY MORE BALLS?", "SCORE 900   PRESS B", "CREDITS 2"]);
  });

  it("is a pure function of the state", () => {
    const s = state({ phase: "play" }, 5, 1);
    expect(hudLines(s, 1)).toEqual(hudLines(structuredClone(s), 1));
  });
});
