import { createArcadeLoop, createJuice, createSoundHooks, createTimeline } from '../../kit/animation.mjs';
import { LOOKS } from '../../looks.mjs';
import { CENTRE_X, CENTRE_Y, CREAM, GOLD, HEIGHT, INK, PIXEL, WIDTH, WORLD_SCALE,
  createSumoArt, makeFloor, makeRug } from './art.mjs';

const RING_OUT_MS = 640;
const LALA_X = 1164;
const LALA_Y = 131;
const TAU = Math.PI * 2;
const SCREEN_X = x => CENTRE_X + x * WORLD_SCALE;
const SCREEN_Y = y => CENTRE_Y + y * WORLD_SCALE;

function interpolate(previous, current, amount, lerp) {
  return {
    ...current,
    elapsedMs: lerp(previous.elapsedMs, current.elapsedMs, amount),
    bodies: current.bodies.map((body, index) => {
      const before = previous.bodies[index];
      if (!before || body.outAt !== null) return body;
      return { ...body, x: lerp(before.x, body.x, amount), y: lerp(before.y, body.y, amount) };
    }),
  };
}

function box(context, x, y, width, height, radius, fill, stroke) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fillStyle = fill;
  context.fill();
  if (stroke) {
    context.strokeStyle = stroke;
    context.lineWidth = 2;
    context.stroke();
  }
}

function drawSidebars(context, roster, bodies, connected, art) {
  const leftCount = Math.ceil(roster.size / 2);
  for (const [index, body] of bodies.entries()) {
    const player = roster.get(body.id);
    const secondColumn = index >= leftCount;
    const row = secondColumn ? index - leftCount : index;
    const x = secondColumn ? WIDTH - 352 : 46;
    const y = 162 + row * 75;
    const colour = LOOKS[player.look].colour;
    const riding = body.outAt === null;
    const away = !connected.has(body.id);
    box(context, x, y, 306, 63, 12, '#302431', riding ? '#bf8a7366' : '#98748773');
    box(context, x + 12, y + 11, 40, 40, 6, riding ? colour : '#c8b0c5');
    art.badge(context, player.look, x + 18, y + 17, PIXEL);
    context.textAlign = 'left';
    context.font = '800 27px system-ui';
    context.fillStyle = riding ? CREAM : '#e1c6db';
    context.fillText(player.name, x + 65, y + (riding && !away ? 41 : 30), 226);
    if (!riding || away) {
      context.font = '800 16px system-ui';
      context.fillStyle = '#e2b8d6';
      context.fillText(away ? 'AWAY' : 'DRAUGHT', x + 65, y + 51);
    }
  }
}

function drawThread(context, scene, at, reduced, sprites, pulledAt) {
  const pulling = at - pulledAt < 610;
  const warning = scene.warning;
  const radius = scene.radius * WORLD_SCALE;
  const knotX = CENTRE_X + .8 * radius;
  const knotY = CENTRE_Y - .6 * radius;
  const pawX = LALA_X + 37;
  const pawY = LALA_Y + 111;
  context.beginPath();
  context.moveTo(knotX, knotY);
  context.bezierCurveTo(knotX + 51, knotY - 12, pawX - 38, pawY + (warning ? 4 : 50), pawX, pawY);
  context.lineWidth = warning ? 6 : 4;
  context.strokeStyle = warning ? GOLD : '#d38e70';
  context.stroke();
  const blink = !reduced && at % 3400 > 3230;
  sprites.lala(context, pulling ? 2 : Number(blink), LALA_X, LALA_Y);
  if (!warning) return;

  const forecastRadius = scene.warning.radius * WORLD_SCALE;
  context.beginPath();
  context.arc(CENTRE_X, CENTRE_Y, forecastRadius, 0, TAU);
  context.strokeStyle = '#392936';
  context.lineWidth = 9;
  context.stroke();
  context.strokeStyle = GOLD;
  context.lineWidth = 5;
  context.setLineDash([13, 9]);
  context.stroke();
  context.setLineDash([]);
  box(context, LALA_X - 35, LALA_Y + 133, 245, 56, 11, '#ffd782');
  context.fillStyle = INK;
  context.textAlign = 'center';
  context.font = '850 24px system-ui';
  context.fillText(`Lala pulls in ${Math.ceil(warning.ms / 1000)}`, LALA_X + 87, LALA_Y + 169);
}

function drawGusts(context, scene, reduced) {
  if (!scene.gusts.length) return;
  context.save();
  context.beginPath();
  context.arc(CENTRE_X, CENTRE_Y, scene.radius * WORLD_SCALE, 0, TAU);
  context.clip();
  for (const gust of scene.gusts) {
    const progress = Math.min(1, (scene.elapsedMs - gust.at) / gust.duration);
    const along = reduced ? 0 : (2 * progress - 1) * gust.radius * WORLD_SCALE;
    context.save();
    context.translate(CENTRE_X, CENTRE_Y);
    context.rotate(Math.atan2(gust.y, gust.x));
    context.strokeStyle = '#e9fcf1be';
    context.lineWidth = 4;
    context.lineCap = 'round';
    context.beginPath();
    for (let lane = -8; lane <= 8; lane++) {
      const y = lane * scene.radius / 4;
      const x = along - Math.abs(lane % 4) * 11;
      context.moveTo(x - 35 - Math.abs(lane % 3) * 13, y);
      context.quadraticCurveTo(x - 15, y - 5, x, y);
      context.lineTo(x - 8, y + 5);
    }
    context.stroke();
    context.restore();
  }
  context.restore();
}

function drawBody(context, body, player, { sprites, time, reduced, juice, outs, dashes }) {
  let x = SCREEN_X(body.x);
  let y = SCREEN_Y(body.y);
  const out = body.outAt !== null;
  const age = time - (outs.get(body.id) ?? -Infinity);
  if (out && age >= RING_OUT_MS) return;
  const dash = time - (dashes.get(body.id) ?? -Infinity) < 150;
  if (out && !reduced) {
    const distance = Math.hypot(body.x, body.y) || 1;
    const fall = age / RING_OUT_MS;
    x += body.x / distance * 69 * fall;
    y += body.y / distance * 69 * fall + 44 * fall * fall;
    context.globalAlpha = 1 - .82 * fall;
  }
  const colour = LOOKS[player.look].colour;
  if (out || dash) {
    context.beginPath();
    context.ellipse(x, y + 10, 33, 25, 0, 0, TAU);
    context.strokeStyle = out ? '#ffb393' : colour;
    context.lineWidth = 4;
    context.stroke();
  }
  context.fillStyle = '#201d27a6';
  context.beginPath();
  context.ellipse(x, y + 15, 32, 13, 0, 0, TAU);
  context.fill();
  const speed = body.vx * body.vx + body.vy * body.vy;
  const phase = time + player.look * 123;
  const pose = reduced ? 0 : dash || (speed > 80 && phase % 160 < 95) ? 2 : Number(phase % 2800 > 2580);
  const squash = reduced ? 0 : juice.squash(body.id, time);
  sprites.bunny(context, player.look, pose, x, y, squash);
  const badge = { x, y, colour, look: player.look, alpha: context.globalAlpha };
  context.globalAlpha = 1;
  return badge;
}

function drawBadge(context, badge, art) {
  const { x, y, colour, look, alpha } = badge;
  context.globalAlpha = alpha;
  box(context, Math.round(x) - 18, Math.round(y) - 7, 36, 35, 6, colour, INK);
  art.badge(context, look, x - 14, y - 4, PIXEL);
  context.globalAlpha = 1;
}

function drawFooter(context, live, count, text, colour) {
  box(context, WIDTH / 2 - 275, 788, 550, 49, 13, '#271d2bdc');
  context.textAlign = 'center';
  context.font = '850 26px system-ui';
  context.fillStyle = colour;
  context.fillText(text || `${live} of ${count} on the rug`, WIDTH / 2, 822, 510);
}

export function mountDustBunnyTv(canvas, { art, sound }) {
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.setAttribute('aria-label', 'Dust Bunny Sumo. Bump rivals off the rug and be the last bunny on.');
  const context = canvas.getContext('2d', { alpha: false });
  const document = canvas.ownerDocument;
  const floor = makeFloor(document);
  const backdrop = document.createElement('canvas');
  backdrop.width = WIDTH;
  backdrop.height = HEIGHT;
  const backdropContext = backdrop.getContext('2d', { alpha: false });
  const sprites = createSumoArt(document);
  const timeline = createTimeline();
  const juice = createJuice();
  const play = createSoundHooks(sound, { hit: 'move', out: 'error', dash: 'lure', gust: 'collect',
    warning: 'lure', shrink: 'cat', win: 'win' });
  const outs = new Map();
  const dashes = new Map();
  let roster;
  let rug;
  let previous;
  let lastEvent = 0;
  let pulledAt = -Infinity;
  let lastSoundAt = -Infinity;
  let lastOut;
  let finishText;
  let sidebarKey;
  let reducedHit;

  const loop = createArcadeLoop((time, reduced) => {
    if (!previous) return;
    const scene = timeline.sample(time, interpolate, reduced);
    context.drawImage(backdrop, 0, 0);
    context.save();
    const [dx, dy] = juice.offset(time);
    context.translate(dx, dy);
    context.drawImage(rug, CENTRE_X - rug.width / 2, CENTRE_Y - rug.height / 2);
    drawThread(context, scene, time, reduced, sprites, pulledAt);
    drawGusts(context, scene, reduced);
    const drawOrder = [...scene.bodies].sort((a, b) => a.y - b.y);
    const style = { sprites, time, reduced, juice, outs, dashes };
    const badges = drawOrder.map(body => drawBody(context, body, roster.get(body.id), style));
    // Keep player marks above the sprites when a pack bunches up.
    for (const badge of badges) if (badge) drawBadge(context, badge, art);
    if (reduced && reducedHit && time - reducedHit.time < 240) {
      context.beginPath();
      context.arc(reducedHit.x, reducedHit.y, 27, 0, TAU);
      context.strokeStyle = GOLD;
      context.lineWidth = 4;
      context.stroke();
    }
    juice.draw(context, time);
    context.restore();
    const live = scene.bodies.filter(body => body.outAt === null).length;
    const outText = lastOut && time - lastOut.time < 2800 ? `${lastOut.name} is a draught` : '';
    drawFooter(context, live, roster.size, finishText || outText, finishText ? GOLD : CREAM);
  }, value => juice.setReducedMotion(value));

  function showEvents(scene, time) {
    let cue;
    // Play at most one cue from a batch. A ring-out takes precedence over its hit.
    const priority = ['dash', 'hit', 'gust', 'warning', 'shrink', 'out'];
    if (!previous?.scene.warning && scene.warning) cue = 'warning';
    for (const event of scene.events) {
      if (event.id <= lastEvent) continue;
      lastEvent = event.id;
      const player = roster.get(event.playerId);
      const colour = player ? LOOKS[player.look].colour : GOLD;
      const x = SCREEN_X(event.x ?? 0);
      const y = SCREEN_Y(event.y ?? 0);
      if (event.kind === 'hit') {
        reducedHit = { x, y, time };
        juice.impact({ x, y, time, colour, id: event.playerId, strong: event.strong });
        juice.impact({ x, y, time, colour: LOOKS[roster.get(event.otherId).look].colour, id: event.otherId });
      } else if (event.kind === 'dash') {
        dashes.set(event.playerId, time);
        juice.impact({ x, y, time, colour });
      } else if (event.kind === 'out') {
        outs.set(event.playerId, time);
        lastOut = { name: player.name, time };
        juice.impact({ x, y: y - 34, time, colour, label: 'OUT!', strong: true });
      } else if (event.kind === 'shrink') {
        pulledAt = time;
      }
      if (!cue || priority.indexOf(event.kind) > priority.indexOf(cue)) cue = event.kind;
    }
    if (cue && (time - lastSoundAt > 95 || ['out', 'warning', 'shrink'].includes(cue))) {
      play(cue);
      lastSoundAt = time;
    }
  }

  function push(view) {
    const scene = view.scene;
    if (!scene) return;
    const time = performance.now();
    if (view.round !== previous?.round) {
      roster = new Map(view.roster.map(player => [player.id, player]));
      outs.clear();
      dashes.clear();
      juice.clear();
      lastEvent = 0;
      lastOut = reducedHit = finishText = sidebarKey = undefined;
      lastSoundAt = pulledAt = -Infinity;
    }
    if (!rug || scene.radius !== previous.scene.radius) rug = makeRug(document, scene.radius);
    const connected = new Set(view.players.filter(player => player.connected).map(player => player.id));
    const key = scene.bodies.map(body => (body.outAt === null ? 'r' : 'd') + (connected.has(body.id) ? '+' : '-')).join('');
    if (key !== sidebarKey) {
      backdropContext.drawImage(floor, 0, 0);
      drawSidebars(backdropContext, roster, scene.bodies, connected, art);
      sidebarKey = key;
    }
    showEvents(scene, time);
    if (view.phase === 'results' && previous?.phase !== 'results') {
      const winners = view.results.filter(result => result.place === 1);
      if (winners.length) {
        const winner = roster.get(winners[0].playerId);
        finishText = winners.length > 1 ? 'Shared first place!' : `${winner.name} wins!`;
        const body = scene.bodies.find(candidate => candidate.id === winner.id);
        juice.impact({ x: SCREEN_X(body.x), y: SCREEN_Y(body.y), time, colour: GOLD, strong: true });
        play('win');
      }
    }
    timeline.push(scene, view.round, time);
    previous = view;
  }

  return { push, setReducedMotion: loop.setReducedMotion, dispose: loop.dispose };
}
