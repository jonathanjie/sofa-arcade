import { createArcadeLoop, createJuice, createSoundHooks } from '../../kit/animation.mjs';
import { LOOKS } from '../../looks.mjs';
import { CARDS, PLAY_MS, PREVIEW_MS } from './cards.mjs';
import { createCardArt, label, rect } from './art.mjs';

const WIDTH = 1760;
const HEIGHT = 816;
const CREAM = '#fff1d3';
const JAM = '#983550';
const GOLD = '#ffc56b';
const GREEN = '#2e6554';
const DARK = '#35263d';
const SHIFT_MS = 450;

function backplate(document) {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  rect(context, 0, 0, WIDTH, HEIGHT, '#743449');
  for (let y = 0; y < HEIGHT; y += 44) {
    for (let x = 0; x < WIDTH; x += 44) {
      rect(context, x, y, 22, 22, '#8b4256');
      rect(context, x + 22, y + 22, 22, 22, '#8b4256');
    }
  }
  rect(context, 31, 41, 1095, 751, '#3a2439');
  rect(context, 26, 26, 1095, 751, CREAM);
  rect(context, 47, 45, 1053, 713, '#e0b784');
  rect(context, 51, 49, 1045, 705, CREAM);
  rect(context, 1119 + 32, 41, 582, 751, '#3a2439');
  rect(context, 1146, 26, 582, 751, DARK);
  rect(context, 1172, 112, 530, 2, '#6a5169');
  rect(context, 1172, 692, 530, 2, '#6a5169');
  return canvas;
}

function position(index, twoColumns) {
  if (twoColumns) return { x: 1172 + (index >= 8 ? 270 : 0), y: 134 + (index % 8) * 69, width: 260 };
  return { x: 1172, y: 134 + index * 69, width: 530 };
}

function drawRow(context, art, player, width, pose) {
  const { rank, direction, gained } = player;
  const colour = LOOKS[player.look].colour;
  rect(context, 0, 0, width, 59, player.done ? '#514157' : '#44354d');
  rect(context, 0, 0, 5, 59, colour);
  if (direction) label(context, direction < 0 ? '↑' : '↓', 21, 14, 19, {
    colour: direction < 0 ? '#a6dbad' : '#e3c8c4', align: 'center',
  });
  label(context, String(rank), 21, direction ? 38 : 30, 23, { colour: '#e3c8c4', align: 'center' });
  art.runner(context, player.look, pose, 38, 5, 3);
  rect(context, 71, 36, 18, 18, colour);
  art.badge(context, player.look, 73, 38, 2);
  label(context, player.name, 95, 30, 24, { colour: CREAM, max: width - 165 });
  label(context, String(player.total), width - 10, gained ? 19 : 30, 24, { colour: CREAM, align: 'right' });
  if (gained) label(context, '+' + player.gain, width - 10, 43, 19, { colour: GOLD, align: 'right' });
}

function drawCard(context, art, scene, time, reduced, roundPhase) {
  const { card, index, variant, multiplier, phase } = scene;
  const entry = CARDS[card];
  const elapsed = Math.max(0, Math.min(PLAY_MS, time - PREVIEW_MS));
  const bonus = multiplier === 2;
  const accent = bonus ? JAM : GREEN;
  rect(context, 68, 66, 1010, 55, accent);
  label(context, 'CHALLENGE ' + (index + 1) + ' / ' + CARDS.length, 89, 93, 26, { colour: CREAM });
  if (bonus) label(context, 'LALA BONUS  ×2', 1057, 93, 28, { colour: GOLD, align: 'right' });
  const status = roundPhase === 'countdown' ? 'Do each challenge to build your score.'
    : phase === 'score' ? ''
    : phase === 'preview' ? 'Get ready'
    : phase === 'check' ? 'Time!'
    : '';
  label(context, entry.instruction, 573, 207, 76, { align: 'center', face: 'Georgia', max: 991 });
  rect(context, 93, 272, 960, 325, bonus ? '#f5d4bc' : '#f3dfb6');
  rect(context, 93, 272, 960, 4, bonus ? '#e6ac98' : '#e7c995');
  if (phase === 'score' && bonus) {
    art.cat(context, 425, 431, time, reduced);
    label(context, 'Double points!', 564, 426, 54, { colour: JAM, face: 'Georgia', max: 410 });
  } else if (phase === 'score' && !bonus) {
    label(context, 'Points served!', 573, 431, 88, { colour: GREEN, align: 'center', face: 'Georgia' });
  } else {
    art.draw(context, entry.visual, 573, 431, phase === 'play' ? elapsed : -1, variant, reduced);
  }
  if (roundPhase !== 'countdown' && phase === 'play') {
    const seconds = Math.ceil((PLAY_MS - elapsed) / 1000);
    rect(context, 117, 636, 912, 25, '#d9bc94');
    rect(context, 117, 636, 912 * (1 - elapsed / PLAY_MS), 25, seconds <= 1 ? JAM : accent);
    label(context, seconds + ' s left', 573, 708, 40, { align: 'center' });
  } else {
    label(context, status, 573, 683, 47, { align: 'center', max: 965 });
  }
}

export function mountSnackStackTv(canvas, { art, sound }) {
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const document = canvas.ownerDocument;
  const context = canvas.getContext('2d', { alpha: false });
  const background = backplate(document);
  const cardArt = createCardArt(document, art);
  const juice = createJuice();
  const playSound = createSoundHooks(sound, { start: 'move', hit: 'collect', score: 'bank', win: 'win' });
  let view;
  let rows = [];
  let positions = new Map();
  let ranks = new Map();
  let directions = new Map();
  const tiles = new Map();
  let arrival = 0;
  let movedAt = 0;
  let rowCount = 0;
  let finished = 0;
  let lastHit = -Infinity;

  function tile(player, width, pose) {
    let cache = tiles.get(player.id);
    if (cache?.key !== player.key) {
      cache = { key: player.key, frames: [] };
      tiles.set(player.id, cache);
    }
    if (!cache.frames[pose]) {
      const frame = document.createElement('canvas');
      frame.width = width;
      frame.height = 59;
      drawRow(frame.getContext('2d'), art, player, width, pose);
      cache.frames[pose] = frame;
    }
    return cache.frames[pose];
  }

  function draw(at, reduced) {
    if (!view) return;
    const { scene } = view;
    const clock = view.phase === 'playing' && scene.phase === 'play'
      ? scene.elapsed + Math.min(100, Math.max(0, at - arrival)) : scene.elapsed;
    context.drawImage(background, 0, 0);
    drawCard(context, cardArt, scene, clock, reduced, view.phase);
    label(context, 'Score ladder', 1174, 74, 42, { colour: CREAM, face: 'Georgia' });
    const part = reduced ? 1 : Math.min(1, Math.max(0, (at - movedAt) / SHIFT_MS));
    const fraction = 1 - (1 - part) ** 3;
    for (const player of rows) {
      const box = positions.get(player.id);
      // A short slide in the direction of a rank change keeps all rows legible.
      const rise = Math.round(-player.direction * 4 * (1 - fraction));
      const pop = juice.squash(player.id, at) !== 0;
      const idle = (Math.floor(at / 170) + player.look * 5) % 21;
      const pose = reduced ? 0 : pop ? 2 : idle === 1 ? 1 : 0;
      context.drawImage(tile(player, box.width, pose), box.x, box.y + rise);
    }
    const progress = view.phase === 'results' ? 'Round complete'
      : scene.phase === 'score' ? 'Scores locked' : finished + ' / ' + rowCount + ' finished';
    label(context, progress, 1437, 733, 34, { colour: GOLD, align: 'center' });
    juice.draw(context, at);
  }

  const loop = createArcadeLoop(draw, reduced => juice.setReducedMotion(reduced));
  function push(next) {
    const scene = next.scene;
    if (!scene) return;
    const time = performance.now();
    const prior = view?.round === next.round ? view.scene : null;
    if (!prior) {
      ranks = new Map();
      directions = new Map();
      tiles.clear();
      juice.clear();
    }
    const players = new Map(next.players.map(player => [player.id, player]));
    rows = scene.players.filter(player => players.has(player.id))
      .map(player => ({ ...player, ...players.get(player.id) }))
      .sort((a, b) => b.total - a.total);
    rowCount = rows.length;
    finished = rows.filter(player => player.done).length;
    positions = new Map(rows.map((player, index) => [player.id, position(index, rows.length > 8)]));
    let rank = 0;
    const nextRanks = new Map(rows.map(({ id, total }, index) => {
      if (rows[index - 1]?.total !== total) rank = index + 1;
      return [id, rank];
    }));
    if (scene.phase === 'score' && prior?.phase !== 'score') {
      directions = new Map([...nextRanks].map(([id, place]) => [id, Math.sign(place - (ranks.get(id) ?? place))]));
      movedAt = time;
    }
    ranks = nextRanks;
    rows = rows.map(player => {
      const rank = ranks.get(player.id);
      const direction = scene.phase === 'score' ? directions.get(player.id) ?? 0 : 0;
      const gained = scene.phase === 'score' && player.gain > 0;
      const key = [rows.length > 8, player.done, player.look, player.name, player.total, gained && player.gain, rank, direction].join('/');
      return { ...player, rank, direction, gained, key };
    });
    if (scene.phase === 'play' && prior?.phase !== 'play') playSound('start');
    if (scene.phase === 'play' && prior?.index === scene.index) {
      const priorDone = new Set(prior.players.filter(player => player.done).map(player => player.id));
      const hits = rows.filter(player => player.done && !priorDone.has(player.id));
      for (const player of hits) {
        const { x, y } = positions.get(player.id);
        juice.impact({ x: x + 58, y: y + 30, id: player.id, colour: LOOKS[player.look].colour, time });
      }
      if (hits.length && time - lastHit > 130) {
        playSound('hit');
        lastHit = time;
      }
    }
    if (scene.phase === 'score' && prior?.phase !== 'score') {
      playSound('score');
      juice.impact({ x: 573, y: 510, colour: GOLD, time, strong: scene.multiplier === 2 });
    }
    if (next.phase === 'results' && view?.phase !== 'results' && next.results.length) {
      playSound('win');
      juice.impact({ x: 573, y: 510, colour: GOLD, label: next.results[0].place === next.results[1]?.place ? 'TIE!' : 'WIN!', time, strong: true });
    }
    canvas.setAttribute('aria-label', CARDS[scene.card].instruction + '. ' + finished + ' of ' + rowCount + ' finished.');
    view = next;
    arrival = time;
  }

  return { push, setReducedMotion: loop.setReducedMotion, dispose: loop.dispose };
}
