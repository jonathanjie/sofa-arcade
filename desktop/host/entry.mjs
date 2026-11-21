/** Bundled Node entrypoint. Only the native parent writes its private stdin. */
import path from 'node:path';
import { mkdir, realpath, lstat, open, rename, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { networkInterfaces } from 'node:os';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { createHostLifecycle, createRefreshGate, networkFingerprint, refreshReason, MAX_RECORD_BYTES, MAX_SECURE_RECORD_BYTES, MAX_COMMAND_BYTES, PROTOCOL_VERSION } from './lifecycle.mjs';
import { attachNativeSecureLan, validateSecureCommand } from './secure-lan.mjs';

function emit(record) {
  const text = JSON.stringify(record) + '\n';
  if (Buffer.byteLength(text) > (record.type === 'secure-result' ? MAX_SECURE_RECORD_BYTES : MAX_RECORD_BYTES)) throw new Error('Oversized protocol message.');
  process.stdout.write(text);
}

function argumentsFrom(args) {
  const enableGravityOrchard = args.at(-1) === '--gravity-orchard-candidate';
  if (enableGravityOrchard) args = args.slice(0, -1);
  if (args.length !== 6) throw new Error('Invalid arguments.');
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    if (!['--root', '--database', '--port'].includes(key) || values[key] !== undefined || typeof args[index + 1] !== 'string') throw new Error('Invalid arguments.');
    values[key] = args[index + 1];
  }
  if (!path.isAbsolute(values['--root'] || '') || !path.isAbsolute(values['--database'] || '') || !/^\d{1,5}$/.test(values['--port'] || '')) throw new Error('Invalid arguments.');
  const port = Number(values['--port']);
  if (port < 0 || port > 65535) throw new Error('Invalid port.');
  return { root: values['--root'], databasePath: values['--database'], port, host: '0.0.0.0', ...(enableGravityOrchard ? { enableGravityOrchard: true } : {}) };
}

let lifecycle;
let refreshGate;
let timer;
let runtimeTiming;
let stopping = false;
let failed = false;

/** Instrumented native acceptance only; never stdout, a public route, or SQL data. */
function createRuntimeTiming(directory) {
  const operations = new Set(['sqlite.prepare', 'sqlite.get', 'sqlite.all', 'sqlite.run', 'sqlite.exec',
    'sqlite.begin', 'sqlite.commit', 'sqlite.rollback', 'checkpoint.project', 'checkpoint.stringify', 'realtime.timer']);
  const startedAtMs = performance.now(), initialCpu = process.cpuUsage();
  const loop = monitorEventLoopDelay({ resolution: 10 });
  const totals = Object.create(null), slowOperations = [];
  let omittedSlowOperations = 0, finished = false;
  loop.enable();
  return {
    observe(value) {
      if (finished || !value || !operations.has(value.operation)
          || !Number.isFinite(value.atMs) || !Number.isFinite(value.durationMs) || value.durationMs < 0) return;
      const total = totals[value.operation] ||= { count: 0, totalMs: 0, maximumMs: 0, maximumLateByMs: 0 };
      total.count++; total.totalMs += value.durationMs; total.maximumMs = Math.max(total.maximumMs, value.durationMs);
      const timer = value.operation === 'realtime.timer';
      const lateByMs = timer && Number.isFinite(value.lateByMs) ? Math.max(0, value.lateByMs) : 0;
      total.maximumLateByMs = Math.max(total.maximumLateByMs, lateByMs);
      if (value.durationMs < 20 && lateByMs < 50) return;
      const cpu = process.cpuUsage(initialCpu);
      const item = { operation: value.operation, elapsedMs: value.atMs - startedAtMs, durationMs: value.durationMs,
        cpuUserMs: cpu.user / 1000, cpuSystemMs: cpu.system / 1000 };
      if (timer) {
        if (!Number.isFinite(value.delayMs) || value.delayMs < 0) return;
        item.delayMs = value.delayMs; item.lateByMs = lateByMs;
      }
      if (slowOperations.length === 128) { slowOperations.shift(); omittedSlowOperations++; }
      slowOperations.push(item);
    },
    async finish() {
      if (finished) return;
      finished = true; loop.disable();
      const cpu = process.cpuUsage(initialCpu);
      const record = { schemaVersion: 1, kind: 'native-e2e-host-runtime-timing',
        startedAtEpochMs: performance.timeOrigin + startedAtMs, durationMs: performance.now() - startedAtMs,
        cpuUserMs: cpu.user / 1000, cpuSystemMs: cpu.system / 1000,
        eventLoopDelayMs: { maximum: loop.max / 1e6, p50: loop.percentile(50) / 1e6,
          p95: loop.percentile(95) / 1e6, p99: loop.percentile(99) / 1e6 },
        operations: totals, slowOperations, omittedSlowOperations,
        measurement: 'Optional instrumented-host observation; no SQL, bindings, credentials, paths, room state or checkpoint contents. Timer lateness and callback duration are separate; not a one-way or display measurement.' };
      const data = JSON.stringify(record) + '\n';
      if (Buffer.byteLength(data) > 128 * 1024) throw new Error('Timing evidence exceeded its fixed bound.');
      const temporary = path.join(directory, `.host-timing-${process.pid}.tmp`);
      let handle, owned = false;
      try {
        handle = await open(temporary, 'wx', 0o600); owned = true;
        await handle.writeFile(data); await handle.sync(); await handle.close(); handle = null;
        await rename(temporary, path.join(directory, 'host-timing.json')); owned = false;
      } finally { await handle?.close().catch(() => {}); if (owned) await rm(temporary, { force: true }).catch(() => {}); }
    },
  };
}
function emitFailure(error, invalid = false) {
  if (failed) return;
  failed = true;
  const code = invalid ? 'invalid_arguments' : error?.code === 'EADDRINUSE' ? 'port_in_use' : 'startup_failed';
  const message = {
    invalid_arguments: 'The local host received invalid startup settings.',
    port_in_use: 'The saved local port is in use. Close the other app using it, then retry.',
    startup_failed: 'The local host could not start. Your saved rooms have been kept.',
  }[code];
  emit({ type: 'error', protocolVersion: PROTOCOL_VERSION, code, message });
}

async function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  // Shutdown stays bounded even if a stalled socket prevents server.close().
  const deadline = setTimeout(() => process.exit(exitCode || 1), 5000);
  deadline.unref();
  try { await lifecycle?.stop(); } catch { exitCode ||= 1; }
  try { await runtimeTiming?.finish(); } catch { exitCode ||= 1; }
  process.stdin.destroy();
  process.exitCode = exitCode;
  clearTimeout(deadline);
}

process.umask(0o077);
process.once('SIGTERM', () => void stop());
process.once('SIGINT', () => void stop());
process.once('uncaughtException', error => { emitFailure(error); void stop(1); });
process.once('unhandledRejection', error => { emitFailure(error); void stop(1); });
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  input += chunk;
  if (Buffer.byteLength(input) > MAX_COMMAND_BYTES) { emitFailure(null, true); void stop(1); return; }
  let index;
  while ((index = input.indexOf('\n')) >= 0) {
    const line = input.slice(0, index); input = input.slice(index + 1);
    let command;
    try { command = JSON.parse(line); } catch { emitFailure(null, true); void stop(1); return; }
    if (command?.type === 'secure') {
      try { validateSecureCommand(command); } catch { emitFailure(null, true); void stop(1); return; }
      const reply = { type: 'secure-result', protocolVersion: PROTOCOL_VERSION, id: command.id, operation: command.operation };
      void lifecycle?.secureCommand(command.operation, command.options).then(result => {
        if (!stopping) emit({ ...reply, ok: true, ...result });
      }).catch(() => { if (!stopping) emit({ ...reply, ok: false, code: 'secure_operation_failed' }); });
      continue;
    }
    if (!command || Object.keys(command).length !== 1 || !['shutdown', 'refresh'].includes(command.type)) { emitFailure(null, true); void stop(1); return; }
    if (command.type === 'shutdown') void stop();
    else void refreshGate?.acknowledge().catch(error => { emitFailure(error); void stop(1); });
  }
});
// Parent death closes this inherited pipe; no PID guessing, process scanning,
// attach-to-existing-host logic, or signals to unrelated processes are needed.
process.stdin.once('end', () => void stop());
process.stdin.once('error', () => void stop(1));
process.stdin.resume();

let options;
try { options = argumentsFrom(process.argv.slice(2)); }
catch (error) { emitFailure(error, true); await stop(1); }
if (options && !stopping) {
  try {
    options.root = await realpath(options.root);
    const parent = path.dirname(options.databasePath);
    await mkdir(parent, { recursive: true, mode: 0o700 });
    const databaseParent = await realpath(parent);
    options.databasePath = path.join(databaseParent, path.basename(options.databasePath));
    if (options.databasePath === options.root || options.databasePath.startsWith(options.root + path.sep)) throw new Error('Database must be outside resources.');
    try { if ((await lstat(options.databasePath)).isSymbolicLink()) throw new Error('Database cannot be a symlink.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (process.env.SOFA_NATIVE_E2E_TIMING === '1') {
      runtimeTiming = createRuntimeTiming(databaseParent);
      options.onRuntimeTiming = runtimeTiming.observe;
    }
    const { startLanServer } = await import(pathToFileURL(path.join(options.root, 'server/lan.mjs')).href);
    const start = async current => {
      const lan = await startLanServer(current);
      try { return await attachNativeSecureLan(lan, { appDataDir: databaseParent }); }
      catch (error) { await lan.close(); throw error; }
    };
    lifecycle = createHostLifecycle({ start, options, emit });
    refreshGate = createRefreshGate({ emit, refresh: reason => lifecycle.refresh(reason) });
    if (!stopping) await lifecycle.start();
    const fingerprint = () => { try { return networkFingerprint(networkInterfaces()); } catch { return ''; } };
    let previousNetwork = fingerprint();
    let previousTick = Date.now();
    if (!stopping) timer = setInterval(() => {
      const network = fingerprint();
      const now = Date.now();
      const reason = refreshReason({ previousNetwork, network, previousTick, now });
      previousNetwork = network; previousTick = now;
      // The native parent destroys its old credentialed webview before ACK.
      // Keep this listener owned until then; never let hidden pages poll a
      // port that may have been acquired by an unrelated process.
      if (reason) refreshGate.request(reason);
    }, 3000);
    timer?.unref();
  } catch (error) { emitFailure(error); await stop(1); }
}
