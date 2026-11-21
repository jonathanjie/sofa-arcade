import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { certificateError, safeCertificateError } from './errors.mjs';

const DIRECTORY = 'secure-lan-v1';
const INSTALLATION = 'installation.json';
const WITNESS = 'installation-identity.json';
const LOCK = '.host-operation.lock';
const MAX_BYTES = 65_536;
const inProcessQueues = new Map();
const fileFlags = constants.O_RDONLY | constants.O_NOFOLLOW;
const sameInode = (a, b) => a.dev === b.dev && a.ino === b.ino;
const owns = (stat) => typeof process.getuid !== 'function' || stat.uid === process.getuid();

function mapStorageError(error) {
  if (error?.code === 'ELOOP') return certificateError('STORAGE_UNSAFE');
  return safeCertificateError(error, 'STORAGE_UNAVAILABLE');
}

function validFile(stat) {
  return stat.isFile() && owns(stat) && stat.nlink === 1 && (stat.mode & 0o777) === 0o600;
}

/**
 * Fixed-directory storage, only for a trusted canonical native app-data path.
 * Node has no portable openat API. Private owned directories and inode checks
 * prevent unprivileged path substitution; another same-UID native process is
 * outside this component's isolation boundary.
 */
export function createPrivateStorage(appDataDir) {
  if (typeof appDataDir !== 'string' || !path.isAbsolute(appDataDir) ||
      appDataDir === path.parse(appDataDir).root || appDataDir.includes('\0') ||
      path.resolve(appDataDir) !== appDataDir) throw certificateError('STORAGE_UNSAFE');
  const directory = path.join(appDataDir, DIRECTORY);

  async function ensureDirectory(create) {
    try {
      // Reject symlink ancestors rather than silently changing the supplied
      // destination. On macOS GO7 calls realpath on its native app-data path.
      if (await fs.realpath(appDataDir) !== appDataDir) throw certificateError('STORAGE_UNSAFE');
      let cursor = appDataDir;
      while (true) {
        const stat = await fs.lstat(cursor);
        if (!stat.isDirectory() || stat.isSymbolicLink() ||
            ((stat.mode & 0o022) && !(stat.mode & 0o1000))) throw certificateError('STORAGE_UNSAFE');
        if (cursor === appDataDir && (!owns(stat) || (stat.mode & 0o700) !== 0o700 || (stat.mode & 0o022))) {
          throw certificateError('STORAGE_UNSAFE');
        }
        const next = path.dirname(cursor);
        if (next === cursor) break;
        cursor = next;
      }
      if (create) {
        try { await fs.mkdir(directory, { mode: 0o700 }); }
        catch (error) { if (error.code !== 'EEXIST') throw error; }
      }
      let stat;
      try { stat = await fs.lstat(directory); }
      catch (error) { if (!create && error.code === 'ENOENT') return null; throw error; }
      if (!stat.isDirectory() || stat.isSymbolicLink() || !owns(stat) || (stat.mode & 0o777) !== 0o700) {
        throw certificateError('STORAGE_UNSAFE');
      }
      return stat;
    } catch (error) { throw mapStorageError(error); }
  }

  async function checkDirectory(expected) {
    const actual = await ensureDirectory(false);
    if (!actual || !sameInode(expected, actual)) throw certificateError('STORAGE_UNSAFE');
  }

  async function readNamed(filename, stamp, maxBytes = MAX_BYTES) {
    await checkDirectory(stamp);
    const fullPath = path.join(directory, filename);
    let handle;
    try {
      try { handle = await fs.open(fullPath, fileFlags); }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
      const before = await handle.stat();
      if (!validFile(before) || before.size > maxBytes) throw certificateError('STORAGE_UNSAFE');
      const bytes = await handle.readFile();
      const after = await handle.stat();
      const named = await fs.lstat(fullPath);
      if (!validFile(named) || !sameInode(before, named) || before.mtimeMs !== after.mtimeMs ||
          before.size !== after.size || bytes.length > maxBytes) throw certificateError('STORAGE_UNSAFE');
      await checkDirectory(stamp);
      return { bytes, stat: before };
    } finally { await handle?.close(); }
  }

  async function unlinkExact(filename, stat, stamp) {
    await checkDirectory(stamp);
    const fullPath = path.join(directory, filename);
    const named = await fs.lstat(fullPath);
    if (!validFile(named) || !sameInode(named, stat)) throw certificateError('STORAGE_UNSAFE');
    await fs.unlink(fullPath);
  }

  async function acquireLock(stamp) {
    const fullPath = path.join(directory, LOCK);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await checkDirectory(stamp);
      let handle;
      let createdStat;
      try {
        handle = await fs.open(fullPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
        const stat = await handle.stat();
        createdStat = stat;
        if (!validFile(stat)) throw certificateError('STORAGE_UNSAFE');
        await handle.writeFile(JSON.stringify({ pid: process.pid, nonce: randomUUID() }));
        await handle.sync();
        await checkDirectory(stamp);
        return async () => {
          try { await unlinkExact(LOCK, stat, stamp); }
          finally { await handle.close(); }
        };
      } catch (error) {
        if (handle && createdStat) {
          // A write/sync failure after O_EXCL must not strand a live-PID lock.
          // Never unlink a replacement or a path whose ownership changed.
          try { await unlinkExact(LOCK, createdStat, stamp); } catch { /* Fail closed. */ }
        }
        await handle?.close();
        if (error.code !== 'EEXIST') throw error;
        const current = await readNamed(LOCK, stamp, 256);
        if (!current) continue;
        let lock;
        try { lock = JSON.parse(current.bytes.toString('utf8')); }
        catch { throw certificateError('STORE_BUSY'); }
        if (!Number.isSafeInteger(lock.pid) || lock.pid <= 0 || typeof lock.nonce !== 'string') {
          throw certificateError('STORE_BUSY');
        }
        let dead = false;
        try { process.kill(lock.pid, 0); }
        catch (check) { if (check.code === 'ESRCH') dead = true; }
        if (!dead) throw certificateError('STORE_BUSY');
        // Recover only a lock whose recorded process no longer exists, after
        // checking its exact inode. A live/reused PID is conservatively busy.
        await unlinkExact(LOCK, current.stat, stamp);
      }
    }
    throw certificateError('STORE_BUSY');
  }

  function serialized(operation) {
    const previous = inProcessQueues.get(directory) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    inProcessQueues.set(directory, next);
    void next.finally(() => {
      if (inProcessQueues.get(directory) === next) inProcessQueues.delete(directory);
    }).catch(() => {});
    return next.catch((error) => { throw mapStorageError(error); });
  }

  async function read(stamp, filename = INSTALLATION) {
    const stored = await readNamed(filename, stamp);
    return stored?.bytes ?? null;
  }

  async function write(bytes, stamp, filename = INSTALLATION) {
    if (!Buffer.isBuffer(bytes) || bytes.length > MAX_BYTES) throw certificateError('MATERIAL_INVALID');
    await checkDirectory(stamp);
    // Inspect any destination before replacing it. Never overwrite a symlink,
    // hard-linked file, foreign owner or directory, even within private storage.
    await readNamed(filename, stamp);
    const temporaryName = `.installation-${randomUUID()}.tmp`;
    const temporaryPath = path.join(directory, temporaryName);
    let handle;
    let temporaryStat;
    let renamed = false;
    try {
      handle = await fs.open(temporaryPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
      temporaryStat = await handle.stat();
      if (!validFile(temporaryStat)) throw certificateError('STORAGE_UNSAFE');
      await handle.writeFile(bytes);
      await handle.sync();
      await handle.close();
      handle = null;
      await checkDirectory(stamp);
      const destination = path.join(directory, filename);
      await fs.rename(temporaryPath, destination);
      renamed = true;
      const committed = await fs.lstat(destination);
      if (!validFile(committed) || !sameInode(temporaryStat, committed)) throw certificateError('STORAGE_UNSAFE');
      const directoryHandle = await fs.open(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      try {
        if (!sameInode(stamp, await directoryHandle.stat())) throw certificateError('STORAGE_UNSAFE');
        await directoryHandle.sync();
      } finally { await directoryHandle.close(); }
    } finally {
      await handle?.close();
      if (!renamed && temporaryStat) await unlinkExact(temporaryName, temporaryStat, stamp);
    }
  }

  async function remove(stamp) {
    const saved = await readNamed(INSTALLATION, stamp);
    if (saved) await unlinkExact(INSTALLATION, saved.stat, stamp);
    const witness = await readNamed(WITNESS, stamp);
    if (witness) await unlinkExact(WITNESS, witness.stat, stamp);
    // Only our exact staging naming convention is eligible; never rm -rf the
    // private subtree or touch the native app's other data.
    for (const name of await fs.readdir(directory)) {
      if (!/^\.installation-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.tmp$/.test(name)) continue;
      const staged = await readNamed(name, stamp);
      if (staged) await unlinkExact(name, staged.stat, stamp);
    }
    return { removed: Boolean(saved || witness) };
  }

  return Object.freeze({
    snapshot: () => serialized(async () => {
      const stamp = await ensureDirectory(false);
      return stamp ? { bytes: await read(stamp), witness: await read(stamp, WITNESS) } : { bytes: null, witness: null };
    }),
    transaction: (operation, { create = true } = {}) => serialized(async () => {
      const stamp = await ensureDirectory(create);
      if (!stamp) return operation({ read: async () => null, readWitness: async () => null, remove: async () => ({ removed: false }) });
      const release = await acquireLock(stamp);
      try {
        return await operation({
          read: () => read(stamp), readWitness: () => read(stamp, WITNESS),
          write: (bytes) => write(bytes, stamp), writeWitness: (bytes) => write(bytes, stamp, WITNESS),
          remove: () => remove(stamp),
        });
      }
      finally { await release(); }
    }),
  });
}
