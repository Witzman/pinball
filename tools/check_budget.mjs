// Bundle-size gate over dist/ after `vite build`. Limits from budgets in issue #4:
// JS gzip <= 150 KB, total first-load weight (excluding dist/audio) <= 1 MB.
import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const JS_GZIP_MAX = 150 * 1024;
// The PlayCanvas engine is its own lazy chunk (#45): the owner accepted its size, it has its own limit and is not part of the first load.
const ENGINE_GZIP_MAX = 700 * 1024;
// The generated art (#45) is lazy too: images load after the first frame, with their own limit.
const ART_MAX = 1.5 * 1024 * 1024;
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
let engine = 0;
let art = 0;
let total = 0;
for (const f of files) {
  if (f.startsWith(join("dist", "audio"))) continue;
  const buf = readFileSync(f);
  if (/playcanvas-[^/\\]*\.js$/.test(f)) {
    engine += gzipSync(buf).length;
    continue;
  }
  if (/\.webp$/.test(f)) {
    art += buf.length;
    continue;
  }
  total += buf.length;
  if (f.endsWith(".js")) js += gzipSync(buf).length;
}

const kb = (n) => (n / 1024).toFixed(1) + " KB";
console.log(`budget: js gzip ${kb(js)} / ${kb(JS_GZIP_MAX)}, total ${kb(total)} / ${kb(TOTAL_MAX)}`);
if (engine > 0) console.log(`budget: engine chunk gzip ${kb(engine)} / ${kb(ENGINE_GZIP_MAX)} (lazy, not first load)`);
if (art > 0) console.log(`budget: art images ${kb(art)} / ${kb(ART_MAX)} (lazy)`);
if (js > JS_GZIP_MAX || art > ART_MAX || total > TOTAL_MAX || engine > ENGINE_GZIP_MAX) {
  console.error("budget: EXCEEDED");
  process.exit(1);
}
