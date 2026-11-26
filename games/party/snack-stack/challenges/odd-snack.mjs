import { challenge, result, speed } from './scoring.mjs';

export default challenge('odd-snack', (attempt, { kind, at, value }, variant) => {
  if (kind !== 'choose' || value >= 4) return attempt;
  return result(attempt, at, value === variant ? 85 + speed(at, 15) : 0);
}, () => 0, { variants: 4 });
