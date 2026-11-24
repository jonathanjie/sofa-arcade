import { createArcadeLoop, createJuice, createSoundHooks, createTimeline } from '../../kit/animation.mjs';
import { LOOKS } from '../../looks.mjs';

const WIDTH = 1760;
const HEIGHT = 816;
const TRACK_TOP = 78;
const TRACK_HEIGHT = 724;
const MAX_DUST = 128;
const DUST_MS = 360;
const PALETTE = { linen: '#fff2d7', ink: '#192b2b', dim: '#bcd6c7', gold: '#fbd280' };

function lanes(roster) {
  const columns = roster.length > 8 ? 2 : 1;
  const rows = Math.ceil(roster.length / columns);
  const columnWidth = WIDTH / columns;
  const height = Math.min(180, Math.floor(TRACK_HEIGHT / rows));
  const top = TRACK_TOP + Math.floor((TRACK_HEIGHT - height * rows) / 2);
  return new Map(roster.map((player, index) => {
    const x = Math.floor(index / rows) * columnWidth + 18;
    const y = top + (index % rows) * height;
    const width = columnWidth - 36;
    return [player.id, {
      ...player, x, y, width, height,
      start: x + (columns === 2 ? 192 : 250), finish: x + width - 38,
      floor: y + height - 15, scale: Math.min(10, Math.floor(height / 15)),
    }];
  }));
}

function paintTrack(context, laneMap, art) {
  context.fillStyle = '#274946';
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = '#1e3835';
  context.fillRect(0, 0, WIDTH, 64);
  context.font = '800 24px system-ui';
  for (const { x, y, width, height, start, finish, floor, name, look } of laneMap.values()) {
    context.fillStyle = '#355a52';
    context.fillRect(x, y, width, height - 6);
    context.fillStyle = '#28443e';
    context.fillRect(x, y, start - x - 8, height - 6);
    context.fillStyle = '#517467';
    context.fillRect(start, floor, finish - start, 4);
    for (let marker = start; marker < finish - 38; marker += 64) {
      context.fillRect(marker, floor - 11, 21, 3);
    }
    for (let row = 0; row * 8 < height - 12; row++) {
      for (let col = 0; col < 2; col++) {
        context.fillStyle = (row + col) % 2 === 0 ? PALETTE.gold : '#243f38';
        context.fillRect(finish + col * 8, y + 3 + row * 8, 8, Math.min(8, height - 9 - row * 8));
      }
    }
    const colour = LOOKS[look].colour;
    context.fillStyle = colour;
    context.fillRect(x + 14, y + 9, 39, 39);
    art.badge(context, look, x + 19, y + 14, 4);
    context.font = '850 28px system-ui';
    context.fillStyle = PALETTE.linen;
    context.fillText(name, x + 14, y + 75, start - x - 23);
  }
}

function runnerPosition(lane, distance, target) {
  const nose = lane.scale * 12;
  return lane.start + (lane.finish - lane.start - nose) * distance / target;
}

function interpolate(previous, current, amount, lerp) {
  return {
    ...current, runners: current.runners.map((runner, index) => ({
      ...runner, distance: lerp(previous.runners[index].distance, runner.distance, amount),
    })),
  };
}

export function mountTapRaceTv(canvas, { art, sound }) {
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  const track = canvas.ownerDocument.createElement('canvas');
  track.width = WIDTH;
  track.height = HEIGHT;
  const trackContext = track.getContext('2d');
  const playSound = createSoundHooks(sound, { checkpoint: 'collect', finish: 'win' });
  const timeline = createTimeline();
  const juice = createJuice();
  const activity = new Map();
  let byId;
  let previous;
  let painted;
  let leaders = new Set();
  let dust = [];
  let reducedMotion = false;

  function addDust(lane, runner, time, target) {
    const x = runnerPosition(lane, runner.distance, target) + lane.scale * 4;
    for (let index = 0; index < 3; index++) {
      dust.push({ x, y: lane.floor - 3 - index * 3, at: time, size: 5 + index * 3, speed: 40 + index * 24 });
    }
    if (dust.length > MAX_DUST) dust.splice(0, dust.length - MAX_DUST);
  }

  function drawDust(at) {
    dust = dust.filter(puff => at - puff.at < DUST_MS);
    context.fillStyle = '#efd8a4';
    for (const puff of dust) {
      const age = Math.max(0, (at - puff.at) / DUST_MS);
      context.globalAlpha = (1 - age) * 0.65;
      const size = Math.round(puff.size + age * 5);
      context.fillRect(Math.round(puff.x - age * puff.speed), Math.round(puff.y - age * 18), size, size);
    }
    context.globalAlpha = 1;
  }

  const loop = createArcadeLoop((at, reduced) => {
    if (!previous) return;
    context.drawImage(track, 0, 0);
    const display = juice.frozen(at) && painted ? painted : timeline.sample(at, interpolate, reduced);
    const [dx, dy] = juice.offset(at);
    for (const id of leaders) {
      const lane = byId.get(id);
      context.strokeStyle = PALETTE.gold;
      context.lineWidth = 4;
      context.strokeRect(lane.x + 2, lane.y + 2, lane.width - 4, lane.height - 10);
    }
    const final = previous.phase === 'results';
    context.font = '850 29px system-ui';
    context.fillStyle = final ? PALETTE.gold : PALETTE.linen;
    context.fillText(final ? (previous.notice === 'time_limit' ? 'TIME!' : 'FINISH!') : 'START', 23, 42);
    context.textAlign = 'right';
    context.fillStyle = PALETTE.gold;
    context.fillText(`FINISH LINE · ${display.target} TAPS`, WIDTH - 25, 42);
    context.textAlign = 'start';

    drawDust(at);
    for (const runner of display.runners) {
      const lane = byId.get(runner.playerId);
      const x = runnerPosition(lane, runner.distance, display.target);
      const stride = activity.get(runner.playerId);
      const running = !reduced && !final && stride && at - stride.at < 245;
      const swing = running ? Math.floor((at - stride.start) * stride.rate / 1000) % 2 : 0;
      const pose = running ? swing + 1 : 0;
      const hop = running && swing ? lane.scale : 0;
      context.fillStyle = PALETTE.ink;
      context.fillRect(Math.round(x + lane.scale * 3), lane.floor + 1, lane.scale * 9, 4);
      art.runner(context, lane.look, pose, x + dx, lane.floor - 16 * lane.scale - hop + dy, lane.scale);
    }
    juice.draw(context, at);
    painted = display;
  }, reduced => {
    reducedMotion = reduced;
    if (reduced) dust = [];
    juice.setReducedMotion(reduced);
  });

  function push(view) {
    const time = performance.now();
    const scene = view.scene;
    if (!scene || (previous && view.round < previous.round)) return;
    const sameRound = previous?.round === view.round;
    if (!sameRound) {
      byId = lanes(view.roster);
      paintTrack(trackContext, byId, art);
      painted = null;
      activity.clear();
      dust = [];
      juice.clear();
    }
    const eligible = new Set(view.players.map(player => player.id));
    const scores = view.phase === 'results'
      ? view.results.filter(result => result.place === 1).map(result => result.playerId)
      : scene.runners.filter(runner => eligible.has(runner.playerId));
    if (view.phase === 'results') leaders = new Set(scores);
    else {
      const lead = Math.max(0, ...scores.map(runner => runner.distance));
      leaders = new Set(scores.filter(runner => lead > 0 && runner.distance === lead).map(runner => runner.playerId));
    }

    const old = sameRound ? previous.scene.runners : [];
    let checkpoint = false;
    for (const [index, runner] of scene.runners.entries()) {
      const prior = old[index];
      if (!prior || runner.distance <= prior.distance) continue;
      const lane = byId.get(runner.playerId);
      const previousStride = activity.get(runner.playerId);
      const gap = previousStride ? Math.max(50, time - previousStride.at) : 180;
      const tapsPerSecond = (runner.distance - prior.distance) * 1000 / gap;
      const rate = Math.min(20, 5 + tapsPerSecond);
      const running = previousStride && gap < 245;
      const lastDust = previousStride?.dustAt ?? -Infinity;
      const puff = !reducedMotion && time - lastDust >= 85;
      activity.set(runner.playerId, { at: time, start: running ? previousStride.start : time, rate, dustAt: puff ? time : lastDust });
      if (puff) addDust(lane, runner, time, scene.target);
      if (Math.floor(runner.distance / 10) > Math.floor(prior.distance / 10)) checkpoint = true;
    }
    if (view.phase === 'results' && previous?.phase !== 'results') {
      const winner = view.results[0];
      if (winner) {
        const lane = byId.get(winner.playerId);
        juice.impact({ x: runnerPosition(lane, winner.score, scene.target) + lane.scale * 8,
          y: lane.floor - lane.scale * 9, colour: LOOKS[lane.look].colour, id: winner.playerId, time, strong: true });
        playSound('finish');
      }
    } else if (checkpoint) playSound('checkpoint');
    timeline.push(scene, view.round, time);
    previous = view;
  }

  return { push, setReducedMotion: loop.setReducedMotion, dispose: loop.dispose };
}
