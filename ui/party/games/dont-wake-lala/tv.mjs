import { createArcadeLoop, createJuice, createSoundHooks, createTimeline } from '../../kit/animation.mjs';
import { fitSpriteScale } from '../../kit/sprites.mjs';
import { LOOKS } from '../../looks.mjs';
import { createHallwayArt } from './art.mjs';

const DEFAULT_AREA = { width: 1920, height: 1000, safe: { x: 58, y: 0, width: 1804, height: 968 } };
const RUNNER = { width: 16, height: 16 };
const SLIDE_MS = 480;
const LOOK_FREEZE_MS = 105;
const CHEESE_MARKS = 3;
const CREAM = '#fff2d9';
const GOLD = '#ffd473';
const MINT = '#cee6d6';
const ALERT = '#ffc0aa';
const GOAL = 'Hold to reach the cheese. Let go when Lala looks.';
const SIGNALS = {
  sleep: { title: 'Tiptoe…', colour: MINT },
  ear: { title: 'Ear twitch!', colour: GOLD },
  blink: { title: 'Eye opening!', colour: GOLD },
  look: { title: 'Freeze!', colour: ALERT },
  finish: { title: 'Cheese!', colour: GOLD },
  time: { title: 'Time’s up!', colour: GOLD },
  empty: { title: 'Round over', colour: MINT },
};

function rectangle(context, colour, x, y, width, height) {
  context.fillStyle = colour;
  context.fillRect(x, y, width, height);
}

function polygon(context, colour, points) {
  context.fillStyle = colour;
  context.beginPath();
  for (const [x, y] of points) context.lineTo(x, y);
  context.closePath();
  context.fill();
}

function oval(context, colour, x, y, width, height) {
  context.fillStyle = colour;
  context.beginPath();
  context.ellipse(x, y, width, height, 0, 0, 2 * Math.PI);
  context.fill();
}

function label(context, text, x, y, { colour = CREAM, size = 24, align = 'left', maxWidth = 1920, display } = {}) {
  context.fillStyle = colour;
  context.font = `bold ${size}px ${display ? 'Georgia, serif' : 'system-ui, sans-serif'}`;
  context.textAlign = align;
  context.textBaseline = 'alphabetic';
  context.fillText(text, x, y, maxWidth);
}

function line(context, colour, width, points) {
  context.beginPath();
  for (const [x, y] of points) context.lineTo(x, y);
  context.strokeStyle = colour;
  context.lineWidth = width;
  context.stroke();
}

function star(context, colour, x, y, radius) {
  polygon(context, colour, [
    [x, y - radius], [x + radius / 4, y - radius / 4], [x + radius, y],
    [x + radius / 4, y + radius / 4], [x, y + radius], [x - radius / 4, y + radius / 4],
    [x - radius, y], [x - radius / 4, y - radius / 4],
  ]);
}

function paintWindow(context) {
  context.fillStyle = '#714c57';
  context.beginPath();
  context.roundRect(1394, 19, 177, 274, [88, 88, 8, 8]);
  context.fill();
  context.fillStyle = '#222841';
  context.beginPath();
  context.roundRect(1404, 29, 157, 250, [79, 79, 3, 3]);
  context.fill();
  oval(context, '#f4db9c', 1480, 108, 43, 43);
  oval(context, '#222841', 1496, 94, 36, 36);
  for (const [x, y, size] of [[1441, 154, 4], [1526, 164, 7], [1466, 195, 5], [1534, 77, 4], [1434, 96, 4]]) {
    star(context, '#b0b7ce', x, y, size);
  }
  rectangle(context, '#714c57', 1404, 212, 157, 7);
  rectangle(context, '#b78373', 1380, 275, 206, 10);
}

function paintSet(context, { width, height, safe }) {
  // Interior art uses one normalized coordinate system. Characters are drawn in CSS pixels.
  context.resetTransform();
  rectangle(context, '#31263b', 0, 0, width, height);
  context.translate(safe.x, safe.y);
  context.scale(safe.width / 1800, safe.height / 960);

  const wall = context.createLinearGradient(0, 0, 1750, 320);
  wall.addColorStop(0, '#302239');
  wall.addColorStop(.56, '#59394f');
  wall.addColorStop(1, '#4c354b');
  rectangle(context, wall, -150, 0, 2100, 294);
  for (let x = -37; x < 1970; x += 54) {
    rectangle(context, '#fbd19b0d', x, 0, 2, 294);
    for (let y = 39 + (x % 108 ? 0 : 35); y < 280; y += 74) star(context, '#faaf9c26', x + 27, y, 5);
  }
  rectangle(context, '#3c2b3e', -150, 224, 2100, 65);
  rectangle(context, '#9a665e', -150, 224, 2100, 5);
  rectangle(context, '#674650', -150, 230, 2100, 4);
  for (let x = -24; x < 1930; x += 120) rectangle(context, '#654553', x, 241, 2, 43);
  rectangle(context, '#b47a65', -150, 287, 2100, 7);
  paintWindow(context);

  const floor = context.createLinearGradient(0, 294, 0, 1010);
  floor.addColorStop(0, '#794857');
  floor.addColorStop(.65, '#a0685b');
  floor.addColorStop(1, '#744655');
  rectangle(context, floor, -150, 294, 2100, 725);
  const boards = [294, 329, 383, 457, 551, 669, 813, 988];
  for (const [index, y] of boards.entries()) {
    line(context, '#432d3d99', 3, [[-150, y], [1950, y]]);
    line(context, '#edaa843f', 2, [[-150, y + 3], [1950, y + 3]]);
    if (index === boards.length - 1) break;
    for (let x = -120 + (index % 3) * 89; x < 1940; x += 215 + index * 23) {
      line(context, '#5031408c', 2, [[x, y], [x + (x - 1480) * .035, boards[index + 1]]]);
    }
  }

  polygon(context, '#ffd48c15', [[1403, 285], [1561, 285], [1840, 672], [1250, 672]]);
  polygon(context, '#30223c99', [[66, 315], [1270, 315], [1490, 947], [5, 966]]);
  polygon(context, '#bc858179', [[67, 310], [1260, 310], [1461, 931], [10, 947]]);
  polygon(context, '#543746', [[77, 318], [1251, 318], [1437, 917], [31, 930]]);
  polygon(context, '#664251', [[89, 331], [1243, 331], [1418, 905], [50, 918]]);
  line(context, '#dba38873', 2, [[93, 338], [1237, 338], [1409, 898], [57, 912], [93, 338]]);

  // Woven marks show the route across the single rug.
  for (const [x, y] of [[365, 387], [786, 385], [1047, 385],
    [289, 582], [693, 582], [1132, 582], [234, 777], [662, 777], [1247, 777]]) {
    star(context, '#e1b09728', x, y, 24);
    star(context, '#e1b09720', x + 34, y + 15, 10);
  }
  context.resetTransform();
}

function makeLayout(roster, safe) {
  const crowd = roster.length > 8;
  const duel = roster.length <= 2;
  const columns = roster.length >= 7 ? 2 : 1;
  const sizeCap = duel ? 12 : crowd ? 5 : roster.length >= 7 ? 6 : 8;
  const scale = Math.min(sizeCap, fitSpriteScale(RUNNER, roster.length, {
    width: safe.width * .6,
    height: safe.height * .73,
  }, { columns }) || 1);
  const x = fraction => safe.x + safe.width * fraction;
  const y = fraction => safe.y + safe.height * fraction;
  const unit = Math.min(safe.width / 1800, safe.height / 960);
  const top = duel ? .52 : .35;
  const bottom = duel ? .77 : .94;
  const lanes = new Map(roster.map((player, index) => {
    const depth = index / Math.max(roster.length - 1, 1);
    const stagger = columns === 2 && index % columns ? (crowd ? .055 : .028) : 0;
    return [player.id, {
      ...player, scale, unit,
      start: x(.124 + .045 * (1 - depth) + stagger),
      finish: x(.648 + .055 * depth + stagger),
      floor: y(top + (bottom - top) * depth),
    }];
  }));
  return {
    lanes, safe, x, y, unit,
    cat: { right: x(.985), floor: y(.583), scale: Math.max(1, Math.floor(Math.min(.34 * safe.width / 89, .46 * safe.height / 65))) },
    cheese: { x: x(.845), y: y(.739) },
  };
}

function runnerX(lane, distance, target) {
  return lane.start + (lane.finish - lane.start) * Math.max(0, Math.min(1, distance / target));
}

function interpolate(previous, current, amount, lerp) {
  const byId = new Map(previous.runners.map(runner => [runner.playerId, runner]));
  return {
    ...current,
    runners: current.runners.map(runner => {
      const before = byId.get(runner.playerId);
      if (!before || before.catchId !== runner.catchId) return runner;
      return { ...runner, distance: lerp(before.distance, runner.distance, amount) };
    }),
  };
}

function paintRoute(context, layout) {
  const { x, y, unit } = layout;
  const start = [[x(.169), y(.34)], [x(.124), y(.951)]];
  const goal = [[x(.648), y(.34)], [x(.731), y(.951)]];
  context.setLineDash([5 * unit, 11 * unit]);
  line(context, '#f6ce9c75', 3 * unit, start);
  line(context, '#ffda8bbb', 4 * unit, goal);
  context.setLineDash([]);
  label(context, 'START', x(.052), y(.96), { size: 19 * unit, colour: '#f9cfae' });
}

function paintLala(context, art, layout, cue, at, reduced, closeUp) {
  const { cat, x, unit } = layout;
  const scale = closeUp ? cat.scale + 1 : cat.scale;
  const left = cat.right - 89 * scale;
  const top = cat.floor - 63 * scale;
  const sleeping = cue === 'sleep';
  oval(context, '#291f2e9c', x(.843), cat.floor + 15 * unit, 242 * unit, 49 * unit);
  oval(context, '#704357', x(.843), cat.floor + 6 * unit, 221 * unit, 39 * unit);
  oval(context, '#a26470', x(.843), cat.floor - 4 * unit, 221 * unit, 32 * unit);
  oval(context, '#bd7e82', x(.843), cat.floor - 10 * unit, 193 * unit, 25 * unit);
  art.cat(context, left, top, scale, cue, at, reduced);

  if (sleeping) {
    const drift = reduced ? 0 : Math.sin(at / 400) * 6 * unit;
    label(context, 'z', left + 4 * scale, top + 8 * scale - drift, { size: 22 * unit, colour: MINT, display: true });
    label(context, 'Z', left + 8 * scale, top + 3 * scale - drift, { size: 44 * unit, colour: MINT, display: true });
  } else if (cue === 'ear') {
    const earX = left + 7 * scale;
    const earY = top + 7 * scale;
    line(context, GOLD, 6 * unit, [[earX - 23 * unit, earY + 5 * unit], [earX - 43 * unit, earY - 1 * unit]]);
    line(context, GOLD, 6 * unit, [[earX - 14 * unit, earY - 8 * unit], [earX - 26 * unit, earY - 26 * unit]]);
    line(context, GOLD, 6 * unit, [[earX + 1 * unit, earY - 12 * unit], [earX + 4 * unit, earY - 34 * unit]]);
  } else if (cue === 'blink' || cue === 'look') {
    star(context, cue === 'look' ? ALERT : GOLD, left + 2 * scale, top + 33 * scale, (cue === 'look' ? 20 : 12) * unit);
  }

  const cheese = layout.cheese;
  const cheeseScale = Math.max(1, Math.floor(8 * unit));
  oval(context, '#35233399', cheese.x, cheese.y + 17 * unit, 110 * unit, 28 * unit);
  oval(context, '#6f525c', cheese.x, cheese.y + 5 * unit, 100 * unit, 24 * unit);
  oval(context, '#b38b7a', cheese.x, cheese.y, 97 * unit, 21 * unit);
  art.cheese(context, cheese.x - 9 * cheeseScale, cheese.y - 12 * cheeseScale, cheeseScale);
  const gleam = reduced ? 0 : Math.sin(at / 340) * 3 * unit;
  star(context, CREAM, cheese.x + 65 * unit, cheese.y - 90 * unit, 14 * unit + gleam);
  star(context, GOLD, cheese.x - 71 * unit, cheese.y - 58 * unit, 10 * unit);
  label(context, 'CHEESE', cheese.x, cheese.y + 61 * unit, { size: 23 * unit, colour: GOLD, align: 'center' });
}

function paintRunner(context, art, lane, runner, target, at, reduced, slide, away) {
  const { look, floor, scale, unit } = lane;
  const remaining = reduced || !slide ? 0 : Math.max(0, 1 - (at - slide.time) / SLIDE_MS);
  const distance = remaining ? slide.distance * remaining ** 2 : runner.distance;
  const x = runnerX(lane, distance, target);
  const pose = !reduced && runner.moving ? 1 + Math.floor(at / 105) % 2 : 0;
  const hop = remaining ? Math.sin(remaining * Math.PI) * 26 * unit : pose === 2 ? 3 * unit : 0;
  const top = floor - RUNNER.height * scale - hop;

  oval(context, '#20172886', x, floor, 6.1 * scale, 1.2 * scale);
  if (away) context.globalAlpha = .64;
  if (remaining) {
    const tail = x + 7 * scale;
    line(context, ALERT, 4 * unit, [[tail, floor - 4 * scale], [tail + 56 * remaining * unit, floor - 4 * scale]]);
    line(context, GOLD, 3 * unit, [[tail + 5 * unit, floor - 6 * scale], [tail + 66 * remaining * unit, floor - 6 * scale]]);
    context.save();
    context.translate(x, floor - 7 * scale - hop);
    context.rotate(-.55 * remaining);
    art.runner(context, look, 1, -8 * scale, -9 * scale, scale);
    context.restore();
  } else {
    art.runner(context, look, pose, x - 8 * scale, top, scale);
  }
  context.globalAlpha = 1;
  return { x, top, lane, caught: runner.caught, away };
}

function paintTag(context, art, { x, top, lane, caught, away }, safe) {
  const { name, look, scale, unit } = lane;
  const badgeScale = Math.max(1, Math.floor(2 * unit));
  const badgeWidth = 7 * badgeScale;
  const size = Math.max(11, (scale > 8 ? 26 : 22) * unit);
  context.font = `bold ${size}px system-ui, sans-serif`;
  const maxName = 123 * unit;
  const nameWidth = Math.min(maxName, context.measureText(name).width);
  const width = badgeWidth + nameWidth + 22 * unit;
  const height = Math.max(badgeWidth, size) + 8 * unit;
  const left = Math.max(safe.x + unit, x - 6.5 * scale - width);
  const y = top + 3 * scale;
  rectangle(context, caught ? '#6a3344' : '#2b2032', left, y, width, height);
  const colour = caught ? ALERT : LOOKS[look].colour;
  rectangle(context, colour, left, y, 3 * unit, height);
  rectangle(context, colour, left + 6 * unit, y + (height - badgeWidth) / 2, badgeWidth, badgeWidth);
  art.badge(context, look, left + 6 * unit, y + (height - badgeWidth) / 2, badgeScale);
  label(context, name, left + badgeWidth + 12 * unit, y + (height + size * .69) / 2, {
    size, maxWidth: maxName, colour: away ? '#d1c4c8' : CREAM,
  });
  if (caught) label(context, '!', x + 7 * scale, y + height, { size: 36 * unit, colour: ALERT, display: true });
}

function status(view) {
  if (view.phase !== 'results') return view.scene.cue;
  return view.scene.finish ? 'finish' : view.results.length ? 'time' : 'empty';
}

function paintCall(context, layout, view, code) {
  const { x, y, unit } = layout;
  const signal = SIGNALS[code];
  const alert = code === 'look';
  const caught = alert ? view.scene.runners.filter(runner => runner.caught).length : 0;
  const winners = code === 'finish' ? view.results.filter(result => result.place === 1) : [];
  const winner = winners.length === 1 ? layout.lanes.get(winners[0].playerId)?.name : null;
  const detail = alert ? (caught ? `${caught} caught · back to the start` : 'Let go and keep still.')
    : code === 'finish' ? (winner ? `${winner} got there first!` : 'A tie at the cheese!')
    : GOAL;
  const left = x(.023);
  if (alert) {
    polygon(context, '#652d43', [[x(.011), y(.013)], [x(.365), y(.013)],
      [x(.318), y(.194)], [x(.011), y(.194)]]);
    line(context, ALERT, 4 * unit, [[x(.012), y(.013)], [x(.012), y(.194)]]);
  }
  label(context, signal.title, left, y(.114), {
    size: (alert ? 91 : 73) * unit, display: true, colour: signal.colour, maxWidth: x(.49) - left,
  });
  label(context, detail, left + 2 * unit, y(.169), {
    size: 27 * unit, maxWidth: x(.62) - left,
  });
}

export function mountDontWakeLalaTv(canvas, { art, sound }) {
  const context = canvas.getContext('2d');
  const document = canvas.ownerDocument;
  const background = document.createElement('canvas');
  const hallwayArt = createHallwayArt(document);
  const timeline = createTimeline();
  const juice = createJuice();
  const playSound = createSoundHooks(sound, { ear: 'move', blink: 'lure', look: 'cat', catch: 'error', score: 'collect', win: 'win' });
  const slides = new Map();
  let area;
  let layout;
  let lastView;
  let lastDraw;
  let lookAt = -Infinity;
  let presence = new Map();
  let visibleRunners = new Set();
  let vignette;

  function resize(next) {
    if (area?.width === next.width && area?.height === next.height && area.safe.height === next.safe.height) return;
    area = next;
    canvas.width = background.width = next.width;
    canvas.height = background.height = next.height;
    paintSet(background.getContext('2d'), next);
    if (lastView) layout = makeLayout(lastView.roster, area.safe);
    const { x, y, width, height } = area.safe;
    vignette = context.createRadialGradient(x + width * .8, y + height * .41, height * .14,
      x + width * .8, y + height * .41, width * .7);
    vignette.addColorStop(0, '#5a213800');
    vignette.addColorStop(.46, '#5a213831');
    vignette.addColorStop(1, '#22142ecf');
    juice.clear();
  }

  resize(DEFAULT_AREA);

  const loop = createArcadeLoop((at, reduced) => {
    if (!lastView) return;
    const { scene } = lastView;
    const code = status(lastView);
    const gaze = code === 'look';
    const cut = !reduced && gaze && at - lookAt < 430;
    const freeze = cut && at - lookAt < LOOK_FREEZE_MS;
    const sampled = freeze && lastDraw ? lastDraw : timeline.sample(at, interpolate, reduced);
    context.drawImage(background, 0, 0);
    paintRoute(context, layout);
    if (gaze) rectangle(context, vignette, 0, 0, area.width, area.height);
    paintLala(context, hallwayArt, layout, scene.cue, at, reduced, cut);

    const tags = [];
    for (const runner of sampled.runners) {
      if (!visibleRunners.has(runner.playerId)) continue;
      tags.push(paintRunner(context, art, layout.lanes.get(runner.playerId), runner, scene.target, at, reduced,
        slides.get(runner.playerId), !presence.get(runner.playerId)));
    }
    for (const tag of tags) paintTag(context, art, tag, layout.safe);
    juice.draw(context, at);
    paintCall(context, layout, lastView, code);
    lastDraw = sampled;
  }, reduced => {
    juice.setReducedMotion(reduced);
    if (reduced) slides.clear();
  });

  function push(view) {
    const { scene } = view;
    if (!scene) return;
    const time = performance.now();
    const prior = lastView?.round === view.round ? lastView : null;
    const previouslyVisible = visibleRunners;
    presence = new Map(view.players.map(player => [player.id, player.connected]));
    visibleRunners = new Set(scene.runners.map(runner => runner.playerId).filter(id => presence.has(id)));
    if (!prior) {
      layout = makeLayout(view.roster, area.safe);
      slides.clear();
      juice.clear();
      lookAt = -Infinity;
      lastDraw = null;
    }

    const previous = new Map(prior?.scene.runners.map(runner => [runner.playerId, runner]));
    for (const [id, runner] of previous) {
      if (!previouslyVisible.has(id) || visibleRunners.has(id)) continue;
      slides.delete(id);
      const lane = layout.lanes.get(id);
      juice.impact({ x: runnerX(lane, runner.distance, scene.target), y: lane.floor - 8 * lane.scale,
        colour: LOOKS[lane.look].colour, time });
    }

    if (scene.cue !== prior?.scene.cue) {
      if (scene.cue === 'look') lookAt = time;
      if (scene.cue !== 'sleep') playSound(scene.cue);
    }

    let caught = false;
    let scored = false;
    for (const runner of scene.runners) {
      const id = runner.playerId;
      const before = previous.get(id);
      if (!before || !presence.has(id)) continue;
      const lane = layout.lanes.get(id);
      const y = lane.floor - 8 * lane.scale;
      if (runner.catchId !== before.catchId) {
        slides.set(id, { distance: before.distance, time });
        juice.impact({ x: runnerX(lane, before.distance, scene.target), y, colour: ALERT, time });
        caught = true;
      } else if (Math.floor(runner.distance / scene.target * CHEESE_MARKS)
        > Math.floor(before.distance / scene.target * CHEESE_MARKS)) {
        const finish = runner.distance === scene.target;
        juice.impact({ x: runnerX(lane, runner.distance, scene.target), y,
          colour: finish ? GOLD : LOOKS[lane.look].colour, strong: finish, time });
        scored = true;
      }
    }
    if (caught) playSound('catch');
    if (scored) playSound('score');
    if (view.phase === 'results' && prior?.phase !== 'results' && view.results.length) playSound('win');
    timeline.push(scene, view.round, time);
    const code = status(view);
    if (canvas.dataset.cue !== code) {
      canvas.dataset.cue = code;
      canvas.setAttribute('aria-label', `${GOAL} ${SIGNALS[code].title}`);
    }
    lastView = view;
  }

  return { push, resize, setReducedMotion: loop.setReducedMotion, dispose: loop.dispose };
}
