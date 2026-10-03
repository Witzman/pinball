import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (p: string) => readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), "utf8");

// Decision in #4 and #17: the site is built and published by its own workflow, from main only.
describe("the Pages deploy", () => {
  const wf = read(".github/workflows/pages.yml");

  /** The keys directly under `on:`, and the lines of the whole `on:` block. */
  const onBlock = (() => {
    const m = /^on:\s*\n((?:[ \t]+.*\n|\s*\n)+)/m.exec(wf)!;
    const lines = m[1]!.split("\n").filter((l) => l.trim() !== "");
    return { text: m[1]!, keys: lines.filter((l) => /^ {2}\S/.test(l)).map((l) => l.trim().replace(/:.*/, "")) };
  })();
  /** The workflow's steps, in order, as their `uses:` or `run:` text. */
  const steps = [...wf.matchAll(/^ {6}- (?:id: \w+\n {8})?(?:uses|run): (.+)$/gm)].map((m) => m[1]!.trim());

  it("runs on pushes to main and by hand, and on no other trigger (no pull requests, schedules or other workflows)", () => {
    expect(onBlock.keys).toEqual(["push", "workflow_dispatch"]);
    expect(onBlock.text).toMatch(/branches: \[main\]/);
  });

  it("lets only main publish, even for a manual run started from another branch", () => {
    expect(wf).toMatch(/^ {4}if: github\.ref == 'refs\/heads\/main'$/m);
  });

  it("asks for exactly the permissions a Pages deploy needs", () => {
    expect(wf).toMatch(/permissions:\s*\n\s+contents: read\s*\n\s+pages: write\s*\n\s+id-token: write/);
  });

  it("checks out, tests, builds and checks the budget before it uploads and deploys the build output, in that order", () => {
    expect(steps).toEqual([
      "actions/checkout@v4",
      "actions/setup-node@v4",
      "npm ci",
      "npm test",
      "npm run build",
      "npm run budget",
      "actions/configure-pages@v5",
      "actions/upload-pages-artifact@v3",
      "actions/deploy-pages@v4",
    ]);
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
