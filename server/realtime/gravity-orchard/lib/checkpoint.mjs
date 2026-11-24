import { LIMITS, actorKey, checkedView, commandFingerprint, exactKeys, identifier, isRecord, normalizeCommand, roomIdentifier } from './protocol.mjs';

export function errorWithCode(code) {
  return Object.assign(new Error(code), { code });
}

/** An explicit v0 -> v1 migration for fixtures/early coordinator checkpoints. */
export function migrateCheckpoint(raw) {
  if (!isRecord(raw) || raw.gameId !== 'gravity-orchard' || ![0, 1].includes(raw.coordinatorSchema)) {
    throw errorWithCode('unsupported_checkpoint');
  }
  if (Buffer.byteLength(JSON.stringify(raw)) > LIMITS.maxCheckpointBytes) throw errorWithCode('invalid_checkpoint');
  if (raw.coordinatorSchema === 0) {
    if (Object.hasOwn(raw, 'commands')) throw errorWithCode('invalid_checkpoint');
    return { ...structuredClone(raw), coordinatorSchema: 1, commands: [] };
  }
  return structuredClone(raw);
}

export function encodeCheckpoint(room, state, view, dedup, simulation, metadata = room) {
  const result = {
    gameId: 'gravity-orchard', coordinatorSchema: 1, roomCode: room.roomCode,
    matchId: view.matchId, runEpoch: view.runEpoch, seed: metadata.seed,
    options: { mode: metadata.options.mode },
    engine: simulation.serializeCheckpoint(state),
    commands: [...dedup.values()].map((entry) => structuredClone(entry)),
  };
  const encoded = JSON.stringify(result);
  if (Buffer.byteLength(encoded) > LIMITS.maxCheckpointBytes) throw errorWithCode('invalid_checkpoint');
  return JSON.parse(encoded);
}

export function decodeCheckpoint(raw, roomCode, simulation) {
  const value = migrateCheckpoint(raw);
  if (!roomIdentifier(value.roomCode) || value.roomCode !== roomCode || !identifier(value.matchId)
    || !Number.isSafeInteger(value.runEpoch) || value.runEpoch < 0 || !identifier(value.seed)
    || !exactKeys(value.options, ['mode']) || !['campaign', 'practice'].includes(value.options.mode)
    || !Array.isArray(value.commands) || value.commands.length > LIMITS.maxDedupRecords) {
    throw errorWithCode('invalid_checkpoint');
  }
  const dedup = new Map();
  for (const entry of value.commands) {
    if (!exactKeys(entry, ['actor', 'command', 'fingerprint', 'result'])
      || !['host:', 'player:jon', 'player:lydia'].includes(entry.actor)) throw errorWithCode('invalid_checkpoint');
    const command = normalizeCommand(entry.command);
    if (!command || entry.fingerprint !== commandFingerprint(command)
      || !(exactKeys(entry.result, ['type', 'protocol', 'id', 'accepted'])
        || (exactKeys(entry.result, ['type', 'protocol', 'id', 'accepted', 'code'])
          && typeof entry.result.code === 'string' && /^[a-z0-9_-]{1,64}$/.test(entry.result.code)))
      || entry.result.type !== 'command-result' || entry.result.protocol !== 1
      || entry.result.id !== command.id || typeof entry.result.accepted !== 'boolean') throw errorWithCode('invalid_checkpoint');
    const key = `${entry.actor}:${command.id}`;
    if (dedup.has(key)) throw errorWithCode('invalid_checkpoint');
    dedup.set(key, entry);
  }
  let state;
  try { state = simulation.restoreCheckpoint(value.engine); }
  catch { throw errorWithCode('invalid_checkpoint'); }
  let view = checkedView(simulation, state);
  if (view.matchId !== value.matchId || view.runEpoch < value.runEpoch) throw errorWithCode('invalid_checkpoint');
  if (view.phase !== 'paused' || view.runEpoch <= value.runEpoch) {
    state = simulation.pauseForSystem(state, 'recovery');
    view = checkedView(simulation, state);
  }
  if (view.phase !== 'paused' || view.runEpoch <= value.runEpoch
    || view.ready.jon || view.ready.lydia || view.pauseReason !== 'recovery') throw errorWithCode('invalid_checkpoint');
  return { state, view, dedup, seed: value.seed, options: value.options };
}

export function insertDedup(room, actor, command, result = { type: 'command-result', protocol: 1, id: command.id, accepted: true }) {
  const dedup = new Map(room.dedup);
  // Keep half the current epoch's budget available for changes to the run.
  const changesRun = result.accepted && (command.kind !== 'ready' || command.payload.value !== room.view.ready[actor.playerId]);
  const limit = changesRun ? LIMITS.maxDedupRecords : Math.floor(LIMITS.maxDedupRecords / 2);
  if (dedup.size >= limit) {
    for (const [key, value] of dedup) {
      if (value.command.matchId !== room.view.matchId || value.command.runEpoch !== room.view.runEpoch) {
        dedup.delete(key);
        if (dedup.size < limit) break;
      }
    }
  }
  if (dedup.size >= limit) throw errorWithCode('command_capacity');
  const entry = { actor: actorKey(actor), command, fingerprint: commandFingerprint(command), result };
  dedup.set(`${entry.actor}:${command.id}`, entry);
  return { dedup, entry };
}
