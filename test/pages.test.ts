import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (p: string) => readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), "utf8");

// Decision in #4 and #17: the site is built and published by its own workflow, from main only.
describe("the Pages deploy", () => {
  const wf = read(".github/workflows/pages.yml");

  it("runs on pushes to main, and by hand, and on nothing else (no pull requests, no other branches)", () => {
    expect(wf).toMatch(/on:\s*\n\s+push:\s*\n\s+branches: \[main\]\s*\n\s+workflow_dispatch:/);
    expect(wf).not.toMatch(/pull_request/);
  });

  it("asks for exactly the permissions a Pages deploy needs", () => {
    expect(wf).toMatch(/permissions:\s*\n\s+contents: read\s*\n\s+pages: write\s*\n\s+id-token: write/);
  });

  it("tests, builds and checks the budget before it publishes the build output, and publishes nothing else", () => {
    const steps = ["npm ci", "npm test", "npm run build", "npm run budget", "upload-pages-artifact", "deploy-pages"].map((s) => wf.indexOf(s));
    expect(steps.every((i) => i > 0)).toBe(true);
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
    expect(wf).toMatch(/path: dist/);
  });

  it("deploys one at a time into the github-pages environment", () => {
    expect(wf).toMatch(/concurrency:\s*\n\s+group: pages\s*\n\s+cancel-in-progress: false/);
    expect(wf).toMatch(/environment:\s*\n\s+name: github-pages/);
  });

  it("is not one of the required checks: the job names tests and hygiene belong to ci.yml", () => {
    const ci = read(".github/workflows/ci.yml");
    expect(ci).toMatch(/^  tests:/m);
    expect(ci).toMatch(/^  hygiene:/m);
    expect(wf).not.toMatch(/^  (tests|hygiene):/m);
  });

  it("builds with relative asset paths, so the site works under /pinball/", () => {
    expect(read("vite.config.ts")).toMatch(/base: "\.\/"/);
  });
});
