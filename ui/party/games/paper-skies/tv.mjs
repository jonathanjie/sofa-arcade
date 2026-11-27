import { createArcadeLoop, createTimeline } from '../../kit/animation.mjs';
import { LOOKS } from '../../looks.mjs';
import { drawObject, drawShadow, pixelText, popup } from './art.mjs';
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

function hud(c, scene, ranked, focus, names) {
  c.font = 'bold 8px monospace'; c.textAlign = 'left';
  c.fillStyle = '#171b30';
  c.fillRect(3,3,scene.solo ? 103 : 93,scene.solo ? 24 : ranked.length * 10 + 4);
  if (scene.solo) {
    pixelText(c,`SCORE ${focus.score}  LV ${scene.lv}`,6,12);
    pixelText(c,`SUNS ${focus.suns}  x${focus.combo}`,6,23,'#ffe28a');
  } else ranked.forEach((p,i) => {
    const look = LOOKS[p.look] ?? LOOKS[0];
    pixelText(c,`${i+1} ${(names.get(p.id) ?? look.name).slice(0,8)} ${p.score}`,6,12+i*10,look.colour);
  });
  c.fillStyle = '#171b30'; c.fillRect(WIDTH-68,3,65,14); c.fillRect(WIDTH-22,19,19,40);
  pixelText(c,'FUEL',WIDTH-66,13); pixelText(c,'ALT',WIDTH-21,27);
  c.fillStyle = '#394259'; c.fillRect(WIDTH-41,7,35,6); c.fillRect(WIDTH-16,30,7,26);
  const fraction = v => Math.max(0,Math.min(1,v));
  c.fillStyle = focus.fuel < 25 ? '#ff8278' : '#80eaca'; c.fillRect(WIDTH-41,7,Math.round(35*fraction(focus.fuel/100)),6);
  const altitude = Math.round(26*fraction((focus.z-8)/60));
  c.fillStyle = '#bc9ced'; c.fillRect(WIDTH-16,56-altitude,7,altitude);
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
    renderTerrain(frame,terrain,camera);
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
    ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
    for (const e of s.events ?? []) popup(ctx,camera,e,elapsed-e.at,reduced);
    hud(ctx,s,ranked,focus,names);
    const scale = Math.min(bounds.width/WIDTH,bounds.height/HEIGHT);
    c.imageSmoothingEnabled = false; c.fillStyle = '#171b30'; c.fillRect(0,0,canvas.width,canvas.height);
    c.drawImage(buffer,bounds.x+(bounds.width-WIDTH*scale)/2,bounds.y+(bounds.height-HEIGHT*scale)/2,WIDTH*scale,HEIGHT*scale);
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
