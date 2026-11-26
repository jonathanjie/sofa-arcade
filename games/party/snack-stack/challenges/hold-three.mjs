import { challenge, result, speed } from './scoring.mjs';

export default challenge('hold-three', (attempt, { kind, at }) => {
  if (kind === 'down') return { ...attempt, mark: at };
  if (kind === 'cancel') return { ...attempt, mark: null };
  if (kind !== 'up' || attempt.mark === null) return attempt;
  const error = Math.abs(at - attempt.mark - 3000);
  const accuracy = Math.max(0, 95 * (1 - error / 1500));
  return result(attempt, at, accuracy * (1 + speed(at, 5, 3000) / 95));
}, () => 0);
