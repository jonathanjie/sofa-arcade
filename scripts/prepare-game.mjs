import { readFile, writeFile, mkdir, copyFile, unlink } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, "ui");
const target = path.join(root, "public");
await mkdir(path.join(target, "assets"), { recursive: true });
for (const name of ["app.js", "styles.css", "audio.js", "score.mjs", "motion.js", "motion.css", "board-view.mjs", "board-view.css", "action-queue.mjs", "transport.mjs"]) {
  await copyFile(path.join(source, name), path.join(target, name));
}
await copyFile(path.join(root, "game", "engine.mjs"), path.join(target, "engine.mjs"));
await mkdir(path.join(target, "games"), { recursive: true });
await copyFile(path.join(root, "games", "catalog.mjs"), path.join(target, "games", "catalog.mjs"));
await copyFile(path.join(root, "node_modules", "qrcode-generator", "dist", "qrcode.js"), path.join(target, "assets", "qrcode.js"));
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
