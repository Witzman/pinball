import { describe, expect, it } from "vitest";
import { chooseTable } from "../../src/app/table-choice";

describe("chooseTable", () => {
  it("plays the demo table by default, and for an id nobody knows", () => {
    expect(chooseTable("").def.id).toBe("demo");
    expect(chooseTable("?x=1").def.id).toBe("demo");
    expect(chooseTable("?table=nowhere").def.id).toBe("demo");
    expect(chooseTable("?table=").def.id).toBe("demo");
  });

  it("plays The Colony on ?table=colony, with its own rules and flow", () => {
    const c = chooseTable("?table=colony");
    expect(c.def.id).toBe("colony");
    expect(c.setup.flow).toBe(c.flow);
    expect(chooseTable("?a=1&table=colony").def.id).toBe("colony");
  });

  it("gives a flow for every table it can choose", () => {
    for (const id of ["demo", "colony"]) expect(chooseTable(`?table=${id}`).flow.ballsPerGame).toBeGreaterThan(0);
  });
});
