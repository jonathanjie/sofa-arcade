import { challenge, result, speed } from './scoring.mjs';

export default challenge('count-mice', (attempt, { kind, at, value }, variant) => {
  if (kind !== 'choose' || value < 3 || value > 8) return attempt;
  const difference = Math.abs(value - (3 + variant));
  return result(attempt, at, difference === 0 ? 85 + speed(at, 15) : difference === 1 ? 25 : 0);
}, () => 0, { variants: 6 });
