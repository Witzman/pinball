// Bundle-size gate over dist/ after `vite build`. Limits from budgets in issue #4:
// JS gzip <= 150 KB, total first-load weight (excluding dist/audio) <= 1 MB.
import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const JS_GZIP_MAX = 150 * 1024;
const TOTAL_MAX = 1024 * 1024;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

let files;
try {
  files = walk("dist");
} catch {
  console.error("budget: dist/ missing, run `npm run build` first");
  process.exit(2);
}

let js = 0;
let total = 0;
for (const f of files) {
  if (f.startsWith(join("dist", "audio"))) continue;
  const buf = readFileSync(f);
  total += buf.length;
  if (f.endsWith(".js")) js += gzipSync(buf).length;
}

const kb = (n) => (n / 1024).toFixed(1) + " KB";
console.log(`budget: js gzip ${kb(js)} / ${kb(JS_GZIP_MAX)}, total ${kb(total)} / ${kb(TOTAL_MAX)}`);
if (js > JS_GZIP_MAX || total > TOTAL_MAX) {
  console.error("budget: EXCEEDED");
  process.exit(1);
}
