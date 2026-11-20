import { readFile, writeFile, mkdir, copyFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BROWSER_FILES, checkedRuntimePath } from "./runtime-files.mjs";

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, "ui");
const target = path.join(root, "public");
await mkdir(path.join(target, "assets"), { recursive: true });
for (const entry of BROWSER_FILES) {
  const filename = await checkedRuntimePath(root, entry.source);
  const destination = path.join(target, entry.url.slice(1));
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(filename, destination);
}
// The QR dependency and its MIT license are vendored for dependency-free local
// play. A framework install may refresh that source from its locked package.
await copyFile(path.join(root, "node_modules", "qrcode-generator", "dist", "qrcode.js"), path.join(target, "assets", "qrcode.js"))
  .catch(async error => {
    if (error.code !== 'ENOENT') throw error;
    await checkedRuntimePath(root, 'public/assets/qrcode.js');
    await checkedRuntimePath(root, 'public/assets/qrcode-LICENSE.txt');
  });
const html = await readFile(path.join(source, "index.html"), "utf8");
await writeFile(path.join(root, "app", "route.ts"), [
  "// Generated from ui/index.html by scripts/prepare-game.mjs.",
  "const html = " + JSON.stringify(html) + ";",
  "export function GET() {",
  "  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' } });",
  "}",
  "",
].join("\n"));
// The root route serves the complete game document, so the starter page is unused.
await unlink(path.join(root, "app", "page.tsx")).catch(error => { if (error.code !== "ENOENT") throw error; });
console.log("Prepared Sofa Arcade collection, game assets, and root route.");
