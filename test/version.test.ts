import { describe, expect, it } from "vitest";
import { VERSION } from "../src/version";

describe("scaffold", () => {
  it("runs the toolchain end to end", () => {
    expect(VERSION).toBe("0.0.0");
  });
});
