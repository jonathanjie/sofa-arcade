import { GREEN_CENTRE, GREEN_HALF_WIDTH, greenPosition } from '../../../../ui/party/games/snack-stack/cards.mjs';
import { challenge, result, speed } from './scoring.mjs';

export default challenge('green-zone', (attempt, { kind, at }, variant) => {
  if (kind === 'down') return { ...attempt, mark: at };
  if (kind === 'cancel') return { ...attempt, mark: null };
  if (kind !== 'up' || attempt.mark === null) return attempt;
  const miss = Math.abs(greenPosition(at, variant) - GREEN_CENTRE);
  const accuracy = miss <= GREEN_HALF_WIDTH ? 86 - miss / 2 : Math.max(0, 65 - miss * 1.7);
  return result(attempt, at, accuracy * (1 + speed(at, 14) / 86));
}, () => 0, { variants: 4, phoneVariant: true });
