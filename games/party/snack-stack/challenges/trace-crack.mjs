import { TRACE } from '../../../../ui/party/games/snack-stack/cards.mjs';
import { challenge, result, speed } from './scoring.mjs';

const CORRIDOR = 17;

export default challenge('trace-crack', (attempt, { kind, at, value }) => {
  if (kind === 'trace-end') return { ...attempt, count: 0 };
  const starts = kind === 'trace-start';
  if (!starts && (kind !== 'point' || attempt.count === 0)) return attempt;
  const corner = starts ? 0 : attempt.count;
  const [x, y] = TRACE[corner];
  if (Math.hypot(x - value[0], y - value[1]) > CORRIDOR) return attempt;
  const count = corner + 1;
  const next = { ...attempt, count, best: Math.max(attempt.best ?? 0, count) };
  return next.count === TRACE.length ? result(next, at, 80 + speed(at)) : next;
}, attempt => (attempt.best ?? 0) * 18);
