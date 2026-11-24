import { compileSprite, drawSprite } from '../../kit/sprites.mjs';
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

const SCALE = 4;
const DRONE = [
  ['..cc.......', '.coocc.....', 'coossscc...', 'coossssww..', 'coossscc...', '.coocc.....', '..cc.......'],
  ['..cc.......', '.coocc.....', 'coossscc...', 'coossssaa..', 'coossscc...', '.coocc.....', '..cc.......'],
  ['..cc.....a.', '.coocc..aa.', 'coocsscc...', 'coocssswwaa', 'coocsscc...', '.coocc..aa.', '..cc.....a.'],
];

export function createPaddleArt(document) {
  const drones = LOOKS.map(look => DRONE.map(rows => compileSprite(document, rows, {
    c: '#24394b', o: '#08121e', s: look.colour, w: '#f1ffff', a: '#88c9e0',
  })));
  const boosts = Object.fromEntries(Object.entries(BOOSTS).map(([kind, boost]) =>
    [kind, compileSprite(document, boost.glyph, { '#': boost.colour })]));
  return {
    drone(context, look, team, pose, x, y) {
      const sprite = drones[look][pose];
      if (team === 0) drawSprite(context, sprite, x, y, SCALE);
      else {
        context.save();
        context.translate(Math.round(x), 0);
        context.scale(-1, 1);
        drawSprite(context, sprite, 0, y, SCALE);
        context.restore();
      }
    },
    boost(context, kind, x, y) {
      const sprite = boosts[kind];
      drawSprite(context, sprite, x - sprite.width * SCALE / 2, y - sprite.height * SCALE / 2, SCALE);
    },
  };
}
