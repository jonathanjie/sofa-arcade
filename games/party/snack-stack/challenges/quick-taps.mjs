import { boundedPoints, challenge, result } from './scoring.mjs';

const TARGET = 50;

export default challenge('quick-taps', (attempt, { kind, at }) => {
  if (kind !== 'tap') return attempt;
  const next = { ...attempt, count: attempt.count + 1 };
  return next.count === TARGET ? result(next, at, 100) : next;
}, attempt => boundedPoints(100 * attempt.count / TARGET));
