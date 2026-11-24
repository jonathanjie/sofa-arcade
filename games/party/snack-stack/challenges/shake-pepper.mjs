import { PEPPER_TAPS } from '../../../../ui/party/games/snack-stack/cards.mjs';
import { challenge, result, speed } from './scoring.mjs';

const REPEAT_MS = 115;

export default challenge('shake-pepper', (attempt, { kind, at }) => {
  if (kind !== 'tap' || (attempt.mark !== null && at - attempt.mark < REPEAT_MS)) return attempt;
  const next = { ...attempt, mark: at, count: attempt.count + 1 };
  return next.count === PEPPER_TAPS ? result(next, at, 80 + speed(at, 20, 575)) : next;
}, attempt => attempt.count * 12);
