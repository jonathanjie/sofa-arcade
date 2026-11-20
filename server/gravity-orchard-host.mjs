/** Local-only composition of the reviewed simulation, room credentials and WS authority. */
import * as simulation from '../games/gravity-orchard/engine.mjs';
import { getGame } from '../games/catalog.mjs';
import { getGameEngine, gravityOrchardRoomEngine } from '../games/registry.mjs';
import { createRoomApi } from './rooms.mjs';
import { createRealtimeCoordinator, readCoordinatorDiagnostics } from './runtime/gravity-orchard-dependencies.mjs';

const GAME_ID = 'gravity-orchard';
const PUBLIC = Object.freeze({ role: 'public', playerId: null });
const fail = code => Object.assign(new Error('The local harvest is unavailable.'), { code, status: 503 });

/** All storage calls use the host's existing SQLite connection, never a second DB. */
export function createGravityOrchardHost({ sqlite, DB, validateUpgrade, onLifecycle, clock, seed, enabled = false }) {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS sofa_gravity_checkpoints (
    code TEXT PRIMARY KEY NOT NULL REFERENCES sofa_rooms(code) ON DELETE CASCADE,
    checkpoint TEXT NOT NULL, updated_at INTEGER NOT NULL
  )`);
  const starting = new Map();
  const activeRooms = new Set();
  const failedRooms = new Set();
  let closed = false;
  let checkpointWrites = 0;
  let authority;

  function roomRecord(code) {
    const row = sqlite.prepare('SELECT code, data, revision, expires_at FROM sofa_rooms WHERE code = ?').get(code);
    if (!row || row.expires_at <= Date.now()) throw fail('room_unavailable');
    const data = JSON.parse(row.data);
    if (data.gameId !== GAME_ID) throw fail('wrong_game');
    return { ...row, data };
  }

  const coordinator = createRealtimeCoordinator({
    simulation, clock, validateUpgrade,
    authorize: args => authority.authorizeRealtime(args, { DB }),
    async loadCheckpoint(code) {
      roomRecord(code);
      const row = sqlite.prepare('SELECT checkpoint FROM sofa_gravity_checkpoints WHERE code = ?').get(code);
      return row ? JSON.parse(row.checkpoint) : null;
    },
    async saveCheckpoint(code, checkpoint) {
      // GO2 supplies a checked, private GO1 checkpoint. Project its exact saved
      // state without calling restoreCheckpoint (which deliberately changes epoch).
      const view = simulation.project(checkpoint.engine.state, PUBLIC);
      if (checkpoint.roomCode !== code || checkpoint.gameId !== GAME_ID
        || checkpoint.coordinatorSchema !== 1 || view.matchId !== checkpoint.matchId
        || view.runEpoch !== checkpoint.runEpoch) throw fail('checkpoint_invalid');
      const encoded = JSON.stringify(checkpoint);
      if (Buffer.byteLength(encoded) > 1024 * 1024) throw fail('checkpoint_invalid');
      const now = Date.now();
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const room = roomRecord(code);
        const data = { ...room.data, state: view,
          phase: view.phase === 'finished' ? 'finished' : 'playing', recentActions: [],
          realtime: { matchId: view.matchId, seed: checkpoint.seed, options: checkpoint.options } };
        sqlite.prepare(`INSERT INTO sofa_gravity_checkpoints (code, checkpoint, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(code) DO UPDATE SET checkpoint = excluded.checkpoint, updated_at = excluded.updated_at`)
          .run(code, encoded, now);
        sqlite.prepare('UPDATE sofa_rooms SET data = ?, revision = revision + 1, updated_at = ? WHERE code = ?')
          .run(JSON.stringify(data), now, code);
        sqlite.exec('COMMIT');
        checkpointWrites++;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
    onLifecycle: packet => onLifecycle?.(packet),
  });

  async function ensureRoom(code, proposed = null) {
    if (!enabled || closed || failedRooms.has(code)) throw fail('realtime_unavailable');
    const current = coordinator.getPublicView(code, PUBLIC);
    if (current) return current;
    if (activeRooms.has(code)) throw fail('realtime_unavailable');
    if (starting.has(code)) return starting.get(code);
    const promise = (async () => {
      const room = roomRecord(code);
      const persisted = room.data.realtime;
      if (!persisted && !proposed) throw fail('game_not_started');
      const parameters = persisted ? { roomCode: code, ...persisted } : { ...proposed, ...(seed === undefined ? {} : { seed }) };
      if (!['jon', 'lydia'].every(id => room.data.seats[id])) throw fail('players_required');
      const snapshot = await coordinator.startRoom(parameters);
      activeRooms.add(code);
      return snapshot.view;
    })();
    starting.set(code, promise);
    try { return await promise; }
    catch (error) { failedRooms.add(code); throw error; }
    finally { starting.delete(code); }
  }

  authority = createRoomApi({
    resolveGame: id => id === GAME_ID && enabled ? { ...getGame(id), status: 'playable' } : getGame(id),
    resolveEngine: id => id === GAME_ID ? (enabled ? gravityOrchardRoomEngine : null) : getGameEngine(id),
    realtime: {
      startRoom: parameters => ensureRoom(parameters.roomCode, parameters),
      ensureRoom,
      getPublicView: (code, viewer) => coordinator.getPublicView(code, viewer),
    },
  });

  return {
    authority,
    handleUpgrade: coordinator.handleUpgrade,
    /** Restore before accepting sockets, so refresh/reconnect needs no HTTP race. */
    async restoreExisting() {
      if (!enabled) return;
      const rows = sqlite.prepare('SELECT code, data FROM sofa_rooms WHERE expires_at > ? ORDER BY updated_at DESC').all(Date.now());
      let restored = 0;
      for (const row of rows) {
        let data;
        try { data = JSON.parse(row.data); } catch { continue; }
        if (data.gameId !== GAME_ID || !data.realtime) continue;
        if (++restored > 32) { failedRooms.add(row.code); continue; }
        // A damaged orchard cannot stop old games or silently reset that harvest.
        await ensureRoom(row.code).catch(() => {});
      }
    },
    async pauseAllForSystem(reason = 'network') {
      if (!['network', 'host-stall', 'recovery'].includes(reason)) throw new TypeError('Invalid pause reason.');
      await Promise.all([...activeRooms].map(code => coordinator.pauseRoom(code, reason)));
    },
    diagnostics(code) {
      return { checkpointWrites, databaseChanges: Number(sqlite.prepare('SELECT total_changes() AS count').get().count),
        coordinator: readCoordinatorDiagnostics(coordinator, code) };
    },
    async close() {
      if (closed) return;
      closed = true;
      await Promise.allSettled([...starting.values()]);
      await Promise.allSettled([...activeRooms].map(code => coordinator.pauseRoom(code, 'network')));
      await coordinator.close();
    },
  };
}
