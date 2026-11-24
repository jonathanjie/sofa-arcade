import { createArcadeLoop, createJuice, createSoundHooks, createTimeline } from '../../kit/animation.mjs';
import { LOOKS } from '../../looks.mjs';
import { BOOSTS, createPaddleArt, TEAMS } from './art.mjs';

const WIDTH = 1760;
const HEIGHT = 816;
const FIELD_X = 160;
const FIELD_Y = 132;
const TRAIL_LENGTH = 11;
const INK = '#070e18';
const WHITE = '#e9f6ff';
const LABEL = '#a6bbd2';
const TYPE = 'ui-monospace, monospace';

function surface(document, width, height) {
  return Object.assign(document.createElement('canvas'), { width, height });
}

function text(context, value, x, y, size, colour, align = 'left', maxWidth) {
  context.font = `800 ${size}px ${TYPE}`;
  context.fillStyle = colour;
  context.textAlign = align;
  if (maxWidth) context.fillText(value, x, y, maxWidth);
  else context.fillText(value, x, y);
}

function paintField(context, scene, players, art) {
  const { width, height } = scene.court;
  context.fillStyle = INK;
  context.fillRect(0, 0, WIDTH, HEIGHT);
  const light = context.createRadialGradient(WIDTH / 2, FIELD_Y + height / 2, 40, WIDTH / 2, FIELD_Y + height / 2, 730);
  light.addColorStop(0, '#132436');
  light.addColorStop(1, '#0a1523');
  context.fillStyle = light;
  context.fillRect(FIELD_X, FIELD_Y, width, height);

  context.save();
  context.translate(FIELD_X, FIELD_Y);
  context.beginPath();
  context.rect(0, 0, width, height);
  context.clip();
  context.strokeStyle = '#9fb7da13';
  context.beginPath();
  for (let x = 40; x < width; x += 40) {
    context.moveTo(x + 0.5, 0);
    context.lineTo(x + 0.5, height);
  }
  for (let y = 40; y < height; y += 40) {
    context.moveTo(0, y + 0.5);
    context.lineTo(width, y + 0.5);
  }
  context.stroke();
  context.strokeStyle = '#53749177';
  context.lineWidth = 2;
  context.setLineDash([5, 10]);
  context.beginPath();
  context.moveTo(width / 2, 0);
  context.lineTo(width / 2, height);
  context.stroke();
  context.setLineDash([]);
  context.beginPath();
  context.arc(width / 2, height / 2, 128, 0, Math.PI * 2);
  context.moveTo(width / 2 + 19, height / 2);
  context.arc(width / 2, height / 2, 19, 0, Math.PI * 2);
  context.stroke();
  context.restore();

  context.fillStyle = '#38516a';
  context.fillRect(FIELD_X, FIELD_Y - 3, width, 3);
  context.fillRect(FIELD_X, FIELD_Y + height, width, 3);
  for (const paddle of scene.paddles) {
    const { team, top, bottom, playerId } = paddle;
    const { name, look, status } = players.get(playerId);
    const { colour } = LOOKS[look];
    const left = team === 0;
    const wall = FIELD_X + (left ? 0 : width);
    const cardX = left ? 12 : wall + 16;
    const y = FIELD_Y + top;
    const slot = bottom - top;
    const marker = y + slot / 2;
    context.fillStyle = TEAMS[team].dark;
    context.fillRect(cardX, y + 3, 132, slot - 6);
    context.fillStyle = status ? '#6f8595' : colour;
    context.fillRect(cardX, y + 3, 3, slot - 6);
    context.fillStyle = TEAMS[team].rail;
    context.fillRect(wall - 2, y + 2, 4, slot - 4);
    context.fillRect(wall - 9, y, 18, 2);
    context.fillStyle = status ? '#6f8595' : colour;
    const badgeX = cardX + (status ? 13 : 48);
    context.fillRect(badgeX, marker - 30, 36, 36);
    art.badge(context, look, badgeX + 4, marker - 26, 4);
    text(context, name, cardX + 66, marker + 30, 23, WHITE, 'center', 114);
    if (status) text(context, status, cardX + 57, marker - 7, 16, LABEL, 'left', 67);
  }
}

function scoreboard(context, scene, goal, result, reduced, now) {
  for (const [index, team] of TEAMS.entries()) {
    const x = index === 0 ? FIELD_X : 1260;
    const scored = goal?.team === index && goal.until > now;
    context.fillStyle = scored ? team.rail : team.dark;
    context.fillRect(x, 19, 340, 88);
    context.fillStyle = team.light;
    context.fillRect(x, 19, 340, 4);
    text(context, team.name.toUpperCase(), x + 22, 55, 26, team.light);
    for (let point = 0; point < scene.target; point++) {
      context.fillStyle = point < scene.points[index] ? team.light : team.rail;
      context.fillRect(x + 23 + point * 22, 70, 16, 10);
    }
    const bump = scored && !reduced ? Math.ceil(13 * (goal.until - now) / 850) : 0;
    text(context, scene.points[index], x + 305, 86, 72 + bump, WHITE, 'right');
  }
  const leader = Math.sign(scene.points[1] - scene.points[0]);
  const title = result ? (leader ? `${TEAMS[leader > 0 ? 1 : 0].name.toUpperCase()} WINS` : 'TIED WALLS')
    : goal?.until > now ? `${TEAMS[goal.team].name.toUpperCase()} +1` : `FIRST TO ${scene.target}`;
  text(context, title, WIDTH / 2, 62, 42, WHITE, 'center');
  text(context, 'Guard your wall and send balls past theirs.', WIDTH / 2, 101, 24, LABEL, 'center');
}

function interp(previous, current, amount, lerp) {
  const last = new Map(previous.balls.map(ball => [ball.id, ball]));
  return {
    ...current,
    paddles: current.paddles.map((paddle, index) => ({
      ...paddle, y: lerp(previous.paddles[index].y, paddle.y, amount),
      length: lerp(previous.paddles[index].length, paddle.length, amount),
    })),
    balls: current.balls.map(ball => {
      const old = last.get(ball.id);
      return old ? { ...ball, x: lerp(old.x, ball.x, amount), y: lerp(old.y, ball.y, amount) } : ball;
    }),
  };
}

function drawPaddle(context, art, paddle, players, lit, scene, reduced, now) {
  const left = paddle.team === 0;
  const wall = FIELD_X + (left ? 0 : scene.court.width);
  const x = wall + (left ? -9 : -5);
  const y = FIELD_Y + paddle.y;
  const size = paddle.length;
  const { look, status } = players.get(paddle.playerId);
  const hit = lit.get(paddle.playerId) > now;
  const colour = status ? '#90a5ad' : LOOKS[look].colour;
  context.fillStyle = colour;
  context.fillRect(x, Math.round(y - size / 2), 14, Math.round(size));
  context.fillStyle = hit ? '#ffffff' : TEAMS[paddle.team].light;
  context.fillRect(wall + (left ? 1 : -5), Math.round(y - size / 2), 4, Math.round(size));
  const pose = hit ? 2 : (reduced || status ? 0 : Math.floor(now / 540 + look) % 2);
  art.drone(context, look, paddle.team, pose, wall, y - 14);
}

function drawBall(context, ball, traces, halo, reduced, at) {
  const x = FIELD_X + ball.x;
  const y = FIELD_Y + ball.y;
  const colour = ball.curved ? BOOSTS.curve.colour : TEAMS[ball.team]?.light ?? '#bde1ff';
  if (!reduced) {
    const entries = traces.get(ball.id) ?? [];
    const last = entries.at(-1);
    if (!last || (at - last.at >= 15 && Math.hypot(last.x - x, last.y - y) >= 2)) {
      entries.push({ x, y, at });
      if (entries.length > TRAIL_LENGTH) entries.shift();
    }
    traces.set(ball.id, entries);
    context.strokeStyle = colour;
    context.lineCap = 'round';
    for (let index = 0; index < entries.length; index++) {
      const point = entries[index];
      const next = entries[index + 1] ?? { x, y };
      const weight = Math.max(0, 1 - (at - point.at) / 190);
      context.globalAlpha = weight * 0.5;
      context.lineWidth = weight * 14 + 1;
      context.beginPath();
      context.moveTo(point.x, point.y);
      context.lineTo(next.x, next.y);
      context.stroke();
    }
    context.globalAlpha = 1;
  }
  context.drawImage(halo, Math.round(x) - 26, Math.round(y) - 26);
  context.fillStyle = colour;
  context.beginPath();
  context.arc(x, y, 10, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#f6fdff';
  context.beginPath();
  context.arc(x - 1, y - 1, 6, 0, Math.PI * 2);
  context.fill();
}

function ballHalo(document) {
  const canvas = surface(document, 52, 52);
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(26, 26, 4, 26, 26, 26);
  gradient.addColorStop(0, '#c6ecffa0');
  gradient.addColorStop(1, '#a6dfff00');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 52, 52);
  return canvas;
}

function drawPickup(context, art, scene) {
  if (scene.pickup) {
    const { x, y, kind } = scene.pickup;
    const boost = BOOSTS[kind];
    context.fillStyle = INK;
    context.strokeStyle = boost.colour;
    context.lineWidth = 3;
    context.beginPath();
    context.arc(FIELD_X + x, FIELD_Y + y, scene.court.pickupRadius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    art.boost(context, kind, FIELD_X + x, FIELD_Y + y);
    text(context, boost.name, FIELD_X + x, FIELD_Y + y + 51, 23, boost.colour, 'center');
  }
}

export function mountWallOfPaddlesTv(canvas, { art, sound }) {
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d', { alpha: false });
  const document = canvas.ownerDocument;
  const backdrop = surface(document, WIDTH, HEIGHT);
  const stage = canvas.parentElement;
  const stageBackground = stage?.style.background;
  if (stage) stage.style.background = INK;
  const paddleArt = createPaddleArt(document);
  const halo = ballHalo(document);
  const timeline = createTimeline();
  const juice = createJuice();
  const play = createSoundHooks(sound, { hit: 'move', goal: 'bank', win: 'win', boost: 'collect' });
  const traces = new Map();
  const lit = new Map();
  let roster = new Map();
  let round;
  let presence;
  let lastEvent = 0;
  let goal;
  let phase;

  const loop = createArcadeLoop((now, reduced) => {
    const scene = timeline.sample(now, interp, reduced);
    if (!scene) return;
    context.drawImage(backdrop, 0, 0);
    scoreboard(context, scene, goal, phase === 'results', reduced, now);
    context.save();
    context.beginPath();
    context.rect(FIELD_X - 10, FIELD_Y, scene.court.width + 20, scene.court.height);
    context.clip();
    const [dx, dy] = juice.offset(now);
    context.translate(dx, dy);
    if (dx || dy) context.drawImage(backdrop, 0, 0);
    drawPickup(context, paddleArt, scene);
    for (const paddle of scene.paddles) drawPaddle(context, paddleArt, paddle, roster, lit, scene, reduced, now);
    for (const ball of scene.balls) drawBall(context, ball, traces, halo, reduced, now);
    juice.draw(context, now);
    context.restore();
    if (scene.slow) text(context, 'SLOW MOTION', WIDTH / 2, 802, 22, BOOSTS.slow.colour, 'center');
  }, reduced => {
    juice.setReducedMotion(reduced);
    if (reduced) traces.clear();
  });

  function push(view) {
    const { scene } = view;
    if (!scene) return;
    const now = performance.now();
    const newRound = view.round !== round;
    const connected = new Map(view.players.map(player => [player.id, player.connected]));
    const status = id => (connected.has(id) ? (connected.get(id) ? '' : 'AWAY') : 'LEFT');
    const nextPresence = JSON.stringify(view.roster.map(player => status(player.id)));
    if (newRound || nextPresence !== presence) {
      roster = new Map(view.roster.map(player => [player.id, { ...player, status: status(player.id) }]));
      paintField(backdrop.getContext('2d'), scene, roster, art);
      presence = nextPresence;
    }
    if (newRound) {
      lastEvent = 0;
      goal = undefined;
      lit.clear();
      traces.clear();
      juice.clear();
    }
    let cue;
    for (const event of scene.events) {
      if (event.id <= lastEvent) continue;
      lastEvent = event.id;
      const { kind, team, playerId } = event;
      const colour = TEAMS[team].light;
      if (kind === 'hit') lit.set(playerId, now + 190);
      if (kind === 'goal') goal = { team, until: now + 850 };
      const x = FIELD_X + event.x;
      const y = FIELD_Y + event.y;
      juice.impact({ x, y, colour, label: kind === 'boost' ? BOOSTS[event.boost].name.toUpperCase() : undefined,
        time: now, strong: kind === 'goal' });
      if (!cue || kind === 'goal' || (cue === 'hit' && kind === 'boost')) cue = kind;
    }
    if (view.phase === 'results' && phase !== 'results') {
      const difference = scene.points[1] - scene.points[0];
      const colour = difference === 0 ? WHITE : TEAMS[difference > 0 ? 1 : 0].light;
      juice.impact({ x: WIDTH / 2, y: FIELD_Y + 74, colour, time: now, strong: true });
      cue = 'win';
    }
    if (cue) play(cue);
    const ids = new Set(scene.balls.map(ball => ball.id));
    for (const id of traces.keys()) if (!ids.has(id)) traces.delete(id);
    const label = `Cyan ${scene.points[0]}, Coral ${scene.points[1]}. Guard your wall and send balls past theirs.`;
    if (canvas.getAttribute('aria-label') !== label) canvas.setAttribute('aria-label', label);
    timeline.push(scene, view.round, now);
    round = view.round;
    phase = view.phase;
  }

  return {
    push, setReducedMotion: loop.setReducedMotion,
    dispose() {
      loop.dispose();
      if (stage) stage.style.background = stageBackground;
    },
  };
}
