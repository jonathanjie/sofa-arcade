import { challenge, result, speed } from './scoring.mjs';

export default challenge('follow-arrow', (attempt, { kind, at, value }, variant) => {
  if (kind !== 'choose' || value >= 4) return attempt;
  return result(attempt, at, value === variant ? 80 + speed(at) : 0);
}, () => 0, { variants: 4 });
