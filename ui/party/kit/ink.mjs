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
import { palette, playerLook, drawBadge } from './ink-paper.mjs';
export * from './ink-paper.mjs';
export { Actor, P, mk, pathPose } from './ink-poses.mjs';

const THIGH = 30, SHIN = 30, UARM = 21, FARM = 21;
const LIMB = 5, ARM = 4.2, TORSO = 8.5, HEAD_R = 7.8, FAR = palette.far;
// In facing-right figure space, knees fold back and elbows fold forward.
const ARM_BEND = -1, KNEE_BEND = 1;
function ik(a, b, l1, l2, hint, bend) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  let d = Math.hypot(dx, dy);
  const base = Math.atan2(dy, dx);
  // Ease into full extension so a straightening limb's joint doesn't race across the last few units.
  const L = l1 + l2, soft = L * 0.96;
  if (d > soft) {
    d = soft + (L - soft) * (1 - Math.exp(-(d - soft) / (L - soft)));
  }
  d = Math.max(Math.abs(l1 - l2) + 0.01, Math.min(L - 0.001, d));
  const c = Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
  const ang = Math.acos(c);
  const j1 = [a[0] + l1 * Math.cos(base + ang), a[1] + l1 * Math.sin(base + ang)];
  const j2 = [a[0] + l1 * Math.cos(base - ang), a[1] + l1 * Math.sin(base - ang)];
  if (bend) {
    const side = (j) => (j[0] - a[0]) * (b[1] - j[1]) - (j[1] - a[1]) * (b[0] - j[0]);
    return Math.sign(side(j1)) === bend ? j1 : j2;
  }
  const d1 = Math.hypot(j1[0] - hint[0], j1[1] - hint[1]);
  const d2 = Math.hypot(j2[0] - hint[0], j2[1] - hint[1]);
  return d1 < d2 ? j1 : j2;
}
function relax(sh, t, amount) {
  const dx = t[0] - sh[0], dy = t[1] - sh[1];
  const d = Math.hypot(dx, dy);
  const want = (UARM + FARM) * 0.96;
  if (dy <= 0 || d < 1 || d >= want) {
    return t;
  }
  const w = (amount ?? 1) * Math.min(1, Math.max(0, (dy / d - 0.8) / 0.18));
  const k = w * w * (3 - 2 * w);
  const nd = d + (want - d) * k;
  return [sh[0] + (dx / d) * nd, sh[1] + (dy / d) * nd];
}
function reach(a, b, max) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const d = Math.hypot(dx, dy);
  if (d <= max) {
    return b;
  }
  return [a[0] + (dx / d) * max, a[1] + (dy / d) * max];
}
function breathe(p, amt) {
  if (!amt) {
    return p;
  }
  const o = Object.assign({}, p);
  const up = (v, k) => [v[0], v[1] - amt * k];
  o.head = up(p.head, 1);
  o.chest = up(p.chest, 0.85);
  o.hF = up(p.hF, 0.6);
  o.hB = up(p.hB, 0.6);
  return o;
}
const BODY = {
  classic: { head: 1, arm: 1, leg: 1, torso: TORSO },
  doodle: { head: 1.75, arm: 1, leg: 0.92, torso: 4.8, hollow: true, sameFar: true, eyes: true },
  doodleshirt: { head: 1.75, arm: 1, leg: 0.92, torso: 4.8, hollow: true, sameFar: true, eyes: true, shirt: true },
  sketch: { head: 1.6, arm: 0.78, leg: 0.74, torso: 3.6, hollow: true, sameFar: true, sketch: true },
  chunky: { head: 1.15, arm: 1.45, leg: 1.45, torso: TORSO * 1.3, mitts: true },
  googly: { head: 1.6, arm: 1, leg: 1, torso: TORSO, googly: true },
};

export function drawFigure(ctx, actorOrPose, x, y, o = {}) {

  const style = o.style || 'chunky';
  const B = BODY[style] || BODY.classic;
  const m = o.lw || 1;
  const ink = o.ink || (o.goon ? palette.goon : palette.ink);
  const far = B.sameFar ? ink : o.far || FAR;
  const p = breathe(actorOrPose.pose ?? actorOrPose, o.reducedMotion ? 0 : o.breath || 0);
  const af = Math.min(1, Math.abs(p.face));
  ctx.save();
  ctx.translate(x, y);
  ctx.scale((o.flip ? -1 : 1) * (o.scale || 1), o.scale || 1);
  if (o.rot) {
    const pv = o.pivot || [0, -8];
    ctx.translate(pv[0], pv[1]);
    ctx.rotate(o.rot);
    ctx.translate(-pv[0], -pv[1]);
  }
  const SK = B.sketch ? { seed: (o.seed || 0) * 7.3 + (o.reducedMotion ? 0 : Math.floor((o.time || 0) / 130)) * 3.1 } : null;

  function jit(i) {
    const v = Math.sin((SK ? SK.seed : 0) * 12.9898 + i * 78.233) * 43758.5453;
    return v - Math.floor(v) - 0.5;
  }
  function sketchStroke(pts, w) {
    const alpha = ctx.globalAlpha;
    for (let pass = 0; pass < 2; pass++) {
      ctx.lineWidth = pass ? w * 0.55 : w;
      ctx.globalAlpha = alpha * (pass ? 0.55 : 1);
      ctx.beginPath();
      for (let s = 0; s < pts.length - 1; s++) {
        const a = pts[s], b = pts[s + 1];
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
        for (let i = 0; i <= 4; i++) {
          const t = i / 4;
          const off = jit(s * 10 + i + pass * 50) * (pass ? 1.6 : 0.9) * Math.sin(t * Math.PI + 0.3);
          const ext = pass && s === 0 && i === 0 ? -2 : pass && s === pts.length - 2 && i === 4 ? 2 : 0;
          const px = a[0] + dx * t + nx * off + (dx / L) * ext, py = a[1] + dy * t + ny * off + (dy / L) * ext;
          if (s === 0 && i === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        }
      }
      ctx.stroke();
    }
    ctx.globalAlpha = alpha;
  }
  // tag ({ limb: 'arm' | 'leg', id }) marks a limb for pnpm game:motion, which checks every tagged limb by id.
  function strokePath(pts, w, col) {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (SK) {
      sketchStroke(pts, w);
      return;
    }
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i][0], pts[i][1]);
    }
    ctx.stroke();
  }
  function figFill(fill, lw, stroke) {
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  function figSeg(a, b, w, col) {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }
  function drawShirt(p, u, n, J, fill) {
    const c = p.chest, h = p.hip;
    const pt = (b, side, w, along) => [b[0] + n[0] * side * w + u[0] * along, b[1] + n[1] * side * w + u[1] * along];
    ctx.beginPath();
    const q = [pt(c, 1, 6.5, 1), pt(c, -1, 6.5, 1), pt(h, -1, 9.5, -8), pt(h, 1, 9.5, -8)];
    ctx.moveTo(q[0][0], q[0][1]);
    for (const v of q.slice(1)) {
      ctx.lineTo(v[0], v[1]);
    }
    ctx.closePath();
    figFill(fill, 2 * J.m, J.ink);
    figSeg(pt(h, 1, 8, 6), pt(h, -1, 8, 6), 2 * J.m, J.ink);
  }
  function drawMitt(h, col, m) {
    ctx.beginPath();
    ctx.arc(h[0], h[1], 4.8, 0, Math.PI * 2);
    figFill('#fff', 2.2 * m, col);
  }
  function drawBoot(f, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(f[0] + 3.5, f[1] + 1.5, 7.5, 4.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  function drawHead(B, hc, hr, ink, m) {
    ctx.beginPath();
    if (B.sketch) {
      const a0 = jit(5) * 3;
      for (let i = 0; i <= 26; i++) {
        const a = a0 + (i / 24) * Math.PI * 2;
        const r = hr * (1 + 0.06 * Math.sin(a * 3 + SK.seed));
        ctx[i ? 'lineTo' : 'moveTo'](hc[0] + Math.cos(a) * r, hc[1] + Math.sin(a) * r);
      }
      figFill('#fff', 2.4 * m, ink);
      return;
    }
    ctx.arc(hc[0], hc[1], hr, 0, Math.PI * 2);
    if (!B.hollow) {
      ctx.fillStyle = ink;
      ctx.fill();
    } else {
      figFill('#fff', 3.6 * m, ink);
    }
    if (B.eyes) {
      const y0 = hc[1] - hr * 0.22, y1 = hc[1] + hr * 0.12;
      figSeg([hc[0] + hr * 0.12, y0], [hc[0] + hr * 0.12, y1], 2.6 * m, ink);
      figSeg([hc[0] + hr * 0.52, y0], [hc[0] + hr * 0.52, y1], 2.6 * m, ink);
    }
    if (B.googly) {
      const r = hr * 0.34;
      for (const [ex, ey] of [[hc[0] + hr * 0.02, hc[1] - hr * 0.18], [hc[0] + hr * 0.6, hc[1] - hr * 0.12]]) {
        ctx.beginPath();
        ctx.arc(ex, ey, r, 0, Math.PI * 2);
        figFill('#fff', 1.1 * m, ink);
        ctx.fillStyle = ink;
        ctx.beginPath();
        ctx.arc(ex + r * 0.38, ey + r * 0.1, r * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const sx = p.chest[0] - p.hip[0], sy = p.chest[1] - p.hip[1];
  const sl = Math.hypot(sx, sy) || 1;
  const u = [sx / sl, sy / sl];
  const n = [-u[1], u[0]];
  const sideOff = 6.2 * (1 - af);
  const shF = [p.chest[0] + n[0] * sideOff - u[0], p.chest[1] + n[1] * sideOff - u[1]];
  const shB = [p.chest[0] - n[0] * sideOff - u[0], p.chest[1] - n[1] * sideOff - u[1]];
  const kF = ik(p.hip, p.fF, THIGH, SHIN, p.kF, KNEE_BEND);
  const kB = ik(p.hip, p.fB, THIGH, SHIN, p.kB, KNEE_BEND);
  const handF = reach(shF, p.hF, UARM + FARM);
  const handB = reach(shB, relax(shB, p.hB, p.hang), UARM + FARM);
  const eF = ik(shF, handF, UARM, FARM, p.eF, ARM_BEND);
  const eB = ik(shB, handB, UARM, FARM, p.eB, ARM_BEND);
  const hr = HEAD_R * B.head;
  const hd = [p.head[0] - p.chest[0], p.head[1] - p.chest[1]];
  const hl = Math.hypot(hd[0], hd[1]) || 1;
  const hu = [hd[0] / hl, hd[1] / hl];
  const neck = B.hollow ? 13 + hr : 20.5 + (hr - HEAD_R) * 0.9;
  const hc = [p.chest[0] + hu[0] * neck, p.chest[1] + hu[1] * neck];
  const J = { head: hc, hr, k: B.head, chest: p.chest, hip: p.hip, handF, handB, eF, eB, shF, shB, ax: p.ax || 0, ink, far, m, goon: !!o.goon, style };
  if (o.under) {
    o.under(J);
  }
  strokePath([shB, eB, handB], ARM * m * B.arm, far);
  if (B.mitts) {
    drawMitt(handB, far, m);
  }
  strokePath([p.hip, kB, p.fB], LIMB * m * B.leg, far);
  if (B.mitts) {
    drawBoot(p.fB, far);
  }
  const neckTop = B.hollow ? [hc[0] - hu[0] * hr, hc[1] - hu[1] * hr] : [p.chest[0] + u[0] * 0.5, p.chest[1] + u[1] * 0.5];
  strokePath([[p.hip[0] + u[0], p.hip[1] + u[1]], neckTop], B.torso * m, ink);
  strokePath([p.hip, kF, p.fF], LIMB * m * B.leg, ink);
  if (B.mitts) {
    drawBoot(p.fF, ink);
  }
  if (B.shirt) {
    drawShirt(p, u, n, J, o.shirt || (o.goon ? FAR : palette.butter));
  }
  drawHead(B, hc, hr, ink, m);
  if (o.mid) {
    o.mid(J);
  }
  strokePath([shF, eF, handF], ARM * m * B.arm, ink);
  if (B.mitts) {
    drawMitt(handF, ink, m);
  }
  if (o.over) {
    o.over(J);
  }
  if (o.look != null) {
    const look = playerLook(o.look);
    const [hx, hy] = hc;
    figSeg([hx - hr * 1.5, hy + 1], [hx + hr * .9, hy - hr * .45], 5 * m, ink);
    figSeg([hx - hr * 1.5, hy + 1], [hx + hr * .9, hy - hr * .45], 3.5 * m, look.colour);
    if (o.badge) drawBadge(ctx, look, p.chest[0] - 6, p.chest[1] + 5, 12);
  }
  ctx.restore();
  return J;
}
