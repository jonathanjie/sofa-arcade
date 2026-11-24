import { compileSprite, drawSprite } from '../../kit/sprites.mjs';

// The outline and fur are shared by all cat poses. Ears and eyes are separate grids.
const LALA_BODY = [
  '........................................................................................',
  '........................................................................................',
  '........................................................................................',
  '........................................................................................',
  '........................................................................................',
  '........................................................................................',
  '........................................................................................',
  '........................................................................................',
  '........................................................................................',
  '........................................................................................',
  '........................................................................................',
  '.........................................................dddddddd.......................',
  '.................................................dddddddddddddddddd.....................',
  '...............................................dddddddddddddddddddddd...................',
  '.............................................dddddddddddddsssssssddddddd................',
  '............................................dddddddsssssssssoooosssddddddd..............',
  '..........................................dddddddsssoosssssooooosssssdddddd.............',
  '........................................ddddddssssooofsssssfffffsssssssddddd............',
  '.......................................dddddssssooofffssssslllllsssssosssdddd...........',
  '......................................ddddssssooofffllssssllllllsssssooossdddd..........',
  '..................dddddddddddddddddddddddsssoooffflllssssslllllssssssffoossdddd.........',
  '...............ddddddddddddddddddddddddddssooffffllllssssslffffssssslfffssssdddd........',
  '............dddddddddddddddddddddddddddddddofffllllllssssffffffsssssffffsssssdddd.......',
  '...........ddddddsssssssssssssssssssssdddddddffffffffssssffffffsssssffffssssssdddd......',
  '..........dddsssssssssssssffssssssffffsssdddddfffffffssssffffffssssfffffsssssssddd......',
  '.........dddsssfffssssssffffsssssfffffsfssssdddffffffsssfffffffssssfffffssssosssddd.....',
  '........dddsssffffssssssllllssssslllffsssssssdddfffffssffffffffssssffffsssssoossddd.....',
  '.......dddssfffllllsssssllllssssllllllssssssssddfffffsfffffffffsssfffffssssoooosddd.....',
  '......dddsfffllllllsssssllllsssslllllsssssffssdddfffffffffffffsssffffffssssfooossddd....',
  '.....dddsffflllllllsssssllllsssslllllssssffffssddfffffffffffffssfffffffssssfooossddd....',
  '.....dddffflllllllllssssllllsssllllllsssfffffsssddffffffffffffsffffffffsssfooooosddd....',
  '....dddsffllllllllllssslllllsssllllllsssfffffsssdddfffffffffffffffffffssssfooooossddd...',
  '....dddffllllllllllllsslllllssllllllsssfffffffsssddfffffffffffffffffffsssfoooooossddd...',
  '....dddflllllllllllllssllllllllllllfssffffffffsssddfffffffffffffffffffsfffooooooosddd...',
  '...dddsflllllllllllllllllllllllllfffsffffffffffssddfffffffffffffffffffffffooooooossddd..',
  '...dddffllllllllllllllllllllfffffffsfffffffffffssddffffffffffffffffffffffoooooooossddd..',
  '...dddfllllllllllllllfffffffffffffffffffffffffsssddffffffffffffffffffffffoooooooossddd..',
  '...dddfllllllllllffffffffffffffffffffffffffffssssddfffffffffffffffffffffoooooooosssddd..',
  '..dddsfllllllllfffffffffffffffffffffffffffffsssssdddfffffffffffffffffffooooooooosssddd..',
  '..dddsfllllllffffffffffffffffffffffffffffffssssssdddfffffffffffffffffooooooooooosssddd..',
  '..dddslllllffffffffffffffffffffffffffffffsssssfssdddffffffffffffffoooooooooooooosdsddd..',
  '..dddsllfffffffffffffffffffffffffffffffffssffffssdddooofffffffffooooooooooooooosdddddd..',
  '..dddsfffffffffffffffffffffffffffffffffffffffffssdddoooooooooooooooooooooooooooddddddd..',
  '..dddsooooooofffffffffffffffffffffffffffffffsssssdddoooooooooooooooooooooooooodddssddd..',
  '..ddddooooooccccccccffffffffcccccfffffffffssssssddddoooooooooooooooooooooooooddddssssdd.',
  '...dddoooocccccccceeeeeeeeeecccccccccfffssssssssdddoooooooooooooooooooooooossdddssossdd.',
  '...dddoocccccccwwweeeeeeeeeeccwwwcccccffssssfsssdddooooooooooooooooooooooosssdddssfosdd.',
  '...dddoccccwwwwwwwweeeeeeeeewwwwwwwwccccfffffssddddooooooooooooooooooooosssssdddsfffosdd',
  '...dddssccwwwwwwwwwddeeeeddwwwwwwwwwwccccfffsssdddssssooooooooooooooooosssssddddsfffosdd',
  '...ddddsccwwswwwwwwwddddddwwwwwwwswwwwcccffssssdddssssssssssssssssssssssssssdddssfffosdd',
  '...dddddsccwwwwwwwwwcddddwwwwwwwwwwwwccccdddddddddssssssssssssssssssssssssssdddsfffoosdd',
  '....ddddsccccccsccccccddcwwwwwwwwwwscccdddddddddddddssssddddsssssssssssssssdddssfffosdd.',
  '.....ddddsccccccccccccssccccccccccccccdddddddddddddddddddddddddddssssssssddddssfffossdd.',
  '......ddddscccccccccccssccccccccccccddddddccccccccdddddddddddddddddddsssddddssfffoossdd.',
  '.......ddddsscccccsssssssssscccccccdddddcccccccccccdddddssssssdddddddddddddsfffooossddd.',
  '........dddddssscccccccccccccccccccdddccccccccccccccdddsssffossssddddddddssssfooossdddd.',
  '.........dddddddsssssssssssssddddddddcccccccccccccccddsssfffffoossssddssssssssosssdddd..',
  '...........ddddddddddddddddddddddddddcccccccccccscccddssfffffffossssssoooosssssssdddd...',
  '.............ddddddddddddddddddddddddcccccccscccsccccdssffffffffssssooooooosssssdddd....',
  '...............dddddddddddddd.....dddcccccccscccscccdddsssffffoosssssoooosssssddddd.....',
  '...................................dddccccccscccsccdddddssssssssssssssssssssdddddd......',
  '....................................ddddddddddddddddd.dddddsssssssssssssssdddddd........',
  '.....................................ddddddddddddddd....ddddddddddddddddddddd...........',
  '...........................................................dddddddddddddddd.............',
  '........................................................................................',
];

const LEFT_EAR = [
  'd..................',
  'dddd...............',
  'ddddddd............',
  'dddfdddd...........',
  'dddffdddd..........',
  '.ddsfffsddd........',
  '.ddsfffffddd.......',
  '.ddsffefffddd......',
  '.dddffeefffddd.....',
  '.dddsffeefffddd....',
  '.dddsffleefffddd...',
  '.dddsffeleefffdd...',
  '.dddsffelleefffdd..',
  '.dddssffllleeffdd..',
  '.dddssffelleeffsdd.',
  '.dddsssffellfffssdd',
  '..dddsssfffefffssdd',
  '..dddsssssfffsssdd.',
  '..dddssssssssssdd..',
  '..dddsssssssssddd..',
  '..dddddddddddddd...',
];

const RIGHT_EAR = [
  '....................',
  '................d...',
  '...............ddd..',
  '..............ddddd.',
  '.............dddodd.',
  '............dddoodd.',
  '...........dddofodd.',
  '..........dddoffodd.',
  '.........dddofffodd.',
  '........dddoffffodd.',
  '.......dddofffefodd.',
  '......dddofffeefoddd',
  '.....dddoffffeefoddd',
  '....dddoofffelefoddd',
  '...dddoofffellefoddd',
  '..dddoofffeellefoddd',
  '..ddooofffelllefoddd',
  '..ddoofffellllefoddd',
  '..ddofffeeelleffoddd',
  '.ddoooffffeeeffoodd.',
  '.ddoooooofffffoodd..',
  '.ddooooooooofoodd...',
  '.ddddddddddddddd....',
];

const EYES = {
  sleep: ['.............', '.............', '.............', 'dd.........dd', '.dd.......dd.', '..ddddddddd..', '.............'],
  blink: ['.............', '....ddddd....', '..ddddd.ddd..', '.dggdddggggd.', '.dggdddggggd.', '..ddddddddd..', '.............'],
  look: ['....ddddd....', '..ddgggggdd..', '.dggddgggggd.', '.dgdpdgggggd.', '.dggddgggggd.', '..ddgggggdd..', '....ddddd....'],
};

const CHEESE = [
  '...........ddd....', '.........ddgggd...', '.......ddggggggd..',
  '.....ddgggggggggd.', '...ddgggggrggggwd.', '.ddgggrggggggwwgd.',
  'dggggggggggwwgggd.', 'dwwwwwwwwwwgggdd..', 'dggrrgggggggddss..',
  'dggrggggrgddss....', 'dggggggrddss......', 'dggggrddss........',
  'dgggddss..........', '.dddss............',
];

const FACE = [
  '................', '..d..........d..', '..dd........dd..', '..ded......ded..',
  '..deoddddddoed..', '..dfooffooffod..', '.dfoffoffoffofd.', '.dfffffffffffd..',
  '.dfffffffffffd..', '.dffdddddddffd..', '.dffffffffffffd.', '.dffccceccfffd..',
  '..dfccccccccd...', '...ddccccddd....', '.....dddd.......', '................',
];
const PALETTE = {
  d: '#321b26', s: '#a74732', o: '#df683b', f: '#f48c4c', l: '#ffad6a',
  c: '#ffce9a', w: '#fff0c7', e: '#de7983', g: '#ffcf55', p: '#fff7d1', r: '#d48a38',
};

export function createHallwayArt(document) {
  const compile = rows => compileSprite(document, rows, PALETTE);
  const body = compile(LALA_BODY);
  const left = compile(LEFT_EAR);
  const right = compile(RIGHT_EAR);
  const eyes = Object.fromEntries(Object.entries(EYES).map(([cue, rows]) => [cue, compile(rows)]));
  const cheese = compile(CHEESE);
  return {
    cat(context, x, y, scale, cue, at, reduced) {
      const breath = !reduced && cue === 'sleep' && Math.floor(at / 625) % 3 === 1 ? 1 : 0;
      const twitch = !reduced && cue === 'ear' && Math.floor(at / 85) % 2 ? 2 : 0;
      const eyelid = eyes[cue] ?? eyes.sleep;
      drawSprite(context, left, x + (6 - twitch) * scale, y + (8 - breath - twitch) * scale, scale);
      drawSprite(context, right, x + (31 + twitch) * scale, y + (6 - breath - twitch) * scale, scale);
      drawSprite(context, body, x, y - breath * scale, scale);
      drawSprite(context, eyelid, x + 7 * scale, y + (36 - breath) * scale, scale);
      drawSprite(context, eyelid, x + 28 * scale, y + (35 - breath) * scale, scale);
    },
    cheese(context, x, y, scale) { drawSprite(context, cheese, x, y, scale); },
  };
}

export function createCatIcon(document) {
  const icons = Object.fromEntries(Object.entries({
    sleep: ['.dffdddddddffd..', '.dffffffffffffd.'],
    ear: ['.dffdddddddffd..', '.dffffffffffffd.'],
    blink: ['.dffggdfdggffd..', '.dffdddffddfffd.'],
    look: ['.dfgpdffdpgffd..', '.dfgddffddgfffd.'],
  }).map(([cue, eyes]) => [cue, compileSprite(document, [
    ...(cue === 'ear' ? ['.g..............', 'g.d..........d..'] : FACE.slice(0, 2)),
    ...FACE.slice(2, 9), ...eyes, ...FACE.slice(11),
  ], PALETTE)]));
  return (context, cue) => {
    context.clearRect(0, 0, 48, 48);
    drawSprite(context, icons[cue] ?? icons.sleep, 0, 0, 3);
  };
}
