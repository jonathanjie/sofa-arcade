/** Bundled Node entrypoint. Only the native parent writes its private stdin. */
import path from 'node:path';
import { mkdir, realpath, lstat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { networkInterfaces } from 'node:os';
import { createHostLifecycle, createRefreshGate, networkFingerprint, refreshReason, MAX_RECORD_BYTES, MAX_COMMAND_BYTES, PROTOCOL_VERSION } from './lifecycle.mjs';

function emit(record) {
  const text = JSON.stringify(record) + '\n';
  if (Buffer.byteLength(text) > MAX_RECORD_BYTES) throw new Error('Oversized protocol message.');
  process.stdout.write(text);
}

function argumentsFrom(args) {
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
  return { root: values['--root'], databasePath: values['--database'], port, host: '0.0.0.0' };
}

let lifecycle;
let refreshGate;
let timer;
let stopping = false;
let failed = false;
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
    const { startLanServer } = await import(pathToFileURL(path.join(options.root, 'server/lan.mjs')).href);
    lifecycle = createHostLifecycle({ start: startLanServer, options, emit });
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
