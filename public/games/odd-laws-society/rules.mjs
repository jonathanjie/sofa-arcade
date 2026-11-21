/**
 * Public, data-only rule switches for Odd Laws Society. Safe to ship to a browser.
 *
 * Rules v0.3 is a base game plus optional modules:
 * - Base v0.3 (no modules): v0.2 plus winner-pays councils, Rebuild, and the
 *   player who is behind chairs the session. It keeps the v0.2 two-copy market
 *   of 18 designs.
 * - Grand Market: a single-copy market dealt from a 30-design pool (8 per term,
 *   4 face up), two-copy income staples, no duplicate designs in one city, 12
 *   effect designs, the Culture Festival, and sponsors with Festival influence.
 * - Back-Room Deals (needs Grand Market): Scout draws blind into a private
 *   reserve of up to 2 cards.
 *
 * Each placement was chosen by bot sweeps; see the simulation README. For
 * example, sponsors made the two-copy base game too political, but they
 * balance the Grand Market.
 */
export const MODULES = Object.freeze({ GRAND_MARKET: 'grand-market', BACK_ROOM: 'back-room' });
export const MODULE_IDS = Object.freeze(Object.values(MODULES));
const MODULE_REQUIREMENTS = Object.freeze({ [MODULES.BACK_ROOM]: [MODULES.GRAND_MARKET] });


/** Returns a canonical module list, or null if the list is invalid. */
export function normalizeModules(modules) {
  if (!Array.isArray(modules) || modules.some(id => !MODULE_IDS.includes(id))) return null;
  const unique = MODULE_IDS.filter(id => modules.includes(id));
  if (unique.length !== modules.length) return null;
  for (const id of unique) {
    if ((MODULE_REQUIREMENTS[id] ?? []).some(required => !unique.includes(required))) return null;
  }
  return unique;
}

/** Which rules apply to a full state or a projected view. */
export function features(view) {
  const v03 = view?.rulesVersion === '0.3';
  const modules = v03 && Array.isArray(view.modules) ? view.modules : [];
  const has = id => modules.includes(id);
  const grandMarket = has(MODULES.GRAND_MARKET);
  return Object.freeze({
    v03,
    // Base v0.3.
    winnerPays: v03,
    rebuild: v03,
    trailingChair: v03,
    // Grand Market.
    grandMarket,
    cultureFestival: grandMarket,
    sponsors: grandMarket,
    festivalInfluence: grandMarket,
    // Back-Room Deals.
    backRoom: has(MODULES.BACK_ROOM),
  });
}
