import { createArcadeLoop, createJuice, createSoundHooks, createTimeline } from '../../kit/animation.mjs';
import { LOOKS } from '../../looks.mjs';
import { createYarnArt, PIXEL } from './art.mjs';
import { BEATS, HEAT_MS, PERFECT_MS, RUSH_MS, TEAMS, closestBeat, createBeatClock } from './rhythm.mjs';

const WIDTH = 1760;
const HEIGHT = 816;
const CENTRE = WIDTH / 2;
const TRAVEL = 256;
const BACK_Y = 320;
const FRONT_Y = 512;
const PAW_Y = 16 * PIXEL + 2;
const FRONT_ROPE_Y = FRONT_Y + PAW_Y;
const INK = '#261f2b';
const CREAM = '#fff0d3';
const BEAT_GLOW_MS = 150;
const STRONG_PULL = 0.72;
const PULL_CALL_MS = 410;

function block(context, colour, x, y, width, height) {
  context.fillStyle = colour;
  context.fillRect(x, y, width, height);
}

function text(context, label, x, y, { size = 30, colour = CREAM, align = 'center', width } = {}) {
  context.fillStyle = colour;
  context.textAlign = align;
  context.font = `850 ${size}px system-ui, sans-serif`;
  context.fillText(label, x, y, width ?? WIDTH);
}

function makeLanes(view) {
  const players = new Map(view.roster.map(player => [player.id, player]));
  return TEAMS.map((_, team) => {
    const mice = view.scene.teams.filter(entry => entry.team === team);
    return mice.map(({ playerId }, index) => {
      const back = index >= 4;
      const rowSize = back ? mice.length - 4 : Math.min(4, mice.length);
      const column = index % 4;
      const x = 326 + (column - (rowSize - 1) / 2) * 136;
      return { ...players.get(playerId), team, x: team === 0 ? x : WIDTH - x, y: back ? BACK_Y : FRONT_Y };
    });
  });
}

function paintName(context, mouse, art) {
  const { name, look, x, y } = mouse;
  const nameWidth = 96;
  block(context, INK, x - 66, y + 91, 132, 46);
  block(context, LOOKS[look].colour, x - 62, y + 102, 23, 23);
  art.badge(context, look, x - 61, y + 103, 3);

  context.font = '850 23px system-ui, sans-serif';
  const width = context.measureText(name).width;
  const fittedSize = Math.min(23, Math.floor(23 * nameWidth / width));
  const style = { align: 'left', width: nameWidth };
  if (fittedSize >= 20) {
    text(context, name, x - 33, y + 122, { ...style, size: fittedSize });
    return;
  }
  const characters = [...name];
  const middle = Math.ceil(characters.length / 2);
  text(context, characters.slice(0, middle).join(''), x - 33, y + 110, { ...style, size: 22 });
  text(context, characters.slice(middle).join(''), x - 33, y + 131, { ...style, size: 22 });
}

function paintRoom(context, groups, art) {
  block(context, '#433343', 0, 0, WIDTH, HEIGHT);
  block(context, '#514052', 0, 230, WIDTH, 371);
  block(context, '#5d4450', 0, 238, WIDTH, 358);
  block(context, '#443247', 0, 260, WIDTH, 8);

  // The wall, sun patch and woven floor use the same 4 px grid as the sprites.
  for (let stripe = 0; stripe < 17; stripe++) {
    const x = 14 + 112 * stripe;
    block(context, '#644a56', x, 268, 4, 304);
    block(context, '#583e4e', x + 4, 268, 4, 304);
  }
  for (let band = 0; band < 9; band++) {
    const half = 116 + (band < 5 ? band : 8 - band) * 20;
    block(context, '#765159', CENTRE - half, 272 + band * 32, half * 2, 32);
  }
  block(context, '#362836', 0, 588, WIDTH, 228);
  block(context, '#59404e', 0, 596, WIDTH, 188);
  for (let y = 600; y < 792; y += 16) {
    for (let x = (y % 32 ? 8 : 0); x < WIDTH; x += 32) block(context, '#674956', x, y, 20, 4);
  }
  block(context, '#342735', 0, 688, WIDTH, 8);
  block(context, '#8b5d5c', 0, 696, WIDTH, 4);
  block(context, '#342735', 0, 776, WIDTH, 8);
  for (let x = 16; x < WIDTH - 16; x += 32) {
    block(context, '#87616b', x, 793, 16, 7);
    block(context, '#372836', x + 4, 800, 8, 8);
  }

  for (const [team, mice] of groups.entries()) {
    const x = team ? WIDTH - 616 : 44;
    const { colour, dark } = TEAMS[team];
    for (const y of [BACK_Y, FRONT_Y]) {
      if (!mice.some(mouse => mouse.y === y)) continue;
      block(context, INK, x, y + 64, 572, 89);
      block(context, dark, x + 4, y + 68, 564, 75);
      block(context, colour, x + 4, y + 139, 564, 4);
      for (let plank = x + 16; plank < x + 555; plank += 24) {
        block(context, INK, plank, y + 127, 8, 8);
      }
    }
    for (const mouse of mice) paintName(context, mouse, art);
  }

  block(context, INK, 0, 0, WIDTH, 228);
  block(context, '#87616b', 0, 228, WIDTH, 4);
  text(context, 'Tap on the beat to pull the knot past your line.', CENTRE, 55, { size: 42 });
  block(context, '#533d4f', 42, 77, WIDTH - 84, 2);

  // Stakes stand behind the rope. The little rail below mirrors the actual knot.
  for (const [team, data] of TEAMS.entries()) {
    const x = CENTRE + (team ? TRAVEL : -TRAVEL);
    block(context, INK, x - 9, FRONT_ROPE_Y - 28, 18, 96);
    block(context, data.colour, x - 5, FRONT_ROPE_Y - 24, 10, 57);
    block(context, CREAM, x - 5, FRONT_ROPE_Y - 14, 10, 8);
    text(context, `${data.name.toUpperCase()} LINE`, x, 737, { size: 26, colour: data.colour, align: team ? 'left' : 'right' });
  }
  block(context, '#211d29', CENTRE - TRAVEL, 719, 2 * TRAVEL, 20);
  for (let tick = -4; tick <= 4; tick++) {
    const x = CENTRE + tick * TRAVEL / 4;
    block(context, tick === 0 ? '#b08e91' : '#785c6b', x - 1, 722, 3, 14);
  }
}

function makeRope(groups) {
  const path = new Path2D();
  const leftBack = groups[0].some(mouse => mouse.y === BACK_Y);
  const rightBack = groups[1].some(mouse => mouse.y === BACK_Y);
  const back = BACK_Y + PAW_Y;
  const edge = 26;
  const bend = 12;
  if (leftBack) {
    path.moveTo(590, back);
    path.lineTo(edge + bend, back);
    path.lineTo(edge, back + bend);
    path.lineTo(edge, FRONT_ROPE_Y - bend);
    path.lineTo(edge + bend, FRONT_ROPE_Y);
  } else path.moveTo(edge, FRONT_ROPE_Y);
  path.lineTo(WIDTH - edge - bend, FRONT_ROPE_Y);
  if (rightBack) {
    path.lineTo(WIDTH - edge, FRONT_ROPE_Y - bend);
    path.lineTo(WIDTH - edge, back + bend);
    path.lineTo(WIDTH - edge - bend, back);
    path.lineTo(WIDTH - 590, back);
  } else path.lineTo(WIDTH - edge, FRONT_ROPE_Y);
  return path;
}

function drawRope(context, path, flashing) {
  for (const [width, colour] of [[22, '#442533'], [14, '#a92f4b'], [6, flashing ? '#ffa293' : '#f76370']]) {
    context.strokeStyle = colour;
    context.lineWidth = width;
    context.stroke(path);
  }
}

function drawTeam(context, scene, data, team, strong) {
  const x = team ? WIDTH - 646 : 46;
  const { colour, dark, name } = data;
  block(context, dark, x, 96, 600, 118);
  block(context, colour, x, 96, 5, 118);
  text(context, name.toUpperCase(), x + 24, 149, { size: 54, colour, align: 'left' });
  text(context, 'HEATS', x + 393, 140, { size: 23, align: 'left' });
  for (let win = 0; win < 2; win++) {
    const start = x + 482 + win * 47;
    block(context, INK, start, 111, 37, 37);
    if (scene.wins[team] > win) block(context, colour, start + 5, 116, 27, 27);
  }
  text(context, 'UNITY', x + 24, 193, { size: 24, align: 'left' });
  block(context, INK, x + 126, 173, 427, 27);
  for (let segment = 0; segment < 10; segment++) {
    const start = x + 132 + segment * 42;
    const fraction = Math.max(0, Math.min(1, scene.unity[team] * 10 - segment));
    block(context, '#fff1cb33', start, 178, 37, 17);
    if (fraction > 0) block(context, strong ? CREAM : colour, start, 178, Math.round(37 * fraction), 17);
  }
}

function drawPulse(context, delta, progress, reduced) {
  const lit = Math.abs(delta) <= PERFECT_MS || (delta > 0 && delta < BEAT_GLOW_MS);
  const x = CENTRE;
  const y = 320;
  context.lineWidth = 4;
  context.strokeStyle = '#dbb591';
  context.beginPath();
  context.arc(x, y, 23, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.arc(x, y, lit ? 23 : 23 + (reduced ? 22 : 36 * progress), 0, Math.PI * 2);
  if (lit) {
    context.fillStyle = '#ffcf85';
    context.fill();
  } else {
    context.strokeStyle = CREAM;
    context.stroke();
  }
  block(context, lit ? INK : '#e7bd92', x - 3, y - 3, 6, 6);
}

function drawCall(context, label, colour, y) {
  block(context, INK, CENTRE - 247, y - 58, 494, 78);
  block(context, colour, CENTRE - 247, y + 14, 494, 6);
  text(context, label, CENTRE, y, { size: 50, colour, width: 465 });
}

function interpolate(previous, current, amount, lerp) {
  return { ...current, position: lerp(previous.position, current.position, amount) };
}

export function mountTugOfYarnTv(canvas, { art, sound }) {
  const document = canvas.ownerDocument;
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.setAttribute('aria-label', 'Tug of Yarn. Tap on the beat to pull the knot past your line.');
  const context = canvas.getContext('2d', { alpha: false });
  const room = document.createElement('canvas');
  room.width = WIDTH;
  room.height = HEIGHT;
  const roomContext = room.getContext('2d', { alpha: false });
  const sprites = createYarnArt(document);
  const cue = createSoundHooks(sound, { beat: 'move', score: 'bank', win: 'win', draw: 'collect' });
  const timeline = createTimeline();
  const juice = createJuice();
  const clock = createBeatClock();
  let groups;
  let rope;
  let previous;
  let played;
  let position = 0;
  let strongUntil = 0;
  let hitUntil = 0;
  let hits = new Set();
  let connected = new Set();

  const loop = createArcadeLoop((at, reduced) => {
    if (!previous) return;
    const scene = timeline.sample(at, interpolate, reduced);
    const playing = previous.phase === 'playing';
    const elapsed = playing ? clock.elapsed(at) - scene.heatStart : scene.t - scene.heatStart;
    const nearest = closestBeat(elapsed);
    const distance = elapsed - BEATS[nearest];
    const next = distance > BEAT_GLOW_MS ? nearest + 1 : nearest;
    const interval = BEATS[next] - (BEATS[next - 1] ?? 0);
    const progress = Math.max(0, Math.min(1, (BEATS[next] - elapsed) / interval)) || 0;
    const onBeat = playing && scene.breakUntil === null && distance >= 0 && distance < BEAT_GLOW_MS;
    const beatKey = `${scene.heat}/${nearest}`;
    if (onBeat && played !== beatKey) {
      played = beatKey;
      cue('beat');
    }
    if (reduced || !juice.frozen(at)) position = scene.position;
    const marker = Math.round(CENTRE + TRAVEL * position);
    const [shakeX, shakeY] = juice.offset(at);
    const strong = strongUntil > at;

    context.drawImage(room, 0, 0);
    for (const [team, data] of TEAMS.entries()) drawTeam(context, scene, data, team, strong && scene.pull[team] >= STRONG_PULL);
    const breaking = scene.breakUntil !== null;
    const remaining = breaking ? scene.breakUntil - scene.heatStart - elapsed : HEAT_MS - elapsed;
    const seconds = Math.ceil(Math.max(0, remaining) / 1000);
    const clockLabel = breaking ? 'NEXT HEAT' : `HEAT ${scene.heat} / 3`;
    text(context, clockLabel, CENTRE, 126, { size: 28, colour: '#e9b9a1' });
    text(context, previous.phase === 'results' ? 'FINAL' : `0:${String(seconds).padStart(2, '0')}`,
      CENTRE, 190, { size: 64 });
    const rush = elapsed >= HEAT_MS - RUSH_MS;
    if (rush && playing && scene.breakUntil === null) text(context, 'FASTER BEATS', CENTRE, 274, { size: 24, colour: '#ffca84' });

    block(context, '#46313d', CENTRE - 76, 548, 152, 16);
    const reacts = onBeat && !reduced;
    sprites.lala(context, CENTRE - 18 * PIXEL, 436 - (reacts ? PIXEL : 0), position,
      !reduced && Math.floor(at / 160) % 29 === 0);
    drawRope(context, rope, onBeat);
    for (const mice of groups) {
      for (const mouse of mice) {
        const present = connected.has(mouse.id);
        const lit = hitUntil > at && hits.has(mouse.id);
        if (lit) block(context, TEAMS[mouse.team].colour, mouse.x - 45, mouse.y + 85, 90, 5);
        if (!present) context.globalAlpha = 0.45;
        const lean = reacts && present;
        const blink = !reduced && Math.floor(at / 140 + mouse.look * 3) % 23 === 0;
        sprites.mouse(context, mouse.look, mouse.team, lean ? 2 : Number(blink), mouse.x + (lean ? (mouse.team ? PIXEL : -PIXEL) : 0), mouse.y);
        if (!present) context.globalAlpha = 1;
      }
    }
    drawPulse(context, playing && scene.breakUntil === null ? distance : Infinity, progress, reduced);
    sprites.knot(context, marker + shakeX, FRONT_ROPE_Y + shakeY);
    block(context, '#ff8387', marker - 5, 714, 10, 30);
    juice.draw(context, at);

    if (previous.phase === 'results') {
      const winner = scene.wins[0] === scene.wins[1] ? null : Number(scene.wins[1] > scene.wins[0]);
      const label = winner === null ? 'MATCH DRAW' : `${TEAMS[winner].name.toUpperCase()} WINS!`;
      drawCall(context, label, winner === null ? CREAM : TEAMS[winner].colour, 418);
    } else if (scene.breakUntil !== null) {
      const winner = scene.heatWinner;
      const label = winner === null ? 'HEAT DRAW' : `${TEAMS[winner].name.toUpperCase()} TAKES THE HEAT`;
      drawCall(context, label, winner === null ? CREAM : TEAMS[winner].colour, 418);
    } else if (strong) {
      drawCall(context, 'PULL!', CREAM, 418);
    }
  }, juice.setReducedMotion);

  function push(view) {
    const scene = view.scene;
    if (!scene) return;
    const at = performance.now();
    const sameRound = previous?.round === view.round;
    const sameHeat = sameRound && previous.scene.heat === scene.heat;
    if (!sameRound) {
      groups = makeLanes(view);
      for (const mice of groups) for (const mouse of mice) sprites.prepare(mouse.look, mouse.team);
      paintRoom(roomContext, groups, art);
      rope = makeRope(groups);
      clock.reset();
      played = undefined;
    }
    if (!sameHeat) {
      juice.clear();
      position = scene.position;
      strongUntil = hitUntil = 0;
    }
    if (view.phase === 'playing') clock.sync(scene.t, at);
    if (sameHeat && scene.beat > previous.scene.beat && scene.hits.length) {
      hits = new Set(scene.hits);
      hitUntil = at + PULL_CALL_MS;
      const team = Number(scene.pull[1] > scene.pull[0]);
      const strong = scene.pull[team] >= STRONG_PULL;
      if (strong) strongUntil = hitUntil;
      juice.impact({ x: CENTRE + TRAVEL * scene.position, y: FRONT_ROPE_Y, colour: TEAMS[team].colour, time: at });
    }
    const matchEnd = view.phase === 'results' && previous?.phase !== 'results';
    if (matchEnd || (sameHeat && scene.breakUntil !== null && previous.scene.breakUntil === null)) {
      const winner = matchEnd ? scene.winner : scene.heatWinner;
      const colour = winner === null ? CREAM : TEAMS[winner].colour;
      cue(winner === null ? 'draw' : matchEnd ? 'win' : 'score');
      juice.impact({ x: CENTRE + TRAVEL * scene.position, y: FRONT_ROPE_Y, colour, time: at, strong: true });
    }
    connected = new Set(view.players.filter(player => player.connected).map(player => player.id));
    timeline.push(scene, `${view.round}/${scene.heat}`, at);
    previous = view;
  }

  return { push, setReducedMotion: loop.setReducedMotion, dispose: loop.dispose };
}
