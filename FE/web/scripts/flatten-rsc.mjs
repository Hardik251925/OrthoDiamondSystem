// Static export (GitHub Pages) fix: Next 16 writes segment prefetch files as
//   out/about/__next.about/__PAGE__.txt
// but the client requests
//   out/about/__next.about.__PAGE__.txt
// A real Next server maps these; static hosts do not. Copy each nested file to its flat name.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "out");
if (process.env.GITHUB_PAGES !== "1" || !fs.existsSync(out)) process.exit(0); // only for the static export build

let n = 0;
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (!e.isDirectory()) continue;
    if (e.name.startsWith("__next.")) {
      const flatten = (d, prefix) => {
        for (const f of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, f.name);
          if (f.isDirectory()) flatten(p, `${prefix}.${f.name}`);
          else {
            fs.copyFileSync(p, path.join(dir, `${prefix}.${f.name}`));
            n++;
          }
        }
      };
      flatten(full, e.name);
    } else if (e.name !== "_next") walk(full);
  }
}
walk(out);
console.log(`flatten-rsc: ${n} prefetch file(s) copied for static hosting`);
