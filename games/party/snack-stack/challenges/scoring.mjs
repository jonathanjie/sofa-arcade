import { CARDS, PLAY_MS } from '../../../../ui/party/games/snack-stack/cards.mjs';

export function challenge(id, input, score, options = {}) {
  return Object.freeze({ ...CARDS.find(card => card.id === id), input, score, ...options });
}

export function boundedPoints(points) {
  return Math.max(0, Math.min(100, Math.round(points)));
}

export function speed(at, max = 20, earliest = 0) {
  return max * (1 - Math.max(0, at - earliest) / (PLAY_MS - earliest));
}

export function result(attempt, at, points) {
  return { ...attempt, finish: at, points: boundedPoints(points) };
}
