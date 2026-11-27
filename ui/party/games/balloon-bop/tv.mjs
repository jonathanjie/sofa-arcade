// Balloon silhouette and string adapted from goofyfish/public/games/bopping.html.
// MIT © Kamran Ahmed. See docs/third-party/goofyfish-LICENSE.txt.
import { createArcadeLoop, createTimeline } from '../../kit/animation.mjs';
import { drawFigure, P, drawPaper, drawGround, drawNameTag, drawPopup, createInkEffects, inkShape, palette } from '../../kit/ink.mjs';

const court = { x: 0, y: 0, width: 1100, height: 550 };
const floor = 431;
const colours = ['#fcd34d', '#fff', '#fed7aa', '#fef3c7', '#ddd'];
function balloon(ctx, x, y, index, time) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = palette.ink;
  ctx.beginPath();
  ctx.moveTo(0, 20);
  const sway = 6 * Math.sin(time / 420 + index);
  ctx.bezierCurveTo(12 + sway, 32, -10 + sway, 42, sway, 50);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 0, 19, 24, -.08, 0, 2 * Math.PI);
  inkShape(ctx, colours[index % colours.length], 2.8);
  ctx.beginPath();
  ctx.moveTo(0, 22);
  ctx.lineTo(-4, 27);
  ctx.lineTo(4, 27);
  ctx.closePath();
  inkShape(ctx, colours[index % colours.length]);
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.ellipse(-7, -9, 3, 6, .5, 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();
}

export function resultSummary({ scene }) {
  return { label: scene.volley ? 'Left ' + scene.points[0] + '  ·  Right ' + scene.points[1] : 'Team score · ' + scene.team,
    colour: '#fde68a' };
}

function interpolate(previous, scene, amount, lerp) {
  const players = scene.players.map(p => {
    const old = previous.players.find(candidate => candidate.id === p.id);
    return old ? { ...p, x: lerp(old.x, p.x, amount), y: lerp(old.y, p.y, amount) } : p;
  });
  const balloons = scene.balloons.map((b, i) => {
    const old = previous.balloons[i];
    // A fresh serve after a drop starts at its new position immediately.
    if (!old || Math.abs(old.y - b.y) > 40) return b;
    return { x: lerp(old.x, b.x, amount), y: lerp(old.y, b.y, amount) };
  });
  return { ...scene, players, balloons };
}

export function mountTv(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const paper = document.createElement('canvas');
  paper.width = court.width;
  paper.height = court.height;
  drawPaper(paper.getContext('2d'), court);
  const timeline = createTimeline();
  const effects = createInkEffects();
  let view, area, lastEvent, began, frozenUntil = 0, lastScene;
  function draw(time, reduced) {
    if (!area || !view?.scene) return;
    const safe = area.safe;
    const scale = Math.min(safe.width / court.width, safe.height / court.height);
    const scene = !reduced && time < frozenUntil && lastScene ? lastScene : timeline.sample(time, interpolate, reduced);
    lastScene = scene;
    ctx.fillStyle = palette.paper;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(safe.x + (safe.width - court.width * scale) / 2, safe.y + (safe.height - court.height * scale) / 2);
    ctx.scale(scale, scale);
    ctx.translate(...effects.offset(time));
    ctx.drawImage(paper, 0, 0);
    drawGround(ctx, 30, 1070, floor);
    const heading = scene.volley ? 'Left  ' + scene.points[0] + '     |     ' + scene.points[1] + '  Right'
      : 'Team  ' + scene.team + '     ·     ' + (3 - scene.drops) + ' lives';
    ctx.font = 'bold 24px system-ui';
    ctx.fillStyle = palette.ink;
    ctx.textAlign = 'left';
    ctx.fillText(heading, 32, 31);
    if (scene.wind) ctx.fillText(scene.wind > 0 ? 'Gust  →' : '←  Gust', 925, 31);
    if (scene.volley) {
      ctx.fillStyle = '#888';
      ctx.fillRect(548, floor - 94, 4, 94);
      for (let y = floor - 94; y < floor; y += 10) ctx.fillRect(541, y, 18, 2);
    }
    // The goon throws from a step ladder beside the court.
    ctx.strokeStyle = palette.goon;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(8, floor); ctx.lineTo(17, floor - 90);
    ctx.lineTo(31, floor - 90); ctx.lineTo(41, floor);
    for (let rung = 1; rung < 5; rung++) {
      ctx.moveTo(17 - rung * 1.7, floor - 90 + rung * 18);
      ctx.lineTo(31 + rung * 1.9, floor - 90 + rung * 18);
    }
    ctx.stroke();
    for (const b of scene.balloons) {
      ctx.beginPath();
      ctx.moveTo(41 + b.x, floor + 5);
      ctx.lineTo(50 + b.x, floor - 3);
      ctx.lineTo(59 + b.x, floor + 5);
      ctx.closePath();
      inkShape(ctx, palette.butter);
    }
    drawFigure(ctx, scene.dart ? P.punch : P.crouch, 21, floor - 90, { scale: .53, goon: true });
    if (scene.dart) {
      ctx.fillStyle = palette.ink;
      ctx.font = 'bold 30px system-ui';
      ctx.fillText('➳', 34 + scene.dart.x, floor - scene.dart.y + 8);
    }
    for (const p of scene.players) {
      ctx.fillStyle = '#ded7c9';
      ctx.beginPath();
      ctx.ellipse(50 + p.x, floor, 16, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      drawFigure(ctx, p.y ? P.leap : P.ready, 50 + p.x, floor - p.y, { scale: .76, look: p.look, badge: true, flip: p.x > 500 });
    }
    scene.balloons.forEach((b, i) => balloon(ctx, 50 + b.x, floor - b.y, i, reduced ? 0 : time));
    const columns = Math.min(8, scene.players.length);
    scene.players.forEach((p, i) => {
      const width = Math.min(180, 1040 / columns);
      drawNameTag(ctx, view.roster.find(r => r.id === p.id)?.name ?? '', p.look,
        { x: (1100 - columns * width) / 2 + i % columns * width, y: 451 + Math.floor(i / columns) * 36, width: width - 4, height: 26 });
    });
    if (view.phase === 'countdown' || time - began < 2500) {
      drawPopup(ctx, 'Tap a spot to hop there and bop the balloon.', 550, 97, court);
      const phase = reduced ? .5 : time % 1200 / 1200;
      drawFigure(ctx, P.leap, 475 + 100 * phase, 209 - 150 * phase * (1 - phase), { scale: .43, look: 0 });
      balloon(ctx, 575, 125, 0, 0);
    }
    effects.draw(ctx, time, court);
    ctx.restore();
    canvas.dataset.bopPhase = view.phase;
  }
  const loop = createArcadeLoop(draw, reduced => effects.setReducedMotion(reduced));
  return { ...loop, dispose() { loop.dispose(); delete canvas.dataset.bopPhase; }, resize(size) { area = size; canvas.width = size.width; canvas.height = size.height; },
    push(next) {
      const now = performance.now();
      if (next.round !== view?.round) { lastEvent = null; effects.clear(); lastScene = null; }
      if (next.phase === 'playing' && view?.phase !== 'playing') began = now;
      view = next;
      timeline.push(next.scene, next.round, now);
      const event = next.scene?.event;
      if (event && event.id !== lastEvent) {
        lastEvent = event.id;
        const strong = !event.label.startsWith('+');
        effects.impact({ x: 50 + event.x, y: floor - event.y, label: event.label, time: now, strong });
        if (strong) frozenUntil = now + 55;
      }
    } };
}
