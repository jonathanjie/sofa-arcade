import { QUICK_TAP_TARGET } from '../../../../ui/party/games/snack-stack/cards.mjs';
import { boundedPoints, challenge, result } from './scoring.mjs';

export default challenge('quick-taps', (attempt, { kind, at }) => {
  if (kind !== 'tap') return attempt;
  const next = { ...attempt, count: attempt.count + 1 };
  return next.count === QUICK_TAP_TARGET ? result(next, at, 100) : next;
}, attempt => boundedPoints(100 * attempt.count / QUICK_TAP_TARGET));
