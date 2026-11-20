import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { desktopRoot } from '../scripts/runtime-files.mjs';
import { cleanNodeEnvironment, nativeTarget } from '../scripts/prepare.mjs';

export const stagedRoot = path.join(desktopRoot, 'stage/runtime');
export const bundledNode = path.join(desktopRoot, 'src-tauri/binaries', `node-${nativeTarget()}`);
export async function launchHost({ database, port = 0, root = stagedRoot, arguments: supplied, executable = bundledNode } = {}) {
  const child = spawn(executable, [path.join(stagedRoot, 'desktop/host/entry.mjs'), ...(supplied || ['--root', root, '--database', database, '--port', String(port)])], {
    env: { ...cleanNodeEnvironment(), PATH: '/nonexistent' }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const records = [];
  let buffer = '';
  let stderr = '';
  let settled = false;
  const waiting = new Set();
  const exited = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => { settled = true; resolve({ code, signal }); for (const waiter of waiting) waiter.reject(new Error(`Host exited ${code}/${signal} before record ${waiter.type}`)); waiting.clear(); }); });
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4096); });
  child.stdout.on('data', chunk => {
    buffer += chunk.toString('utf8');
    let index;
    while ((index = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
      assert.ok(Buffer.byteLength(line) < 4096);
      const value = JSON.parse(line); records.push(value);
      for (const waiter of [...waiting]) if (value.type === waiter.type) { clearTimeout(waiter.timeout); waiting.delete(waiter); waiter.resolve(value); }
    }
    assert.ok(Buffer.byteLength(buffer) < 4096);
  });
  function waitFor(type, from = 0) {
    const record = records.slice(from).find(value => value.type === type);
    if (record) return Promise.resolve(record);
    if (settled) return Promise.reject(new Error(`Host already exited before ${type}`));
    return new Promise((resolve, reject) => {
      const waiter = { type, resolve, reject, timeout: null };
      waiter.timeout = setTimeout(() => { waiting.delete(waiter); reject(new Error(`Host record timeout: ${type}`)); }, 10_000);
      waiting.add(waiter);
    });
  }
  return {
    child, records, exited, waitFor, get stderr() { return stderr; },
    send(type) { child.stdin.write(JSON.stringify({ type }) + '\n'); },
    async close() {
      if (settled) return exited;
      child.stdin.end(JSON.stringify({ type: 'shutdown' }) + '\n');
      const timeout = setTimeout(() => child.kill('SIGKILL'), 7000);
      try { return await exited; } finally { clearTimeout(timeout); }
    },
  };
}

export async function api(origin, route, { token, body, headers = {} } = {}) {
  const response = await fetch(origin + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(body === undefined ? {} : { Origin: origin, 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(5000),
  });
  return { status: response.status, body: await response.json() };
}

export async function makeRoom(origin) {
  const created = await api(origin, '/api/rooms', { body: {} });
  assert.equal(created.status, 201);
  const { code, hostToken } = created.body;
  const tokens = {};
  for (const playerId of ['jon', 'lydia']) {
    const joined = await api(origin, `/api/rooms/${code}/join`, { body: { playerId, clientId: crypto.randomUUID() } });
    assert.equal(joined.status, 200); tokens[playerId] = joined.body.playerToken;
  }
  const started = await api(origin, `/api/rooms/${code}/start`, { token: hostToken, body: {} });
  assert.equal(started.status, 200);
  return { code, hostToken, tokens, room: started.body };
}

export async function subscribe(origin, code, token) {
  const abort = new AbortController();
  const response = await fetch(`${origin}/api/rooms/${code}/events`, { headers: { Authorization: `Bearer ${token}` }, signal: abort.signal });
  assert.equal(response.status, 200);
  const reader = response.body.getReader();
  const history = [];
  const waiting = new Set();
  let stopped = false;
  const { createEventDecoder } = await import(path.join(stagedRoot, 'ui/transport.mjs'));
  const decoder = new TextDecoder();
  const decode = createEventDecoder((type, value) => {
    if (type === 'room') {
      history.push(value);
      for (const waiter of [...waiting]) if (value.revision >= waiter.revision) { clearTimeout(waiter.timeout); waiting.delete(waiter); waiter.resolve(value); }
    }
  });
  const pumping = (async () => {
    try { while (!stopped) { const next = await reader.read(); if (next.done) break; decode(decoder.decode(next.value, { stream: true })); } }
    catch (error) { if (!stopped) for (const waiter of waiting) waiter.reject(error); }
  })();
  return {
    history,
    revision(revision) {
      const seen = history.find(room => room.revision >= revision);
      if (seen) return Promise.resolve(seen);
      return new Promise((resolve, reject) => { const waiter = { revision, resolve, reject, timeout: null }; waiter.timeout = setTimeout(() => { waiting.delete(waiter); reject(new Error('Immediate SSE update timed out.')); }, 2000); waiting.add(waiter); });
    },
    async close() { stopped = true; abort.abort(); await reader.cancel().catch(() => {}); await pumping; for (const waiter of waiting) { clearTimeout(waiter.timeout); waiter.reject(new Error('Stream closed.')); } waiting.clear(); },
  };
}
