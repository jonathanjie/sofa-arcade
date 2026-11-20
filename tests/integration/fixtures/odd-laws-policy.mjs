import { SCENARIOS } from './odd-laws-scenarios.mjs';

/** Public-state decisions for real room/browser acceptance, never a private engine. */
export const phaseAction = (view, type, fields = {}) => ({
  type, matchId: view.matchId, phaseId: view.phaseId, ...fields,
});

export function councilCommitments(view, plan = SCENARIOS.bids[view.session - 1]) {
  return Object.fromEntries(['jon', 'lydia'].map((id, index) => [id, {
    choiceId: plan.keep ? 'keep' : view.council.optionIds[plan.sameChoice ? 0 : index],
    bid: Math.min(plan[id], view.players[id].influence),
  }]));
}

export function selectBuild(view, id, rules) {
  const slot = view.players[id].city.findIndex(plot => plot === null);
  if (slot < 0) return null;
  const candidates = view.market.map(stack => ({ stack, quote: rules.buildQuote(view, id, stack.designId) }))
    .filter(candidate => candidate.quote.allowed);
  candidates.sort((a, b) => {
    if (view.session === 1 && view.players[id].buildsThisSession === 0) {
      if (a.stack.designId === 'corner-shop') return -1;
      if (b.stack.designId === 'corner-shop') return 1;
    }
    return a.quote.cost - b.quote.cost || b.quote.prestige - a.quote.prestige || a.stack.designId.localeCompare(b.stack.designId);
  });
  if (!candidates.length) return null;
  return phaseAction(view, 'build', { designId: candidates[0].stack.designId, row: Math.floor(slot / 3), col: slot % 3 });
}

/** `rules` contains only the injected public preview helper(s). */
export function choosePublicAction(view, id, rules, policy = 'rich') {
  if (policy === 'tie') return phaseAction(view, 'work');
  if (policy === 'fill') return selectBuild(view, id, rules) || phaseAction(view, 'work');
  const index = 3 - view.actionsRemaining[id];
  // Deliberately asymmetric legal choice exercises a winner as well as the separate tie match.
  // This is an acceptance fixture, not a claim about a sensible human strategy.
  if (view.session === 6 && index === 0 && id === 'lydia') return phaseAction(view, 'lobby');
  const wanted = SCENARIOS.richActions[view.session][index];
  if (wanted === 'build') return selectBuild(view, id, rules) || phaseAction(view, 'work');
  if (wanted === 'festival' && (view.players[id].coins < 3 || view.players[id].festivalUsed)) return phaseAction(view, 'work');
  return phaseAction(view, wanted);
}
