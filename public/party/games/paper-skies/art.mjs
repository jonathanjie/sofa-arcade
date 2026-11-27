import { LOOKS } from '../../looks.mjs';
import { WIDTH, HEIGHT, cell, hex } from './voxel.mjs';

const TAU = 2 * Math.PI;
const ink = hex('#171b30');
// Each occupied texel of a horizontal slice is a coloured voxel. Strip enclosed
// texels once; the same surface model works viewed from above, behind or below.
function stack(width, layers, material) {
  const volume = new Uint32Array(width * width * layers);
  const points = [];
  for (let z = 0; z < layers; z++) for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) {
    volume[(z * width + y) * width + x] = material(x - width / 2, y - width / 2, z) || 0;
  }
  for (let z = 0; z < layers; z++) for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) {
    const i = (z * width + y) * width + x, c = volume[i];
    if (!c || (x && y && z && x < width - 1 && y < width - 1 && z < layers - 1 && volume[i-1] && volume[i+1] && volume[i-width] && volume[i+width] && volume[i-width*width] && volume[i+width*width])) continue;
    points.push([x - width / 2, y - width / 2, z - layers / 2, c]);
  }
  return points;
}
const gold = hex('#ffaf32'), honey = hex('#ffd948'), ivory = hex('#fff8d3');
const red = hex('#ff485d'), mint = hex('#bff9e9'), shaded = hex('#424969');
const glass = hex('#58c2bb'), flare = hex('#ffeaaa'), vapour = hex('#b8e1ef');
const cloudBase = hex('#93b8ce'), cloudSide = hex('#cee5ed'), cloudTop = hex('#fffdf4');
const violet = hex('#694778'), amethyst = hex('#9f71ad'), crimson = hex('#ae284e');
const screenUnit = WIDTH / 384;

export function aircraftSurface(look) {
  const body = hex((LOOKS[look] ?? LOOKS[0]).colour);
  return stack(32, 24, (x, y, z) => {
    const side = Math.abs(y);
    const canopy = ((x-3)/7)**2 + (y/3.8)**2 + ((z-12)/7)**2;
    if (z >= 12 && canopy < 1) {
      if (z < 14) return ink;
      if (z >= 17 && y <= 0 && x > 1) return ivory;
      return y < 0 || z > 16 ? mint : glass;
    }
    // Canted fins over two separate engine pods, with painted tips.
    if (z >= 9 && side === 4 + Math.floor((z-9)/6) && x >= -14 && x <= -6-(z-9)*.42)
      return z >= 21 ? gold : x === -14 ? ink : body;
    if (x <= -7 && (side-3)**2 + ((z-7)*.8)**2 < 7)
      return x === -16 ? (side === 3 && Math.abs(z-7) <= 1 ? ivory : red) : shaded;
    if ((x/16)**2 + (y/4.8)**2 + ((z-7)/7.3)**2 < 1)
      return z < 3 ? ink : x > 12 ? ivory : z < 7 ? shaded : body;
    const chord = 10 - side*.37, edge = 9-side*.72-x;
    const wing = edge >= 0 && edge < chord;
    const tail = x >= -15 && x < -8-side*.3 && side <= 9;
    if ((wing || tail) && z >= 7 && z <= (edge > 2 && side < 11 ? 10 : 9))
      return z === 7 || edge < 1 ? ink : side === 13 ? ivory : side >= 12 ? gold : body;
  });
}

const models = new Map();
function model(kind, item) {
  const variant = kind === 'plane' ? item.look : kind === 'balloon' ? item.col : 0;
  const key = `${kind}:${variant}`;
  if (models.has(key)) return models.get(key);
  let points;
  if (kind === 'plane') points = aircraftSurface(variant);
  else if (kind === 'cloud') {
    points = stack(32, 10, (x,y,z) => {
      const deck = (cx,cy,rx,ry,top) => ((x-cx)/rx)**2 + ((y-cy)/ry)**2 < 1 && z <= top;
      if (deck(-1,0,15,7,3) || deck(-7,1,8,6,6) || deck(4,-1,8,7,8) || deck(10,2,5,4,5))
        return z < 2 ? cloudBase : z < 4 || y > 4 ? cloudSide : cloudTop;
    });
  } else if (kind === 'crown') {
    points = stack(18, 14, (x,y,z) => {
      const rim = Math.max(Math.abs(x),Math.abs(y));
      if (rim <= 7 && rim >= 5 && (z < 7 || Math.min(Math.abs(x),Math.abs(y)) >= z-6))
        return z < 2 || rim === 5 ? ink : z === 5 && !(x%4) ? red : z > 10 || z === 3 ? ivory : y > 1 ? gold : honey;
    });
  } else {
    const balloon = kind === 'balloon';
    const silk = hex(['#ff677d','#54bfff','#b788ff','#ffc44b'][variant] ?? '#ff677d');
    points = stack(22, 22, (x,y,z) => {
      const dz = z-11, r = Math.hypot(x,y,dz*(balloon ? .85 : 1));
      if (!balloon && r < 11 && Math.abs(x)+Math.abs(y)+Math.abs(dz) < 12) return r > 6 ? ink : violet;
      if (balloon && z < 4 && Math.abs(x)+Math.abs(y) <= 2) return ink;
      if (r > 7.6) return 0;
      if (!balloon && Math.abs(dz) <= 2 && Math.min(Math.abs(x),Math.abs(y)) < 4) return red;
      if (dz < -3 || y > 5) return ink;
      if (dz > 3 && x < 0 && y < 1) return balloon ? ivory : amethyst;
      return balloon ? silk : violet;
    });
  }
  models.set(key, points); return points;
}

// Rasterize the capped sphere itself, not just its rays, at the camera depth.
function sun(frame, p, unit, time) {
  const radius = Math.max(2*screenUnit, Math.min(HEIGHT*.057, 6*p.scale*unit));
  const reach = radius*(1.35+.12*Math.sin(time/260));
  for (let y=Math.max(0,Math.floor(p.y-reach)); y<=Math.min(HEIGHT-1,p.y+reach); y++) {
    for (let x=Math.max(0,Math.floor(p.x-reach)); x<=Math.min(WIDTH-1,p.x+reach); x++) {
      const dx=(x-p.x)/radius, dy=(y-p.y)/radius, d=dx*dx+dy*dy;
      const ray = Math.min(Math.abs(dx),Math.abs(dy)) < .11 && d > 1.16;
      if (d > 1 && !ray) continue;
      const depth = p.q - Math.sqrt(Math.max(0,1-d))*radius/p.scale, n=y*WIDTH+x;
      if (depth >= frame.depth[n]) continue;
      frame.depth[n]=depth;
      frame.pixels[n]=ray ? honey : d > .78 ? ink : d > .52 || dy > .38 ? gold : (dx+.18)**2+(dy+.22)**2 < .27 ? ivory : honey;
    }
  }
}

// Build the aircraft's three rotated basis vectors once, not once per voxel.
function axes(a, pitch, roll) {
  const c = Math.cos(a), s = Math.sin(a), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  return [[c*cp,s*cp,sp],[-s*cr-c*sp*sr,c*cr-s*sp*sr,cp*sr],[s*sr-c*sp*cr,-c*sr-s*sp*cr,cp*cr]];
}
export function drawObject(frame, camera, kind, item, time) {
  const { x, y, z = 32 } = item, p = camera.project(x,y,z);
  if (camera.chase && p.q < 5) return;
  const unit = kind === 'plane' ? .83 : kind === 'balloon' ? Math.max(.65, (item.r || 9)/9) : kind === 'sun' && item.gold ? 1.2 : 1;
  // Leave room for long wingtip trails at the edge of the viewport.
  const radius = (kind === 'plane' ? 38 : 18) * p.scale * unit;
  if (p.x < -radius || p.x > WIDTH + radius || p.y < -radius || p.y > HEIGHT + radius) return;
  if (kind === 'sun') return sun(frame,p,unit,time);
  const basis = axes(item.a || (kind === 'crown' ? time / 1400 : 0), (item.pitch || 0)*.48 + (item.loop || 0)*TAU, (item.bank || 0)*.7 + (item.roll || 0)*TAU);
  // Transform local offsets to camera space, without wrapping each individual texel.
  const [f,r,u] = basis.map(([vx,vy,vz]) => [(-vx*camera.dy+vy*camera.dx)*unit,(vx*camera.dx+vy*camera.dy)*unit,vz*unit]);
  const size = Math.min(Math.ceil(7*screenUnit), Math.max(1, Math.ceil(p.scale * unit * 1.25)));
  function stamp(i,j,k,colour,diameter = size) {
    const side = i*f[0]+j*r[0]+k*u[0], forward = i*f[1]+j*r[1]+k*u[1], up = i*f[2]+j*r[2]+k*u[2];
    const q = p.q + forward;
    if (camera.chase && q < 4) return;
    const ratio = camera.chase ? p.q/q : 1;
    const sx = Math.floor(WIDTH/2 + (p.x-WIDTH/2 + side*p.scale)*ratio);
    const sy = Math.floor(camera.chase ? camera.horizon + (p.y-camera.horizon + (side*camera.tilt-up)*p.scale)*ratio : p.y - forward*camera.scaleY - up*camera.scaleZ);
    // Orthographic rays descend as they go forward; height breaks depth ties.
    const depth = q - (camera.chase ? 0 : up*.001);
    for (let yy = Math.max(0,sy); yy < Math.min(HEIGHT,sy+diameter); yy++) for (let xx = Math.max(0,sx); xx < Math.min(WIDTH,sx+diameter); xx++) {
      const n = yy*WIDTH+xx;
      if (depth <= frame.depth[n]) { frame.depth[n] = depth; frame.pixels[n] = colour; }
    }
  }
  if (kind === 'plane') {
    const active = item.boost || item.roll || item.loop;
    const length = active ? 24 : 11;
    for (const sign of [-1,1]) {
      for (let t=1; t<=length; t++) {
        const wave = Math.sin(time/220-t/6)*t/length;
        stamp(-5-t,sign*(15+t*.08),-4+wave*(active ? 3 : 1),t < length/2 ? mint : vapour,Math.max(1,Math.ceil(size*.5)));
      }
      for (let t=0; t<(active ? 12 : 4); t++)
        stamp(-17-t,sign*3,-5+Math.sin(t+time/100)*t*.08,t < 2 ? ivory : t < 5 ? flare : red);
    }
  } else if (kind === 'storm') {
    for (let i=0; i<3; i++) {
      const a=time/480+i*TAU/3;
      stamp(10*Math.cos(a),10*Math.sin(a),3*Math.sin(a*2),amethyst);
      stamp(11*Math.cos(a),11*Math.sin(a),3*Math.sin(a*2)+1,ivory);
    }
  }
  const core = kind === 'storm' && Math.sin(time/230) <= 0 ? crimson : red;
  for (const [i,j,k,colour] of model(kind,item)) stamp(i,j,k,kind === 'storm' && colour === red ? core : colour);
}

export function drawShadow(frame, camera, terrain, item, kind) {
  const ground = Math.max(7, terrain.heights[cell(item.x,item.y)]);
  const p = camera.project(item.x,item.y,ground);
  if (camera.chase && p.q < 5) return;
  const rx = Math.min(45*screenUnit, Math.max(2*screenUnit, (kind === 'cloud' ? 15 : kind === 'plane' ? 10 : 5)*p.scale));
  const ry = Math.max(1, rx * (camera.chase ? .27 : .43));
  for (let y = Math.max(0,Math.floor(p.y-ry)); y <= Math.min(HEIGHT-1,p.y+ry); y++) {
    const span = rx*Math.sqrt(Math.max(0,1-((y-p.y)/ry)**2));
    for (let x = Math.max(0,Math.ceil(p.x-span)); x <= Math.min(WIDTH-1,p.x+span); x++) {
      const n = y*WIDTH+x;
      if (Math.abs(frame.depth[n]-p.q) < rx/p.scale+8) frame.pixels[n] = (frame.pixels[n] >>> 1 & 0x007f7f7f) + (kind === 'cloud' ? 0xff0d1420 : 0xff101a26);
    }
  }
}
