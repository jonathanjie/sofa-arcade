import { createArcadeLoop, createJuice, createSoundHooks, createTimeline } from '../../kit/animation.mjs';
import { fitSpriteScale } from '../../kit/sprites.mjs';
import { LOOKS } from '../../looks.mjs';

const DEFAULT_AREA = { width: 1760, height: 816, safe: { x: 18, y: 0, width: 1724, height: 798 } };
const RUNNER = { width: 16, height: 16 };
const COLUMN_GAP = 16;
const TRACK_HEADER = 46;
const MAX_DUST = 128;
const DUST_MS = 360;
const PALETTE = { linen: '#fff2d7', ink: '#192b2b', dim: '#bcd6c7', gold: '#fbd280' };

function lanes(roster, safe) {
  const columns = roster.length > 8 ? 2 : 1;
  const rows = Math.ceil(roster.length / columns);
  const width = Math.floor((safe.width - COLUMN_GAP * (columns - 1)) / columns);
  const trackHeight = Math.max(1, safe.height - TRACK_HEADER);
  const height = Math.min(220, Math.floor(trackHeight / rows));
  const top = safe.y + TRACK_HEADER + Math.floor((trackHeight - height * rows) / 2);
  const labelWidth = Math.round(Math.min(columns === 2 ? 192 : 250, width * 0.32));
  const finishInset = Math.round(Math.min(38, width * 0.08));
  // Leave at least half the distance for movement and room above the floor for a running hop.
  const spriteArea = { width: Math.floor((width - labelWidth - finishInset) / 2) * columns, height: (height - 18) * rows };
  const scale = Math.min(10, fitSpriteScale(RUNNER, roster.length, spriteArea, { columns }));
  return new Map(roster.map((player, index) => {
    const x = safe.x + Math.floor(index / rows) * (width + COLUMN_GAP);
    const y = top + (index % rows) * height;
    return [player.id, {
      ...player, x, y, width, height,
      start: x + labelWidth, finish: x + width - finishInset,
      floor: y + height - 12, scale,
    }];
  }));
}

function paintTrack(context, laneMap, art, area) {
  context.fillStyle = '#274946';
  context.fillRect(0, 0, area.width, area.height);
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
    const tile = Math.min(8, Math.floor((x + width - finish) / 2));
    for (let stripe = 0; tile > 0 && stripe < height - 12; stripe += tile) {
      for (let col = 0; col < 2; col++) {
        context.fillStyle = (stripe / tile + col) % 2 === 0 ? PALETTE.gold : '#243f38';
        context.fillRect(finish + col * tile, y + 3 + stripe, tile, Math.min(tile, height - 9 - stripe));
      }
    }
    const colour = LOOKS[look].colour;
    const badgeScale = Math.min(4, Math.floor((height - 16) / 17), Math.floor((start - x - 20) / 10));
    const badgeSize = 10 * badgeScale;
    context.fillStyle = colour;
    if (badgeScale > 0) {
      context.fillRect(x + 10, y + 8, badgeSize, badgeSize);
      art.badge(context, look, x + 10 + badgeScale, y + 8 + badgeScale, badgeScale);
    }
    const nameSize = Math.min(28, Math.floor(height * 0.32));
    if (nameSize < 8) continue;
    context.font = `850 ${nameSize}px system-ui`;
    context.fillStyle = PALETTE.linen;
    context.fillText(name, x + 10, y + 13 + Math.max(0, badgeSize) + nameSize, start - x - 16);
  }
}

function runnerPosition(lane, distance, target) {
  const nose = lane.scale * 15;
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
  const context = canvas.getContext('2d');
  const track = canvas.ownerDocument.createElement('canvas');
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
  let area;

  function layout(roster) {
    byId = lanes(roster, area.safe);
    paintTrack(trackContext, byId, art, area);
  }

  function resize(next) {
    if (area && area.width === next.width && area.height === next.height && area.safe.height === next.safe.height) return;
    area = next;
    canvas.width = track.width = area.width;
    canvas.height = track.height = area.height;
    if (previous) layout(previous.roster);
    dust = [];
    juice.clear();
  }
  resize(DEFAULT_AREA);

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
    context.font = '850 22px system-ui';
    context.fillStyle = final ? PALETTE.gold : PALETTE.linen;
    if (final) context.fillText(previous.notice === 'time_limit' ? 'TIME!' : 'FINISH!', area.safe.x, 31);
    context.textAlign = 'right';
    context.fillStyle = PALETTE.gold;
    context.fillText(`FINISH LINE · ${display.target} TAPS`, area.safe.x + area.safe.width, 31, area.safe.width);
    context.textAlign = 'start';

    drawDust(at);
    for (const runner of display.runners) {
      const lane = byId.get(runner.playerId);
      if (!lane.scale) continue;
      const x = runnerPosition(lane, runner.distance, display.target);
      const stride = activity.get(runner.playerId);
      const running = !reduced && !final && stride && at - stride.at < 245;
      const swing = running ? Math.floor((at - stride.start) * stride.rate / 1000) % 2 : 0;
      const pose = running ? swing + 1 : 0;
      const hop = running && swing ? lane.scale : 0;
      context.fillStyle = PALETTE.ink;
      context.fillRect(Math.round(x + lane.scale * 3), lane.floor + 1, lane.scale * 9, 4);
      art.runner(context, lane.look, pose, x + dx, lane.floor - RUNNER.height * lane.scale - hop + dy, lane.scale);
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
      layout(view.roster);
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

  return { push, resize, setReducedMotion: loop.setReducedMotion, dispose: loop.dispose };
}
