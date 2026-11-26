import { createArcadeLoop, createJuice, createSoundHooks, createTimeline } from '../../kit/animation.mjs';
import { fitSpriteScale } from '../../kit/sprites.mjs';
import { LOOKS } from '../../looks.mjs';
import { createYarnArt, MOUSE_PAW_ROW, MOUSE_SIZE } from './art.mjs';
import { HEAT_MS, MATCH_MS, RUSH_MS, TEAMS, WALL_CLOCK_ALLOWANCE_MS, beatsFor, closestBeat } from './rhythm.mjs';

const WIDTH = 1760;
const HEIGHT = 900;
const CENTRE = WIDTH / 2;
const TRAVEL = 260;
const BACK_ROPE_Y = 415;
const FRONT_ROPE_Y = 654;
const INK = '#291e29';
const CREAM = '#fff2da';
const BEAT_FLASH_MS = 135;
const PULL_MS = 390;
const FINISH_MS = 570;
const COLUMNS = 4;

function block(ctx, colour, x, y, width, height) {
  ctx.fillStyle = colour;
  ctx.fillRect(x, y, width, height);
}

function text(ctx, label, x, y, { size = 30, colour = CREAM, align = 'center', width = WIDTH } = {}) {
  ctx.fillStyle = colour;
  ctx.textAlign = align;
  ctx.font = `850 ${size}px system-ui, sans-serif`;
  ctx.fillText(label, x, y, width);
}

function makeLanes(view) {
  const players = new Map(view.roster.map(player => [player.id, player]));
  return TEAMS.map((_, team) => view.scene.teams.filter(entry => entry.team === team)
    .map(({ playerId }) => ({ ...players.get(playerId), team })));
}

function placeMice(lanes, scale) {
  const total = lanes[0].length + lanes[1].length;
  const duel = total <= 2;
  const pitch = total > 8 ? 137 : 149;
  const gap = total > 8 ? 22 : 10;
  return lanes.map((mice, team) => {
    if (!mice.length) return [];
    const columns = Math.min(COLUMNS, mice.length);
    const rowHeight = total > 8 ? 133 : duel ? 192 : 151;
    const spriteScale = Math.max(1, fitSpriteScale(MOUSE_SIZE, mice.length, {
      width: columns * (duel ? 228 : pitch) * scale, height: Math.ceil(mice.length / columns) * rowHeight * scale,
    }, { columns, gap: gap * scale }));
    return mice.map((mouse, index) => {
      const back = index >= COLUMNS;
      const rowSize = back ? mice.length - columns : columns;
      const centre = duel ? 387 : rowSize === 1 ? 369 : 307;
      const x = centre + (index % COLUMNS - (rowSize - 1) / 2) * pitch;
      return {
        ...mouse, scale: spriteScale, tagWidth: duel ? 184 : pitch - 6,
        x: team ? WIDTH - x : x, ropeY: back ? BACK_ROPE_Y : FRONT_ROPE_Y,
      };
    });
  });
}

function paintName(ctx, mouse, art) {
  const { name, look, x, ropeY, tagWidth, scale, team } = mouse;
  const left = x - tagWidth / 2;
  const top = ropeY + (MOUSE_SIZE.height - MOUSE_PAW_ROW) * scale + 8;
  const nameWidth = tagWidth - 36;
  block(ctx, INK, left, top, tagWidth, 42);
  block(ctx, TEAMS[team].dark, left + 2, top + 2, tagWidth - 4, 38);
  block(ctx, LOOKS[look].colour, left + 6, top + 10, 23, 23);
  art.badge(ctx, look, left + 7, top + 11, 3);

  ctx.font = '850 23px system-ui, sans-serif';
  const fittedSize = Math.min(23, Math.floor(23 * nameWidth / ctx.measureText(name).width));
  const style = { align: 'left', width: nameWidth };
  if (fittedSize >= 19) {
    text(ctx, name, left + 33, top + 29, { ...style, size: fittedSize });
    return;
  }
  const characters = [...name];
  const middle = Math.ceil(characters.length / 2);
  text(ctx, characters.slice(0, middle).join(''), left + 33, top + 18, { ...style, size: 19 });
  text(ctx, characters.slice(middle).join(''), left + 33, top + 36, { ...style, size: 19 });
}

function paintRoom(ctx, groups, active, art, bounds) {
  const { left, top, width, height } = bounds;
  const wall = ctx.createLinearGradient(0, 180, 0, 713);
  wall.addColorStop(0, '#3f2b39');
  wall.addColorStop(1, '#64444b');
  block(ctx, wall, left, top, width, height);
  for (let x = Math.floor(left / 110) * 110; x < left + width; x += 110) {
    block(ctx, '#301f2d55', x, 222, 5, 480);
    block(ctx, '#a16a6228', x + 5, 222, 3, 480);
  }
  // A pixel-edged patch of light frames the beat and Lala.
  for (let row = 0; row < 13; row++) {
    const half = 118 + (6 - Math.abs(row - 6)) * 23;
    block(ctx, '#d086571c', CENTRE - half, 214 + row * 34, half * 2, 34);
  }
  block(ctx, '#4b3037', left, 702, width, height + top - 702);
  block(ctx, '#aa725e', left, 702, width, 8);
  for (let y = 720; y < top + height; y += 22) {
    for (let x = left - (y % 44 ? 0 : 22); x < left + width; x += 44) block(ctx, '#b27e6640', x, y, 29, 3);
  }
  block(ctx, '#38252f', left, 755, width, 82);
  block(ctx, '#a47067', left, 755, width, 4);
  block(ctx, '#a47067', left, 833, width, 4);

  const duel = groups[0].length + groups[1].length <= 2;
  for (const [team, mice] of groups.entries()) {
    const { colour, dark } = TEAMS[team];
    const benchWidth = duel ? 284 : 544;
    const benchX = duel ? 245 : 30;
    const x = team ? WIDTH - benchX - benchWidth : benchX;
    for (const y of [BACK_ROPE_Y, FRONT_ROPE_Y]) {
      if (!mice.some(mouse => mouse.ropeY === y)) continue;
      block(ctx, INK, x, y + 8, benchWidth, 103);
      block(ctx, dark, x + 4, y + 12, benchWidth - 8, 92);
      block(ctx, colour, x + 4, y + 100, benchWidth - 8, 4);
    }
    for (const mouse of mice) if (active.has(mouse.id)) paintName(ctx, mouse, art);
  }

  block(ctx, INK, left, top, width, 214 - top);
  block(ctx, '#8b5e5b', left, 214, width, 4);
  block(ctx, '#735053', 30, 64, WIDTH - 60, 2);
  text(ctx, 'Tap on the beat. Pull the knot past your line.', CENTRE, 45, { size: 40 });
  for (const [team, data] of TEAMS.entries()) {
    const x = CENTRE + (team ? TRAVEL : -TRAVEL);
    text(ctx, `${data.name.toUpperCase()} LINE`, x + (team ? 28 : -28), 809,
      { size: 29, colour: data.colour, align: team ? 'left' : 'right' });
  }
  block(ctx, '#211822', CENTRE - TRAVEL, 789, TRAVEL * 2, 22);
  for (let tick = -4; tick <= 4; tick++) {
    const x = CENTRE + tick * TRAVEL / 4;
    block(ctx, tick === 0 ? '#d3a398' : '#8c686e', x - 2, 793, 4, 14);
  }
}

function makeRope(groups) {
  const path = new Path2D();
  const leftBack = groups[0].some(mouse => mouse.ropeY === BACK_ROPE_Y);
  const rightBack = groups[1].some(mouse => mouse.ropeY === BACK_ROPE_Y);
  const edge = groups[0].length + groups[1].length <= 2 ? 224 : 33;
  const bend = 14;
  if (leftBack) {
    path.moveTo(565, BACK_ROPE_Y);
    path.lineTo(edge + bend, BACK_ROPE_Y);
    path.lineTo(edge, BACK_ROPE_Y + bend);
    path.lineTo(edge, FRONT_ROPE_Y - bend);
    path.lineTo(edge + bend, FRONT_ROPE_Y);
  } else path.moveTo(edge, FRONT_ROPE_Y);
  path.lineTo(WIDTH - edge - bend, FRONT_ROPE_Y);
  if (rightBack) {
    path.lineTo(WIDTH - edge, FRONT_ROPE_Y - bend);
    path.lineTo(WIDTH - edge, BACK_ROPE_Y + bend);
    path.lineTo(WIDTH - edge - bend, BACK_ROPE_Y);
    path.lineTo(WIDTH - 565, BACK_ROPE_Y);
  } else path.lineTo(WIDTH - edge, FRONT_ROPE_Y);
  return path;
}

function drawRope(ctx, path, flashing) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const [width, colour] of [[24, '#442533'], [16, '#a92f4b'], [7, flashing ? '#ffc1a1' : '#f76370']]) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.stroke(path);
  }
}

function drawTeam(ctx, scene, team, pulling) {
  const x = team ? WIDTH - 618 : 30;
  const { colour, dark, name } = TEAMS[team];
  block(ctx, dark, x, 81, 588, 117);
  block(ctx, pulling ? CREAM : colour, x, 81, pulling ? 9 : 5, 117);
  text(ctx, name.toUpperCase(), x + 24, 135, { size: 55, colour, align: 'left' });
  text(ctx, 'HEATS', x + 392, 126, { size: 23, align: 'left' });
  for (let win = 0; win < 2; win++) {
    const start = x + 479 + win * 45;
    block(ctx, INK, start, 101, 36, 36);
    if (scene.wins[team] > win) block(ctx, colour, start + 5, 106, 26, 26);
  }
  text(ctx, 'UNITY', x + 24, 179, { size: 24, align: 'left' });
  for (let segment = 0; segment < 10; segment++) {
    const start = x + 132 + segment * 42;
    const fraction = Math.max(0, Math.min(1, scene.unity[team] * 10 - segment));
    block(ctx, INK, start, 159, 37, 24);
    if (fraction > 0) block(ctx, pulling ? CREAM : colour, start, 159, Math.round(37 * fraction), 24);
  }
}

function drawBeat(ctx, onBeat, progress, reduced, running) {
  const y = 330;
  if (!running) return;
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#d8a792';
  ctx.beginPath();
  ctx.arc(CENTRE, y, 38, 0, Math.PI * 2);
  ctx.stroke();
  if (onBeat) {
    ctx.fillStyle = '#ffda9b';
    ctx.fill();
  } else if (!reduced) {
    ctx.beginPath();
    ctx.strokeStyle = CREAM;
    ctx.arc(CENTRE, y, 38 + 38 * progress, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (onBeat) text(ctx, 'TAP', CENTRE, y + 10, { size: 22, colour: INK });
  else block(ctx, '#e7bd92', CENTRE - 4, y - 4, 8, 8);
}

function drawFinishLine(ctx, team, lit) {
  const x = CENTRE + (team ? TRAVEL : -TRAVEL);
  const { colour } = TEAMS[team];
  block(ctx, INK, x - 12, FRONT_ROPE_Y - 66, 24, 124);
  block(ctx, lit ? CREAM : colour, x - 6, FRONT_ROPE_Y - 60, 12, 110);
  for (let offset = -55; offset < 48; offset += 22) block(ctx, INK, x - 6, FRONT_ROPE_Y + offset, 12, 8);
  block(ctx, lit ? CREAM : colour, x - (team ? 0 : 42), FRONT_ROPE_Y - 58, 42, 22);
}

function drawFinish(ctx, label, colour) {
  block(ctx, INK, CENTRE - 310, 242, 620, 103);
  block(ctx, colour, CENTRE - 310, 339, 620, 6);
  text(ctx, label, CENTRE, 309, { size: 44, colour, width: 584 });
}

function drawCrossing(ctx, team, progress) {
  const x = CENTRE + (team ? TRAVEL : -TRAVEL);
  const { colour } = TEAMS[team];
  ctx.globalAlpha = 1 - progress;
  ctx.lineWidth = 7;
  for (let ray = 0; ray < 12; ray++) {
    const angle = ray * Math.PI / 6;
    const radius = 42 + progress * 90;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    ctx.strokeStyle = ray % 2 ? colour : CREAM;
    ctx.beginPath();
    ctx.moveTo(x + dx * radius, FRONT_ROPE_Y + dy * radius);
    ctx.lineTo(x + dx * (radius + 24), FRONT_ROPE_Y + dy * (radius + 24));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function tugResultSummary(view) {
  const [mint, honey] = view.scene.wins;
  if (mint === honey) return { label: `Match draw · ${mint}–${honey}`, colour: CREAM };
  const team = TEAMS[Number(honey > mint)];
  return { label: `${team.name} wins · ${Math.max(mint, honey)}–${Math.min(mint, honey)}`, colour: team.colour };
}

function interpolate(previous, current, amount, lerp) {
  return { ...current, position: lerp(previous.position, current.position, amount) };
}

export function mountTugOfYarnTv(canvas, { art, sound }) {
  const document = canvas.ownerDocument;
  canvas.setAttribute('aria-label', 'Tug of Yarn. Tap on the beat. Pull the knot past your line.');
  const ctx = canvas.getContext('2d', { alpha: false });
  const room = document.createElement('canvas');
  const roomContext = room.getContext('2d', { alpha: false });
  const sprites = createYarnArt(document);
  const cue = createSoundHooks(sound, { beat: 'move', pull: 'collect', score: 'bank', win: 'win', draw: 'collect' });
  const timeline = createTimeline({ intervalMs: 150 });
  const juice = createJuice();
  let area;
  let scale = 1;
  let x = 0;
  let y = 0;
  let lanes;
  let groups;
  let rope;
  let previous;
  let playedBeat;
  let latestAt = 0;
  let pullAt = -Infinity;
  let finish;
  let active = new Set();
  let hits = new Set();
  let connected = new Set();

  function resizeRoom() {
    roomContext.setTransform(scale, 0, 0, scale, x, y);
    paintRoom(roomContext, groups, active, art, {
      left: -x / scale, top: -y / scale, width: room.width / scale, height: room.height / scale,
    });
  }

  function place() {
    groups = placeMice(lanes, scale);
    rope = makeRope(groups);
    resizeRoom();
  }

  function resize(playArea) {
    area = playArea;
    const { width, height, safe } = area;
    scale = Math.min(safe.width / WIDTH, safe.height / HEIGHT);
    if (scale <= 0) return;
    x = safe.x + (safe.width - WIDTH * scale) / 2;
    y = safe.y + (safe.height - HEIGHT * scale) / 2;
    canvas.width = room.width = width;
    canvas.height = room.height = height;
    if (lanes) place();
  }

  const loop = createArcadeLoop((at, reduced) => {
    if (!previous || !area || scale <= 0) return;
    const scene = timeline.sample(at, interpolate, reduced);
    const playing = previous.phase === 'playing';
    const breaking = scene.breakUntil !== null;
    const running = playing && !breaking;
    const elapsed = playing ? Math.max(0, MATCH_MS + WALL_CLOCK_ALLOWANCE_MS - previous.ms + at - latestAt) : scene.t;
    const heatElapsed = elapsed - scene.heatStart;
    const beats = beatsFor(scene.level);
    const nearest = closestBeat(heatElapsed, beats);
    const distance = heatElapsed - beats[nearest];
    const next = distance >= BEAT_FLASH_MS ? nearest + 1 : nearest;
    const interval = beats[next] - (beats[next - 1] ?? 0);
    const progress = Math.max(0, Math.min(1, (beats[next] - heatElapsed) / interval)) || 0;
    const onBeat = running && distance >= 0 && distance < BEAT_FLASH_MS;
    if (onBeat && playedBeat !== nearest) {
      playedBeat = nearest;
      cue('beat');
    }
    const pullAge = at - pullAt;
    const pulling = pullAge < PULL_MS;
    const pullMotion = pulling && !reduced ? Math.sin(Math.PI * pullAge / PULL_MS) : 0;
    const crossing = finish?.crossingTeam != null;
    const finishAge = finish ? Math.max(0, at - finish.at) : 0;
    const landing = crossing && !reduced && finishAge < FINISH_MS;
    let position = scene.position;
    let knotLift = 0;
    if (landing) {
      const direction = finish.crossingTeam === 0 ? -1 : 1;
      const progress = finishAge / FINISH_MS;
      const strike = Math.min(1, progress * 2.6);
      position = finish.from + (direction - finish.from) * (1 - (1 - strike) ** 3);
      position += direction * 0.12 * Math.sin(Math.PI * progress);
      knotLift = 32 * Math.sin(Math.PI * progress);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(room, 0, 0);
    ctx.setTransform(scale, 0, 0, scale, x, y);
    for (const team of [0, 1]) drawTeam(ctx, scene, team, pulling && scene.unity[team] > 0);
    const remaining = breaking ? scene.breakUntil - elapsed : HEAT_MS - heatElapsed;
    const seconds = Math.ceil(Math.max(0, remaining) / 1000);
    const final = previous.phase === 'results';
    text(ctx, breaking ? 'NEXT HEAT' : `HEAT ${scene.heat} OF 3`, CENTRE, 121, { size: 28, colour: '#efd1b7' });
    text(ctx, final ? 'FINAL' : `0:${String(seconds).padStart(2, '0')}`, CENTRE, 182, { size: 62 });
    if (running && heatElapsed >= HEAT_MS - RUSH_MS) text(ctx, 'FASTER BEATS', CENTRE, 453, { size: 26, colour: '#ffcc85' });

    block(ctx, '#362530', CENTRE - 88, 622, 176, 16);
    const catLift = knotLift / 2 + (onBeat && !reduced ? 5 : 0);
    sprites.lala(ctx, CENTRE - 90, Math.round(467 - catLift), position,
      !reduced && Math.floor(at / 160) % 29 === 0);
    for (const team of [0, 1]) drawFinishLine(ctx, team, crossing && finish.crossingTeam === team);
    drawRope(ctx, rope, onBeat || pulling || landing);
    for (const mice of groups) {
      for (const mouse of mice) {
        if (!active.has(mouse.id)) continue;
        const present = connected.has(mouse.id);
        const lit = pulling && hits.has(mouse.id);
        const spriteScale = mouse.scale / scale;
        const travel = lit ? (8 + 30 * scene.unity[mouse.team]) * pullMotion : 0;
        const direction = mouse.team ? 1 : -1;
        if (lit) block(ctx, TEAMS[mouse.team].colour, mouse.x - 37, mouse.ropeY + 15, 74, 6);
        if (!present) ctx.globalAlpha = 0.45;
        const blink = !reduced && Math.floor(at / 140 + mouse.look * 3) % 23 === 0;
        // Draw at a whole CSS-pixel scale even when the full stage changes size.
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        sprites.mouse(ctx, mouse.look, mouse.team, lit && !reduced ? 2 : Number(blink),
          x + scale * (mouse.x + direction * travel), y + scale * (mouse.ropeY - (MOUSE_PAW_ROW + 0.5) * spriteScale),
          mouse.scale);
        ctx.setTransform(scale, 0, 0, scale, x, y);
        ctx.globalAlpha = 1;
      }
    }
    drawBeat(ctx, onBeat, progress, reduced, !finish && (running || previous.phase === 'countdown'));
    const marker = Math.round(CENTRE + TRAVEL * position);
    const [shakeX, shakeY] = juice.offset(at);
    if (landing) drawCrossing(ctx, finish.crossingTeam, finishAge / FINISH_MS);
    sprites.knot(ctx, marker + shakeX, FRONT_ROPE_Y - knotLift + shakeY);
    block(ctx, '#ff9791', CENTRE + TRAVEL * Math.max(-1, Math.min(1, position)) - 6, 783, 12, 34);
    juice.draw(ctx, at);

    if (finish) {
      const { winner } = finish;
      const team = TEAMS[winner];
      const label = winner === null ? (final ? 'MATCH DRAW' : 'HEAT DRAW')
        : final ? `${team.name.toUpperCase()} WINS THE MATCH`
          : crossing ? `${team.name.toUpperCase()} CROSSES THE LINE` : `${team.name.toUpperCase()} WINS THE HEAT`;
      drawFinish(ctx, label, winner === null ? CREAM : team.colour);
    }
  }, juice.setReducedMotion);

  function push(view) {
    const scene = view.scene;
    if (!scene) return;
    const at = performance.now();
    const sameRound = previous?.round === view.round;
    const sameHeat = sameRound && previous.scene.heat === scene.heat;
    const nextActive = new Set(scene.teams.map(({ playerId }) => playerId));
    if (!sameHeat) {
      juice.clear();
      playedBeat = undefined;
      pullAt = -Infinity;
      finish = undefined;
    }
    if (!sameRound) {
      lanes = makeLanes(view);
      for (const mice of lanes) for (const mouse of mice) sprites.prepare(mouse.look, mouse.team);
      active = nextActive;
      if (area && scale > 0) place();
    } else if (nextActive.size < active.size) {
      for (const mouse of groups.flat()) {
        if (!active.has(mouse.id) || nextActive.has(mouse.id)) continue;
        juice.impact({ x: mouse.x, y: mouse.ropeY - 24, colour: TEAMS[mouse.team].colour, time: at });
      }
      active = nextActive;
      resizeRoom();
    }
    connected = new Set(view.players.filter(player => player.connected).map(player => player.id));
    if (sameHeat && scene.beat > previous.scene.beat) {
      hits = new Set(scene.hits);
      if (hits.size) {
        pullAt = at;
        cue('pull');
        for (const team of [0, 1]) {
          if (!scene.unity[team]) continue;
          const direction = team ? 1 : -1;
          juice.impact({ x: CENTRE + direction * 182, y: FRONT_ROPE_Y, colour: TEAMS[team].colour, time: at });
        }
      } else pullAt = -Infinity;
    }
    const matchEnd = view.phase === 'results' && previous?.phase !== 'results';
    if (matchEnd || (sameHeat && scene.breakUntil !== null && previous.scene.breakUntil === null)) {
      const winner = matchEnd ? (scene.wins[0] === scene.wins[1] ? null : Number(scene.wins[1] > scene.wins[0])) : scene.heatWinner;
      const crossingTeam = Math.abs(scene.position) === 1 ? Number(scene.position > 0) : null;
      const colour = TEAMS[crossingTeam ?? winner]?.colour ?? CREAM;
      finish = { at, winner, crossingTeam, from: sameHeat ? previous.scene.position : scene.position };
      cue(winner === null ? 'draw' : matchEnd ? 'win' : 'score');
      juice.impact({ x: CENTRE + TRAVEL * scene.position, y: FRONT_ROPE_Y, colour, time: at, strong: true });
    }
    timeline.push(scene, `${view.round}/${scene.heat}`, at);
    latestAt = at;
    previous = view;
  }

  return { resize, push, setReducedMotion: loop.setReducedMotion, dispose: loop.dispose };
}
