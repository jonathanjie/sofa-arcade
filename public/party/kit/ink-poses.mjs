// Adapted from goofyfish/.claude/skills/game/references/snippets.js.
/*
MIT License

Copyright (c) 2026 Kamran Ahmed

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
const lerp = (a, b, k) => a + (b - a) * k;
const EASE = {
  io: (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2),
  in: (k) => k * k,
  out: (k) => 1 - (1 - k) * (1 - k),
  lin: (k) => k,
  soft: (k) => 0.5 - Math.cos(Math.PI * k) / 2,
};

const BASE = {
  face: 1, ax: 0,
  head: [0, -121], chest: [0, -96], hip: [0, -65],
  fF: [1, -8], fB: [-4, -8], kF: [22, -38], kB: [10, -38],
  hF: [3, -57], hB: [-1, -57], eF: [-6, -78], eB: [-6, -78],
};
export const mk = (o, base = BASE) => Object.assign({}, base, o);
export const P = {};
P.stand = mk({});
P.ready = mk({ head: [2, -121], hF: [15, -84], eF: [5, -71], hB: [-4, -56], eB: [-6, -77] });
P.crouch = mk({ head: [6, -100], chest: [4, -76], hip: [-2, -46], kF: [24, -30], kB: [12, -28], hF: [16, -60], eF: [10, -56], hB: [-8, -52], eB: [-8, -60] });
P.leap = mk({ head: [4, -124], chest: [2, -99], hip: [0, -68], fF: [14, -30], fB: [-14, -26], kF: [20, -52], kB: [-2, -48], hF: [18, -140], eF: [16, -120], hB: [-14, -134], eB: [-12, -116] });
P.cheer = mk({ head: [0, -122], chest: [0, -97], hip: [0, -67], hF: [16, -136], hB: [-12, -134], eF: [14, -118], eB: [-12, -116] });
P.wince = mk({ head: [-3, -118], chest: [-2, -94], hip: [0, -65], kF: [20, -37], hF: [7, -125], eF: [19, -111], hB: [-7, -125], eB: [-20, -109] });
P.phew = mk({ head: [-1, -120], chest: [-1, -95], hip: [0, -65], hF: [13, -80], eF: [4, -68], hB: [2, -122], eB: [-14, -106] });
P.punch = mk({ head: [8, -118], chest: [6, -94], hip: [0, -64], kF: [24, -36], kB: [-8, -34], fF: [18, -8], fB: [-16, -8], hF: [44, -98], eF: [26, -96], hB: [2, -88], eB: [-6, -78] });

const PTS = ['head', 'chest', 'hip', 'fF', 'fB', 'kF', 'kB', 'hF', 'hB', 'eF', 'eB'];

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
export function pathPose(list, u) {
  if (u <= 0 || list.length === 1) return list[0];
  if (u >= 1) return list.at(-1);
  const n = list.length - 1;
  const x = Math.min(n - 1e-6, Math.max(0, u * n));
  const i = Math.floor(x), t = x - i;
  const a = list[Math.max(0, i - 1)], b = list[i], c = list[i + 1], d = list[Math.min(n, i + 2)];
  const o = Object.assign({}, c, { face: lerp(b.face, c.face, t), hang: lerp(b.hang ?? 1, c.hang ?? 1, t), ax: lerp(b.ax ?? 0, c.ax ?? 0, t) });
  for (const k of PTS) {
    o[k] = [catmull(a[k][0], b[k][0], c[k][0], d[k][0], t), catmull(a[k][1], b[k][1], c[k][1], d[k][1], t)];
  }
  return o;
}

// An Actor plays queued pose steps: actor.push({ pose: P.crouch, d: 0.12 }, { pose: P.leap, d: 0.2, ez: 'out' }).
// A step can also be { path: [P.a, P.b, P.c], d } for a smooth curve through several poses, or { fn: () => {} } to run code.
export class Actor {
  constructor(pose) {
    this.pose = pose || P.ready;
    this.q = [];
    this.step = null;
    this.t = 0;
  }
  push(...steps) {
    this.q.push(...steps);
  }
  clear() {
    this.q = [];
    this.step = null;
  }
  get idle() {
    return !this.step && !this.q.length;
  }
  update(dt) {
    while (this.step || this.q.length) {
      if (!this.step) {
        if (!this.q.length) {
          return;
        }
        this.step = { ...this.q.shift() };
        this.t = 0;
        if (this.step.fn) {
          const fn = this.step.fn;
          this.step = null;
          fn();
          continue;
        }
        const targets = this.step.path || (this.step.pose ? [this.step.pose] : [this.pose]);
        this.step.list = [this.pose, ...targets];
      }
      this.t += dt;
      const s = this.step;
      const k = s.d > 0 ? Math.min(1, this.t / s.d) : 1;
      this.pose = pathPose(s.list, (EASE[s.ez] || EASE.soft)(k));
      if (k < 1) {
        return;
      }
      dt = this.t - s.d;
      this.step = null;
    }
  }
}
