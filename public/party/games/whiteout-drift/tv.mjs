import { createTimeline, createArcadeLoop, createJuice, createSoundHooks } from '../../kit/animation.mjs';
import { LOOKS } from '../../looks.mjs';
import {
  drawBuildingBlock,
  drawCarSprite,
  drawCone,
  drawHydrant,
  drawIcePatch,
  headlights,
  rect,
  polygon,
  glow,
  noise,
} from './art.mjs';

const TAU = Math.PI * 2;
const modes = {
  getaway: ['Getaway', 'Dodge patrols. Smash hydrants to ice the pursuit.'],
  'cops-and-robbers': ['Cops & Robbers', 'Patrol pins the crew. The crew drives for checkpoints.'],
  'freeze-tag': ['Freeze Tag', 'Tagged drivers join the patrol. Be the last driver.'],
  'drift-king': ['Drift King', 'Grab the crown and keep it moving.'],
};
const cues = {
  hydrant: 'swipe',
  'ice-spin': 'move',
  bust: 'error',
  ram: 'pounce',
  boost: 'lure',
  checkpoint: 'bank',
  crown: 'collect',
  dispatch: 'join',
  cone: 'move',
};
const calls = { hydrant: 'ICE ON THE ROAD', 'ice-spin': 'SPINOUT', bust: 'BUSTED!', crown: 'CROWN SNATCHED' };
const gold = '#ffd477';
const patrol = (car) => car.ai === 1 || car.role === 1;
const tint = (car) => LOOKS[car.look]?.colour ?? gold;
export const whiteoutPlayHintForMode = (mode) => (modes[mode] ?? modes.getaway)[1];
export function whiteoutResultSummary(view) {
  const winner = view.scene?.team?.winner;
  if ((view.scene?.mode ?? view.mode) !== 'cops-and-robbers' || !winner) return null;
  return winner === 'cops'
    ? { label: 'Police Patrol Wins!', colour: '#9ccfff' }
    : { label: 'Getaway Crew Wins!', colour: gold };
}
function interpolate(prev, scene, t, lerp) {
  const last = new Map(prev.cars.map((car) => [car.id, car]));
  return {
    ...scene,
    cars: scene.cars.map((car) => {
      const old = last.get(car.id);
      if (!old || old.role === 2) return car;
      const delta = car.a - old.a;
      return {
        ...car,
        x: lerp(old.x, car.x, t),
        y: lerp(old.y, car.y, t),
        a: old.a + t * Math.atan2(Math.sin(delta), Math.cos(delta)),
      };
    }),
  };
}
function city(c, s) {
  rect(c, '#354558', 0, 0, s.w, s.h);
  for (let i = 0; i < (s.w * s.h) / 170; i++) {
    rect(c, i % 3 ? '#869eb036' : '#17283a48', noise(i) * s.w, noise(i + 8103) * s.h, 2 + (i % 4), 1);
  }
  for (const block of s.blocks) drawBuildingBlock(c, ...block);
  for (const [x, y] of s.lamps) {
    glow(c, x, y, 44, '#ffc26775');
    glow(c, x, y, 16, '#ffbd5d92');
    rect(c, '#344151', x - 1, y - 1, 2, 6);
    rect(c, '#fff1b9', x - 2, y - 3, 4, 3);
  }
}
function ring(c, x, y, r, colour, width = 2) {
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.strokeStyle = colour;
  c.lineWidth = width;
  c.stroke();
}
function crown(c, x, y) {
  polygon(c, gold, [
    [x - 7, y - 5],
    [x - 3, y - 2],
    [x, y - 7],
    [x + 3, y - 2],
    [x + 7, y - 5],
    [x + 5, y + 3],
    [x - 5, y + 3],
  ]);
  rect(c, '#fff3b0', x - 5, y + 4, 10, 1);
}
function stampTracks(c, prev, scene) {
  c.save();
  c.globalCompositeOperation = 'destination-out';
  rect(c, 'rgba(0,0,0,.008)', 0, 0, scene.w, scene.h);
  c.restore();
  const last = new Map(prev.cars.map((car) => [car.id, car]));
  for (const car of scene.cars) {
    const old = last.get(car.id);
    if (!old || car.role === 2 || (!car.drift && !car.spin) || Math.hypot(old.x - car.x, old.y - car.y) > 60)
      continue;
    for (const side of [-5, 5]) {
      c.beginPath();
      for (const [i, p] of [old, car].entries()) {
        const x = p.x - 7 * Math.cos(p.a) - side * Math.sin(p.a),
          y = p.y - 7 * Math.sin(p.a) + side * Math.cos(p.a);
        if (i) c.lineTo(x, y);
        else c.moveTo(x, y);
      }
      c.strokeStyle = '#152335aa';
      c.lineWidth = 2;
      c.stroke();
    }
  }
}
function indicator(c, target, s, colour) {
  const x = Math.max(8, Math.min(s.w - 8, target.x)),
    y = Math.max(8, Math.min(s.h - 8, target.y));
  if (x === target.x && y === target.y) return;
  c.save();
  c.translate(x, y);
  c.rotate(Math.atan2(target.y - y, target.x - x));
  polygon(c, colour, [
    [6, 0],
    [-5, 4],
    [-5, -4],
  ]);
  c.restore();
}
function drawWorld(c, s, roster, time, reduced) {
  const phase = !reduced && Math.floor(time / 350) % 2 === 1;
  for (const p of s.ice) drawIcePatch(c, p.x, p.y, p.r, p.seed, reduced ? 0 : p.ms);
  if (s.checkpoint) {
    const { x, y, r } = s.checkpoint;
    glow(c, x, y, r * 1.5, '#49ffd34a');
    ring(c, x, y, r, '#7ff7c9');
    ring(c, x, y, r * (0.8 + 0.05 * Math.sin(time / 300)), gold, 1);
  }
  for (const p of s.pings) ring(c, p.x, p.y, 15 + (reduced ? 0 : (p.ms / 30) % 24), '#c0deff');
  for (const [, x, y, hit] of s.cones) drawCone(c, x, y, hit);
  for (const p of s.hydrants) drawHydrant(c, p.x, p.y, p.cd);
  const cars = s.cars.filter((car) => car.role !== 2);
  for (const car of cars) {
    c.save();
    c.translate(car.x, car.y);
    c.rotate(car.a);
    headlights(c, patrol(car), phase);
    c.restore();
  }
  for (const car of cars) {
    c.save();
    c.translate(car.x, car.y);
    c.rotate(car.a);
    drawCarSprite(c, { ...car, colour: tint(car), sirenPhase: phase });
    c.restore();
    if (car.pin > 0) {
      c.beginPath();
      c.arc(car.x, car.y, 16, -TAU / 4, -TAU / 4 + TAU * Math.min(1, car.pin / 10));
      c.strokeStyle = '#ff9f62';
      c.lineWidth = 3;
      c.stroke();
    }
    const name = roster.get(car.id);
    if (name && !car.ai) {
      c.font = 'bold 11px system-ui';
      c.textAlign = 'center';
      const w = Math.min(76, c.measureText(name).width + 8),
        x = Math.max(w / 2, Math.min(s.w - w / 2, car.x)),
        y = car.y < 27 ? car.y + 23 : car.y - 12;
      rect(c, '#122030db', x - w / 2, y - 10, w, 13);
      c.fillStyle = '#f2f5ef';
      c.fillText(name, x, y, w - 5);
    }
    if (!reduced && (car.drift || car.spin || car.pin)) {
      for (let i = 0; i < 5; i++) {
        const age = (time / 320 + i / 5) % 1;
        rect(
          c,
          car.pin ? gold : '#ccdfef',
          car.x - Math.cos(car.a) * (10 + age * 14),
          car.y - Math.sin(car.a) * (10 + age * 14) + Math.sin(i * 4) * age * 10,
          2,
          2,
        );
      }
    }
    if (patrol(car)) indicator(c, car, s, '#8ac4ff');
  }
  if (s.checkpoint) indicator(c, s.checkpoint, s, '#7ff7c9');
  if (s.crown) {
    const holder = cars.find((car) => car.id === s.crown.holder),
      p = holder ?? s.crown;
    crown(c, p.x, holder ? (p.y < 32 ? p.y + 32 : p.y - 29) : p.y);
    indicator(c, p, s, gold);
  }
}
const HUD_HEIGHT = 38;
function hud(c, s, roster, callout) {
  rect(c, '#172437', 0, -HUD_HEIGHT, s.w, HUD_HEIGHT - 2);
  rect(c, gold, 0, -HUD_HEIGHT, 4, HUD_HEIGHT - 2);
  c.font = 'bold 17px system-ui';
  c.textAlign = 'left';
  c.fillStyle = '#fff2cd';
  c.fillText(modes[s.mode][0], 12, -14);
  const players = s.cars.filter((car) => !car.ai);
  const holder = roster.get(s.crown?.holder);
  const status = s.team
    ? `Crew ${s.team.robbers}   /   Patrol ${s.team.cops}`
    : s.crown
      ? holder
        ? `Crown: ${holder}`
        : 'Crown loose'
      : s.checkpoint
        ? 'Checkpoint open'
        : `${players.filter((p) => p.role === 0 || p.role === 3).length} still driving`;
  c.fillStyle = '#aad5e8';
  c.fillText(status, s.w * 0.2, -14, s.w * 0.24);
  c.textAlign = 'right';
  c.fillStyle = '#f5f0df';
  const leaders = players.sort((a, b) => b.score - a.score).slice(0, 4);
  leaders.forEach((car, i) => {
    c.fillStyle = tint(car);
    c.fillText(`${roster.get(car.id) ?? 'Driver'} ${car.score}`, s.w * (0.58 + 0.135 * i), -14, s.w * 0.12);
  });
  if (callout) {
    c.font = '900 21px system-ui';
    c.textAlign = 'center';
    const w = c.measureText(callout).width + 28;
    rect(c, '#142135e8', (s.w - w) / 2, 8, w, 33);
    c.fillStyle = gold;
    c.fillText(callout, s.w / 2, 31);
  }
}
export function mountWhiteoutTv(canvas, { sound }) {
  const c = canvas.getContext('2d', { alpha: false });
  const cityCanvas = canvas.ownerDocument.createElement('canvas'),
    trackCanvas = canvas.ownerDocument.createElement('canvas');
  const timeline = createTimeline(),
    juice = createJuice(),
    play = createSoundHooks(sound, cues);
  let view,
    area,
    layout,
    callout,
    seen = new Set(),
    roster = new Map();
  canvas.setAttribute('aria-label', 'Whiteout Drift midnight chase board');
  function rebuild(s) {
    if (!area) return;
    const safe = area.safe,
      scale = Math.min(safe.width / s.w, safe.height / (s.h + HUD_HEIGHT));
    layout = {
      scale,
      x: safe.x + (safe.width - s.w * scale) / 2,
      y: safe.y + (safe.height - (s.h + HUD_HEIGHT) * scale) / 2 + HUD_HEIGHT * scale,
    };
    cityCanvas.width = s.w;
    cityCanvas.height = s.h;
    if (trackCanvas.width !== s.w || trackCanvas.height !== s.h) {
      trackCanvas.width = s.w;
      trackCanvas.height = s.h;
    }
    city(cityCanvas.getContext('2d'), s);
  }
  const loop = createArcadeLoop(
    (now, reduced) => {
      const s = timeline.sample(now, interpolate, reduced);
      if (!s || !layout?.scale) return;
      const time = reduced ? 0 : now;
      rect(c, '#101b2a', 0, 0, canvas.width, canvas.height);
      c.save();
      c.translate(layout.x, layout.y);
      c.scale(layout.scale, layout.scale);
      c.imageSmoothingEnabled = false;
      c.save();
      c.beginPath();
      c.rect(0, 0, s.w, s.h);
      c.clip();
      c.drawImage(cityCanvas, 0, 0);
      c.drawImage(trackCanvas, 0, 0);
      drawWorld(c, s, roster, time, reduced);
      if (!reduced) {
        juice.draw(c, now);
        for (let i = 0; i < 72; i++)
          rect(
            c,
            i % 3 ? '#dbeaf480' : '#edfbffc0',
            (noise(i) * s.w + time * 0.012) % s.w,
            (noise(i + 121) * s.h + time * (0.022 + (i % 3) * 0.012)) % s.h,
            1 + (i % 2),
            2,
          );
      }
      c.restore();
      hud(c, s, roster, callout && now < callout.until ? callout.text : null);
      c.restore();
    },
    (value) => juice.setReducedMotion(value),
  );
  return {
    resize(next) {
      area = next;
      canvas.width = next.width;
      canvas.height = next.height;
      if (view) rebuild(view.scene);
    },
    push(next) {
      const s = next.scene;
      if (!s || next.round < view?.round) return;
      const now = performance.now(),
        fresh = next.round !== view?.round;
      if (fresh) {
        seen.clear();
        juice.clear();
        callout = null;
        rebuild(s);
        trackCanvas.getContext('2d').clearRect(0, 0, trackCanvas.width, trackCanvas.height);
      } else if (area && s.elapsedMs > view.scene.elapsedMs)
        stampTracks(trackCanvas.getContext('2d'), view.scene, s);
      roster = new Map(next.roster.map((p) => [p.id, p.name]));
      for (const e of s.events) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        play(e.kind);
        if (calls[e.kind]) callout = { text: calls[e.kind], until: now + 1250 };
        juice.impact({
          x: e.x,
          y: e.y,
          time: now,
          colour: e.kind === 'ram' ? gold : '#c4eaff',
          strong: e.kind === 'bust' || e.kind === 'hydrant',
        });
      }
      timeline.push(s, next.round, now);
      view = next;
    },
    setReducedMotion: loop.setReducedMotion,
    dispose() {
      loop.dispose();
      juice.clear();
      cityCanvas.width = trackCanvas.width = 0;
    },
  };
}
