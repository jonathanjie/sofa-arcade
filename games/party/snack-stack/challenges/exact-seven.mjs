import { EXACT_TAP_TARGET } from '../../../../ui/party/games/snack-stack/cards.mjs';
import { boundedPoints, challenge, speed } from './scoring.mjs';

export default challenge('exact-seven', (attempt, { kind, at }) => {
  if (kind !== 'tap') return attempt;
  return { ...attempt, count: attempt.count + 1, mark: at };
}, attempt => {
  if (attempt.count === EXACT_TAP_TARGET) return boundedPoints(90 + speed(attempt.mark, 10));
  return attempt.count ? boundedPoints(70 - 14 * Math.abs(attempt.count - EXACT_TAP_TARGET)) : 0;
});
