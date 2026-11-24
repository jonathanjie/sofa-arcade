import { createArcadeLoop, createJuice, createSoundHooks, createTimeline } from '../../kit/animation.mjs';
import { LOOKS } from '../../looks.mjs';

const WIDTH = 1760;
const HEIGHT = 816;
const RACE_TOP = 82;
const ROW_HEIGHT = 86;
const HALF_WIDTH = WIDTH / 2;
const FIRST_X = 220;
const FINISH_X = 805;
const RUNNER_SCALE = 4;
const PALETTE = { linen: '#f9ecd3', ink: '#192b2b', dim: '#aeccbc', finish: '#fbd280' };

function lanes(roster) {
  return new Map(roster.map((player, index) => {
    const column = index >= 8 ? 1 : 0;
    const row = index % 8;
    return [player.id, { ...player, x: column * HALF_WIDTH, y: RACE_TOP + row * ROW_HEIGHT }];
  }));
}

function createTrackCanvas(document) {
  const board = document.createElement('canvas');
  board.width = WIDTH;
  board.height = HEIGHT;
  return board;
}

function paintTrack(context, laneMap, art) {
  context.fillStyle = '#274946';
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = '#1e3938';
  context.fillRect(HALF_WIDTH - 3, 32, 6, HEIGHT - 64);
  context.font = '800 23px system-ui';
  context.fillStyle = PALETTE.dim;
  for (const x of [0, HALF_WIDTH]) {
    context.fillText('RUNNER', x + 30, 51);
    context.fillText('START', x + FIRST_X, 51);
    context.fillText('FINISH', x + FINISH_X - 42, 51);
  }
  for (const lane of laneMap.values()) {
    const { x, y, name, look } = lane;
    context.fillStyle = '#335954';
    context.fillRect(x + 25, y, HALF_WIDTH - 50, ROW_HEIGHT - 9);
    context.fillStyle = '#40665e';
    for (let marker = FIRST_X; marker < FINISH_X; marker += 58) {
      context.fillRect(x + marker, y + ROW_HEIGHT - 22, 19, 3);
    }
    context.fillStyle = PALETTE.finish;
    for (let square = 0; square < 8; square++) {
      context.fillRect(x + FINISH_X + square % 2 * 7, y + 10 + square * 7, 7, 7);
    }
    context.fillStyle = LOOKS[look].colour;
    context.fillRect(x + 37, y + 12, 36, 36);
    art.badge(context, look, x + 41, y + 16, 4);
    context.font = '800 24px system-ui';
    context.fillStyle = PALETTE.linen;
    context.fillText(name, x + 37, y + 69, FIRST_X - 48);
  }
}

function runnerPosition(lane, distance, target) {
  return lane.x + FIRST_X + (FINISH_X - FIRST_X - RUNNER_SCALE * 12) * distance / target;
}

function interpolate(previous, current, amount, lerp) {
  return {
    ...current, runners: current.runners.map((runner, index) => ({
      ...runner, distance: lerp(previous.runners[index]?.distance ?? runner.distance, runner.distance, amount),
    })),
  };
}

export function mountTapRaceTv(canvas, { art, sound }) {
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  const track = createTrackCanvas(canvas.ownerDocument);
  const trackContext = track.getContext('2d');
  const playSound = createSoundHooks(sound, { checkpoint: 'collect', finish: 'win' });
  const timeline = createTimeline();
  const juice = createJuice();
  let byId;
  let previous;
  let painted;
  let lit = new Map();

  const loop = createArcadeLoop((at, reduced) => {
    if (!previous) return;
    context.clearRect(0, 0, WIDTH, HEIGHT);
    context.drawImage(track, 0, 0);
    const display = juice.frozen(at) && painted ? painted : timeline.sample(at, interpolate, reduced);
    const [dx, dy] = juice.offset(at);
    for (const runner of display.runners) {
      const lane = byId.get(runner.playerId);
      const x = runnerPosition(lane, runner.distance, display.target);
      const active = !reduced && lit.get(runner.playerId) > at;
      const pose = active ? Math.floor(at / 85) % 2 + 1 : 0;
      const squash = juice.squash(runner.playerId, at);
      const scaleY = RUNNER_SCALE - squash;
      context.fillStyle = PALETTE.ink;
      context.fillRect(Math.round(x + dx + 48), lane.y + dy + 63, 19, 4);
      art.runner(context, lane.look, pose, x + dx, lane.y + dy + 69 - 16 * scaleY, RUNNER_SCALE + squash, scaleY);
    }
    juice.draw(context, at);
    painted = display;
  }, reduced => juice.setReducedMotion(reduced));

  function push(view) {
    const time = performance.now();
    const scene = view.scene;
    if (!scene) return;
    if (!byId || view.round !== previous.round) {
      byId = lanes(view.roster);
      paintTrack(trackContext, byId, art);
      painted = null;
      lit = new Map();
      juice.clear();
    }
    const sameRound = previous?.round === view.round;
    const old = sameRound ? previous.scene.runners : [];
    let checkpoint = false;
    for (const [index, runner] of scene.runners.entries()) {
      if (!old[index] || runner.distance === old[index].distance) continue;
      lit.set(runner.playerId, time + 160);
      const strong = runner.distance === scene.target;
      if (strong || Math.floor(runner.distance / 10) > Math.floor(old[index].distance / 10)) {
        const lane = byId.get(runner.playerId);
        juice.impact({ x: runnerPosition(lane, runner.distance, scene.target) + 34, y: lane.y + 28,
          colour: LOOKS[lane.look].colour, label: strong ? 'FINISH!' : String(runner.distance),
          id: runner.playerId, time, strong });
        checkpoint = true;
      }
    }
    if (view.phase === 'results' && previous?.phase !== 'results') {
      const winner = view.results[0];
      if (winner) {
        if (winner.score < scene.target) {
          const lane = byId.get(winner.playerId);
          juice.impact({ x: runnerPosition(lane, winner.score, scene.target) + 34, y: lane.y + 28,
            colour: LOOKS[lane.look].colour, label: 'TIME!', id: winner.playerId, time, strong: true });
        }
        playSound('finish');
      }
    } else if (checkpoint) playSound('checkpoint');
    timeline.push(scene, view.round, time);
    previous = view;
  }

  return { push, setReducedMotion: loop.setReducedMotion, dispose: loop.dispose };
}
