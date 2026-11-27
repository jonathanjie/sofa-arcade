// Art direction adapted from goofyfish/public/games/stomping.html (MIT, © Kamran Ahmed).
import { createInkEffects, drawFigure, drawGround, drawNameTag, drawPaper, drawPopup, inkShape, P, palette } from '../../kit/ink.mjs';

const area = { x: 0, y: 0, width: 1000, height: 550 };
export const instruction = 'Tap to hop forward. Hold, then release to hop higher.';

// Try nearby rows before shifting a label sideways. A line keeps a displaced
// tag attached to the correct jumper when several land on the same head.
function placeTag(p, placed) {
  const anchor = Math.max(3, Math.min(917, p.x - 40));
  for (const offset of [0, -82, 82, -164, 164]) {
    const x = Math.max(3, Math.min(917, anchor + offset));
    for (const dy of [6, 26, -79, 46, -99, 66, -119]) {
      const y = Math.max(48, Math.min(505, p.y + dy));
      if (placed.every(r => Math.abs(r.x - x) >= 81 || Math.abs(r.y - y) >= 18))
        return { x, y, width: 80, height: 17 };
    }
  }
  return { x: anchor, y: p.y + 6, width: 80, height: 17 };
}

function triangle(c, x, y, dx, dy) {
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x + dx, y + dy);
  c.lineTo(x + 16, y);
  c.closePath();
  inkShape(c, palette.ink, 1);
}

export function mountTv(canvas) {
  const c = canvas.getContext('2d');
  const paper = document.createElement('canvas');
  paper.width = 1000;
  paper.height = 550;
  const background = paper.getContext('2d');
  drawPaper(background, area);
  for (let x = 0; x < 1000; x += 17) triangle(background, x, 527, 9, -17 - (x % 5));
  drawGround(background, 0, 1000, 528);
  const effects = createInkEffects();
  let safe;
  let streak;
  let view, prior, reduced = false, frame, freezeUntil = 0;
  function drawFrame(now) {
    frame = requestAnimationFrame(drawFrame);
    const s = view?.scene;
    if (!s || (!reduced && now < freezeUntil)) return;
    const box = safe ?? { x: 0, y: 0, width: canvas.width, height: canvas.height };
    const scale = Math.min(box.width / 1000, box.height / 550);
    c.resetTransform();
    c.fillStyle = palette.paper;
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.setTransform(scale, 0, 0, scale, box.x + (box.width - 1000 * scale) / 2, box.y + (box.height - 550 * scale) / 2);
    c.drawImage(paper, 0, 0);
    c.save();
    c.translate(...effects.offset(now));
    for (let y = 95; y < 510; y += 18) {
      c.fillStyle = palette.ink;
      c.fillRect(s.wall - 4, y, 4, 20);
      c.beginPath();
      c.moveTo(s.wall, y);
      c.lineTo(s.wall + 12, y - 8);
      c.lineTo(s.wall, y + 8);
      c.fill();
    }
    for (const g of s.goons) {
      const size = g.brim ? .27 : .42;
      drawFigure(c, P.ready, g.x, g.y + 128 * size, { scale: size, goon: true, flip: g.dir < 0 });
      if (g.brim) {
        c.beginPath();
        c.ellipse(g.x, g.y, g.brim, 3, 0, 0, Math.PI * 2);
        inkShape(c, palette.goon);
      }
    }
    const tags = [];
    for (const p of s.players) {
      if (!p.lives) continue;
      if (p.balloon > 0) {
        c.beginPath();
        c.moveTo(p.x + 8, p.y - 39);
        c.lineTo(p.x + 14, p.y - 81);
        c.stroke();
        c.beginPath();
        c.ellipse(p.x + 14, p.y - 89, 11, 15, .1, 0, Math.PI * 2);
        inkShape(c);
      }
      const pose = p.squashed || p.riding ? P.crouch : p.balloon || p.rising ? P.leap : P.wince;
      drawFigure(c, pose, p.x, p.y + 10, { scale: .48, look: p.look, flip: p.dir < 0 });
      tags.push({ ...placeTag(p, tags), p });
    }
    for (const tag of tags) {
      const p = tag.p;
      c.beginPath();
      c.moveTo(p.x, p.y);
      c.lineTo(tag.x + 40, tag.y + 8);
      c.strokeStyle = palette.far;
      c.stroke();
    }
    for (const tag of tags) {
      drawNameTag(c, tag.p.name ?? tag.p.id, tag.p.look, tag);
    }
    c.restore();
    effects.draw(c, now, area);
    if (view.phase === 'countdown' || s.elapsedMs < 2600) {
      const phase = reduced ? .5 : (now % 1200) / 1200;
      drawFigure(c, P.leap, 159, 69 - 13 * Math.sin(Math.PI * phase), { scale: .29, look: 0 });
      drawPopup(c, instruction, 525, 66, area);
    } else if (streak && now < streak.until) {
      drawPopup(c, streak.text, 500, 42, area);
    }
  }
  frame = requestAnimationFrame(drawFrame);
  return {
    push(next) {
      prior = view;
      view = next;
      if (prior?.round !== next.round) {
        effects.clear();
        streak = undefined;
      } else for (const p of next.scene?.players ?? []) {
        const last = prior.scene?.players.find(q => q.id === p.id);
        if (last && p.hits > last.hits) {
          const now = performance.now();
          const milestone = p.chain % 3 === 0;
          effects.impact({ x: p.x, y: p.y, time: now, strong: milestone });
          if (milestone) streak = { text: (p.name ?? p.id) + ' · ' + p.chain + ' hops', until: now + 700 };
          freezeUntil = now + 30;
        }
      }
    },
    setReducedMotion(value) {
      reduced = value || matchMedia('(prefers-reduced-motion: reduce)').matches;
      effects.setReducedMotion(reduced);
    },
    resize({ width, height, safe: bounds }) { canvas.width = width; canvas.height = height; safe = bounds; },
    dispose() { cancelAnimationFrame(frame); effects.clear(); },
  };
}
