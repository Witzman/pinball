import { describe, expect, it } from "vitest";
import { chooseTable } from "../../src/app/table-choice";

describe("chooseTable", () => {
  it("plays The Colony, with its own rules and flow", () => {
    const c = chooseTable();
    expect(c.def.id).toBe("colony");
    expect(c.def.name).toMatch(/colony/i);
    expect(c.setup.rules).toBeDefined();
    expect(c.flow.ballsPerGame).toBeGreaterThan(0);
  });
});
