import { createArcadeLoop, createJuice, createSoundHooks, createTimeline } from '../../kit/animation.mjs';
import { LOOKS } from '../../looks.mjs';
import { createHallwayArt } from './art.mjs';

const WIDTH = 1760;
const HEIGHT = 816;
const PIXEL = 4;
const RUG_TOP = 128;
const RUG_HEIGHT = 656;
const ALCOVE = { x: 1296, y: 104, width: 432, height: 680 };
const LANE_FLOOR = 72;
const SLIDE_MS = 430;
const LOOK_FREEZE_MS = 105;
const POINTS_PER_MARK = 50;
const INK = '#251c2b';
const CREAM = '#fff0d6';
const GOLD = '#ffcf72';
const STARLIGHT = '#accfce';
const ALERT = '#ff9e93';
const GOAL = 'Hold to tiptoe to the cheese and let go when Lala looks.';
const SIGNAL = {
  sleep: { label: 'Lala is asleep', colour: STARLIGHT },
  ear: { label: 'Ear twitch!', colour: GOLD },
  blink: { label: 'Eye opening!', colour: GOLD },
  look: { label: 'Freeze!', colour: ALERT },
  finish: { label: 'Cheese!', colour: GOLD },
  time: { label: 'Time’s up!', colour: GOLD },
};

function block(context, colour, x, y, width, height) {
  context.fillStyle = colour;
  context.fillRect(x, y, width, height);
}

function label(context, text, x, y, { colour = CREAM, size = 25, align = 'left', maxWidth } = {}) {
  context.fillStyle = colour;
  context.font = `800 ${size}px system-ui, sans-serif`;
  context.textAlign = align;
  context.fillText(text, x, y, maxWidth ?? WIDTH);
}

function createLanes(roster) {
  const split = roster.length > 8;
  const count = split ? Math.ceil(roster.length / 2) : roster.length;
  const stride = Math.min(144, Math.floor(RUG_HEIGHT / count / PIXEL) * PIXEL);
  const lanes = roster.map((player, index) => {
    const second = split && index >= count;
    const countInBank = second ? roster.length - count : count;
    return {
      ...player,
      x: second ? 664 : 32,
      y: RUG_TOP + Math.round((RUG_HEIGHT - stride * countInBank) / 2) + index % count * stride,
      width: split ? 608 : 1240,
    };
  });
  return new Map(lanes.map(lane => [lane.id, lane]));
}

function startX(lane) { return lane.x + 188; }
function finishX(lane) { return lane.x + lane.width - 40; }
function runnerX(lane, distance, target) {
  return startX(lane) + (finishX(lane) - startX(lane) - 54) * distance / target;
}

function paintHallway(context) {
  block(context, '#37283d', 0, 0, WIDTH, HEIGHT);
  block(context, '#49344b', 0, 104, WIDTH, 656);
  // Repeating wallpaper and wooden trim put the two banks in the same hallway.
  for (let y = 116; y < HEIGHT; y += 64) {
    for (let x = y % 128 === 52 ? 8 : 40; x < WIDTH; x += 64) {
      block(context, '#5c4159', x, y + 4, 12, 4);
      block(context, '#5c4159', x + 4, y, 4, 12);
    }
  }
  block(context, '#281e2e', 0, 0, WIDTH, 96);
  block(context, '#6c4b56', 0, 92, WIDTH, 4);
  block(context, '#947173', 0, 96, WIDTH, 4);
  block(context, '#231c2d', 0, 788, WIDTH, 28);
  block(context, '#694b52', 0, 788, WIDTH, 4);
  block(context, '#80575e', 0, 800, WIDTH, 4);
  for (let x = 0; x < WIDTH; x += 80) block(context, '#563c47', x, 804, 4, 12);
}

function paintLane(context, lane) {
  const { x, y, width, look, name } = lane;
  block(context, '#291e2b', x + 4, y + 4, width, 76);
  block(context, '#79534f', x, y, width, 72);
  block(context, '#493342', x, y + 4, width, 64);
  block(context, '#61404b', x + 160, y + 4, width - 160, 64);
  block(context, '#825452', x + 160, y + 56, width - 160, 12);
  block(context, '#bb8065', x + 160, y + 64, width - 160, 4);
  block(context, LOOKS[look].colour, x + 10, y + 23, 4, 32);
  label(context, name, x + 24, y + 48, { size: 25, maxWidth: 132 });
  for (let index = 1; index <= 9; index++) {
    const marker = startX(lane) + Math.round((finishX(lane) - startX(lane)) * index / 10);
    block(context, '#996c65', marker, y + 61, 4, 7);
  }
  block(context, '#bc896e', startX(lane), y + 12, 4, 52);
  for (let row = 0; row < 6; row++) {
    for (let column = 0; column < 2; column++) {
      block(context, (row + column) % 2 ? '#926451' : GOLD, finishX(lane) + column * 8, y + 12 + row * 8, 8, 8);
    }
  }
}

function paintAlcove(context) {
  const { x, y, width, height } = ALCOVE;
  block(context, '#241a2a', x + 8, y + 8, width, height);
  block(context, '#a27169', x, y, width, height);
  block(context, '#714950', x + 4, y + 4, width - 8, height - 8);
  block(context, '#35263e', x + 16, y + 16, width - 32, height - 32);
  block(context, '#4c344b', x + 24, y + 96, width - 48, 396);
  for (const inset of [48, 96, 144, 192]) {
    block(context, '#604252', x + inset, y + 104, 4, 368);
    block(context, '#604252', x + width - inset - 4, y + 104, 4, 368);
  }
  block(context, '#674355', x + 140, y + 116, 152, 112);
  block(context, '#271e36', x + 148, y + 124, 136, 96);
  block(context, '#655972', x + 152, y + 128, 128, 88);
  block(context, '#3f3957', x + 156, y + 132, 120, 80);
  block(context, '#b6bbd8', x + 180, y + 144, 24, 32);
  block(context, '#3f3957', x + 192, y + 140, 20, 26);
  for (const [starX, starY] of [[220, 154], [256, 150], [240, 173], [174, 190], [261, 193]]) {
    block(context, '#c4bad3', x + starX, y + starY, 4, 4);
  }
  block(context, '#8b6978', x + 132, y + 216, 168, 8);
  block(context, '#61384d', x + 36, y + 484, width - 72, 20);
  block(context, '#b55763', x + 48, y + 476, width - 96, 32);
  block(context, '#d97d7b', x + 56, y + 476, width - 112, 8);
  block(context, '#864657', x + 48, y + 500, width - 96, 8);
  block(context, '#70484c', x + 24, y + 520, width - 48, 100);
  block(context, '#c28b6d', x + 24, y + 520, width - 48, 8);
  block(context, '#4d3440', x + 24, y + 620, width - 48, 8);
}

function paintSet(context, lanes) {
  paintHallway(context);
  label(context, GOAL, 32, 60, { size: 34 });
  paintAlcove(context);
  for (const lane of lanes.values()) paintLane(context, lane);
}

function interpolate(previous, current, amount, lerp) {
  return {
    ...current,
    runners: current.runners.map((runner, index) => {
      const before = previous.runners[index];
      if (!before || before.catchId !== runner.catchId) return runner;
      return { ...runner, distance: lerp(before.distance, runner.distance, amount) };
    }),
  };
}

function paintCat(context, art, cue, status, at, zoom, reduced) {
  const { x, y, width } = ALCOVE;
  const alert = cue === 'look';
  const asleep = cue === 'sleep';
  const signal = SIGNAL[status];
  // The label and silhouette carry the cue independently of colour and motion.
  block(context, signal.colour, x + 16, y + 16, width - 32, 72);
  label(context, signal.label, x + width / 2, y + 65, { align: 'center', colour: INK, size: 44 });
  if (zoom) {
    block(context, '#a54655', x + 24, y + 96, width - 48, 400);
    block(context, '#b85963', x + 24, y + 208, width - 48, 124);
    block(context, '#c3656c', x + 24, y + 256, width - 48, 24);
  } else if (alert) {
    block(context, ALERT, x + 24, y + 96, 8, 400);
    block(context, ALERT, x + width - 32, y + 96, 8, 400);
  }
  context.save();
  context.beginPath();
  context.rect(x + 24, y + 96, width - 48, 384);
  context.clip();
  // A cut to a larger integer scale keeps the open eyes crisp during the look.
  if (zoom) art.cat(context, x - 8, y + 97, 7, cue, at, reduced);
  else art.cat(context, x + 40, y + 222, PIXEL, cue, at, reduced);
  context.restore();

  if (asleep && status === 'sleep') {
    const breath = !reduced && Math.floor(at / 625) % 3 === 1 ? PIXEL : 0;
    label(context, 'z', x + 86, y + 252 - breath, { colour: STARLIGHT, size: 24 });
    label(context, 'Z', x + 112, y + 224 - breath, { colour: STARLIGHT, size: 35 });
  }
  if (cue === 'ear') {
    block(context, GOLD, x + 58, y + 243, 12, 4);
    block(context, GOLD, x + 50, y + 232, 12, 4);
    block(context, GOLD, x + 67, y + 220, 4, 12);
  }
  const glint = !reduced && Math.floor(at / 300) % 3 === 0;
  const cheeseX = x + width / 2 - 36;
  art.cheese(context, cheeseX, y + 537, PIXEL);
  if (glint || status === 'finish') {
    for (const side of [-1, 1]) {
      const starX = x + width / 2 + side * 70;
      block(context, GOLD, starX, y + 552, 4, 20);
      block(context, GOLD, starX - 8, y + 560, 20, 4);
    }
  }
  label(context, 'The cheese', x + width / 2, y + 654, { align: 'center', size: 32, colour: GOLD });
}

function paintRunner(context, art, lane, runner, target, at, reduced, slide, presence) {
  const { y, look } = lane;
  const left = presence === undefined;
  const away = presence === false;
  const colour = LOOKS[look].colour;
  const progress = (finishX(lane) - startX(lane)) * runner.distance / target;
  block(context, runner.caught ? ALERT : colour, startX(lane), y + 64, Math.round(progress), 4);
  const sliding = !reduced && slide && at - slide.time < SLIDE_MS;
  const remaining = sliding ? 1 - Math.max(0, at - slide.time) / SLIDE_MS : 0;
  const from = sliding ? slide.distance * remaining ** 2 : runner.distance;
  const x = Math.round(runnerX(lane, from, target));
  const pose = !reduced && runner.moving ? 1 + Math.floor(at / 120) % 2 : 0;
  const hop = reduced ? 0 : sliding ? Math.round(Math.sin(remaining * Math.PI) * 14)
    : runner.moving && pose === 2 ? PIXEL : 0;
  if (left) {
    paintRunnerTag(context, lane, 'Left', STARLIGHT, x);
    return;
  }
  if (away) context.globalAlpha = .4;
  block(context, '#452d3e', x + 10, y + 60, 40, 4);
  if (sliding && remaining > .3) {
    context.save();
    context.translate(x + 64, y + LANE_FLOOR - hop - 4);
    context.scale(-1, -1);
    art.runner(context, look, 1, 0, 0, PIXEL);
    context.restore();
    block(context, CREAM, x + 50, y + 20, 16, 4);
    block(context, GOLD, x + 56, y + 30, 20, 4);
  } else {
    art.runner(context, look, pose, x, y + LANE_FLOOR - 64 - hop, PIXEL);
  }
  block(context, INK, x - 24, y + 24 - hop, 36, 36);
  block(context, colour, x - 22, y + 26 - hop, 32, 32);
  art.badge(context, look, x - 20, y + 28 - hop, PIXEL);
  context.globalAlpha = 1;
  if (runner.caught || away) {
    paintRunnerTag(context, lane, runner.caught ? 'Caught!' : 'Away', runner.caught ? ALERT : STARLIGHT, x);
  }
}

function paintRunnerTag(context, lane, text, colour, runnerX) {
  const right = lane.x + lane.width - 130;
  const x = runnerX + 78 > right ? startX(lane) + 56 : right;
  block(context, INK, x, lane.y + 15, 82, 37);
  label(context, text, x + 41, lane.y + 41, { align: 'center', colour, size: 20 });
}

export function mountDontWakeLalaTv(canvas, { art, sound }) {
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  const document = canvas.ownerDocument;
  const set = document.createElement('canvas');
  set.width = WIDTH;
  set.height = HEIGHT;
  const setContext = set.getContext('2d');
  const hallwayArt = createHallwayArt(document);
  const timeline = createTimeline();
  const juice = createJuice();
  const playSound = createSoundHooks(sound, { ear: 'move', blink: 'lure', look: 'cat', catch: 'error', score: 'collect', win: 'win' });
  const slides = new Map();
  let lanes;
  let lastView;
  let lastDraw;
  let lookAt = -Infinity;
  let presence = new Map();

  const loop = createArcadeLoop((at, reduced) => {
    if (!lastView) return;
    const scene = lastView.scene;
    const looking = scene.cue === 'look';
    const cut = !reduced && looking && at - lookAt < 425;
    const freeze = cut && at - lookAt < LOOK_FREEZE_MS;
    const sampled = freeze && lastDraw ? lastDraw : timeline.sample(at, interpolate, reduced);
    const status = lastView.phase === 'results' ? (scene.finish ? 'finish' : 'time') : scene.cue;
    context.drawImage(set, 0, 0);
    for (const runner of sampled.runners) {
      paintRunner(context, art, lanes.get(runner.playerId), runner, scene.target, at, reduced,
        slides.get(runner.playerId), presence.get(runner.playerId));
    }
    paintCat(context, hallwayArt, scene.cue, status, at, cut, reduced);
    juice.draw(context, at);
    lastDraw = sampled;
  }, reduced => juice.setReducedMotion(reduced));

  function push(view) {
    const { scene } = view;
    if (!scene) return;
    const time = performance.now();
    const prior = lastView?.round === view.round ? lastView : null;
    presence = new Map(view.players.map(player => [player.id, player.connected]));
    if (!prior) {
      lanes = createLanes(view.roster);
      paintSet(setContext, lanes);
      for (const lane of lanes.values()) {
        // Populate the kit's small runner sprite cache before the first frame.
        for (let pose = 0; pose < 3; pose++) art.runner(setContext, lane.look, pose, -64, -64, PIXEL);
      }
      slides.clear();
      juice.clear();
      lookAt = -Infinity;
      lastDraw = null;
    }
    if (scene.cue !== prior?.scene.cue) {
      if (scene.cue === 'look') lookAt = time;
      if (scene.cue !== 'sleep') playSound(scene.cue);
    }
    let caught = false;
    let scored = false;
    for (const [index, runner] of scene.runners.entries()) {
      const before = prior?.scene.runners[index];
      if (!before || !presence.has(runner.playerId)) continue;
      const lane = lanes.get(runner.playerId);
      const colour = LOOKS[lane.look].colour;
      if (runner.catchId !== before.catchId) {
        slides.set(runner.playerId, { distance: before.distance, time });
        juice.impact({ x: runnerX(lane, before.distance, scene.target) + 36, y: lane.y + 36, colour: ALERT, time });
        caught = true;
      } else if (Math.floor(runner.distance / POINTS_PER_MARK) > Math.floor(before.distance / POINTS_PER_MARK)) {
        juice.impact({ x: runnerX(lane, runner.distance, scene.target) + 36, y: lane.y + 44,
          colour, label: runner.distance === scene.target ? 'Cheese!' : undefined, time });
        scored = true;
      }
    }
    if (caught) playSound('catch');
    if (view.phase === 'results' && prior?.phase !== 'results' && view.results.length) playSound('win');
    else if (scored) playSound('score');
    timeline.push(scene, view.round, time);
    const status = view.phase === 'results' ? (scene.finish ? 'finish' : 'time') : scene.cue;
    if (canvas.dataset.cue !== status) {
      canvas.dataset.cue = status;
      canvas.setAttribute('aria-label', `${GOAL} ${SIGNAL[status].label}`);
    }
    lastView = view;
  }

  return { push, setReducedMotion: loop.setReducedMotion, dispose: loop.dispose };
}
