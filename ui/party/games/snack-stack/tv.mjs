import { createArcadeLoop, createJuice, createSoundHooks } from '../../kit/animation.mjs';
import { fitSpriteScale } from '../../kit/sprites.mjs';
import { LOOKS } from '../../looks.mjs';
import { CARDS, INTRO, exampleGesture, PLAY_MS, PREVIEW_MS } from './cards.mjs';
import { createCardArt, label, rect } from './art.mjs';

const CREAM = '#fff3d7';
const JAM = '#892e49';
const GOLD = '#ffd075';
const GREEN = '#285949';
const DARK = '#342538';
const PLATTER = '#f0d6a9';
const RANK_COLOURS = [GOLD, '#ded4ef', '#efaf91'];
const SHIFT_MS = 550;
const EXIT_MS = 260;
const SPRITE = { width: 16, height: 16 };

function panel(context, { x, y, width, height }, colour, radius = 20) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fillStyle = colour;
  context.fill();
}

function makeLayout({ width, height, safe }) {
  const unit = Math.min(1, width / 1440, height / 850);
  const margin = 9;
  const x = safe.x / unit + margin;
  const y = safe.y / unit + margin;
  const usableWidth = safe.width / unit - margin * 2;
  const usableHeight = safe.height / unit - margin * 2;
  const gap = 22;
  const ladderWidth = Math.min(706, usableWidth * .4);
  const cardWidth = usableWidth - gap - ladderWidth;
  return {
    unit, card: { x, y, width: cardWidth, height: usableHeight },
    ladder: { x: x + cardWidth + gap, y, width: ladderWidth, height: usableHeight },
  };
}

function drawBackground(canvas, layout) {
  const context = canvas.getContext('2d');
  rect(context, 0, 0, canvas.width, canvas.height, '#663349');
  context.save();
  context.scale(layout.unit, layout.unit);
  const square = 32;
  for (let y = 0; y < canvas.height / layout.unit; y += square) {
    for (let x = 0; x < canvas.width / layout.unit; x += square) {
      if ((x / square + y / square) % 2 === 0) rect(context, x, y, square, square, '#773c50');
    }
  }
  for (const [box, colour] of [[layout.card, CREAM], [layout.ladder, DARK]]) {
    panel(context, { ...box, y: box.y + 6 }, '#492838');
    panel(context, box, colour);
    panel(context, { x: box.x + 8, y: box.y + 8, width: box.width - 16, height: box.height - 16 },
      box === layout.card ? '#f0d5ad' : '#47364c', 16);
    panel(context, { x: box.x + 11, y: box.y + 11, width: box.width - 22, height: box.height - 22 }, colour, 13);
  }
  context.restore();
}

function rowLayout(ladder, count) {
  if (count === 0) return () => null;
  const columns = count > 8 ? 2 : 1;
  const rows = Math.ceil(count / columns);
  const gap = columns === 2 ? 8 : 4;
  const width = (ladder.width - 38 - (columns - 1) * gap) / columns;
  const usableHeight = ladder.height - 148;
  const height = Math.min(count <= 3 ? 188 : 123, (usableHeight - (rows - 1) * gap) / rows);
  const padding = columns === 2 ? 8 : 4;
  const scale = Math.max(1, Math.min(count <= 3 ? 10 : 7,
    fitSpriteScale(SPRITE, 1, { width: width - 190, height: height - padding })));
  const top = ladder.y + 86 + Math.max(0, (usableHeight - rows * (height + gap) + gap) / 2);
  return index => ({
    x: ladder.x + 19 + Math.floor(index / rows) * (width + gap),
    y: top + (index % rows) * (height + gap),
    width: Math.floor(width), height: Math.floor(height), scale, compact: columns === 2,
  });
}

function drawRow(context, art, player, box, pose) {
  const { rank, direction, gained } = player;
  const { width, height, scale, compact } = box;
  const leading = player.total > 0 && rank <= 3 ? RANK_COLOURS[rank - 1] : null;
  const look = LOOKS[player.look];
  const large = scale >= 8;
  panel(context, { x: 0, y: 0, width, height }, leading ? '#5e485c' : player.done ? '#493a4f' : '#413448', 10);
  rect(context, 0, 10, 5, height - 20, look.colour);
  if (leading) rect(context, 12, 3, width - 24, 2, leading);

  const rankX = large ? 33 : 24;
  const mid = height / 2;
  label(context, player.ranked ? String(rank) : '—', rankX, mid + (direction ? -10 : 0), large ? 32 : 22,
    { colour: leading ?? '#e9d7dc', align: 'center' });
  if (direction) label(context, direction < 0 ? '↑' : '↓', rankX, mid + 15, 21,
    { colour: direction < 0 ? '#ace4b8' : '#e6c5c5', align: 'center' });
  const mouseX = large ? 57 : 43;
  art.runner(context, player.look, pose, mouseX, Math.round(mid - scale * 8), scale);
  const badgeX = mouseX + 11 * scale;
  const badgeY = mid + scale * 3;
  panel(context, { x: badgeX - 2, y: badgeY - 2, width: 18, height: 18 }, look.colour, 3);
  art.badge(context, player.look, badgeX, badgeY, 2);
  const nameX = mouseX + scale * 15 + 10;
  const scoreSpace = large ? 122 : 73;
  const colour = player.connected ? CREAM : '#cec0ca';
  label(context, player.name, nameX, mid - (!player.connected || large ? 13 : 0), large ? 36 : compact ? 25 : 31, {
    colour, max: width - nameX - scoreSpace,
  });
  if (!player.connected || large) {
    const status = !player.connected ? 'Seat held' : player.done ? 'Ready for next' : '';
    label(context, status, nameX, mid + 22, 19, { colour: '#e8ced3' });
  }
  const right = width - (large ? 25 : 12);
  label(context, String(player.total), right, mid - (gained ? 12 : 0), large ? 49 : compact ? 28 : 38,
    { colour: leading ?? CREAM, align: 'right' });
  if (gained) label(context, '+' + player.gain, right, mid + (large ? 32 : 20), large ? 29 : 22,
    { colour: GOLD, align: 'right' });
}

function drawCard(context, art, box, scene, time, reduced, roundPhase, results) {
  const { index, card, phase, multiplier, variant, difficulty, nextCard } = scene;
  const entry = CARDS[card];
  const { x, y, width, height } = box;
  const centre = x + width / 2;
  const bonus = multiplier === 2;
  const accent = bonus ? JAM : GREEN;
  const elapsed = Math.max(0, Math.min(PLAY_MS, time - PREVIEW_MS));
  const progress = (index + 1) + ' / ' + CARDS.length;
  panel(context, { x: x + 21, y: y + 21, width: width - 42, height: 56 }, accent, 9);
  label(context, 'CHALLENGE ' + progress, x + 42, y + 50, 23, { colour: CREAM });
  if (bonus) label(context, 'LALA BONUS   ×2', x + width - 41, y + 50, 28, { colour: GOLD, align: 'right' });
  else label(context, 'Highest score wins', x + width - 42, y + 50, 25, { colour: CREAM, align: 'right' });

  if (phase === 'intro') {
    for (const [i, line] of ['12 tiny challenges.', '5 seconds each.', 'Fastest and most accurate', 'climb the stack.'].entries()) {
      label(context, line, centre, y + height * (.31 + i * .13), i < 2 ? 76 : 49,
        { align: 'center', face: 'Georgia', max: width - 76 });
    }
    return;
  }
  if (phase === 'preview') {
    const short = scene.tutorialMs < PREVIEW_MS;
    const line = (text, position, size, colour = DARK) => label(context, text, centre, y + height * position, size,
      { align: 'center', colour, max: width - 70 });
    line(entry.name, .17, 43, accent);
    line(entry.instruction, short ? .44 : .27, 60);
    if (!short) {
      const demo = exampleGesture(entry.visual, time, reduced);
      context.save();
      context.translate(centre, y + height * .51);
      const scale = Math.min(width / 680, height / 900);
      context.scale(scale, scale);
      context.rotate(demo.angle * Math.PI / 180);
      panel(context, { x: -248, y: -134, width: 496, height: 268 }, DARK);
      panel(context, { x: -234, y: -120, width: 468, height: 240 }, PLATTER);
      context.scale(.64, .64);
      art.draw(context, entry.visual, 0, 0, demo.time, 0, 0, false);
      label(context, '☞', (demo.x - 50) * 7, (demo.y - 50) * 3 + 40, 95, { colour: JAM, align: 'right' });
      context.restore();
      line(demo.caption, .70, 34, JAM);
      line(entry.score, .78, 38);
    }
    const seconds = Math.ceil((PREVIEW_MS - time) / 1000);
    line(seconds <= 3 ? 'Starts in ' + Math.max(1, seconds) : 'Watch first', .90, 48, accent);
    return;
  }

  const winning = roundPhase === 'results';
  const scored = phase === 'score' || winning;
  const headline = winning ? 'Round complete!' : scored ? (bonus ? 'Lala doubles it!' : 'Points served!') : entry.instruction;
  label(context, headline, centre, y + height * .2, 70,
    { face: 'Georgia', align: 'center', colour: scored ? accent : DARK, max: width - 66 });

  const tray = { x: x + 33, y: y + height * .298, width: width - 66, height: height * .47 };
  const trayY = tray.y + tray.height / 2;
  panel(context, { ...tray, y: tray.y + 6 }, '#dbb887', 23);
  panel(context, tray, bonus ? '#edbbad' : PLATTER, 23);
  panel(context, { x: tray.x + 8, y: tray.y + 8, width: tray.width - 16, height: tray.height - 16 },
    bonus ? '#f5cec1' : '#f8e4ba', 18);
  if (scored) {
    if (bonus || winning) {
      const beat = reduced ? 0 : Math.sin(time / 140) * 8;
      art.cat(context, centre - 136, trayY + beat, time, reduced, true, 14);
      const result = results.length === 0 ? '—' : results[0].place === results[1]?.place ? 'TIE!' : 'WIN!';
      label(context, winning ? result : '×2', centre + 129, trayY - 15, 126,
        { face: 'Georgia', align: 'center', colour: JAM });
      label(context, winning ? 'See the podium' : 'DOUBLE POINTS', centre + 129, trayY + 76, 26,
        { align: 'center', colour: JAM });
    } else {
      const x0 = centre - 201;
      for (const [index, tier] of [2, 1, 3].entries()) {
        const top = trayY - (tier === 1 ? 98 : tier === 2 ? 51 : 15);
        const column = x0 + index * 136;
        panel(context, { x: column, y: top, width: 128, height: trayY + 85 - top },
          RANK_COLOURS[tier - 1], 10);
        label(context, String(tier), column + 64, top + 39, 36, { align: 'center' });
      }
    }
  } else {
    const scale = Math.min(tray.width / 770, tray.height / 310);
    context.save();
    context.translate(centre, trayY);
    context.scale(scale, scale);
    art.draw(context, entry.visual, 0, 0, phase === 'play' ? elapsed : -1, variant, difficulty, reduced);
    context.restore();
  }

  const foot = y + height * .874;
  if (scored) {
    const next = nextCard === undefined ? '' : 'Next · ' + CARDS[nextCard].instruction;
    label(context, winning ? '' : next || 'Final scores', centre, foot, 32, { align: 'center', max: width - 76 });
  } else if (roundPhase !== 'countdown' && phase === 'play') {
    const fraction = 1 - elapsed / PLAY_MS;
    const seconds = Math.ceil(PLAY_MS * fraction / 1000);
    const left = x + 45;
    const trackWidth = width - 90;
    panel(context, { x: left, y: foot - 20, width: trackWidth, height: 23 }, '#e0be8f', 10);
    if (fraction > 0) panel(context, { x: left, y: foot - 20, width: trackWidth * fraction, height: 23 },
      seconds <= 1 ? JAM : accent, 10);
    label(context, seconds + ' s left', centre, foot + 48, 32, { align: 'center' });
  } else {
    const status = roundPhase === 'countdown' ? 'Play each challenge. Highest score wins.'
      : phase === 'preview' ? 'Get ready' : 'Time!';
    label(context, status, centre, foot + 14, 35, { colour: accent, align: 'center', max: width - 75 });
  }
}

export function mountSnackStackTv(canvas, { art, sound }) {
  const document = canvas.ownerDocument;
  const context = canvas.getContext('2d', { alpha: false });
  const background = document.createElement('canvas');
  const cardArt = createCardArt(document, art);
  const juice = createJuice();
  const playSound = createSoundHooks(sound, { start: 'move', hit: 'collect', score: 'bank', bonus: 'win', win: 'win' });
  const tiles = new Map();
  const exits = new Map();
  const shifts = new Map();
  let layout;
  let view;
  let rows = [];
  let positions = new Map();
  let directions = new Map();
  let arrival = 0;
  let effectTime = 0;
  let finished = 0;
  let lastHit = -Infinity;

  function positionRows() {
    const position = rowLayout(layout.ladder, rows.length);
    positions = new Map(rows.map((player, index) => [player.id, position(index)]));
  }

  function resize(area) {
    canvas.width = background.width = area.width;
    canvas.height = background.height = area.height;
    layout = makeLayout(area);
    drawBackground(background, layout);
    tiles.clear();
    exits.clear();
    shifts.clear();
    positionRows();
  }

  function tile(player, box, pose) {
    let cache = tiles.get(player.id);
    if (cache?.key !== player.key) {
      cache = { key: player.key, frames: [] };
      tiles.set(player.id, cache);
    }
    if (!cache.frames[pose]) {
      const frame = document.createElement('canvas');
      frame.width = box.width;
      frame.height = box.height;
      drawRow(frame.getContext('2d'), art, player, box, pose);
      cache.frames[pose] = frame;
    }
    return cache.frames[pose];
  }

  function rowPoint(id, at, reduced) {
    const to = positions.get(id);
    const from = shifts.get(id);
    if (reduced || !from) return to;
    const t = Math.max(0, Math.min(1, (at - effectTime) / SHIFT_MS));
    const remaining = (1 - t) ** 3;
    if (t === 1) shifts.delete(id);
    return { ...to, x: to.x + (from.x - to.x) * remaining, y: to.y + (from.y - to.y) * remaining };
  }

  function draw(at, reduced) {
    if (!view || !layout) return;
    const { scene } = view;
    const { ladder, unit, card } = layout;
    const clock = view.phase === 'playing' && scene.phase === 'play'
      ? scene.elapsed + Math.min(100, Math.max(0, at - arrival)) : scene.elapsed;
    context.drawImage(background, 0, 0);
    context.save();
    context.scale(unit, unit);
    drawCard(context, cardArt, card, scene, clock, reduced, view.phase, view.results);
    label(context, 'Score ladder', ladder.x + 25, ladder.y + 46, 41, { colour: CREAM, face: 'Georgia' });
    rect(context, ladder.x + 22, ladder.y + 77, ladder.width - 44, 2, '#6e5369');
    for (const player of rows) {
      const point = rowPoint(player.id, at, reduced);
      const idle = (Math.floor(at / 190) + player.look * 5) % 19;
      const pose = reduced ? 0 : juice.squash(player.id, at) !== 0 ? 2 : idle === 1 ? 1 : 0;
      context.drawImage(tile(player, point, pose), Math.round(point.x), Math.round(point.y));
    }
    for (const [id, exit] of exits) {
      const fraction = (at - exit.at) / EXIT_MS;
      if (reduced || fraction >= 1) {
        exits.delete(id);
        continue;
      }
      const { x, y, height, scale } = exit.box;
      context.globalAlpha = 1 - Math.max(0, fraction);
      art.runner(context, exit.look, 1, x + (scale >= 8 ? 57 : 43) + fraction * 20,
        y + height / 2 - scale * 8 - fraction * 17, scale);
      context.globalAlpha = 1;
    }
    const progress = view.phase === 'results' ? 'Final scores'
      : scene.phase === 'score' ? 'Scores updated' : finished + ' / ' + rows.length + ' finished';
    label(context, progress, ladder.x + ladder.width / 2, ladder.y + ladder.height - 28, 27,
      { colour: GOLD, align: 'center' });
    juice.draw(context, at);
    context.restore();
  }

  const loop = createArcadeLoop(draw, reduced => {
    juice.setReducedMotion(reduced);
    if (reduced) {
      shifts.clear();
      exits.clear();
    }
  });
  function push(next) {
    const scene = next.scene;
    if (!scene || !layout) return;
    const time = performance.now();
    const prior = view?.round === next.round ? view.scene : null;
    if (!prior) {
      rows = [];
      directions.clear();
      exits.clear();
      shifts.clear();
      tiles.clear();
      juice.clear();
    }
    const old = new Map(rows.map(player => [player.id, player]));
    const oldPoints = new Map(rows.map(player => [player.id, rowPoint(player.id, time, false)]));
    const seats = new Map(next.players.map(player => [player.id, player]));
    const identities = new Map(next.roster.map(player => [player.id, player]));
    rows = scene.players.filter(player => seats.has(player.id))
      .map(player => ({ ...player, ...identities.get(player.id), connected: seats.get(player.id).connected }))
      .sort((a, b) => b.total - a.total);
    finished = rows.filter(player => player.done).length;
    const reveal = scene.phase === 'score' && prior?.phase !== 'score';
    const remaining = new Set(rows.map(row => row.id));
    const departed = [...old.values()].filter(player => !remaining.has(player.id));
    for (const player of departed) {
      exits.set(player.id, { look: player.look, box: oldPoints.get(player.id), at: time });
      tiles.delete(player.id);
    }
    if (!prior || reveal || departed.length) {
      positions.clear();
      positionRows();
      shifts.clear();
      if (prior) {
        for (const [id, from] of oldPoints) {
          const to = positions.get(id);
          if (to && from.width === to.width && (from.x !== to.x || from.y !== to.y)) shifts.set(id, from);
        }
      }
      effectTime = time;
    }
    if (reveal) directions = new Map();
    const ranked = scene.index > 0 || scene.phase === 'score' || next.phase === 'results';
    let rank = 0;
    rows = rows.map((player, index) => {
      if (rows[index - 1]?.total !== player.total) rank = index + 1;
      const before = old.get(player.id);
      if (reveal && before?.ranked) directions.set(player.id, Math.sign(rank - before.rank));
      const direction = scene.phase === 'score' ? directions.get(player.id) ?? 0 : 0;
      const gained = scene.phase === 'score' && player.gain > 0;
      const box = positions.get(player.id);
      const key = [box.width, box.height, box.scale, player.connected, player.done, player.look,
        player.name, player.total, gained && player.gain, rank, ranked, direction].join('/');
      return { ...player, rank, ranked, direction, gained, key };
    });

    if (scene.phase === 'play' && prior?.phase !== 'play') playSound('start');
    if (scene.phase === 'play' && prior?.index === scene.index) {
      const hits = rows.filter(player => player.done && !old.get(player.id)?.done);
      for (const player of hits) {
        const { x, y, height, scale } = positions.get(player.id);
        juice.impact({ x: x + 43 + scale * 8, y: y + height / 2, id: player.id, colour: LOOKS[player.look].colour, time });
      }
      if (hits.length && time - lastHit > 130) {
        playSound('hit');
        lastHit = time;
      }
    }
    const { card } = layout;
    if (reveal) {
      const bonus = scene.multiplier === 2;
      playSound(bonus ? 'bonus' : 'score');
      juice.impact({ x: card.x + card.width / 2, y: card.y + card.height * .59, colour: GOLD, time, strong: bonus });
    }
    if (next.phase === 'results' && view?.phase !== 'results' && next.results.length) {
      playSound('win');
      juice.impact({ x: card.x + card.width / 2, y: card.y + card.height * .59, colour: GOLD, time, strong: true });
    }
    const entry = CARDS[scene.card];
    const description = scene.phase === 'intro' ? INTRO : scene.phase === 'preview'
      ? entry.name + '. ' + entry.instruction + '. ' + entry.score : entry.instruction + '. ' + finished + ' of ' + rows.length + ' finished.';
    canvas.setAttribute('aria-label', description);
    view = next;
    arrival = time;
  }

  return { push, resize, setReducedMotion: loop.setReducedMotion, dispose: loop.dispose };
}
