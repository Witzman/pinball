// Regenerates test/golden/hashes.json. Run it ONLY when a physics or hash change
// is meant to alter results, and say why in the issue. Usage: npm run golden:update
import { spawnSync } from "node:child_process";

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const r = spawnSync(npx, ["vitest", "run", "test/golden.test.ts"], {
  stdio: "inherit",
  env: { ...process.env, GOLDEN_UPDATE: "1" },
});
process.exit(r.status ?? 1);
