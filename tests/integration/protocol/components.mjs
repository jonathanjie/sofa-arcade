import { access } from 'node:fs/promises';
import { getGame } from '../../../games/catalog.mjs';
import { getGameEngine } from '../../../games/registry.mjs';
import * as rooms from '../../../server/rooms.mjs';
import { startFixtureServer } from './harness.mjs';

export const ODD_GAME_ID = 'odd-laws-society';

/** Preparatory runs show named skips; the final acceptance command must set this to 1. */
export async function oddComponents(t) {
  const missing = [];
  for (const filename of ['engine.mjs', 'preview.mjs', 'catalog.mjs']) {
    try { await access(new URL(`../../../games/odd-laws-society/${filename}`, import.meta.url)); }
    catch { missing.push(`WS1 games/odd-laws-society/${filename}`); }
  }
  if (typeof rooms.createRoomApi !== 'function') missing.push('WS2 createRoomApi injection handoff');
  if (missing.length) {
    const message = `Integration dependency unavailable: ${missing.join('; ')}. This is not Odd Laws acceptance.`;
    if (process.env.SOFA_INTEGRATION_REQUIRE_COMPONENTS === '1') throw new Error(message);
    t.skip(message);
    return null;
  }
  const [authority, previews, catalog] = await Promise.all([
    import('../../../games/odd-laws-society/engine.mjs'),
    import('../../../games/odd-laws-society/preview.mjs'),
    import('../../../games/odd-laws-society/catalog.mjs'),
  ]);
  return { engine: authority.engine, previews, catalog };
}

export function seedForChair(engine, chair) {
  for (let index = 0; index < 100; index++) {
    const seed = `ws6-protocol-${index}`;
    const view = engine.project(engine.create({ seed, matchId: 'ws6-chair-search' }), { role: 'host' });
    if (view.chair === chair) return seed;
  }
  throw new Error(`No deterministic seed produced initial Chair ${chair}.`);
}

/** Only setup seed is pinned. All rules, authentication, persistence, CAS and projection are real. */
export async function oddServer(components, { chair = 'jon', ...options } = {}) {
  const seed = seedForChair(components.engine, chair);
  const engine = Object.freeze({
    ...components.engine,
    create: args => components.engine.create({ ...args, seed }),
  });
  const roomApi = rooms.createRoomApi({
    resolveGame: id => id === ODD_GAME_ID ? { ...getGame(id), status: 'playable' } : getGame(id),
    resolveEngine: id => id === ODD_GAME_ID ? engine : getGameEngine(id),
  });
  // The WS2 handoff owns the seam. This must reach both HTTP and each SSE subscriber.
  return startFixtureServer({ ...options, roomApi });
}
