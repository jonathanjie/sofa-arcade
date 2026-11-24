import { CHEESE_HALF_WIDTH, cheeseAngle } from '../../../../ui/party/games/snack-stack/cards.mjs';
import { challenge, result, speed } from './scoring.mjs';

export default challenge('cheese-wheel', (attempt, { kind, at }, variant) => {
  if (kind !== 'tap') return attempt;
  const angle = cheeseAngle(at, variant);
  const miss = Math.min(angle, 360 - angle);
  const accuracy = miss <= CHEESE_HALF_WIDTH ? 95 - miss / 2 : Math.max(0, 60 - miss * 1.5);
  return result(attempt, at, accuracy * (1 + speed(at, 5) / 95));
}, () => 0, { variants: 4, phoneVariant: true });
