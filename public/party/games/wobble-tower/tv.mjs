// Swing and falling offcuts adapted from goofyfish public/games/stacks.html and planks.html.
// © Kamran Ahmed, MIT. See docs/third-party/goofyfish-LICENSE.txt.
import { createArcadeLoop } from '../../kit/animation.mjs';
import { P, drawFigure, drawPaper, drawGround, drawNameTag, inkShape, palette, createInkEffects } from '../../kit/ink.mjs';

const area = { x: 0, y: 0, width: 1280, height: 660 };
const titles = { tallest: 'Tallest Tower', coop: "Don’t Topple", duel: 'Plank Duel' };
const crews = ['Bolt Crew', 'Rivet Crew'];

export function mountTv(canvas) {
  const ctx = canvas.getContext('2d');
  const paper = document.createElement('canvas');
  paper.width = area.width;
  paper.height = area.height;
  drawPaper(paper.getContext('2d'), area);
  const effects = createInkEffects();
  let view, shownTurn, hitAt = -Infinity;
  function plank(x, y, w, colour) {
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y, w, 19, 3);
    inkShape(ctx, colour, 3);
    if (w > 24) {
      ctx.fillStyle = palette.ink;
      for (const end of [-1, 1]) ctx.fillRect(x + end * (w / 2 - 8), y + 8, 3, 3);
    }
  }
  function title(text, x, y, size) {
    ctx.fillStyle = palette.ink;
    ctx.font = '900 ' + size + 'px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(text, x, y);
  }
  const loop = createArcadeLoop((time, reduced) => {
    if (!view?.scene) return;
    const s = view.scene;
    const teaching = view.phase === 'countdown';
    const active = s.roster.find(p => p.id === s.active);
    const center = lane => s.towers.length === 1 ? 640 : 356 + lane * 568;
    const deck = 395;
    ctx.drawImage(paper, 0, 0);
    title(titles[s.mode], 640, 38, 25);
    title(teaching ? 'Tap when the plank lines up.' : (active?.name ?? 'Crew') + ' · Your drop!', 640, 89, 42);
    if (s.event && shownTurn !== s.turn) {
      shownTurn = s.turn;
      hitAt = time;
      effects.clear();
      effects.impact({ x: center(s.event.lane), y: deck - 120, time, strong: true, label: s.event.label });
    }
    const age = time - hitAt;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 100, area.width, 335);
    ctx.clip();
    ctx.translate(...effects.offset(time));
    s.towers.forEach((tower, lane) => {
      const cx = center(lane);
      const layers = tower.layers.slice(-7);
      const topY = deck - layers.length * 19;
      layers.forEach((l, i) => plank(cx + l.x, deck - 19 * (i + 1), l.w, i % 2 ? '#f5e1ab' : '#efeae0'));
      drawGround(ctx, cx - 225, cx + 225, deck, lane);
      const rocking = !reduced && age < 660 && s.event?.lane === lane;
      const landing = rocking && age < 155;
      if (landing) {
        const progress = Math.min(1, age / 105);
        plank(cx + s.event.block.x, topY - 105 * (1 - progress * progress), s.event.block.w, palette.butter);
      }
      drawFigure(ctx, rocking ? P.wince : P.ready, cx + layers.at(-1).x, topY + 5,
        { scale: .75, goon: true, rot: rocking ? Math.sin(age / 50) * (1 - age / 660) * .22 : 0, reducedMotion: reduced });
      if (s.lane === lane && !landing) {
        const demo = teaching ? (reduced ? 0 : Math.sin(time / 390)) : null;
        const x = cx + (teaching ? demo * 125 : s.moving.x);
        const y = teaching && Math.abs(demo) < .23 ? topY - 22 : topY - 105;
        ctx.beginPath();
        ctx.moveTo(cx, 109);
        ctx.lineTo(x, y);
        ctx.strokeStyle = palette.far;
        ctx.lineWidth = 3;
        ctx.stroke();
        plank(x, y, s.moving.w, palette.butter);
        if (teaching) title('TAP ↓', cx + 145, topY - 32, 22);
      }
      if (rocking && s.event.cut && age > 155) {
        ctx.save();
        ctx.translate(cx + s.event.x, topY + age * age / 1600);
        ctx.rotate(age / 460);
        plank(0, 0, s.event.cut, '#eed394');
        ctx.restore();
      }
      const caption = s.mode === 'coop' ? 'Best ' + s.peak : s.mode === 'duel' ? crews.map((c,i) => c + ' ' + s.points[i]).join('   /   ') : crews[lane];
      title(caption + '   ·   ' + tower.height + (tower.height === 1 ? ' floor' : ' floors'), cx, deck + 31, 23);
    });
    ctx.restore();
    effects.draw(ctx, time, area);
    s.roster.forEach((p, i) => {
      const members = s.roster.filter(other => other.side === p.side);
      const slot = members.indexOf(p);
      const width = 565 / Math.min(4, members.length);
      const x = 62 + 593 * p.side + width * (slot % 4 + .5);
      const y = 509 + Math.floor(slot / 4) * 121;
      const pose = p.id === s.active ? P.cheer : i % 3 === 1 ? P.ready : P.stand;
      drawFigure(ctx, pose, x, y, { look: p.look, flip: !!p.side, scale: .58, reducedMotion: reduced });
      drawNameTag(ctx, p.name, p.look, { x: x - 64, y: y - 1, width: 128, height: 29 });
    });
  }, value => effects.setReducedMotion(value));
  canvas.width = 1280;
  canvas.height = 660;
  return { ...loop, push(next) {
    if (next.round !== view?.round) { effects.clear(); shownTurn = undefined; hitAt = -Infinity; }
    view = next;
  } };
}

export function resultSummary({ scene }) {
  if (!scene) return null;
  const floors = n => n + (n === 1 ? ' floor' : ' floors');
  if (scene.mode === 'coop') return { label: 'Crew record · ' + floors(scene.peak), colour: '#ffe59b' };
  const [a, b] = scene.mode === 'duel' ? scene.points : scene.towers.map(tower => tower.height);
  const winner = a === b ? 'Crews tied' : crews[a > b ? 0 : 1] + ' wins';
  return { label: winner + ' · ' + a + ' to ' + b, colour: '#ffe59b' };
}
