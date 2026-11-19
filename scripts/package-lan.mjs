#!/usr/bin/env node
/** Reproducible, dependency-free local-play ZIP. Only named runtime files enter it. */
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { deflateRawSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const prefix = 'sofa-arcade-local/';
const output = path.join(root, 'public/downloads/sofa-arcade-local.zip');
const runtime = [
  'start-sofa.command',
  'scripts/lan-server.mjs',
  'server/lan.mjs', 'server/rooms.mjs',
  'game/engine.mjs', 'games/catalog.mjs', 'games/registry.mjs',
  'ui/index.html', 'ui/app.js', 'ui/styles.css', 'ui/audio.js', 'ui/score.mjs',
  'ui/motion.js', 'ui/motion.css', 'ui/board-view.mjs', 'ui/board-view.css',
  'ui/action-queue.mjs', 'ui/transport.mjs',
  'public/assets/sofa-room.png', 'public/assets/characters.png',
  'public/assets/qrcode.js', 'public/assets/qrcode-LICENSE.txt',
  'public/favicon.svg', 'public/manifest.webmanifest',
  'docs/LAN.md',
];
const migrations = (await readdir(path.join(root, 'drizzle'))).filter(name => /^\d[^/]*\.sql$/.test(name)).sort();
if (!migrations.length) throw new Error('The local-play package needs its checked-in SQL migration.');
runtime.push(...migrations.map(name => 'drizzle/' + name));

const readme = `SOFA ARCADE — LOCAL PLAY

One Mac, one TV, two phones. Keep the devices on the same home Wi-Fi.

1. Install Node.js 22.13 or newer if needed: https://nodejs.org/
2. Open start-sofa.command, or open Terminal in this folder and run:

   bash start-sofa.command

3. Open the local address printed in Terminal on your Mac.
4. Choose Sofa Kingdoms, then Host on the TV.
5. Scan the room QR with both phones. Cast the Mac browser to your TV.

Keep Terminal open while playing. Press Control+C to stop.
No npm install, build, account, or internet connection is needed during play.

If you prefer to start it directly:
   node scripts/lan-server.mjs

Room state is saved beside these files in .sofa-lan/rooms.sqlite.
Local rooms are separate from the public website's rooms and last 24 hours.
See docs/LAN.md for connection help and technical details.

Artwork and music were created for Jon, Lydia, and Lala.
The QR-code library's MIT license is in public/assets/qrcode-LICENSE.txt.
`;

const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const files = await Promise.all(runtime.map(async name => ({
  name: prefix + name,
  data: await readFile(path.join(root, name)),
  mode: name === 'start-sofa.command' ? 0o100755 : 0o100644,
})));
files.push({ name: prefix + 'README.txt', data: Buffer.from(readme), mode: 0o100644 });
files.sort((left, right) => left.name.localeCompare(right.name, 'en'));
const directories = new Set([prefix]);
for (const file of files) {
  const parts = file.name.split('/');
  for (let index = 1; index < parts.length; index++) directories.add(parts.slice(0, index).join('/') + '/');
}
const entries = [...directories].sort().map(name => ({ name, data: Buffer.alloc(0), mode: 0o40755, directory: true })).concat(files);

// Standard ZIP local headers + central directory; no Zip64 is needed for this
// small collection. Stable 1980 timestamps keep unchanged source reproducible.
const bodies = [];
const central = [];
let offset = 0;
for (const entry of entries) {
  const name = Buffer.from(entry.name, 'utf8');
  const compressed = entry.directory ? entry.data : deflateRawSync(entry.data, { level: 6 });
  const method = entry.directory ? 0 : 8;
  const crc = crc32(entry.data);
  if (compressed.length > 0xffffffff || entry.data.length > 0xffffffff || offset > 0xffffffff) throw new Error('The local bundle exceeds standard ZIP limits.');
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(method, 8);
  local.writeUInt16LE(33, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(entry.data.length, 22);
  local.writeUInt16LE(name.length, 26);
  bodies.push(local, name, compressed);

  const record = Buffer.alloc(46);
  record.writeUInt32LE(0x02014b50, 0);
  record.writeUInt16LE((3 << 8) | 20, 4); // Unix creator, ZIP 2.0.
  record.writeUInt16LE(20, 6);
  record.writeUInt16LE(0x0800, 8);
  record.writeUInt16LE(method, 10);
  record.writeUInt16LE(33, 14);
  record.writeUInt32LE(crc, 16);
  record.writeUInt32LE(compressed.length, 20);
  record.writeUInt32LE(entry.data.length, 24);
  record.writeUInt16LE(name.length, 28);
  record.writeUInt32LE(((entry.mode << 16) | (entry.directory ? 0x10 : 0)) >>> 0, 38);
  record.writeUInt32LE(offset, 42);
  central.push(record, name);
  offset += local.length + name.length + compressed.length;
}
const directory = Buffer.concat(central);
if (entries.length > 0xffff || offset + directory.length > 0xffffffff) throw new Error('The local bundle exceeds standard ZIP limits.');
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(directory.length, 12);
end.writeUInt32LE(offset, 16);
const archive = Buffer.concat([...bodies, directory, end]);
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, archive);
console.log(JSON.stringify({ archive: output, files: files.length, bytes: archive.length }));
