/** Public, pure v0.2 arithmetic. Safe to ship to a browser; no authority imports. */
import { BUILDINGS, LAWS } from './catalog.mjs';
import { RuleError } from './errors.mjs';

const buildings = new Map(BUILDINGS.map(building => [building.id, building]));
const laws = new Map(LAWS.map(law => [law.id, law]));
const playerIds = ['jon', 'lydia'];

function playerFor(view, playerId) {
  if (!playerIds.includes(playerId)) throw new RuleError('INVALID_PLAYER', 'Choose a valid player.');
  const player = view?.players?.[playerId];
  if (!player || !Array.isArray(player.city) || player.city.length !== 9) {
    throw new RuleError('INVALID_VIEW', 'A valid city view is required.');
  }
  return player;
}

function buildingFor(designId) {
  const building = buildings.get(designId);
  if (!building) throw new RuleError('INVALID_DESIGN', 'Choose a known building.');
  return building;
}

function lawFor(lawId, category) {
  if (lawId === `${category}-neutral`) return null;
  const law = laws.get(lawId);
  if (!law || law.category !== category) {
    throw new RuleError('INVALID_LAW', 'Choose a law from the correct category.');
  }
  return law;
}

function cityBuildings(player) {
  return player.city.filter(Boolean).map(instance => buildingFor(instance.designId));
}

function abilityTotal(player, type) {
  return cityBuildings(player).reduce((total, building) => (
    total + (building.ability?.type === type ? building.ability.amount : 0)
  ), 0);
}

function qualifiesStreet(row) {
  if (row.length !== 3 || row.some(instance => instance === null)) return false;
  const guildCount = new Set(row.map(instance => buildingFor(instance.designId).guild)).size;
  return guildCount === 1 || guildCount === 3;
}

/** Established income icons only; Commerce guild membership is not an income icon. */
export function incomeBonus(view, playerId) {
  return Math.min(2, abilityTotal(playerFor(view, playerId), 'income'));
}

/** Existing Festival icons have a citywide +1 cap, including duplicate buildings. */
export function festivalBonus(view, playerId) {
  return Math.min(1, abilityTotal(playerFor(view, playerId), 'festivalBonus'));
}

/**
 * Preview the single greatest pre-action discount, including its actual reduction.
 * All known-design arithmetic remains available when this Build is unavailable.
 */
export function buildQuote(view, playerId, designId) {
  const player = playerFor(view, playerId);
  const building = buildingFor(designId);
  const law = lawFor(view.activeLaws?.economy, 'economy');
  const firstBuild = player.buildsThisSession === 0;
  const workshop = firstBuild && abilityTotal(player, 'firstBuildDiscount') > 0 ? 1 : 0;
  const effect = law?.effect;
  const lawDiscount = (
    (effect?.type === 'guildDiscount' && effect.guild === building.guild)
    || (effect?.type === 'firstBuildDiscount' && firstBuild)
  ) ? effect.amount : 0;
  // Prefer the law on an eligible tie so every viewer labels the same source.
  const selected = lawDiscount >= workshop && lawDiscount > 0
    ? { amount: lawDiscount, sourceId: law.id }
    : { amount: workshop, sourceId: workshop > 0 ? 'workshop' : null };
  const cost = Math.max(1, building.cost - selected.amount);
  const discount = { amount: building.cost - cost, sourceId: selected.sourceId };
  const influenceGain = building.ability?.type === 'influenceOnBuild'
    ? Math.max(0, Math.min(building.ability.amount, 6 - player.influence))
    : 0;

  let reason = null;
  if (view.phase !== 'playing' || view.stage !== 'actions') reason = 'Build during a city turn.';
  else if (view.activePlayer !== playerId) reason = 'Wait for your turn.';
  else if (building.term !== view.term || !view.market?.some(stack => stack.designId === designId && stack.remaining > 0)) {
    reason = 'This building is not available.';
  } else if (!player.city.includes(null)) reason = 'Your city is full.';
  else if (player.coins < cost) reason = 'Not enough coins.';

  return {
    allowed: reason === null,
    reason,
    printedCost: building.cost,
    cost,
    discount,
    influenceGain,
    prestige: building.prestige,
  };
}

/** Hypothetical placement ignores action timing, affordability, and market stock. */
export function streetOutcome(view, playerId, row, col, designId) {
  const player = playerFor(view, playerId);
  buildingFor(designId);
  if (!Number.isInteger(row) || row < 0 || row > 2 || !Number.isInteger(col) || col < 0 || col > 2) {
    throw new RuleError('INVALID_PLOT', 'Choose a plot within the city.');
  }
  if (player.city[row * 3 + col] !== null) {
    return { canPlace: false, reason: 'Choose an empty plot.', completes: false, qualifies: false, prestige: 0 };
  }
  const street = player.city.slice(row * 3, row * 3 + 3);
  street[col] = { designId };
  const completes = street.every(instance => instance !== null);
  const qualifies = completes && qualifiesStreet(street);
  return {
    canPlace: true,
    reason: null,
    completes,
    qualifies,
    prestige: qualifies && !player.streetEvaluated[row] ? 2 : 0,
  };
}

function thresholdPoints(thresholds, count) {
  return thresholds.reduce((points, threshold) => (
    count >= threshold.atLeast ? Math.max(points, threshold.points) : points
  ), 0);
}

/** Evaluate one prospective Civic award from this public city's current snapshot. */
export function civicAward(view, playerId, lawId = view.activeLaws.civic) {
  const player = playerFor(view, playerId);
  const law = lawFor(lawId, 'civic');
  if (!law) return 0;
  const effect = law.effect;
  const city = cityBuildings(player);
  let points = 0;
  if (effect.type === 'guildThreshold') {
    points = thresholdPoints(effect.thresholds, city.filter(building => building.guild === effect.guild).length);
  } else if (effect.type === 'diversityThreshold') {
    points = thresholdPoints(effect.thresholds, new Set(city.map(building => building.guild)).size);
  } else if (effect.type === 'streetCount') {
    let count = 0;
    for (let row = 0; row < 3; row++) {
      if (qualifiesStreet(player.city.slice(row * 3, row * 3 + 3))) count++;
    }
    points = Math.min(effect.cap, count * effect.pointsEach);
  }
  return Math.min(2, points);
}

/** Printed prestige is derived once from the city; secured components never rescore. */
export function scoreBreakdown(view, playerId) {
  const player = playerFor(view, playerId);
  const buildings = cityBuildings(player).reduce((sum, building) => sum + building.prestige, 0);
  const streets = player.score.streets;
  const festivals = player.score.festivals;
  const civic = player.score.civic;
  const treasury = Math.min(4, Math.floor(player.coins / 3));
  return { buildings, streets, festivals, civic, treasury, total: buildings + streets + festivals + civic + treasury };
}
