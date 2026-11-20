/**
 * Deliberately small, deterministic heuristic policies, not optimal play.
 * This module receives projected views only and has no authority import.
 * Weights are hypotheses for exercising distinct routes, never changes to v0.2 rules.
 */
import { BUILDINGS, LAWS } from '../catalog.mjs';
import { buildQuote, streetOutcome, civicAward, incomeBonus, festivalBonus } from '../preview.mjs';

export const POLICY_IDS = Object.freeze(['economy', 'festival', 'civic', 'efficient-building']);
export const POLICY_VERSION = 'heuristics-1';
const buildingById = new Map(BUILDINGS.map(building => [building.id, building]));
const lawById = new Map(LAWS.map(law => [law.id, law]));
const other = seat => seat === 'jon' ? 'lydia' : 'jon';
const command = (view, type, fields = {}) => ({ type, matchId: view.matchId, phaseId: view.phaseId, ...fields });
const copy = value => JSON.parse(JSON.stringify(value));
const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const tieKey = action => `${action.type}:${action.designId ?? ''}:${action.row ?? ''}:${action.col ?? ''}`;
function validatePolicy(id) {
  if (!POLICY_IDS.includes(id)) throw new Error('Unknown policy.');
}
function cityWith(view, seat, designId, index) {
  const next = copy(view);
  next.players[seat].city[index] = { instanceId: 'hypothetical', designId };
  return next;
}
function ownLawValue(view, seat, policyId, lawId, category) {
  const player = view.players[seat];
  if (category === 'civic') {
    const now = civicAward(view, seat, lawId);
    // One to two scoring opportunities before the next Civic vote; no final multiplier.
    const rounds = view.session === 6 ? 1 : 2;
    const law = lawById.get(lawId);
    const guildPreference = policyId === 'civic' ? 'civic' : policyId === 'festival' ? 'culture' : policyId === 'economy' ? 'commerce' : null;
    const roomToBuild = player.city.includes(null);
    const prospective = roomToBuild && law?.effect.type === 'guildThreshold' && law.effect.guild === guildPreference ? 0.35 : 0;
    return now * rounds + prospective;
  }
  const imagined = { ...view, activeLaws: { ...view.activeLaws, economy: lawId } };
  const savings = view.market.filter(stack => stack.remaining > 0).map(stack => {
    const quote = buildQuote(imagined, seat, stack.designId);
    const design = buildingById.get(stack.designId);
    const preference = policyId === 'civic' && design.guild === 'civic' ? 1.45
      : policyId === 'festival' && design.guild === 'culture' ? 1.45
        : policyId === 'economy' && design.ability?.type === 'income' ? 1.5 : 1;
    return quote.discount.amount * preference;
  }).sort((a, b) => b - a);
  const openPlots = player.city.filter(plot => plot === null).length;
  const usable = Math.min(openPlots, lawId === 'open-tender' ? 1 : 2);
  const construction = savings.slice(0, usable).reduce((sum, value) => sum + value, 0) * 0.65;
  const work = lawId === 'honest-wages' ? (player.coins < 4 || openPlots === 0 ? 1.5 : 0.8) : 0;
  return construction + work;
}

/** Both policies decide before either commitment is submitted by the harness. */
export function chooseCouncil(view, seat, policyId) {
  validatePolicy(policyId);
  if (view.stage !== 'council' || !view.council || view.council.ownCommitment !== null) throw new Error('Policy needs an unlocked projected council.');
  const category = view.council.category;
  const currentLaw = view.activeLaws[category];
  const ranked = view.council.optionIds.map(choiceId => {
    const lawId = choiceId === 'keep' ? currentLaw : choiceId;
    const own = ownLawValue(view, seat, policyId, lawId, category);
    const rival = ownLawValue(view, other(seat), policyId, lawId, category);
    return { choiceId, value: own - rival * 0.55 };
  }).sort((a, b) => b.value - a.value || compareText(a.choiceId, b.choiceId));
  const best = ranked[0];
  const spread = best.value - ranked[ranked.length - 1].value;
  const policyBid = policyId === 'civic' ? (spread > 2.5 ? 3 : spread > 1 ? 2 : spread > 0.25 ? 1 : 0)
    : spread > 2.5 ? 2 : spread > 0.8 ? 1 : 0;
  // Retain influence for later ballots unless the current differential is material.
  const reserve = view.session < 5 && policyId !== 'civic' ? 1 : 0;
  const bid = Math.min(3, Math.max(0, view.players[seat].influence - reserve), policyBid);
  return command(view, 'commitCouncil', { choiceId: best.choiceId, bid });
}

function placementPotential(view, seat, index, designId) {
  const row = Math.floor(index / 3);
  const prospective = view.players[seat].city.slice(row * 3, row * 3 + 3);
  prospective[index % 3] = { designId };
  const ids = prospective.filter(Boolean).map(card => buildingById.get(card.designId).guild);
  if (ids.length === 3) return new Set(ids).size === 2 ? -0.7 : 0;
  return ids.length === 2 ? 0.3 : 0.08;
}
function buildValue(view, seat, policyId, design, quote, index) {
  const street = streetOutcome(view, seat, Math.floor(index / 3), index % 3, design.id);
  const remainingIncomes = 6 - view.session;
  const emptyPlots = view.players[seat].city.filter(plot => plot === null).length;
  let value = design.prestige * (policyId === 'efficient-building' ? 1.3 : 1.1)
    + street.prestige * 1.3 - quote.cost * 0.45
    + placementPotential(view, seat, index, design.id);
  const ability = design.ability?.type;
  if (ability === 'income' && incomeBonus(view, seat) < 2) value += remainingIncomes * (policyId === 'economy' ? 1.05 : 0.5);
  if (ability === 'firstBuildDiscount' && !view.players[seat].city.some(card => card && buildingById.get(card.designId).ability?.type === 'firstBuildDiscount')) {
    value += Math.min(remainingIncomes, emptyPlots - 1) * (policyId === 'economy' ? 0.8 : 0.35);
  }
  if (ability === 'festivalBonus' && festivalBonus(view, seat) === 0) value += (7 - view.session) * (policyId === 'festival' ? 1.1 : 0.15);
  if (ability === 'influenceOnBuild') value += quote.influenceGain * (policyId === 'civic' ? 0.75 : 0.15);
  if (policyId === 'civic' && design.guild === 'civic') value += 0.8;
  if (policyId === 'festival' && design.guild === 'culture') value += 0.35;
  const projected = cityWith(view, seat, design.id, index);
  const awardGain = civicAward(projected, seat) - civicAward(view, seat);
  value += awardGain * (view.session % 2 === 0 && view.session < 6 ? 2 : 1) * (policyId === 'civic' ? 1.5 : 0.8);
  // Preserve scarce late slots: a heuristic opportunity cost, not an extra rule.
  if (view.session < 5 && emptyPlots <= 3) value -= (5 - view.session) * 1.25;
  return value;
}

/** Generate legal candidates from public data; no full-state engine or hidden choice access. */
export function chooseCityAction(view, seat, policyId) {
  validatePolicy(policyId);
  if (view.stage !== 'actions' || view.activePlayer !== seat) throw new Error('Policy needs its own projected city turn.');
  const player = view.players[seat];
  const emptyPlots = player.city.flatMap((plot, index) => plot === null ? [index] : []);
  const candidates = [];
  const workGain = view.activeLaws.economy === 'honest-wages' ? 4 : 3;
  const costlyAvailable = view.market.some(stack => stack.remaining > 0 && buildQuote(view, seat, stack.designId).cost > player.coins);
  const liquidity = player.coins < 3 || (costlyAvailable && player.coins < 6) ? 2.1 : 0;
  candidates.push({ action: command(view, 'work'), value: workGain * 0.4 + liquidity });
  const nextAgenda = view.agenda[view.session];
  const politicalNeed = nextAgenda && Math.max(...nextAgenda.lawIds.map(id => ownLawValue(view, seat, policyId, id, nextAgenda.category))) > 1.5;
  if (policyId === 'civic' && view.session < 6 && player.influence <= 1 && politicalNeed) {
    candidates.push({ action: command(view, 'lobby'), value: 2.7 });
  }
  if (player.coins >= 3 && !player.festivalUsed) {
    const points = 3 + festivalBonus(view, seat);
    const value = points * (policyId === 'festival' ? 1.55 : 1) - 1.35 + (emptyPlots.length === 0 ? 1.4 : 0);
    candidates.push({ action: command(view, 'festival'), value });
  }
  for (const stack of view.market) {
    const quote = buildQuote(view, seat, stack.designId);
    if (!quote.allowed) continue;
    const design = buildingById.get(stack.designId);
    for (const index of emptyPlots) candidates.push({
      action: command(view, 'build', { designId: design.id, row: Math.floor(index / 3), col: index % 3 }),
      value: buildValue(view, seat, policyId, design, quote, index),
    });
  }
  candidates.sort((a, b) => b.value - a.value || compareText(tieKey(a.action), tieKey(b.action)));
  return candidates[0].action;
}
