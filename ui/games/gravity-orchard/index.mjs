/** GO7: one authenticated realtime owner for the assembled public game views. */
import { createRealtimeClient } from '../../realtime/gravity-orchard/index.mjs';
import { mountPhone } from './phone/index.mjs';
import { mountTV } from './tv/index.mjs';
import { mountTutorial } from './tutorial/index.mjs';
import * as geometry from '../../../games/gravity-orchard/geometry.mjs';
import { MANIFEST } from '../../media/gravity-orchard/manifest.mjs';
import * as score from '../../media/gravity-orchard/score.mjs';
import { CUE_POLICY } from '../../media/gravity-orchard/events.mjs';

export { mountTutorial, score };
export const GAME_ID = 'gravity-orchard';
const SAFE_INPUT = Object.freeze({x: 0, y: 0, brake: true});
const PHASES = new Set(['waiting', 'countdown', 'playing', 'paused', 'interlude', 'finished']);
const SCENES = new Set(['menu', 'practice', 'stage1', 'stage2', 'stage3', 'paused', 'celebrate']);

/** Translate the final pack's state records into GO4's state-specific atlas entries. */
export function createOrchardAssets(manifest = MANIFEST) {
  const assets = {...manifest.assets};
  const characterStates = {};
  for (const [actor, states] of Object.entries(manifest.characterStates)) {
    characterStates[actor] = {};
    for (const [pose, state] of Object.entries(states)) {
      const atlas = manifest.assets[state.asset];
      const key = `character-${actor}-${pose}`;
      const ordered = [state.reducedMotionFrame, ...state.frames.filter(name => name !== state.reducedMotionFrame)];
      assets[key] = {...atlas, frames: ordered.map(name => ({...atlas.frames[name]}))};
      characterStates[actor][pose] = key;
    }
  }
  return Object.freeze({ assets: Object.freeze(assets), characterStates: Object.freeze(characterStates),
    resolve(key) {
      const canonical = key.replaceAll('.', '-');
      return assets[canonical] || assets[`${canonical}-ordinary`] || null;
    },
  });
}

/** Shared scheduler only. Consume IDs even while muted, and prefer significant simultaneous cues. */
export function createOrchardSound(sound, {role = 'host', now = () => performance.now()} = {}) {
  let disposed = false, matchId = null, epoch = null, queued = [], scheduled = false;
  const seen = new Set(), lastAt = new Map();
  function reset(view) {
    if (view.matchId !== matchId || view.runEpoch !== epoch) {
      const changedMatch = view.matchId !== matchId;
      matchId = view.matchId; epoch = view.runEpoch; queued = []; lastAt.clear();
      if (changedMatch) seen.clear();
    }
  }
  return Object.freeze({
    reset,
    setScene(scene) {
      if (!disposed && role === 'host' && SCENES.has(scene)) sound?.setContext?.({scoreScene: scene});
    },
    effect(name, {id} = {}) {
      if (disposed || role !== 'host' || !Object.hasOwn(CUE_POLICY, name) || typeof id !== 'string' || !matchId) return;
      const identity = `${matchId}|${id}`;
      if (seen.has(identity)) return;
      seen.add(identity); while (seen.size > 512) seen.delete(seen.values().next().value);
      queued.push({name, identity, epoch});
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        const ready = queued; queued = [];
        if (disposed) return;
        ready.sort((a,b) => CUE_POLICY[b.name].priority - CUE_POLICY[a.name].priority);
        const cue = ready.find(entry => entry.epoch === epoch && now() - (lastAt.get(entry.name) ?? -Infinity) >= CUE_POLICY[entry.name].cooldownMs);
        if (cue) { lastAt.set(cue.name, now()); sound?.effect?.(cue.name); }
      });
    },
    dispose() {disposed = true; queued = []; seen.clear(); lastAt.clear();},
  });
}

export function realtimeURL(origin = globalThis.location?.origin) {
  const url = new URL('/api/realtime/gravity-orchard', origin);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new TypeError('A local game origin is required.');
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.href;
}

/** No bearer, private state, checkpoint or mutable physics is exposed to a mounted view. */
export function mountGravityOrchard(root, {
  viewer, code, token, initialRoom, sound = {}, preferences = {},
  onView = () => {}, onStatus = () => {}, onExit = () => {}, origin = globalThis.location?.origin,
} = {}, dependencies = {}) {
  if (!root?.ownerDocument || !['host','player'].includes(viewer?.role) || viewer.role === 'player' && !['jon','lydia'].includes(viewer.playerId)) throw new TypeError('An authenticated game viewer is required.');
  viewer = Object.freeze({role: viewer.role, playerId: viewer.playerId ?? null});
  const makeClient = dependencies.createRealtimeClient || createRealtimeClient;
  const mount = viewer.role === 'player' ? dependencies.mountPhone || mountPhone : dependencies.mountTV || mountTV;
  const clock = () => root.ownerDocument.defaultView?.performance?.now?.() ?? performance.now();
  const assets = createOrchardAssets();
  const cues = createOrchardSound(sound, {role: viewer.role, now: clock});
  let disposed = false, presentation = null, client = null, latest = null, presence = null;
  let status = {state: 'connecting'}, commandSerial = 0, receivedLive = false, countdownId = null;
  const commandPrefix = globalThis.crypto?.randomUUID?.() || `host-${Math.round(clock())}`;
  function reportStatus(next) {
    if (disposed) return;
    status = next;
    presentation?.setConnection({...status, ...(presence ? {presence} : {})});
    onStatus(status);
  }
  function sendCommand(command) {
    if (disposed) return Promise.reject(new Error('This garden has closed.'));
    const id = command.id || `${commandPrefix}:${++commandSerial}`;
    return client.sendCommand({id, kind: command.kind, payload: command.payload || {}});
  }
  function accept(view, nextPresence) {
    if (disposed || view?.gameId !== GAME_ID || !PHASES.has(view.phase)) return false;
    if (latest?.matchId === view.matchId && (view.runEpoch < latest.runEpoch || view.runEpoch === latest.runEpoch && view.tick < latest.tick)) return false;
    if (nextPresence) presence = nextPresence;
    cues.reset(view);
    const nextCountdownId = view.phase === 'countdown' ? `countdown:${view.matchId}:${view.runEpoch}:${Math.max(1,Math.ceil(view.countdownTicks/60))}` : null;
    if (receivedLive && nextCountdownId && nextCountdownId !== countdownId) cues.effect('countdown', {id: nextCountdownId});
    countdownId = nextCountdownId;
    presentation.setConnection({...status, ...(presence ? {presence} : {})});
    presentation.update(view);
    latest = view;
    root.dataset.matchId = view.matchId;
    root.dataset.runEpoch = String(view.runEpoch);
    root.dataset.tick = String(view.tick);
    root.dataset.phase = view.phase;
    onView(view);
    return true;
  }
  client = makeClient({url: realtimeURL(origin), roomCode: code, token,
    onStatus: reportStatus,
    onSnapshot(snapshot) {
      if (disposed) return;
      const authenticated = client.getStats().viewer;
      if (authenticated && (authenticated.role !== viewer.role || authenticated.playerId !== (viewer.playerId ?? null))) {
        reportStatus({state:'error',message:'This room credential belongs to a different view. Rejoin the room.'});
        client.dispose(); return;
      }
      // A validated welcome snapshot precedes the client's connected callback.
      status = {state: 'connected'};
      accept(snapshot.view, snapshot.presence);
      receivedLive = true;
    },
  });
  const common = {assets, onCommand: sendCommand, onExit, reducedMotion: preferences.reducedMotion};
  if (viewer.role === 'host') {
    sound.setScore?.(GAME_ID, score);
    sound.setContext?.({role: 'host', view: 'game', scoreScene: 'menu'});
    presentation = mount(root, {...common, geometry, sound: cues, now: clock});
  } else {
    sound.setContext?.({role: 'player', view: 'game'});
    presentation = mount(root, {...common, playerId: viewer.playerId, input: {setInput: value => !disposed && client.setInput(value)}});
    // GO3 accepts an image source; crop the final atlas to its authored idle frame.
    const state = MANIFEST.characterStates[viewer.playerId].idle;
    const atlas = MANIFEST.assets[state.asset], frame = atlas.frames[state.reducedMotionFrame];
    const portrait = root.querySelector?.('[data-go3="portrait"] img');
    if (portrait) Object.assign(portrait.style, {width: `${atlas.width / frame.width * 100}%`, height: `${atlas.height / frame.height * 100}%`, maxWidth: 'none', objectFit: 'fill', transform: `translate(${-frame.x / atlas.width * 100}%, ${-frame.y / atlas.height * 100}%)`});
  }
  if (initialRoom?.state) accept(initialRoom.state);
  client.connect();
  return Object.freeze({
    receive(room) {
      // HTTP/SSE maintains coarse room lifecycle. Once realtime is established,
      // its ordered stream owns presentation; an old HTTP completion cannot rewind it.
      if (!disposed && !latest && room?.code === code && room.gameId === GAME_ID) accept(room.state);
    },
    sendCommand,
    getStats() {return client.getStats();},
    pause(reason = 'help') {
      client.setInput(SAFE_INPUT);
      if (!['playing','countdown'].includes(latest?.phase)) return Promise.resolve({accepted: true});
      return sendCommand({kind:'pause',payload:{reason}});
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      presentation?.dispose(); client.setInput(SAFE_INPUT); client.dispose(); cues.dispose();
      for (const key of ['matchId','runEpoch','tick','phase']) delete root.dataset[key];
    },
  });
}
