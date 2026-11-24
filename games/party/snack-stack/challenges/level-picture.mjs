import { PICTURE_ANGLE } from '../../../../ui/party/games/snack-stack/cards.mjs';
import { challenge, result, speed } from './scoring.mjs';

const LEVEL_TOLERANCE = 13;
const LEVEL_MS = 300;
const MAX_SAMPLE_GAP_MS = 175;

export default challenge('level-picture', (attempt, { kind, at, value }, variant) => {
  if (kind !== 'axis') return attempt;
  const error = Math.abs(PICTURE_ANGLE[variant] + value);
  const count = Math.max(attempt.count, Math.max(0, 35 - error));
  if (error > LEVEL_TOLERANCE) return { ...attempt, count, mark: null, sample: at };
  const mark = attempt.mark === null || at - attempt.sample > MAX_SAMPLE_GAP_MS ? at : attempt.mark;
  if (at - mark >= LEVEL_MS) return result(attempt, at, 80 + speed(at, 20, LEVEL_MS));
  return { ...attempt, count, mark, sample: at };
}, attempt => attempt.count, { variants: 4, phoneVariant: true });
