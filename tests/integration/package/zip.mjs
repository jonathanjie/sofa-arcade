/** Small read-only ZIP inspector for our reproducible store/deflate package. */
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { mkdir, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';

export function readZip(bytes) {
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65_557) && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  assert.ok(end >= 0, 'ZIP has a central directory');
  assert.equal(bytes.readUInt16LE(end + 4), 0, 'One ZIP volume');
  const count = bytes.readUInt16LE(end + 10);
  let cursor = bytes.readUInt32LE(end + 16);
  const entries = new Map();
  for (let index = 0; index < count; index++) {
    assert.equal(bytes.readUInt32LE(cursor), 0x02014b50);
    const method = bytes.readUInt16LE(cursor + 10);
    const compressedLength = bytes.readUInt32LE(cursor + 20);
    const size = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const mode = bytes.readUInt32LE(cursor + 38) >>> 16;
    const offset = bytes.readUInt32LE(cursor + 42);
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    assert.ok(name && !name.startsWith('/') && !name.includes('\\') && !name.split('/').includes('..'), `Safe ZIP path ${name}`);
    assert.ok(!entries.has(name), `Unique ZIP member ${name}`);
    assert.equal(bytes.readUInt32LE(offset), 0x04034b50);
    const localNameLength = bytes.readUInt16LE(offset + 26);
    const localExtraLength = bytes.readUInt16LE(offset + 28);
    assert.equal(bytes.subarray(offset + 30, offset + 30 + localNameLength).toString('utf8'), name);
    const compressed = bytes.subarray(offset + 30 + localNameLength + localExtraLength, offset + 30 + localNameLength + localExtraLength + compressedLength);
    assert.ok([0, 8].includes(method), 'Supported ZIP compression');
    const data = method === 8 ? inflateRawSync(compressed) : compressed;
    assert.equal(data.length, size);
    assert.equal(mode & 0o170000, name.endsWith('/') ? 0o040000 : 0o100000, 'No symlinks or unusual file types');
    entries.set(name, { data, mode });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  assert.equal(cursor, end, 'Central directory ends at its declared end');
  return entries;
}

export async function extractZip(entries, directory) {
  for (const [name, { data, mode }] of entries) {
    const destination = path.join(directory, name);
    if (name.endsWith('/')) await mkdir(destination, { recursive: true });
    else {
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, data);
      await chmod(destination, mode & 0o777);
    }
  }
}
