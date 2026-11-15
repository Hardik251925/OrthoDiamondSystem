// Copies Bootstrap's CSS into src/styles/vendor without the leading @charset rule,
// because @charset is not allowed inside @import ... layer(bootstrap). Runs before dev/build.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "node_modules/bootstrap/dist/css/bootstrap.min.css");
const outDir = path.join(root, "src/styles/vendor");
fs.mkdirSync(outDir, { recursive: true });
const css = fs.readFileSync(src, "utf8").replace(/^@charset "UTF-8";/, "").replace(/\/\*# sourceMappingURL=.*\*\/\s*$/, "");
fs.writeFileSync(path.join(outDir, "bootstrap.css"), css);
console.log(`bootstrap.css vendored (${(css.length / 1024).toFixed(0)} KB)`);
