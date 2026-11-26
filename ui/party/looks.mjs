import { compileSprite, drawSprite } from './kit/sprites.mjs';

// Each scarf has an independent ink badge. The silhouettes carry identity in grayscale.
const definitions = [
  ['Bolt', '#ffca58', ['...##..', '..##...', '.#####.', '...##..', '..##...', '.##....', '.#.....']],
  ['Heart', '#fa8290', ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...', '.......']],
  ['Diamond', '#61dac1', ['...#...', '..###..', '.#####.', '#######', '.#####.', '..###..', '...#...']],
  ['Stripes', '#8cadea', ['##...##', '##...##', '##...##', '##...##', '##...##', '##...##', '##...##']],
  ['Crown', '#e1a1ff', ['.......', '#..#..#', '##.#.##', '#######', '.#####.', '.#####.', '.......']],
  ['Sprout', '#b7dc77', ['##...##', '###.###', '.#####.', '..###..', '...#...', '...#...', '..###..']],
  ['Ring', '#ffab68', ['..###..', '.##.##.', '##...##', '##...##', '##...##', '.##.##.', '..###..']],
  ['Checkers', '#ff94c7', ['##..##.', '##..##.', '..##..#', '..##..#', '##..##.', '##..##.', '..##..#']],
  ['Fish', '#77d1f1', ['..###..', '.####.#', '##.####', '#######', '.####.#', '..###..', '.......']],
  ['Arrow', '#dab29a', ['...##..', '....##.', '.....##', '#######', '.....##', '....##.', '...##..']],
  ['Cross', '#ff7764', ['..###..', '..###..', '#######', '#######', '#######', '..###..', '..###..']],
  ['Moon', '#79d3a5', ['..###..', '.###...', '###....', '###....', '###...#', '.######', '..####.']],
  ['Star', '#f5e694', ['...#...', '...#...', '#######', '.#####.', '..###..', '.##.##.', '.#...#.']],
  ['Steps', '#bcc2de', ['....###', '....###', '..#####', '..#####', '#######', '#######', '#######']],
  ['Wings', '#baa9f6', ['##...##', '###.###', '.#####.', '..###..', '.#####.', '###.###', '##...##']],
  ['Dots', '#fff0db', ['##...##', '##...##', '.......', '..###..', '.......', '##...##', '##...##']],
];

export const LOOKS = Object.freeze(definitions.map(([name, colour, badge]) => Object.freeze({
  name, colour, badge: Object.freeze(badge),
})));

const BODY = [
  '................',
  '...oo....oo.....',
  '..oeeo..oeeo....',
  '..oeeeooeeeo....',
  '..oeefffffeo....',
  '...offffffffo...',
  '..offfkfffkfo...',
  '..offffffffnno..',
  '..ofbbbbbbffo...',
  '..ossssssssso...',
  '...osssssssoso..',
  '..offbbbbffoso..',
  't.offbbbbffo.o..',
  'ttoffbbbbffo....',
];

const FEET = [
  ['..ooffooffoo....', '...oo..oo.......'],
  ['..offo..offoo...', '..oo......oo....'],
  ['...ooffooffo....', '....oo.oo.......'],
];
const CAT = [
  '................', '..o........o....', '..oo......oo....', '..oeo....oeo....',
  '..odoooooodo....', '..odffffffdo....', '.offdfdfdfffo...', '.offfffffffo....',
  '.ofkbfffkbfo....', '.offbbnbbffo....', '..obbbbbbbo.....', '...ooooooo......',
  '..ofdfdfdfo..o..', '..offffffffoofo.', '..obfbbbbffdofo.', '...ooooooo.ooo..',
];
const MOUSE_PALETTE = {
  o: '#271f24', e: '#e49e9f', f: '#ba9c83', b: '#ffedcc', k: '#201a1c', n: '#eb7c88', t: '#e2a3a2',
};

export function createLookArt(document) {
  const sprites = new Map();
  const badges = new Map();
  const cat = compileSprite(document, CAT, {
    ...MOUSE_PALETTE, f: '#e88b4d', e: '#ffb799', d: '#b65437', b: '#ffe2bb',
  });

  function badge(context, look, x, y, scale) {
    if (!badges.has(look)) badges.set(look, compileSprite(document, LOOKS[look].badge, { '#': '#211c23' }));
    drawSprite(context, badges.get(look), x, y, scale);
  }

  function runner(context, look, pose, x, y, scale, scaleY = scale) {
    const key = look * FEET.length + pose;
    if (!sprites.has(key)) {
      sprites.set(key, compileSprite(document, [...BODY, ...FEET[pose]], { ...MOUSE_PALETTE, s: LOOKS[look].colour }));
    }
    drawSprite(context, sprites.get(key), x, y, scale, scaleY);
  }

  function portrait(canvas, look) {
    const context = canvas.getContext('2d');
    const scale = Math.max(1, Math.floor(canvas.height / 16));
    context.clearRect(0, 0, canvas.width, canvas.height);
    runner(context, look, 0, 0, 0, scale);
    const badgeScale = Math.max(1, scale - 1);
    const inset = badgeScale;
    const tile = 9 * badgeScale;
    const x = canvas.width - tile;
    const y = canvas.height - tile;
    context.fillStyle = '#211c23';
    context.fillRect(x - 2, y - 2, tile + 2, tile + 2);
    context.fillStyle = LOOKS[look].colour;
    context.fillRect(x, y, tile, tile);
    badge(context, look, x + inset, y + inset, badgeScale);
  }

  return {
    badge, runner, portrait,
    cat(context, x, y, scale) { drawSprite(context, cat, x, y, scale); },
  };
}
