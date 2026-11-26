import { compileSprite, drawSprite, fitSpriteScale } from '../../kit/sprites.mjs';
import { LOOKS } from '../../looks.mjs';

export const TEAMS = [
  { name: 'Cyan', light: '#62f4ff', dark: '#103647', rail: '#144659' },
  { name: 'Coral', light: '#ff738f', dark: '#4a2137', rail: '#55243f' },
];

export const BOOSTS = {
  wide: { name: 'Wide paddles', colour: '#fed573', glyph: ['...#...', '..###..', '...#...', '...#...', '...#...', '..###..', '...#...'] },
  split: { name: 'Split ball', colour: '#8df5ac', glyph: ['#.....#', '.#...#.', '..#.#..', '...#...', '...#...', '...#...', '...#...'] },
  curve: { name: 'Curve ball', colour: '#cfadff', glyph: ['....###', '...###.', '..#.#..', '.#.....', '.#.....', '..#....', '...##..'] },
  slow: { name: 'Slow motion', colour: '#8fcaff', glyph: ['#######', '.#...#.', '..#.#..', '...#...', '..#.#..', '.#####.', '#######'] },
};

const DRONE = [
  '....ss.....', '...sccs....', '..scoocs...', '.scooocs...', 'scoosscsc..',
  'scoossowwcc', 'scoosscsc..', '.scooocs...', '..scoocs...', '...sccs....', '....ss.....',
];

export function createPaddleArt(document) {
  const drones = LOOKS.map(look => compileSprite(document, DRONE, {
    c: '#2c435c', o: '#101d2c', s: look.colour, w: '#f1ffff',
  }));
  const boosts = Object.fromEntries(Object.entries(BOOSTS).map(([kind, boost]) =>
    [kind, compileSprite(document, boost.glyph, { '#': boost.colour })]));
  return {
    droneScale(area, slots) {
      return Math.min(13 - Math.ceil((slots - 1) / 2), fitSpriteScale(drones[0], slots, area, { columns: 1, gap: 10 }));
    },
    drone(context, look, team, x, y, scale) {
      if (!scale) return;
      const sprite = drones[look];
      context.save();
      context.translate(Math.round(x), Math.round(y));
      if (team === 1) context.scale(-1, 1);
      drawSprite(context, sprite, -sprite.width * scale / 2, -sprite.height * scale / 2, scale);
      context.restore();
    },
    boost(context, kind, x, y) {
      const sprite = boosts[kind];
      const scale = 4;
      drawSprite(context, sprite, x - sprite.width * scale / 2, y - sprite.height * scale / 2, scale);
    },
  };
}
