import { compileSprite, drawSprite } from '../../kit/sprites.mjs';
import { LOOKS } from '../../looks.mjs';

const PIXEL = 5;
export const MOUSE_PAW_ROW = 16;

// The paw sits on row 16 in every pose so it stays on the yarn.
const MOUSE_HEAD = [
  '......................',
  '......oooo............',
  '.....oeeeoo...........',
  '....oeeeeeoo.ooo......',
  '....oeeeeefooffoo.....',
  '....oeeeffffffffffo...',
  '.....offfffffkkfffo...',
  '.....offfffffkkffffo..',
  '.....offffffffffffnno.',
  '......offfbbbbbbbbno..',
  '......oobbbbbbbbboo...',
];
const MOUSE_REST = [
  '.....ossssssssoo......',
  '....offsosssso........',
  '....offbbbbffoo.......',
  '...offbbbbfffboo......',
  '...offbbbbffofboo.....',
  '...offbbbbfo..obbo....',
  '.ttoffbbbffo..........',
  't..offfffffo..........',
  '..offfoofffooo........',
  '..ooo....ooooo........',
];
const MOUSE_PULL = [
  '....ossssssssoo.......',
  '...offsossssso........',
  '...offbbbbffoo........',
  '..offbbbbfffboo.......',
  '..offbbbbffofboo......',
  '..offbbbbfo..obbo.....',
  '.toffbbbffo...........',
  't.offffffof...........',
  '.offfoo.offfoo........',
  '.oooo....ooooo........',
];

export const MOUSE_SIZE = { width: MOUSE_HEAD[0].length, height: MOUSE_HEAD.length + MOUSE_REST.length };

const CAT = [
  '....................................',
  '....oooo....................oooo....',
  '....oddooo................oooddo....',
  '....odeedoo..............oodeedo....',
  '....odeeedooo..........ooodeeedo....',
  '....odeeeedooooo....ooooodedeedo....',
  '....odffeeefffff....fffffeedffdo....',
  '....offfeffffffffffffffffeffffo.....',
  '...offfffffddffddffddffddfffffffo...',
  '...offfffffffdfddffddfdffffffffo....',
  '..offfffffffffdddddddfffffffffffo...',
  '..offfffffbbbbfdddddffbbbbffffffo...',
  '..offffffbfffffffffffbffffbfffffo...',
  '..offfffbbbbbbbbffbbbbbbbbbbffffo...',
  '..offffbbwwwwbbbffbbbwwwwbbbbfffo...',
  '..offffbbwwwwbbbffbbbwwwwbbbbfffo...',
  '..offffbbbbbbbbbbbbbbbbbbbbbbfffo...',
  '...offffffffbbbbnnbbbbfffffffffo....',
  '...oooffffffbbbbbkkbbbffffffooo.....',
  '.......oooffbbdboobdbbffooo.........',
  '.........oooffbbbbbbffooo...........',
  '..........oofffffffffoo.............',
  '.........offddffffddffoo............',
  '........offfffffffffffooo......oo...',
  '........offfbbbbbbfffffdo.....oddo..',
  '.......offfbbbbbbbbfffffo....oddfo..',
  '.......offfbbbbbbbbfffffo....offfo..',
  '......oofffbbbbbbbbfffooo...offfo...',
  '.....oobbffobbbbboffbbofoooofffo....',
  '.....obbbffobbbbboffbbofddfffoo.....',
  '.....oooooo.ooooo.ooooo.ooooo.......',
];

const KNOT = [
  '..............',
  '.....dddd.....',
  '...ddrrddgg...',
  '..drrrdbbvvo..',
  '.drrrdbbvvwvo.',
  '.drrdbbvvwvvvo',
  'drrrbbvvwvvvvo',
  'drrbvvvwvvvvod',
  '.dbvvvwvvvvdd.',
  '..ovvvvvoddd..',
  '...ovvoddd....',
  '....ooo.......',
];

const PALETTE = {
  o: '#2e212b', f: '#baa290', b: '#fff0d6', k: '#221821', n: '#ec8e91', e: '#edada6', t: '#ed9d9d',
};
const CAT_PALETTE = {
  ...PALETTE, f: '#f0a056', e: '#ffc3a0', d: '#bb553a', b: '#ffe0a8', w: '#fff6d2', n: '#7c3a39',
};
const KNOT_PALETTE = { o: '#4a2335', d: '#8e2947', r: '#e34359', g: '#ffa174', b: '#69243c', v: '#f76e77', w: '#ffc5a1' };
const mirror = rows => rows.map(row => [...row].reverse().join(''));

export function createYarnArt(document) {
  const sprites = new Map();
  const cat = compileSprite(document, CAT, CAT_PALETTE);
  const knot = compileSprite(document, KNOT, KNOT_PALETTE);

  function prepare(look, team) {
    const key = 2 * look + team;
    if (sprites.has(key)) return;
    const rest = [...MOUSE_HEAD, ...MOUSE_REST];
    // Blink changes only the eye, while the tail takes a small step.
    const blink = [...rest];
    blink[6] = '.....offffffffffffo...';
    blink[7] = '.....offfffffkkffffo..';
    blink[17] = 'tt.offbbbffo..........';
    const pull = [...MOUSE_HEAD.map(row => '.' + row.slice(0, -1)), ...MOUSE_PULL];
    const palette = { ...PALETTE, s: LOOKS[look].colour };
    sprites.set(key, [rest, blink, pull].map(rows => compileSprite(document, team ? mirror(rows) : rows, palette)));
  }

  return {
    prepare,
    mouse(context, look, team, pose, x, y, scale) {
      drawSprite(context, sprites.get(2 * look + team)[pose], x - MOUSE_SIZE.width * scale / 2, y, scale);
    },
    lala(context, x, y, position, blink) {
      drawSprite(context, cat, x, y, PIXEL);
      context.fillStyle = PALETTE.k;
      const gaze = Math.min(3, Math.max(0, Math.round(1.5 + position * 2)));
      for (const eye of [9, 21]) {
        context.fillRect(x + (eye + gaze) * PIXEL, y + 14 * PIXEL, PIXEL, (blink ? 1 : 2) * PIXEL);
        if (blink) context.fillRect(x + eye * PIXEL, y + 15 * PIXEL, 4 * PIXEL, PIXEL);
      }
    },
    knot(context, x, y) { drawSprite(context, knot, x - 7 * PIXEL, y - 6 * PIXEL, PIXEL); },
  };
}
