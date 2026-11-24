import { compileSprite, drawSprite } from '../../kit/sprites.mjs';
import {
  CHEESE_HALF_WIDTH, GREEN_CENTRE, GREEN_HALF_WIDTH, PICTURE_ANGLE, TRACE, cheeseAngle, greenPosition, lalaLooks,
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
  function cat(context, x, y, at, reduced, looking = true) {
    const lift = reduced || Math.floor(at / 260) % 2 === 0 ? 0 : UNIT;
    icon(context, looking ? 'cat' : 'away', x, y - lift);
  }

  const visuals = {
    seven(context, x, y, time) {
      for (let index = 0; index < 7; index++) {
        const spread = (index - 3) * 95;
        const rise = time >= 0 && Math.floor(time / 140) % 7 === index ? 12 : 0;
        icon(context, 'paw', x + spread, y + Math.abs(index - 3) * 8 - rise, 5);
      }
    },
    burst(context, x, y, time) {
      icon(context, 'paw', x, y + (time > 0 && time % 250 > 120 ? 12 : 0));
      for (const sign of [-1, 1]) {
        for (let index = 0; index < 3; index++) {
          pixels(context, x + sign * (116 + index * 48), y + (index - 1) * 40, 3, 1, index === 1 ? JAM : GOLD);
        }
      }
    },
    timer(context, x, y, time) {
      disc(context, x, y, 106, INK);
      disc(context, x, y, 95, GOLD);
      disc(context, x, y, 83, CREAM);
      pixels(context, x - 16, y - 130, 4, 3, INK);
      for (let index = 0; index < 3; index++) {
        disc(context, x + (index - 1) * 40, y + 43, 8, time >= (index + 1) * 1000 ? GREEN : '#ceb388');
      }
      label(context, '3s', x, y - 12, 76, { align: 'center', face: 'Georgia' });
    },
    bar(context, x, y, time, variant) {
      const left = x - 320;
      rect(context, left - 6, y - 42, 652, 84, INK);
      rect(context, left, y - 36, 640, 72, '#e2c79b');
      rect(context, left + 6.4 * (GREEN_CENTRE - GREEN_HALF_WIDTH), y - 36, 12.8 * GREEN_HALF_WIDTH, 72, GREEN);
      label(context, 'RELEASE', left + 6.4 * GREEN_CENTRE, y, 21, { colour: CREAM, align: 'center' });
      rect(context, left + greenPosition(time, variant) * 6.4 - 7, y - 48, 14, 96, INK);
      rect(context, left + greenPosition(time, variant) * 6.4 - 3, y - 43, 6, 86, CREAM);
    },
    pepper(context, x, y, time) {
      const shake = time < 0 ? 0 : Math.floor(time / 100) % 2 === 0 ? -8 : 8;
      icon(context, 'pepper', x + shake, y + 10);
      for (const dx of [-144, -112, 112, 144]) {
        pixels(context, x + dx, y - 32, 2, 1, JAM);
        pixels(context, x + dx, y + 24, 2, 1, JAM);
      }
    },
    picture(context, x, y, time, variant) {
      const angle = PICTURE_ANGLE[variant] * (time < 0 ? .005 : .0025 + .0025 * Math.cos(time / 270));
      pixels(context, x - 8, y - 110, 2, 2, INK);
      context.save();
      context.translate(x, y - 94);
      context.rotate(angle);
      rect(context, -4, 0, 8, 48, INK);
      rect(context, -100, 48, 200, 146, INK);
      rect(context, -88, 60, 176, 122, '#91bda5');
      icon(context, 'cheese', 0, 120, 6);
      context.restore();
    },
    crack(context, x, y, time) {
      const points = TRACE.map(([px, py]) => [x + (px - 46) * 7.7, y + (py - 49) * 2.7]);
      context.strokeStyle = INK;
      context.lineWidth = 14;
      context.lineJoin = 'bevel';
      context.beginPath();
      points.forEach(([px, py]) => context.lineTo(px, py));
      context.stroke();
      points.forEach(([px, py], index) => {
        rect(context, px - 21, py - 21, 42, 42, time >= 0 && Math.floor(time / 350) % 4 === index ? JAM : GREEN);
        label(context, String(index + 1), px, py, 26, { colour: CREAM, align: 'center' });
      });
    },
    arrow(context, x, y, time, variant) {
      disc(context, x, y, 108, '#e3c99e');
      const beat = time >= 0 && time % 480 > 260 ? 8 : 0;
      const dx = [0, beat, 0, -beat][variant];
      const dy = [-beat, 0, beat, 0][variant];
      arrow(context, x + dx, y + dy, variant);
    },
    wheel(context, x, y, time, variant) {
      const angle = cheeseAngle(time, variant) * Math.PI / 180 - Math.PI / 2;
      disc(context, x, y + 16, 101, INK);
      disc(context, x, y + 16, 90, '#dca578');
      disc(context, x, y + 16, 70, '#f0cb91');
      const cheeseArc = CHEESE_HALF_WIDTH * Math.PI / 180;
      context.strokeStyle = GOLD;
      context.lineWidth = 16;
      context.beginPath();
      context.arc(x, y + 16, 85, -Math.PI / 2 - cheeseArc, -Math.PI / 2 + cheeseArc);
      context.stroke();
      icon(context, 'cheese', x, y - 111, 4);
      context.strokeStyle = INK;
      context.lineWidth = 11;
      context.beginPath();
      context.moveTo(x, y + 16);
      context.lineTo(x + 75 * Math.cos(angle), y + 16 + 75 * Math.sin(angle));
      context.stroke();
      disc(context, x, y + 16, 12, INK);
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
    lookout(context, x, y, time, variant, realTime, reduced) {
      const looking = lalaLooks(realTime, variant);
      disc(context, x - 136, y, 96, looking ? '#e6a49b' : '#acd4ad');
      cat(context, x - 136, y, time, reduced, looking);
      label(context, looking ? 'WAIT' : 'TAP!', x + 105, y, 74, { colour: looking ? JAM : GREEN, align: 'center' });
    },
    snacks(context, x, y, time, variant) {
      for (let index = 0; index < 4; index++) {
        const px = x + (index - 1.5) * 167;
        const lift = time < 0 ? 0 : (time + index * 120) % 1000 < 240 ? 8 : 0;
        icon(context, index === variant ? 'berry' : 'cheese', px, y - 19 - lift);
        label(context, String(index + 1), px, y + 73, 31, { align: 'center' });
      }
    },
  };
  return {
    cat,
    draw(context, key, x, y, elapsed, variant, reduced) {
      // The cue itself stays live when motion communicates a scoring window.
      const essential = key === 'bar' || key === 'wheel';
      const animationTime = reduced && !essential ? -1 : elapsed;
      visuals[key](context, x, y, animationTime, variant, elapsed, reduced);
    },
  };
}
