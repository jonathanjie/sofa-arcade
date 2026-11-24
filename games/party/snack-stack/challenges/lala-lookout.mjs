import { LALA_TAPS, lalaLooks } from '../../../../ui/party/games/snack-stack/cards.mjs';
import { boundedPoints, challenge, result, speed } from './scoring.mjs';

export default challenge('lala-lookout', (attempt, { kind, at }, variant) => {
  if (kind !== 'tap') return attempt;
  if (lalaLooks(at, variant)) return { ...attempt, misses: attempt.misses + 1 };
  const next = { ...attempt, count: attempt.count + 1 };
  return next.count === LALA_TAPS
    ? result(next, at, 80 + speed(at, 20, 650) - next.misses * 20) : next;
}, attempt => boundedPoints(attempt.count * 15 - attempt.misses * 20), { variants: 4 });
