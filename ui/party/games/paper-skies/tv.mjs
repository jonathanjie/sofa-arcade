import { createArcadeLoop, createTimeline } from '../../kit/animation.mjs';
import { LOOKS } from '../../looks.mjs';
import { drawObject, drawShadow } from './art.mjs';
import { WIDTH, HEIGHT, buildTerrain, colourTerrain, createCamera, createFrame, renderTerrain, wrapped } from './voxel.mjs';

const modes = {
  'ring-rally': ['Climb, dive, roll and loop through glowing Sun chains—dodge spiky storms!', 'Ring Rally'],
  'balloon-pop': ['Swoop through 3D sky balloons at matching altitude and barrel-roll past storms!', 'Balloon Pop'],
  'sky-tag': ['Snatch the 3D Sun Crown and out-maneuver rivals with rolls and loops!', 'Sky Tag'],
};
export const paperSkiesPlayHintForMode = mode => (modes[mode] ?? modes['ring-rally'])[0];
export function paperSkiesResultSummary(view) {
  const scene = view.state ?? view.scene;
  const mode = (modes[scene?.mode ?? view.mode] ?? modes['ring-rally'])[1];
  const standings = view.results?.length ? view.results : (view.standings ?? scene?.planes ?? []);
  if (!standings.length) return `A soft landing after ${mode}.`;
  const best = Math.max(...standings.map(p => p.score));
  const leaders = standings.filter(p => p.score === best);
  if (leaders.length > 1) return `${leaders.length} pilots share the ${mode} lead with ${best}!`;
  const pilot = leaders[0];
  const member = view.roster?.find(p => p.id === (pilot.playerId ?? pilot.id));
  return `${member?.name ?? pilot.name ?? LOOKS[pilot.look]?.name ?? 'Our pilot'} wins ${mode} with ${best}. Nice flying!`;
}

function glide(previous, scene, t, lerp) {
  if (previous.mode !== scene.mode) return scene;
  const planes = scene.planes.map((p, i) => {
    const old = previous.planes[i]?.id === p.id ? previous.planes[i] : previous.planes.find(other => other.id === p.id);
    if (!old || previous.seed !== scene.seed) return p;
    const next = { ...p, x: (old.x + wrapped(p.x-old.x)*t + 512)%512, y: (old.y + wrapped(p.y-old.y)*t + 512)%512 };
    const turn = p.a - old.a;
    next.a = old.a + t*Math.atan2(Math.sin(turn),Math.cos(turn));
    for (const key of ['z','bank','pitch','roll','loop']) {
      // A completed trick returns to zero; never rewind it through a full turn.
      if ((key === 'roll' || key === 'loop') && old[key] > .5 && !p[key]) continue;
      next[key] = lerp(old[key] || 0,p[key] || 0,t);
    }
    return next;
  });
  return { ...scene, planes };
}

// The world is deliberately pixelated; all overlay coordinates are 1080p artwork.
const HUD_W = 1920, HUD_H = 1080;
const panel = '#161c30', paper = '#fff8db', mint = '#7ef0c4', coral = '#ff6b6b';
const tricks = { dodge:'DODGE!', close:'CLOSE CALL!', loop:'LOOP!', skim:'SKIM!', crash:'CRASH!' };
const fraction = value => Math.max(0,Math.min(1,value));
function rect(c,x,y,w,h,colour) {
  c.fillStyle = colour; c.fillRect(x,y,w,h);
}
function label(c,text,x,y,size,colour = paper) {
  c.font = `bold ${size}px monospace`;
  x = Math.round(x); y = Math.round(y);
  c.fillStyle = '#101321'; c.fillText(text,x+2,y+3);
  c.fillStyle = colour; c.fillText(text,x,y);
}
function hud(c, scene, ranked, focus, names) {
  c.textAlign = 'left';
  rect(c,24,24,340,scene.solo ? 100 : 28+ranked.length*32,panel);
  if (scene.solo) {
    rect(c,24,24,5,100,'#ffe28a');
    label(c,`SCORE ${focus.score}`,42,68,40);
    label(c,`SUNS ${focus.suns}  LV ${scene.lv}  ×${focus.combo}`,42,105,25,'#ffe28a');
  } else ranked.forEach((p,i) => {
    const look = LOOKS[p.look] ?? LOOKS[0];
    rect(c,36,41+i*32,6,21,look.colour);
    label(c,`${i+1} ${(names.get(p.id) ?? look.name).slice(0,9)}`,55,60+i*32,25);
    c.textAlign = 'right'; label(c,String(p.score),350,60+i*32,25); c.textAlign = 'left';
  });
  rect(c,1616,24,280,58,panel);
  label(c,'FUEL',1630,63,28);
  rect(c,1710,39,170,29,'#090c15'); rect(c,1714,43,162,21,'#384056');
  rect(c,1714,43,Math.round(162*fraction(focus.fuel/100)),21,focus.fuel < 25 ? coral : mint);
  rect(c,1824,92,72,168,panel); label(c,'ALT',1835,123,25);
  rect(c,1846,135,27,110,'#090c15'); rect(c,1850,139,19,102,'#384056');
  const altitude = Math.round(102*fraction((focus.z-8)/60));
  rect(c,1850,241-altitude,19,altitude,'#c29eff');
  rect(c,1760,1012,136,44,panel); label(c,'V · CAM',1773,1042,25,'#c6cede');
}
function markers(c,camera,scene,names,elapsed,reduced) {
  c.textAlign = 'center';
  for (const plane of scene.planes) {
    const p = camera.project(plane.x,plane.y,plane.z);
    if (camera.chase && p.q < 5) continue;
    const look = LOOKS[plane.look] ?? LOOKS[0];
    const name = (names.get(plane.id) ?? look.name).slice(0,10);
    const x = Math.round(p.x*HUD_W/WIDTH), y = Math.round(p.y*HUD_H/HEIGHT - 12*p.scale*HUD_W/WIDTH);
    c.font = 'bold 21px monospace';
    const width = Math.ceil(c.measureText(name).width)+18;
    rect(c,x-width/2,y-26,width,29,panel); rect(c,x-4,y+3,8,5,look.colour);
    label(c,name,x,y-4,21,look.colour);
  }
  for (const e of scene.events ?? []) {
    const age = elapsed-e.at, title = tricks[e.kind];
    if (age < 0 || age > 800 || (!title && !e.text)) continue;
    const p = camera.project(e.x,e.y,e.z ?? 32);
    if (camera.chase && p.q < 5) continue;
    const x = p.x*HUD_W/WIDTH, y = p.y*HUD_H/HEIGHT-50-(reduced ? 0 : age*.075);
    label(c,title ?? e.text,x,y,36,e.kind === 'crash' ? coral : '#fff299');
    if (title && e.text && title !== e.text) label(c,e.text,x,y+27,24);
  }
}

export function mountPaperSkiesTv(canvas, { reducedMotion = false } = {}) {
  const doc = canvas.ownerDocument, c = canvas.getContext('2d', { alpha: false });
  const buffer = doc.createElement('canvas'); buffer.width = WIDTH; buffer.height = HEIGHT;
  const ctx = buffer.getContext('2d', { alpha: false }); ctx.imageSmoothingEnabled = false;
  const image = ctx.createImageData?.(WIDTH,HEIGHT) ?? { data: new Uint8ClampedArray(WIDTH*HEIGHT*4), width: WIDTH, height: HEIGHT };
  const frame = createFrame(image.data), timeline = createTimeline();
  let bounds = { x: 0, y: 0, width: canvas.width, height: canvas.height };
  let terrain, seed, lastRound, receivedAt, chaseOverride, solo, disposed = false, still = false;
  let names = new Map();
  canvas.setAttribute('aria-label','Paper Skies flight board');
  const toggle = event => {
    if (event.key?.toLowerCase() === 'v' && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey) chaseOverride = !(chaseOverride ?? solo);
  };
  doc.addEventListener('keydown',toggle);
  function update(view) {
    const scene = view.scene ?? view.state;
    if (disposed || !scene?.planes || view.round < lastRound) return;
    if (!terrain || seed !== scene.seed) {
      seed = scene.seed; terrain = colourTerrain(buildTerrain(seed).heights);
    }
    if (view.round !== lastRound || solo !== Boolean(scene.solo)) chaseOverride = undefined;
    solo = Boolean(scene.solo); lastRound = view.round; receivedAt = performance.now();
    names = new Map((view.roster ?? []).map(p => [p.id,p.name]));
    timeline.push(scene,lastRound,receivedAt);
  }
  function draw(at = performance.now(), reduced = still) {
    if (disposed || !(bounds.width > 0 && bounds.height > 0)) return;
    const s = timeline.sample(at,glide,reduced);
    if (!s?.planes.length) return;
    const ranked = [...s.planes].sort((a,b) => b.score-a.score).slice(0,4);
    const focus = solo ? s.planes[0] : ranked[0], camera = createCamera(focus,chaseOverride ?? solo,reduced);
    const elapsed = s.elapsedMs + (reduced ? 0 : Math.max(0,at-receivedAt));
    const time = reduced ? 0 : elapsed;
    renderTerrain(frame,terrain,camera,time);
    const objects = [];
    for (let i = 0; i < 6; i++) objects.push(['cloud',{ x: (43+i*83+time*.002)%512, y: (38+i*137)%512, z: 69+i%3*4 }]);
    for (const [kind,items] of [['sun',s.suns],['storm',s.storms],['balloon',s.balloons],['plane',s.planes]]) {
      for (const item of items ?? []) objects.push([kind,item]);
    }
    for (const crown of s.crowns ?? []) {
      const holder = s.planes.find(p => p.id === crown.holder);
      objects.push(['crown',holder ? { ...crown,x:holder.x,y:holder.y,z:holder.z+11 } : crown]);
    }
    for (const [kind,item] of objects) drawShadow(frame,camera,terrain,item,kind);
    for (const [kind,item] of objects) drawObject(frame,camera,kind,item,time);
    ctx.putImageData?.(image,0,0);
    const scale = Math.min(bounds.width/HUD_W,bounds.height/HUD_H);
    const x = bounds.x+(bounds.width-HUD_W*scale)/2, y = bounds.y+(bounds.height-HUD_H*scale)/2;
    c.imageSmoothingEnabled = false; rect(c,0,0,canvas.width,canvas.height,panel);
    c.drawImage(buffer,x,y,HUD_W*scale,HUD_H*scale);
    c.save(); c.translate(x,y); c.scale(scale,scale);
    c.beginPath(); c.rect(0,0,HUD_W,HUD_H); c.clip();
    markers(c,camera,s,names,elapsed,reduced);
    hud(c,s,ranked,focus,names);
    c.restore();
  }
  const loop = createArcadeLoop(draw,value => { still = value; }); loop.setReducedMotion(reducedMotion);
  return { update, push: update, draw, setReducedMotion: loop.setReducedMotion,
    resize({ width,height,safe }) {
      if (disposed) return;
      canvas.width = width; canvas.height = height; bounds = safe ?? { x:0,y:0,width,height };
    },
    dispose() { disposed = true; loop.dispose(); doc.removeEventListener('keydown',toggle); buffer.width = buffer.height = 0; terrain = null; },
  };
}
