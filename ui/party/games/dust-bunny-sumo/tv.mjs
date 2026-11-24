import { createArcadeLoop, createJuice, createSoundHooks, createTimeline } from '../../kit/animation.mjs';
import { fitSpriteScale } from '../../kit/sprites.mjs';
import { LOOKS } from '../../looks.mjs';
import { BUNNY_SIZE, CREAM, GOLD, createSumoArt, makeFloor, makeRug } from './art.mjs';

const RING_OUT_MS = 620;
const DASH_TRAIL_MS = 240;
const HIT_PAUSE_SPACING_MS = 240;
const TAU = Math.PI * 2;

const clamp = (number, min, max) => Math.min(max, Math.max(min, number));

function interpolate(previous, current, amount, lerp) {
  const beforeById = new Map(previous.bodies.map(body => [body.id, body]));
  return {
    ...current,
    elapsedMs: lerp(previous.elapsedMs, current.elapsedMs, amount),
    bodies: current.bodies.map(body => {
      const before = beforeById.get(body.id);
      if (!before || body.outAt !== null) return body;
      return { ...body, x: lerp(before.x, body.x, amount), y: lerp(before.y, body.y, amount) };
    }),
  };
}

function arenaLayout(safe, playerCount, initialRadius) {
  const { x, y, width, height } = safe;
  const wide = width >= height * 1.42;
  const ui = clamp(height / 970, .48, 1);
  const cx = x + width / 2;
  const cy = y + height * (wide ? .50 : .55);
  const panelSpace = wide ? Math.min(300 * ui, .21 * width) : 0;
  const cameraRadius = Math.max(1, Math.min(.43 * height, width / 2 - panelSpace - 56 * ui));
  // Preserve more of the physical size difference between a duel and a full rug.
  const radius = cameraRadius * (.9 + .1 * (playerCount - 2) / 14);
  const crowdScale = playerCount <= 4 ? 7 : playerCount <= 8 ? 6 : 5;
  const fitArea = { width: 1.62 * radius, height: 1.62 * radius };
  const scale = clamp(fitSpriteScale(BUNNY_SIZE, playerCount, fitArea, { gap: 18 * ui }), 1, crowdScale);
  return {
    safe, cx, cy, ui, wide, radius, scale, world: radius / initialRadius,
    left: wide ? x + 48 * ui : cx,
    right: wide ? cx + radius + (x + width - cx - radius) / 2 : cx,
    statusY: wide ? cy - 178 * ui : y + 32 * ui,
    catY: wide ? cy - 167 * ui : y + height - 36 * ui,
    panelWidth: wide ? Math.max(1, cx - radius - x - 70 * ui) : width - 16,
  };
}

function box(context, x, y, width, height, radius, fill) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fillStyle = fill;
  context.fill();
}

function write(context, text, x, y, size, colour, width) {
  context.font = `800 ${size}px system-ui`;
  context.fillStyle = colour;
  context.fillText(text, x, y, width);
}

function drawHud(context, layout, scene, phase, lastCall, finishText) {
  const { ui, wide, left, right, statusY: y, catY, panelWidth } = layout;
  context.textAlign = wide ? 'left' : 'center';
  write(context, 'Last bunny wins', left, y, 36 * ui, GOLD, panelWidth);
  write(context, 'Tilt or drag to roll.', left, y + 32 * ui, 23 * ui, CREAM, panelWidth);
  write(context, 'Dash to bump rivals off.', left, y + 59 * ui, 23 * ui, CREAM, panelWidth);
  if (wide) {
    const live = scene.bodies.filter(body => body.outAt === null).length;
    write(context, String(live), left, y + 162 * ui, 82 * ui, CREAM, panelWidth);
    write(context, 'ON THE RUG', left, y + 191 * ui, 20 * ui, '#edd1c4', panelWidth);
    const status = finishText || lastCall || (phase === 'countdown' ? 'Find your bunny' : '');
    if (status) write(context, status, left, y + 240 * ui, 25 * ui, GOLD, panelWidth);
  }
  context.textAlign = 'center';
  const label = scene.warning ? `LALA PULLS IN ${Math.ceil(scene.warning.ms / 1000)}`
    : wide ? 'Lala shrinks the rug' : '';
  if (label) write(context, label, right, catY + (wide ? 152 * ui : 0), 24 * ui,
    scene.warning ? GOLD : CREAM, panelWidth);
}

function drawLala(context, scene, layout, time, reduced, sprites, pulledAt, reactedAt) {
  const { cx, cy, world, right, catY, wide, ui } = layout;
  const radius = scene.radius * world;
  if (wide) {
    const knotX = cx + .94 * radius;
    const knotY = cy - Math.sqrt(1 - .94 ** 2) * radius;
    const pulling = time - pulledAt < 540;
    const pawX = right - 60 * ui;
    const pawY = catY + 105 * ui;
    context.beginPath();
    context.moveTo(knotX, knotY);
    context.bezierCurveTo(knotX + 45 * ui, knotY + 1, pawX - 60 * ui, pawY + 39 * ui, pawX, pawY);
    context.lineWidth = scene.warning || pulling ? 5 * ui : 3 * ui;
    context.strokeStyle = scene.warning || pulling ? GOLD : '#e2a985';
    context.stroke();
    const blink = !reduced && time % 3400 > 3230;
    const scale = Math.max(1, Math.round(8 * ui));
    const surprised = time - reactedAt < 650;
    const pose = pulling ? 2 : surprised ? 3 : Number(blink);
    const hop = surprised && !reduced ? Math.max(0, 1 - (time - reactedAt) / 260) * 11 * ui : 0;
    sprites.lala(context, pose, right - 11 * scale, catY - hop, scale);
    if (surprised) {
      context.textAlign = 'center';
      write(context, '!', right + 67 * ui, catY + 17 * ui - hop, 37 * ui, GOLD, 34 * ui);
    }
  }
  if (!scene.warning) return;

  const forecast = scene.warning.radius * world;
  context.beginPath();
  context.arc(cx, cy, radius, 0, TAU);
  context.arc(cx, cy, forecast, 0, TAU);
  context.fillStyle = '#e19a5270';
  context.fill('evenodd');
  context.beginPath();
  context.arc(cx, cy, forecast, 0, TAU);
  context.strokeStyle = '#2c212c';
  context.lineWidth = 9 * ui;
  context.stroke();
  context.strokeStyle = GOLD;
  context.lineWidth = 5 * ui;
  context.setLineDash([14 * ui, 8 * ui]);
  context.stroke();
  context.setLineDash([]);
}

function drawGusts(context, scene, layout, reduced) {
  if (!scene.gusts.length) return;
  const { cx, cy, world, ui } = layout;
  context.save();
  context.beginPath();
  context.arc(cx, cy, scene.radius * world, 0, TAU);
  context.clip();
  for (const gust of scene.gusts) {
    const progress = clamp((scene.elapsedMs - gust.at) / gust.duration, 0, 1);
    const along = reduced ? 0 : (2 * progress - 1) * gust.radius * world;
    context.save();
    context.translate(cx, cy);
    context.rotate(Math.atan2(gust.y, gust.x));
    context.strokeStyle = '#e9fcf1d8';
    context.lineWidth = 4 * ui;
    context.lineCap = 'round';
    context.beginPath();
    for (let lane = -7; lane <= 7; lane++) {
      const y = lane * scene.radius * world / 7;
      const x = along - Math.abs(lane % 4) * 12 * ui;
      context.moveTo(x - (44 + Math.abs(lane % 3) * 13) * ui, y);
      context.quadraticCurveTo(x - 15 * ui, y - 7 * ui, x, y);
      context.lineTo(x - 9 * ui, y + 7 * ui);
    }
    context.stroke();
    context.restore();
  }
  context.restore();
}

function drawRider(context, body, player, { layout, sprites, time, reduced, juice, outs, dashes }) {
  const { cx, cy, world, scale, ui } = layout;
  let x = cx + body.x * world;
  let y = cy + body.y * world;
  const out = body.outAt !== null;
  const age = time - (outs.get(body.id) ?? -Infinity);
  if (out && (age >= RING_OUT_MS || reduced)) return;
  const dash = dashes.get(body.id);
  const dashAge = time - (dash?.time ?? -Infinity);
  const dashing = dashAge < DASH_TRAIL_MS;
  const colour = LOOKS[player.look].colour;
  if (out) {
    const distance = Math.hypot(body.x, body.y) || 1;
    const fall = age / RING_OUT_MS;
    x += body.x / distance * 63 * ui * fall;
    y += body.y / distance * 63 * ui * fall + 38 * ui * fall * fall;
    context.globalAlpha = 1 - fall;
  }

  if (dashing && !reduced && !out) {
    const dx = body.x - dash.x;
    const dy = body.y - dash.y;
    const length = Math.hypot(dx, dy) || 1;
    context.globalAlpha = .9 * (1 - dashAge / DASH_TRAIL_MS);
    context.lineCap = 'round';
    for (const [index, offset] of [-12, 0, 12].entries()) {
      const lane = offset * ui;
      const trail = (index === 1 ? 71 : 50) * ui;
      context.beginPath();
      context.moveTo(x + dy / length * lane, y - dx / length * lane);
      context.lineTo(x + (dy * lane - dx * trail) / length, y - (dx * lane + dy * trail) / length);
      context.lineWidth = (index === 1 ? 8 : 4) * ui;
      context.strokeStyle = index === 1 ? CREAM : colour;
      context.stroke();
    }
    context.globalAlpha = 1;
  }
  context.fillStyle = '#23202a94';
  context.beginPath();
  context.ellipse(x, y + 3 * scale, 7 * scale, 2.8 * scale, 0, 0, TAU);
  context.fill();
  const speed = body.vx * body.vx + body.vy * body.vy;
  const phase = time + player.look * 123;
  const pose = reduced ? 0 : dashing || (speed > 80 && phase % 160 < 95) ? 2 : Number(phase % 2800 > 2580);
  sprites.bunny(context, player.look, pose, x, y, scale, reduced ? 0 : juice.squash(body.id, time));
  context.globalAlpha = 1;
  if (!out) return { x, y, colour, player };
}

function drawTags(context, riders, layout, art, names, connected) {
  const { safe, scale, ui } = layout;
  const height = Math.round(28 * ui);
  const gap = 3 * ui;
  const placed = [];
  const intersects = (a, b) => a.x < b.x + b.w + gap && a.x + a.w + gap > b.x
    && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
  function tagAt(x, y, w) {
    return {
      x: clamp(x, safe.x + gap, safe.x + safe.width - w - gap),
      y: clamp(y, safe.y + gap, safe.y + safe.height - height - gap),
      w, h: height,
    };
  }

  for (const rider of riders) {
    const { x, y, player, colour } = rider;
    const w = names.get(player.id);
    const below = y + 5 * scale;
    const above = y - 16 * scale - height;
    const candidates = [
      tagAt(x - w / 2, below, w), tagAt(x - w / 2, above, w),
      tagAt(x + 9 * scale, y - height, w), tagAt(x - 9 * scale - w, y - height, w),
      tagAt(x - w / 2, below + height + gap, w), tagAt(x - w / 2, above - height - gap, w),
    ];
    const clearsRiders = candidate => riders.every(other => other === rider || !intersects(candidate, {
      x: other.x - 7 * scale, y: other.y - 13 * scale, w: 14 * scale, h: 17 * scale,
    }));
    const clearsTags = candidate => placed.every(tag => !intersects(candidate, tag));
    const rect = candidates.find(candidate => clearsTags(candidate) && clearsRiders(candidate))
      ?? candidates.find(clearsTags);
    // The scarf stays visible when a tightly packed group has no room for another label.
    if (!rect) continue;
    placed.push(rect);
    const away = !connected.has(player.id);
    const badgeScale = ui < .65 ? 1 : 2;
    const anchorX = clamp(x, rect.x, rect.x + w);
    const anchorY = y < rect.y ? rect.y : rect.y + height;
    if (Math.abs(anchorX - x) > scale || (rect.y !== candidates[0].y && rect.y !== candidates[1].y)) {
      context.beginPath();
      context.moveTo(anchorX, anchorY);
      context.lineTo(x, y + (anchorY > y ? 4 : -9) * scale);
      context.strokeStyle = colour;
      context.lineWidth = 2 * ui;
      context.stroke();
    }
    context.globalAlpha = away ? .72 : 1;
    box(context, rect.x, rect.y, w, height, 6 * ui, '#251d29');
    box(context, rect.x + 3 * ui, rect.y + 3 * ui, 20 * ui, height - 6 * ui, 4 * ui, colour);
    art.badge(context, player.look, rect.x + 13 * ui - 3.5 * badgeScale,
      rect.y + height / 2 - 3.5 * badgeScale, badgeScale);
    context.textAlign = 'left';
    write(context, player.name, rect.x + 28 * ui, rect.y + height * .72, 18 * ui, CREAM, w - 34 * ui);
    context.globalAlpha = 1;
  }
}

export function mountDustBunnyTv(canvas, { art, sound }) {
  canvas.setAttribute('aria-label', 'Dust Bunny Sumo. Roll to steer. Dash to bump. Last bunny on wins.');
  canvas.setAttribute('data-sumo', '');
  const context = canvas.getContext('2d', { alpha: false });
  const document = canvas.ownerDocument;
  const sprites = createSumoArt(document);
  const timeline = createTimeline();
  const juice = createJuice();
  const play = createSoundHooks(sound, {
    hit: 'move', impact: 'cat', out: 'error', left: 'move', dash: 'lure', gust: 'collect',
    warning: 'lure', shrink: 'cat', win: 'win',
  });
  const outs = new Map();
  const dashes = new Map();
  const names = new Map();
  let area;
  let layout;
  let floor;
  let rug;
  let roster;
  let previous;
  let connected;
  let lastDraw = [];
  let frozenBodies = new Map();
  let lastEvent = 0;
  let pulledAt = -Infinity;
  let reactedAt = -Infinity;
  let lastSoundAt = -Infinity;
  let lastPauseAt = -Infinity;
  let callout;
  let finishText;
  let flash;

  function rebuild(scene) {
    if (!area) return;
    layout = arenaLayout(area.safe, roster.size, scene.initialRadius);
    floor = makeFloor(document, area.width, area.height, layout.cx, layout.cy);
    rug = makeRug(document, scene.radius * layout.world);
    names.clear();
    context.font = `800 ${18 * layout.ui}px system-ui`;
    for (const player of roster.values()) {
      names.set(player.id, Math.min(150 * layout.ui, Math.ceil(context.measureText(player.name).width) + 38 * layout.ui));
    }
  }

  const loop = createArcadeLoop((time, reduced) => {
    if (!previous || !layout) return;
    const scene = timeline.sample(time, interpolate, reduced);
    const { cx, cy, world, safe } = layout;
    context.drawImage(floor, 0, 0);
    context.save();
    context.beginPath();
    context.rect(safe.x, safe.y, safe.width, safe.height);
    context.clip();
    context.translate(...(reduced ? [0, 0] : juice.offset(time)));
    context.drawImage(rug, cx - rug.width / 2, cy - rug.height / 2);
    drawLala(context, scene, layout, time, reduced, sprites, pulledAt, reactedAt);
    drawGusts(context, scene, layout, reduced);
    const freeze = !reduced && juice.frozen(time);
    const bodies = freeze
      ? scene.bodies.map(body => body.outAt === null ? frozenBodies.get(body.id) ?? body : body)
      : scene.bodies;
    lastDraw = bodies;
    const drawOrder = [...bodies].sort((a, b) => a.y - b.y);
    const style = { layout, sprites, time, reduced, juice, outs, dashes };
    const riders = [];
    for (const body of drawOrder) {
      const rider = drawRider(context, body, roster.get(body.id), style);
      if (rider) riders.push(rider);
    }
    if (flash && time - flash.time < (reduced ? 320 : 155)) {
      context.beginPath();
      context.arc(cx + flash.x * world, cy + flash.y * world, (flash.kind === 'hit' ? 24 : 33) * layout.ui, 0, TAU);
      context.strokeStyle = GOLD;
      context.lineWidth = 4 * layout.ui;
      context.stroke();
    }
    juice.draw(context, time);
    drawTags(context, riders, layout, art, names, connected);
    context.restore();
    const lastCall = callout && time - callout.time < 2800 ? callout.text : '';
    drawHud(context, layout, scene, previous.phase, lastCall, finishText);
  }, value => juice.setReducedMotion(value));

  function showEvents(scene, time) {
    let cue;
    const priority = ['dash', 'hit', 'left', 'gust', 'warning', 'impact', 'shrink', 'out'];
    if (!previous?.scene.warning && scene.warning) cue = 'warning';
    for (const event of scene.events) {
      if (event.id <= lastEvent) continue;
      lastEvent = event.id;
      const player = roster.get(event.playerId);
      const colour = player ? LOOKS[player.look].colour : GOLD;
      const x = layout.cx + (event.x ?? 0) * layout.world;
      const y = layout.cy + (event.y ?? 0) * layout.world;
      let eventCue = event.kind;
      if (event.kind === 'hit') {
        const strong = event.strong && time - lastPauseAt >= HIT_PAUSE_SPACING_MS;
        if (strong) {
          lastPauseAt = time;
          frozenBodies = new Map(lastDraw.map(body => [body.id, body]));
        }
        if (event.strong) eventCue = 'impact';
        flash = { ...event, time };
        juice.impact({ x, y, time, colour, id: event.playerId, strong });
        juice.impact({ x, y, time, colour: LOOKS[roster.get(event.otherId).look].colour, id: event.otherId });
      } else if (event.kind === 'dash') {
        dashes.set(event.playerId, { x: event.x, y: event.y, time });
        juice.impact({ x, y, time, colour });
      } else if (event.kind === 'out' || event.kind === 'left') {
        flash = { ...event, time };
        const ringOut = event.kind === 'out';
        if (ringOut) {
          outs.set(event.playerId, time);
          reactedAt = time;
        }
        callout = { text: ringOut ? `${player.name} is a draught` : `${player.name} left`, time };
        juice.impact({ x, y: y - 34 * layout.ui, time, colour, label: ringOut ? 'OUT!' : undefined });
      } else if (event.kind === 'shrink') {
        pulledAt = time;
      }
      if (!cue || priority.indexOf(eventCue) > priority.indexOf(cue)) cue = eventCue;
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
      frozenBodies.clear();
      lastDraw = [];
      lastEvent = 0;
      callout = flash = finishText = undefined;
      lastSoundAt = lastPauseAt = pulledAt = reactedAt = -Infinity;
      rebuild(scene);
    } else if (layout && scene.radius !== previous.scene.radius) {
      rug = makeRug(document, scene.radius * layout.world);
    }
    connected = new Set(view.players.filter(player => player.connected).map(player => player.id));
    if (layout) showEvents(scene, time);
    if (view.phase === 'results' && previous?.phase !== 'results') {
      const winners = view.results.filter(result => result.place === 1);
      if (winners.length) {
        const winner = roster.get(winners[0].playerId);
        finishText = winners.length > 1 ? 'Shared first place!' : `${winner.name} wins · ${winners[0].score} pts`;
        const body = scene.bodies.find(candidate => candidate.id === winner.id);
        if (body && layout) {
          frozenBodies = new Map(lastDraw.map(rider => [rider.id, rider]));
          juice.impact({ x: layout.cx + body.x * layout.world, y: layout.cy + body.y * layout.world,
            time, colour: GOLD, strong: true });
        }
        play('win');
      }
    }
    timeline.push(scene, view.round, time);
    previous = view;
  }

  function resize(nextArea) {
    if (area?.width === nextArea.width && area?.height === nextArea.height
      && area?.safe.height === nextArea.safe.height) return;
    area = nextArea;
    canvas.width = area.width;
    canvas.height = area.height;
    if (previous) {
      juice.clear();
      rebuild(previous.scene);
    }
  }

  return {
    push, resize, setReducedMotion: loop.setReducedMotion,
    dispose() {
      loop.dispose();
      canvas.removeAttribute('data-sumo');
    },
  };
}
