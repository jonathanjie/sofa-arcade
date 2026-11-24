import { createArcadeLoop, createJuice, createSoundHooks, createTimeline } from '../../kit/animation.mjs';
import { LOOKS } from '../../looks.mjs';
import { BOOSTS, createPaddleArt, TEAMS } from './art.mjs';

const TRAIL_LENGTH = 10;
const GOAL_MS = 1250;
const INK = '#080e19';
const WHITE = '#edf7ff';
const LABEL = '#b3c6dc';
const INSTRUCTIONS = 'Slide to block balls. Send them past the other wall.';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function text(context, value, x, y, size, colour, align = 'center', maxWidth) {
  context.font = `800 ${size}px system-ui, sans-serif`;
  context.fillStyle = colour;
  context.textAlign = align;
  if (maxWidth) context.fillText(value, x, y, maxWidth);
  else context.fillText(value, x, y);
}

function fitCourt(safe, court) {
  const flank = Math.min(246, Math.round(safe.width * 0.155));
  const header = clamp(Math.round(safe.height * 0.125), 65, 125);
  const width = safe.width - 2 * flank;
  const height = Math.max(1, safe.height - header - 16);
  return {
    safe, flank, header, width, height,
    left: safe.x + flank, right: safe.x + flank + width, top: safe.y + header, bottom: safe.y + header + height,
    sx: width / court.width, sy: height / court.height,
  };
}

function paintField(context, layout, width, height) {
  const { left, right, top, bottom } = layout;
  context.fillStyle = INK;
  context.fillRect(0, 0, width, height);
  const wallLight = context.createLinearGradient(left, 0, right, 0);
  wallLight.addColorStop(0, '#0c2a39');
  wallLight.addColorStop(0.23, '#111e30');
  wallLight.addColorStop(0.77, '#151d30');
  wallLight.addColorStop(1, '#321b30');
  context.fillStyle = wallLight;
  context.fillRect(left, top, layout.width, layout.height);

  context.strokeStyle = '#b7d7fa12';
  context.lineWidth = 1;
  context.beginPath();
  for (let column = 1; column < 24; column++) {
    const x = left + column * layout.width / 24;
    context.moveTo(x, top);
    context.lineTo(x, bottom);
  }
  for (let row = 1; row < 16; row++) {
    const y = top + row * layout.height / 16;
    context.moveTo(left, y);
    context.lineTo(right, y);
  }
  context.stroke();

  const center = (left + right) / 2;
  const middle = (top + bottom) / 2;
  const circle = Math.min(layout.width, layout.height) * 0.19;
  context.strokeStyle = '#8faec658';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(center, top);
  context.lineTo(center, bottom);
  context.moveTo(center + circle, middle);
  context.arc(center, middle, circle, 0, 2 * Math.PI);
  context.moveTo(center + 9, middle);
  context.arc(center, middle, 9, 0, 2 * Math.PI);
  context.stroke();
  context.fillStyle = '#6485a6';
  context.fillRect(left - 3, top - 3, layout.width + 6, 3);
  context.fillRect(left - 3, bottom, layout.width + 6, 3);
}

function winningTeam(scene) {
  if (scene.walkover) return TEAMS[scene.paddles[0]?.team];
  const [cyan, coral] = scene.points;
  return cyan === coral ? undefined : TEAMS[cyan > coral ? 0 : 1];
}

function drawScores(context, scene, layout, phase, goals, now) {
  const { safe, left, right, header } = layout;
  const scale = Math.min(1, header / 112, safe.width / 1560);
  const cardWidth = 300 * scale;
  const cardTop = safe.y + 5;
  const center = (left + right) / 2;
  for (const [index, team] of TEAMS.entries()) {
    const x = index === 0 ? left : right - cardWidth;
    const scored = goals[index]?.until > now;
    context.fillStyle = scored ? team.rail : team.dark;
    context.fillRect(x, cardTop, cardWidth, 91 * scale);
    context.fillStyle = team.light;
    context.fillRect(x, cardTop, cardWidth, 3);
    text(context, team.name.toUpperCase(), x + 18 * scale, cardTop + 38 * scale, 26 * scale, team.light, 'left');
    text(context, scene.points[index], x + cardWidth - 18 * scale, cardTop + 70 * scale, 64 * scale, WHITE, 'right');
    const barWidth = 113 * scale;
    context.fillStyle = '#ffffff25';
    context.fillRect(x + 18 * scale, cardTop + 65 * scale, barWidth, 6 * scale);
    context.fillStyle = team.light;
    context.fillRect(x + 18 * scale, cardTop + 65 * scale, barWidth * Math.min(1, scene.points[index] / scene.target), 6 * scale);
  }

  let title = `TARGET ${scene.target}`;
  let subtitle = INSTRUCTIONS;
  let colour = WHITE;
  const [cyanGoal, coralGoal] = goals;
  const goal = (cyanGoal?.until ?? 0) > (coralGoal?.until ?? 0) ? cyanGoal : coralGoal;
  if (phase === 'results') {
    const team = winningTeam(scene);
    title = team ? `${team.name.toUpperCase()} WINS` : scene.walkover ? 'ROUND CLOSED' : 'TIED WALLS';
    subtitle = scene.walkover && team ? 'The other wall is empty.' : `Final score  ${scene.points[0]} – ${scene.points[1]}`;
    colour = team?.light ?? WHITE;
  } else if (goal && now < goal.until) {
    if (cyanGoal?.until === coralGoal?.until) title = 'BOTH TEAMS SCORE';
    else {
      title = `${TEAMS[goal.team].name.toUpperCase()} SCORES +${goal.count}`;
      colour = TEAMS[goal.team].light;
    }
  } else if (scene.opening && Math.max(...scene.points) >= scene.target) {
    title = 'HOLD THE LEAD';
  }
  text(context, title, center, cardTop + 45 * scale, 43 * scale, colour, 'center', 515 * scale);
  text(context, subtitle, center, cardTop + 82 * scale, 23 * scale, LABEL, 'center', 550 * scale);
}

function interp(previous, current, amount, lerp) {
  const oldPaddles = new Map(previous.paddles.map(paddle => [paddle.playerId, paddle]));
  const oldBalls = new Map(previous.balls.map(ball => [ball.id, ball]));
  return {
    ...current,
    paddles: current.paddles.map(paddle => {
      const old = oldPaddles.get(paddle.playerId);
      if (!old) return paddle;
      return {
        ...paddle, y: lerp(old.y, paddle.y, amount), length: lerp(old.length, paddle.length, amount),
        top: lerp(old.top, paddle.top, amount), bottom: lerp(old.bottom, paddle.bottom, amount),
      };
    }),
    balls: current.balls.map(ball => {
      const old = oldBalls.get(ball.id);
      return old ? { ...ball, x: lerp(old.x, ball.x, amount), y: lerp(old.y, ball.y, amount) } : ball;
    }),
  };
}

function drawPaddle(context, art, paddle, identity, layout, droneScale, hit, squash) {
  const { team, top, bottom, y, length } = paddle;
  const { look, name, away } = identity;
  const { left, right, flank, sy } = layout;
  const isLeft = team === 0;
  const wall = isLeft ? left : right;
  const slotY = layout.top + top * sy;
  const slotHeight = (bottom - top) * sy;
  const center = slotY + slotHeight / 2;
  const cardX = isLeft ? wall - flank + 10 : wall + 16;
  const cardWidth = flank - 26;
  const paddleY = layout.top + y * sy;
  const paddleHeight = length * sy;
  const paddleWidth = clamp(flank * 0.125, 10, 28) + squash * 4;
  const colour = away ? '#9baebd' : LOOKS[look].colour;
  const palette = TEAMS[team];
  context.fillStyle = palette.dark;
  context.fillRect(cardX, slotY + 4, cardWidth, Math.max(0, slotHeight - 8));
  context.fillStyle = '#ffffff25';
  context.fillRect(cardX, slotY + 4, cardWidth, 1);
  context.fillStyle = palette.rail;
  context.fillRect(wall - 4, slotY + 4, 8, Math.max(0, slotHeight - 8));
  // Brackets mark the limits of a player's travel; the bright paddle is the hit surface.
  context.fillStyle = palette.light;
  context.fillRect(wall - 11, slotY + 1, 22, 2);
  context.fillRect(wall - 11, slotY + slotHeight - 3, 22, 2);
  context.fillStyle = hit ? WHITE : colour;
  context.fillRect(isLeft ? wall - paddleWidth : wall, paddleY - paddleHeight / 2, paddleWidth, paddleHeight);
  context.fillStyle = hit ? colour : palette.light;
  context.fillRect(isLeft ? wall - 5 : wall, paddleY - paddleHeight / 2, 5, paddleHeight);

  const nameCenter = isLeft ? cardX + cardWidth * 0.23 : cardX + cardWidth * 0.77;
  const badgeScale = slotHeight >= 75 && flank > 135 ? 4 : 2;
  const badgeSize = 9 * badgeScale;
  const badgeY = center - badgeSize / 2 - (away ? 20 : 12);
  const badgeX = Math.round(nameCenter - badgeSize / 2);
  if (slotHeight >= 39) {
    context.fillStyle = colour;
    context.fillRect(badgeX, badgeY, badgeSize, badgeSize);
    art.shared.badge(context, look, badgeX + badgeScale, badgeY + badgeScale, badgeScale);
  }
  const labelSize = clamp(slotHeight / 5, 11, 26);
  text(context, name, nameCenter, center + (badgeScale === 4 ? 26 : 15), labelSize, WHITE, 'center', cardWidth * 0.42);
  if (away && slotHeight >= 66) text(context, 'AWAY', nameCenter, center + 42, 13, LABEL);

  const droneX = isLeft ? cardX + cardWidth * 0.74 : cardX + cardWidth * 0.26;
  const halfDrone = 11 * droneScale / 2 + 4;
  const droneY = clamp(paddleY, slotY + halfDrone, slotY + slotHeight - halfDrone);
  if (slotHeight >= 156) {
    context.fillStyle = '#ffffff26';
    context.fillRect(droneX - 1, slotY + paddleHeight / 2, 2, slotHeight - paddleHeight);
  }
  if (hit) {
    context.fillStyle = '#ffffff35';
    context.fillRect(wall - 14, paddleY - paddleHeight / 2 - 3, 28, paddleHeight + 6);
  }
  context.globalAlpha = away ? 0.5 : 1;
  art.paddle.drone(context, look, team, droneX, droneY, droneScale);
  context.globalAlpha = 1;
}

function drawBall(context, ball, traces, layout, radius, reduced, now) {
  const x = layout.left + ball.x * layout.sx;
  const y = layout.top + ball.y * layout.sy;
  const colour = ball.curved ? BOOSTS.curve.colour : TEAMS[ball.team]?.light ?? '#c4e8ff';
  const rx = radius * layout.sx;
  const ry = radius * layout.sy;
  if (!reduced) {
    const entries = traces.get(ball.id) ?? [];
    const last = entries.at(-1);
    if (!last || (now - last.at >= 15 && Math.hypot(last.x - x, last.y - y) >= 2)) {
      entries.push({ x, y, at: now });
      if (entries.length > TRAIL_LENGTH) entries.shift();
    }
    traces.set(ball.id, entries);
    context.strokeStyle = colour;
    context.lineCap = 'round';
    for (let index = 0; index < entries.length; index++) {
      const point = entries[index];
      const next = entries[index + 1] ?? { x, y };
      const weight = Math.max(0, 1 - (now - point.at) / 175);
      context.globalAlpha = weight * 0.42;
      context.lineWidth = weight * rx + 1;
      context.beginPath();
      context.moveTo(point.x, point.y);
      context.lineTo(next.x, next.y);
      context.stroke();
    }
  }
  context.fillStyle = colour;
  context.globalAlpha = 0.25;
  context.beginPath();
  context.ellipse(x, y, rx * 1.6, ry * 1.55, 0, 0, 2 * Math.PI);
  context.fill();
  context.globalAlpha = 1;
  context.beginPath();
  context.ellipse(x, y, rx, ry, 0, 0, 2 * Math.PI);
  context.fill();
  context.fillStyle = WHITE;
  context.beginPath();
  context.ellipse(x, y, rx * 0.6, ry * 0.6, 0, 0, 2 * Math.PI);
  context.fill();
}

function drawPickup(context, art, scene, layout) {
  if (!scene.pickup) return;
  const { kind, x, y } = scene.pickup;
  const boost = BOOSTS[kind];
  const px = layout.left + x * layout.sx;
  const py = layout.top + y * layout.sy;
  const radius = scene.court.pickupRadius * Math.min(layout.sx, layout.sy);
  context.fillStyle = INK;
  context.strokeStyle = boost.colour;
  context.lineWidth = 3;
  context.beginPath();
  context.arc(px, py, radius, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  if (radius >= 19) art.boost(context, kind, px, py);
  text(context, boost.name, px, py + radius + 26, 22, boost.colour);
}

function drawGoal(context, layout, goal, now, reduced) {
  if (!goal || now >= goal.until) return;
  const wall = goal.team === 1 ? layout.left : layout.right;
  const inward = goal.team === 1 ? 1 : -1;
  const progress = 1 - (goal.until - now) / GOAL_MS;
  const y = layout.top + goal.y * layout.sy;
  const colour = TEAMS[goal.team].light;
  context.save();
  context.beginPath();
  context.rect(layout.left, layout.top, layout.width, layout.height);
  context.clip();
  context.fillStyle = colour;
  context.globalAlpha = reduced ? 0.24 : (1 - progress) * 0.48;
  context.fillRect(wall, layout.top, inward * 15, layout.height);
  if (!reduced) {
    const wave = 30 + progress * layout.height * 0.72;
    context.strokeStyle = colour;
    context.lineWidth = 5;
    context.beginPath();
    context.arc(wall, y, wave, 0, 2 * Math.PI);
    context.stroke();
    context.globalAlpha *= 0.42;
    context.fillRect(wall, layout.top, inward * (38 + 72 * (1 - progress)), layout.height);
  }
  context.restore();
}

export function mountWallOfPaddlesTv(canvas, { art, sound }) {
  const context = canvas.getContext('2d', { alpha: false });
  const backdrop = canvas.ownerDocument.createElement('canvas');
  const stage = canvas.parentElement;
  const background = stage.style.background;
  stage.style.background = INK;
  const artwork = { shared: art, paddle: createPaddleArt(canvas.ownerDocument) };
  const timeline = createTimeline();
  const juice = createJuice();
  const play = createSoundHooks(sound, { hit: 'move', goal: 'bank', win: 'win', boost: 'collect' });
  const traces = new Map();
  const lit = new Map();
  let roster = new Map();
  let playArea;
  let layout;
  let court;
  let round;
  let lastEvent = 0;
  const goals = [null, null];
  let phase;

  function restage() {
    if (!playArea || !court) return;
    layout = fitCourt(playArea.safe, court);
    paintField(backdrop.getContext('2d'), layout, playArea.width, playArea.height);
    traces.clear();
    juice.clear();
  }

  function resize(area) {
    if (area.width === playArea?.width && area.height === playArea.height && area.safe.height === playArea.safe.height) return;
    playArea = area;
    canvas.width = backdrop.width = area.width;
    canvas.height = backdrop.height = area.height;
    restage();
  }

  const loop = createArcadeLoop((now, reduced) => {
    const scene = timeline.sample(now, interp, reduced);
    if (!scene || !layout) return;
    context.drawImage(backdrop, 0, 0);
    drawScores(context, scene, layout, phase, goals, now);
    const teamSizes = [0, 0];
    for (const paddle of scene.paddles) teamSizes[paddle.team]++;
    const droneScales = teamSizes.map(count => artwork.paddle.droneScale({
      width: layout.flank * 0.54, height: layout.height - 10,
    }, count));
    for (const paddle of scene.paddles) {
      const { playerId, team } = paddle;
      drawPaddle(context, artwork, paddle, roster.get(playerId), layout, droneScales[team],
        lit.get(playerId) > now, reduced ? 0 : juice.squash(playerId, now));
    }
    for (const goal of goals) drawGoal(context, layout, goal, now, reduced);
    drawPickup(context, artwork.paddle, scene, layout);
    for (const ball of scene.balls) drawBall(context, ball, traces, layout, scene.court.radius, reduced, now);
    if (scene.slow) {
      text(context, 'SLOW MOTION', (layout.left + layout.right) / 2, layout.bottom - 22, 22, BOOSTS.slow.colour);
    }
    context.save();
    context.beginPath();
    context.rect(layout.safe.x, layout.top, layout.safe.width, layout.height);
    context.clip();
    juice.draw(context, now);
    context.restore();
  }, reduced => {
    juice.setReducedMotion(reduced);
    if (reduced) traces.clear();
  });

  function push(view) {
    const { scene } = view;
    if (!scene) return;
    if (!court) {
      court = scene.court;
      restage();
    }
    const now = performance.now();
    const connected = new Map(view.players.map(player => [player.id, player.connected]));
    roster = new Map(view.roster.map(player => [player.id, { ...player, away: !connected.get(player.id) }]));
    if (view.round !== round) {
      lastEvent = 0;
      goals.fill(null);
      lit.clear();
      traces.clear();
      juice.clear();
    }
    let cue;
    const goalCounts = [0, 0];
    for (const event of scene.events) {
      if (event.id <= lastEvent) continue;
      lastEvent = event.id;
      const { kind, team, playerId } = event;
      const colour = kind === 'leave' ? LOOKS[roster.get(playerId).look].colour : TEAMS[team].light;
      if (kind === 'hit') lit.set(playerId, now + 210);
      if (kind === 'leave') lit.delete(playerId);
      if (kind === 'goal') {
        goals[team] = { team, until: now + GOAL_MS, y: event.y, count: ++goalCounts[team] };
      }
      juice.impact({
        x: layout.left + event.x * layout.sx, y: layout.top + event.y * layout.sy, colour,
        label: kind === 'boost' ? BOOSTS[event.boost].name.toUpperCase() : undefined,
        id: kind === 'hit' ? playerId : undefined, time: now, strong: kind === 'goal',
      });
      if (kind !== 'leave' && (!cue || kind === 'goal' || (cue === 'hit' && kind === 'boost'))) cue = kind;
    }
    if (view.phase === 'results' && phase !== 'results') {
      const colour = winningTeam(scene)?.light ?? WHITE;
      juice.impact({ x: canvas.width / 2, y: layout.top + 112, colour, time: now, strong: true });
      cue = 'win';
    }
    if (cue) play(cue);
    const ids = new Set(scene.balls.map(ball => ball.id));
    for (const id of traces.keys()) if (!ids.has(id)) traces.delete(id);
    const label = `Cyan ${scene.points[0]}, Coral ${scene.points[1]}. ${INSTRUCTIONS}`;
    if (canvas.getAttribute('aria-label') !== label) canvas.setAttribute('aria-label', label);
    timeline.push(scene, view.round, now);
    round = view.round;
    phase = view.phase;
  }

  return {
    push, resize, setReducedMotion: loop.setReducedMotion,
    dispose() {
      loop.dispose();
      stage.style.background = background;
    },
  };
}
