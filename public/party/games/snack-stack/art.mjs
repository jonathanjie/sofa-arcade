import { compileSprite, drawSprite } from '../../kit/sprites.mjs';
import {
  GREEN_CENTRE, PICTURE_ANGLE, TRACE, cheeseAngle, cheeseHalfWidth, greenHalfWidth, greenPosition, lalaLooks,
} from './cards.mjs';

const INK = '#362438';
const CREAM = '#fff4d3';
const GOLD = '#f2ae49';
const JAM = '#a53550';
const GREEN = '#336b59';
const UNIT = 8;

const ICONS = {
  paw: [
    '....oo...oo.....', '...oppo.oppo....', '...oppo.oppo....', '....oo...oo.....',
    '.oo.........oo..', 'oppo..oooo.oppo.', 'oppo.oppppooppo.', '.oo.oppppppooo..',
    '...oppppppppo...', '..oppppppppppo..', '..oppppppppppo..', '...oooooooooo...',
  ],
  cheese: [
    '.......ooo......', '.....ooggyo.....', '...ooggggyyo....', '.oogggggyyyyo...',
    'oggggyyygyyyyo..', 'oyyyyyyyyyyyyyo.', 'ooooooooooooooo.', 'oyyddyyyyyydyyo.',
    'oyddyyyyyyddyo.', 'oyyyyyydyyyyyo.', 'oyyyyydyyyyyyo.', 'ooooooooooooooo.',
  ],
  berry: [
    '.....gg..gg.....', '.....gggggg.....', '...oooggggooo...', '..oppppppppppo..',
    '.opplpplpplpppo.', '.oppppppppppppo.', '..opplppplppo...', '...oppppppppo...',
    '....opplppoo....', '.....opppoo.....', '......oooo......',
  ],
  pepper: [
    '.....oooooo.....', '....oyygygyo....', '...oygyygyyyo...', '...oooooooooo...',
    '...ollllllllo...', '...ojjjjjjjjo...', '...ojpppppjjo...', '...ojppgppjjo...',
    '...ojpppppjjo...', '...ojjjjjjjjo...', '...ollllllllo...', '...oooooooooo...',
  ],
  cat: [
    '................', '..o..........o..', '..oo........oo..', '..opo......opo..',
    '..odoooooooodo..', '..odfdfdfdfdo...', '.offfffffffffo..', '.ofkoffffokfo...',
    '.offllffllffo...', '..ofllkllffo....', '...ollllllo.....', '....oooooo......',
    '...ofdfdffo.o...', '..offffffffofo..', '..olfffflfffdo..', '...oooooooooo...',
  ],
  away: [
    '................', '..o..........o..', '..oo........oo..', '..odo......odo..',
    '..odoooooooodo..', '..ofddfddfddo...', '.offfffffffffo..', '.offffddffffo...',
    '.offffffffffo...', '..offdddfffo....', '...offffffo.....', '....oooooo......',
    '...ofdfdffo.o...', '..offffffffofo..', '..offddfffdfdo..', '...oooooooooo...',
  ],
};

const PALETTE = {
  o: INK, p: '#ed7891', y: '#ffd16e', g: '#83ba76', j: JAM, l: CREAM,
  d: '#bc643e', f: '#ed934c', k: '#221a25',
};

export function rect(context, x, y, width, height, colour) {
  context.fillStyle = colour;
  context.fillRect(x, y, width, height);
}

export function label(context, value, x, y, size, { colour = INK, align = 'left', face = 'system-ui', max } = {}) {
  context.fillStyle = colour;
  context.font = '900 ' + size + 'px ' + face;
  context.textAlign = align;
  context.textBaseline = 'middle';
  if (max === undefined) context.fillText(value, x, y);
  else context.fillText(value, x, y, max);
}

function disc(context, x, y, radius, colour) {
  context.fillStyle = colour;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

function stroke(context, points, colour, width) {
  context.strokeStyle = colour;
  context.lineWidth = width;
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.beginPath();
  points.forEach(([x, y]) => context.lineTo(x, y));
  context.stroke();
}

function pixels(context, x, y, width, height, colour) {
  rect(context, Math.round(x / UNIT) * UNIT, Math.round(y / UNIT) * UNIT, width * UNIT, height * UNIT, colour);
}

function arrow(context, x, y, direction) {
  const points = [[0, -9], [8, -1], [4, -1], [4, 7], [-4, 7], [-4, -1], [-8, -1]];
  context.save();
  context.translate(x, y);
  context.rotate(direction * Math.PI / 2);
  context.beginPath();
  points.forEach(([dx, dy]) => context.lineTo(dx * UNIT, dy * UNIT));
  context.closePath();
  context.fillStyle = GREEN;
  context.fill();
  context.restore();
}

export function createCardArt(document, art) {
  const sprites = Object.fromEntries(Object.entries(ICONS).map(([key, rows]) => [key, compileSprite(document, rows, PALETTE)]));
  function icon(context, key, x, y, scale = UNIT) {
    const sprite = sprites[key];
    drawSprite(context, sprite, x - sprite.width * scale / 2, y - sprite.height * scale / 2, scale);
  }
  function cat(context, x, y, at, reduced, looking = true, scale = UNIT) {
    const lift = reduced || Math.floor(at / 260) % 2 === 0 ? 0 : UNIT;
    icon(context, looking ? 'cat' : 'away', x, y - lift, scale);
  }

  const visuals = {
    seven(context, x, y, time) {
      for (let index = 0; index < 7; index++) {
        const px = x + (index - 3) * 102;
        const beat = time >= 0 && Math.floor(time / 160) % 7 === index;
        disc(context, px, y - 18, 44, beat ? JAM : '#e2be90');
        disc(context, px, y - 22, 39, beat ? '#ffd888' : CREAM);
        icon(context, 'paw', px, y - 20 - (beat ? 7 : 0), 4);
        label(context, String(index + 1), px, y + 63, 30, { align: 'center' });
      }
    },
    burst(context, x, y, time) {
      const beat = time >= 0 && time % 250 > 120;
      disc(context, x, y + 17, 113, INK);
      disc(context, x, y + (beat ? 17 : 0), 107, '#e8899c');
      disc(context, x, y + (beat ? 13 : -4), 92, '#ffc0c1');
      icon(context, 'paw', x, y + (beat ? 13 : -4));
      for (const sign of [-1, 1]) {
        for (let index = 0; index < 3; index++) {
          const px = x + sign * (137 + index * 38 + (beat ? 10 : 0));
          stroke(context, [[px - 13, y + (index - 1) * 44], [px + 13, y + (index - 1) * 44]],
            index === 1 ? JAM : GOLD, 10);
        }
      }
    },
    timer(context, x, y, time) {
      disc(context, x, y, 106, INK);
      disc(context, x, y, 95, GOLD);
      disc(context, x, y, 83, CREAM);
      pixels(context, x - 16, y - 130, 4, 3, INK);
      if (time >= 0) {
        context.beginPath();
        context.strokeStyle = GREEN;
        context.lineWidth = 9;
        const progress = (time % 4000) / 3000;
        context.arc(x, y, 90, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, progress));
        context.stroke();
      }
      for (let index = 0; index < 3; index++) {
        disc(context, x + (index - 1) * 40, y + 43, 8, time >= 0 && time % 4000 >= (index + 1) * 1000 ? GREEN : '#ceb388');
      }
      label(context, '3s', x, y - 12, 76, { align: 'center', face: 'Georgia' });
    },
    bar(context, x, y, time, variant, difficulty) {
      const left = x - 320;
      const half = greenHalfWidth(difficulty);
      const marker = left + greenPosition(time, variant) * 6.4;
      const hot = Math.abs(greenPosition(time, variant) - GREEN_CENTRE) <= half;
      rect(context, left - 6, y - 42, 652, 84, INK);
      rect(context, left, y - 36, 640, 72, '#e2c79b');
      rect(context, left + 6.4 * (GREEN_CENTRE - half), y - 36, 12.8 * half, 72, hot ? '#417f58' : GREEN);
      label(context, 'RELEASE HERE', left + 6.4 * GREEN_CENTRE, y - 78, 29, { colour: GREEN, align: 'center' });
      rect(context, marker - 9, y - 49, 18, 98, INK);
      rect(context, marker - 4, y - 43, 8, 86, CREAM);
      disc(context, marker, y + 56, 14, INK);
      disc(context, marker, y + 56, 8, hot ? '#a8e297' : GOLD);
    },
    pepper(context, x, y, time) {
      const shake = time < 0 ? 0 : Math.floor(time / 100) % 2 === 0 ? -8 : 8;
      context.save();
      context.translate(x + shake, y - 30);
      context.rotate(shake / 60);
      icon(context, 'pepper', 0, 0, 13);
      context.restore();
      for (const dx of [-144, -112, 112, 144]) {
        pixels(context, x + dx, y - 60, 2, 1, JAM);
        pixels(context, x + dx, y - 18, 2, 1, JAM);
      }
      label(context, '×6', x, y + 106, 40, { colour: JAM, align: 'center' });
    },
    picture(context, x, y, time, variant) {
      const demonstration = time < 0 ? 1 : Math.max(0, Math.cos(time / 420));
      const angle = PICTURE_ANGLE[variant] * .006 * demonstration;
      stroke(context, [[x - 245, y + 24], [x + 245, y + 24]], '#b28864', 4);
      label(context, '←', x - 217, y - 21, 56, { colour: GREEN, align: 'center' });
      label(context, '→', x + 217, y - 21, 56, { colour: GREEN, align: 'center' });
      disc(context, x, y - 108, 12, INK);
      context.save();
      context.translate(x, y - 94);
      context.rotate(angle);
      rect(context, -4, 0, 8, 48, INK);
      rect(context, -110, 42, 220, 154, INK);
      rect(context, -100, 52, 200, 134, GOLD);
      rect(context, -90, 62, 180, 114, '#91bda5');
      icon(context, 'cheese', 0, 120, 6);
      context.restore();
      label(context, 'LEVEL', x, y + 146, 29, { colour: GREEN, align: 'center' });
    },
    crack(context, x, y, time) {
      const points = TRACE.map(([px, py]) => [x + (px - 46) * 7.7, y + (py - 49) * 3.15]);
      stroke(context, points, INK, 15);
      const progress = time < 0 ? 0 : (time % 2200) / 500;
      if (progress > 0) {
        const segment = Math.min(2, Math.floor(progress));
        const [fromX, fromY] = points[segment];
        const [toX, toY] = points[segment + 1];
        const part = Math.min(1, progress - segment);
        const head = [fromX + (toX - fromX) * part, fromY + (toY - fromY) * part];
        stroke(context, [...points.slice(0, segment + 1), head], JAM, 9);
        disc(context, head[0], head[1], 25, GOLD);
      }
      points.forEach(([px, py], index) => {
        disc(context, px, py, 23, index <= progress ? JAM : GREEN);
        label(context, String(index + 1), px, py, 26, { colour: CREAM, align: 'center' });
      });
    },
    arrow(context, x, y, time, variant) {
      disc(context, x, y, 127, INK);
      disc(context, x, y, 120, GOLD);
      disc(context, x, y, 105, CREAM);
      const beat = time >= 0 && time % 480 > 260 ? 14 : 0;
      const dx = [0, beat, 0, -beat][variant];
      const dy = [-beat, 0, beat, 0][variant];
      arrow(context, x + dx, y + dy, variant);
    },
    wheel(context, x, y, time, variant, difficulty) {
      const turn = cheeseAngle(time, variant);
      const angle = turn * Math.PI / 180 - Math.PI / 2;
      const radius = 119;
      const top = -Math.PI / 2;
      const halfWidth = cheeseHalfWidth(difficulty);
      const cheeseArc = halfWidth * Math.PI / 180;
      const inCheese = Math.min(turn, 360 - turn) <= halfWidth;
      disc(context, x, y + 5, radius + 9, INK);
      disc(context, x, y, radius + 6, '#b68067');
      disc(context, x, y, radius, '#68485c');
      for (let segment = 0; segment < 12; segment++) {
        const section = (segment + .5) * Math.PI / 6 + top;
        stroke(context, [[x + 48 * Math.cos(section), y + 48 * Math.sin(section)],
          [x + 112 * Math.cos(section), y + 112 * Math.sin(section)]], '#9e7580', 2);
      }
      context.beginPath();
      context.moveTo(x, y);
      context.arc(x, y, radius, top - cheeseArc, top + cheeseArc);
      context.closePath();
      context.fillStyle = inCheese ? '#fff09a' : '#ffc145';
      context.fill();
      icon(context, 'cheese', x + 220, y - 92, 5);
      label(context, 'CHEESE', x + 220, y - 38, 29, { align: 'center' });
      stroke(context, [[x + 160, y - 92], [x + 126, y - 92], [x + 30, y - 113]], INK, 4);
      const tip = [x + 98 * Math.cos(angle), y + 98 * Math.sin(angle)];
      stroke(context, [[x, y], tip], INK, 17);
      stroke(context, [[x, y], tip], CREAM, 9);
      disc(context, x, y, 14, INK);
      disc(context, x, y, 7, GOLD);
    },
    mice(context, x, y, time, variant) {
      for (let index = 0; index < 3 + variant; index++) {
        const columns = Math.min(4, 3 + variant);
        const px = x + (index % 4 - (columns - 1) / 2) * 151;
        const py = y + (variant >= 2 ? (index < 4 ? -52 : 48) : 0);
        const pose = time >= 0 && (time + index * 100) % 750 < 140 ? 1 : 0;
        art.runner(context, (index * 5 + variant) % 16, pose, px - 48, py - 48, 6);
      }
    },
    lookout(context, x, y, time, variant, difficulty, realTime, reduced) {
      const looking = lalaLooks(realTime, variant, difficulty);
      disc(context, x - 145, y, 119, looking ? '#e6a49b' : '#acd4ad');
      cat(context, x - 145, y, time, reduced, looking, 12);
      label(context, looking ? 'WAIT' : 'TAP!', x + 114, y - 20, 78, { colour: looking ? JAM : GREEN, align: 'center' });
      label(context, '5 TAPS', x + 114, y + 53, 29, { colour: looking ? JAM : GREEN, align: 'center' });
    },
    snacks(context, x, y, time, variant) {
      for (let index = 0; index < 4; index++) {
        const px = x + (index - 1.5) * 167;
        const lift = time < 0 ? 0 : (time + index * 120) % 1000 < 240 ? 8 : 0;
        disc(context, px, y - 14, 75, '#cea578');
        disc(context, px, y - 19, 72, CREAM);
        icon(context, index === variant ? 'berry' : 'cheese', px, y - 19 - lift);
        disc(context, px, y + 83, 22, INK);
        label(context, String(index + 1), px, y + 84, 30, { align: 'center', colour: CREAM });
      }
    },
  };
  return {
    cat,
    draw(context, key, x, y, elapsed, variant, difficulty, reduced) {
      // The cue itself stays live when motion communicates a scoring window.
      const essential = key === 'bar' || key === 'wheel';
      const animationTime = reduced && !essential ? -1 : elapsed;
      visuals[key](context, x, y, animationTime, variant, difficulty, elapsed, reduced);
    },
  };
}
