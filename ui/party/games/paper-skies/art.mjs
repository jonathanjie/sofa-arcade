import { compileStack, drawStack } from '../../kit/stack.mjs';
import { LOOKS } from '../../looks.mjs';

const TURN = Math.PI * 2;
const ink = '#38445a';
export const scarf = look => (LOOKS[look] ?? LOOKS[0]).colour;

function oval(c, x, y, rx, ry, colour, angle = 0) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, angle, 0, TURN);
  c.fillStyle = colour;
  c.fill();
}
function paper(c, colour, points) {
  c.beginPath();
  c.moveTo(...points[0]);
  for (const point of points.slice(1)) c.lineTo(...point);
  c.closePath();
  c.fillStyle = colour;
  c.fill();
}
function arc(c, x, y, rx, ry, angle, start, end, colour, width) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, angle, start, end);
  c.strokeStyle = colour;
  c.lineWidth = width;
  c.stroke();
}

// A back-swept tail narrows into the keel; the other edge tapers to an east-facing nose.
const halfWing = ['C', 'CCC', 'PCCCCC', 'PPCCCPPPP', '.PPCCCPPPPPP', '.PPPCCCPPPPPPPP',
  '..PPPCCCPPPPPPPPPP', '..PPPPCCCPPPPPPPPPPPP', '...PPPPCCCPPPPPPPPPPPPPP', '...FFFFFFFFFFFFFFFFFFFFFFFF'];
const wing = [...halfWing, ...halfWing.slice(0, -1).reverse().map(row => row.replaceAll('P', 'S'))]
  .map(row => row.padEnd(27, '.'));
const layers = [wing.map(row => row.replace(/[^.]/g, 'K')), wing,
  wing.map(row => row.replace(/[PCS]/g, '.')), wing.map(row => row.replace(/[PCS]/g, '.').replace('FFFFFFFF', '........'))];

export function createPlaneArt(document) {
  const models = new Map();
  return (c, plane, time, reduced) => {
    const { x, y, look, boost, wobble, bank, a } = plane;
    const angle = a + (wobble && !reduced ? Math.sin(time * 0.021) * 0.13 : 0);
    if (!models.has(look)) models.set(look, compileStack(document, layers, {
      C: scarf(look), P: '#fff6db', S: '#b9c8ce', K: ink, F: '#ffffee',
    }));
    oval(c, x + 9, y + 15, 21, 9, '#647a8525', angle);
    c.save();
    c.translate(x, y);
    c.rotate(angle);
    const length = boost ? 78 : 34 + Math.min(18, Math.max(0, plane.spd));
    const ripple = reduced ? 0 : Math.sin(time / 110) * 2;
    for (const side of [-1, 1]) {
      paper(c, boost ? '#fff3bedb' : '#fffbef8a', [[-17, side * 12], [-37, side * 13],
        [-length, side * 15 + ripple], [-36, side * 16], [-17, side * 16]]);
    }
    if (boost) paper(c, '#ed9854', [[-16, -3], [-48, ripple], [-16, 3]]);
    c.restore();
    drawStack(c, models.get(look), x, y, { angle, scale: 2, sliceGap: Math.abs(bank) > 0.25 ? 1 : 0.5 });
  };
}

export function paintSky(c, w, h) {
  const sky = c.createLinearGradient(0, 0, w * 0.3, h);
  for (const [at, colour] of [[0, '#8fcbd2'], [0.48, '#f8dfb7'], [0.75, '#edd2b0'], [1, '#c1d5be']]) sky.addColorStop(at, colour);
  c.fillStyle = sky;
  c.fillRect(0, 0, w, h);
  oval(c, w * 0.77, h * 0.17, 75, 75, '#fff0bf66');
  oval(c, w * 0.77, h * 0.17, 58, 58, '#fff1c8');
  const fields = ['#accabc', '#d1cfad', '#e4c5a8', '#bbd0b7'];
  for (let i = 0; i < 11; i++) oval(c, i * w / 9, h * 0.92, w / 6, h * (0.19 + 0.05 * Math.sin(i)), '#bdcebf');
  const corner = (col, row) => [(col - row * 0.19) * w / 9, h * (0.83 + 0.06 * row + 0.017 * Math.sin(col + row))];
  for (let row = 0; row < 4; row++) for (let col = 0; col < 11; col++) {
    paper(c, fields[(col * 3 + row) % 4], [corner(col, row), corner(col + 1, row), corner(col + 1, row + 1), corner(col, row + 1)]);
  }
  paper(c, '#a9cbd0', [[w * 0.69, h * 0.78], [w * 0.58, h * 0.89], [w * 0.63, h * 0.91], [w * 0.48, h],
    [w * 0.40, h], [w * 0.60, h * 0.91], [w * 0.55, h * 0.89]]);
}

export function thermal(c, { x, y, r }, time) {
  for (let i = 0; i < 3; i++) {
    const phase = time / 800 + i * 2;
    arc(c, x, y - i * 3, r * (1 - i * 0.2), r * (0.66 - i * 0.13), -0.2, phase, phase + 4.7, '#bd8658aa', 2.5);
  }
}
export function cloud(c, { x, y, r, gust }) {
  oval(c, x, y + r * 0.13, r, r * 0.45, gust ? '#64748c' : '#dbcbb7');
  const colour = gust ? '#909bac' : '#fff1d9';
  oval(c, x, y, r, r * 0.43, colour);
  oval(c, x - r * 0.29, y - r * 0.21, r * 0.48, r * 0.44, colour);
  oval(c, x + r * 0.19, y - r * 0.24, r * 0.42, r * 0.54, colour);
  if (gust) for (let i = 0; i < 2; i++) arc(c, x - i * 9, y + i * 9, r * 0.7, r * 0.16, -0.1, 0.2, 2.8, '#e2e9ed', 2);
}
export function hoop(c, { x, y, r, a, gold }, time) {
  const band = gold ? '#ffc85b' : '#7fdcf1';
  arc(c, x, y + 3, r * 0.56, r, a, 0, TURN, gold ? '#a16939' : '#40748a', 10);
  arc(c, x, y, r * 0.56, r, a, 0, TURN, band, 6);
  const start = time / 680;
  arc(c, x, y, r * 0.56, r, a, start, start + 1.1, '#fff9df', 3);
}
const balloonColours = ['#df7376', '#639fd1', '#b38ac2', '#73b99f'];
export function balloon(c, { x, y, r, pts, col }) {
  arc(c, x - r * 0.21, y + r * 1.45, r * 0.23, r * 0.49, 0.12, -1, 1.6, ink, 1.6);
  paper(c, ink, [[x, y + r * 0.9], [x - 3, y + r + 5], [x + 3, y + r + 5]]);
  oval(c, x, y + 2, r * 0.86, r, '#665772');
  oval(c, x, y, r * 0.86, r, balloonColours[col]);
  oval(c, x - r * 0.32, y - r * 0.46, r * 0.22, r * 0.11, '#fff6decc', -0.7);
  for (let i = 0; i < pts; i++) oval(c, x + (i - (pts - 1) / 2) * 6, y + 3, 2, 2, ink);
}
export function crown(c, x, y, time) {
  c.save();
  c.translate(x, y);
  c.scale(0.78 + 0.22 * Math.cos(time / 420), 1);
  oval(c, 0, 0, 20, 17, '#fff29d88');
  paper(c, '#9f6436', [[-15, -8], [-7, -3], [0, -15], [7, -3], [15, -8], [11, 9], [-11, 9]]);
  paper(c, '#ffcf53', [[-13, -7], [-6, -1], [0, -12], [6, -1], [13, -7], [10, 5], [-10, 5]]);
  oval(c, 0, 1, 2, 3, '#fff7ce');
  c.restore();
}
export function dart(c, { x, y, a, look }) {
  c.save(); c.translate(x, y); c.rotate(a);
  paper(c, ink, [[-20, 0], [-5, -4], [12, 0], [-5, 4]]);
  paper(c, scarf(look), [[-14, 0], [-5, -2], [9, 0]]);
  c.restore();
}
export function burst(c, event, age) {
  if (age < 0 || age >= 480) return;
  const t = age / 480;
  c.globalAlpha = 1 - t;
  const colours = { crown: '#ffcc50', ring: '#ecffff', hit: '#c36152', pop: scarf(event.look) };
  for (let i = 0; i < 8; i++) {
    const a = i * TURN / 8, radius = 8 + t * 32;
    oval(c, event.x + Math.cos(a) * radius, event.y + Math.sin(a) * radius, 4, 2, colours[event.type], a);
  }
  c.globalAlpha = 1;
}
