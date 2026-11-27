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
const models = new Map();
function model(kind, item) {
  const variant = kind === 'plane' ? item.look : kind === 'balloon' ? item.col : 0;
  const key = `${kind}:${variant}`;
  if (models.has(key)) return models.get(key);
  let points;
  if (kind === 'plane') {
    const body = hex((LOOKS[variant] ?? LOOKS[0]).colour);
    points = stack(32, 16, (x, y, z) => {
      const side = Math.abs(y);
      if (((x-3)/7)**2 + (y/3.5)**2 + ((z-9)/6)**2 < 1 && z > 8) return z > 12 ? ivory : mint;
      if ((x/16)**2 + (y/4)**2 + ((z-6)/6.2)**2 < 1) return z < 3 ? ink : x > 12 ? gold : z < 6 ? shaded : body;
      const wing = 9 - side * .7 - x, tail = x < -8 && x >= -14 && side < 8;
      if (((wing >= 0 && wing < 10 - side * .35) || tail) && z >= 5 && z <= 7) return z === 5 || wing < 1 || side >= 15 ? ink : side >= 12 ? gold : body;
      if (x < -8 && x > -14 && side <= 1 && z < 16 && z >= 6) return z > 12 ? gold : body;
    });
  } else if (kind === 'cloud') {
    points = stack(32, 5, (x,y,z) => Math.abs(x) + Math.abs(y)*2 < 20 && Math.abs(y) < 6 && (z < 3 || x < 6) ? (z < 2 ? hex('#c4dce7') : hex('#fffdf4')) : 0);
  } else if (kind === 'crown') {
    points = stack(16, 12, (x,y,z) => {
      const rim = Math.max(Math.abs(x), Math.abs(y));
      if (rim < 7 && rim >= 4 && (z < 6 || Math.min(Math.abs(x),Math.abs(y)) > z-6)) return z < 2 ? ink : z === 4 && !(x%4) ? red : z > 7 ? ivory : honey;
    });
  } else {
    const balloon = kind === 'balloon', storm = kind === 'storm';
    const colour = balloon ? hex(['#ff677d','#54bfff','#b788ff','#ffc44b'][variant] ?? '#ff677d') : storm ? hex('#6a4586') : honey;
    points = stack(20, 20, (x,y,z) => {
      const dz = z - 10, r = Math.hypot(x,y,dz * (balloon ? .86 : 1));
      if (storm && r < 10 && [Math.abs(x),Math.abs(y),Math.abs(dz)].filter(n => n <= 1).length >= 2) return ink;
      if (balloon && z < 4 && Math.abs(x)+Math.abs(y) < 2) return ink;
      if (r > 7) return 0;
      if (storm && Math.abs(dz) < 2 && (Math.abs(x)<3 || Math.abs(y)<3)) return red;
      return dz < -3 ? (storm || balloon ? ink : gold) : dz > 3 && x-y < -1 ? ivory : colour;
    });
  }
  models.set(key, points); return points;
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
  const radius = 18 * p.scale * unit;
  if (p.x < -radius || p.x > WIDTH + radius || p.y < -radius || p.y > HEIGHT + radius) return;
  const basis = axes(item.a || (kind === 'crown' ? time / 1400 : 0), (item.pitch || 0)*.48 + (item.loop || 0)*TAU, (item.bank || 0)*.7 + (item.roll || 0)*TAU);
  if (kind === 'sun') {
    // A stepped aureole and four detached glints distinguish Suns from balloons.
    const radius = Math.min(60, Math.ceil(10 * unit * p.scale));
    for (let y = Math.max(0, Math.floor(p.y-radius)); y <= Math.min(HEIGHT-1,p.y+radius); y++) {
      for (let x = Math.max(0, Math.floor(p.x-radius)); x <= Math.min(WIDTH-1,p.x+radius); x++) {
        const dx = Math.abs(x-p.x), dy = Math.abs(y-p.y), n = y*WIDTH+x;
        if (p.q >= frame.depth[n] || dx+dy > radius*1.35) continue;
        const glint = Math.min(dx,dy) < Math.max(1,p.scale) && Math.max(dx,dy) > radius*.85;
        frame.pixels[n] = glint ? ivory : ((frame.pixels[n] >>> 1) & 0x007f7f7f) + 0xff24657e;
      }
    }
  }
  // Transform local offsets to camera space, without wrapping each individual texel.
  const [f,r,u] = basis.map(([vx,vy,vz]) => [(-vx*camera.dy+vy*camera.dx)*unit,(vx*camera.dx+vy*camera.dy)*unit,vz*unit]);
  const size = Math.min(7, Math.max(1, Math.ceil(p.scale * unit * 1.25)));
  for (const [i,j,k,colour] of model(kind,item)) {
    const side = i*f[0]+j*r[0]+k*u[0], forward = i*f[1]+j*r[1]+k*u[1], up = i*f[2]+j*r[2]+k*u[2];
    const q = p.q + forward;
    if (camera.chase && q < 4) continue;
    const ratio = camera.chase ? p.q/q : 1;
    const sx = Math.floor(WIDTH/2 + (p.x-WIDTH/2 + side*p.scale)*ratio);
    const sy = Math.floor(camera.chase ? camera.horizon + (p.y-camera.horizon + (side*camera.tilt-up)*p.scale)*ratio : p.y - forward*camera.scaleY - up*camera.scaleZ);
    // Orthographic rays descend as they go forward; height breaks depth ties.
    const depth = q - (camera.chase ? 0 : up*.001);
    for (let yy = Math.max(0,sy); yy < Math.min(HEIGHT,sy+size); yy++) for (let xx = Math.max(0,sx); xx < Math.min(WIDTH,sx+size); xx++) {
      const n = yy*WIDTH+xx;
      if (depth <= frame.depth[n]) { frame.depth[n] = depth; frame.pixels[n] = colour; }
    }
  }
}

export function drawShadow(frame, camera, terrain, item, kind) {
  const ground = Math.max(7, terrain.heights[cell(item.x,item.y)]);
  const p = camera.project(item.x,item.y,ground);
  if (camera.chase && p.q < 5) return;
  const rx = Math.min(45, Math.max(2, (kind === 'cloud' ? 15 : kind === 'plane' ? 10 : 5)*p.scale));
  const ry = Math.max(1, rx * (camera.chase ? .27 : .43));
  for (let y = Math.max(0,Math.floor(p.y-ry)); y <= Math.min(HEIGHT-1,p.y+ry); y++) {
    const span = rx*Math.sqrt(Math.max(0,1-((y-p.y)/ry)**2));
    for (let x = Math.max(0,Math.ceil(p.x-span)); x <= Math.min(WIDTH-1,p.x+span); x++) {
      const n = y*WIDTH+x;
      if (Math.abs(frame.depth[n]-p.q) < rx/p.scale+8) frame.pixels[n] = (frame.pixels[n] >>> 1 & 0x007f7f7f) + 0xff101a26;
    }
  }
}

export function pixelText(c, text, x, y, colour = '#fff8db') {
  x = Math.round(x); y = Math.round(y);
  c.fillStyle = '#141924'; c.fillText(text,x+1,y+1);
  c.fillStyle = colour; c.fillText(text,x,y);
}
export function popup(c, camera, event, age, reduced) {
  if (!event.text || age < 0 || age > 800) return;
  const p = camera.project(event.x,event.y,event.z ?? 32);
  if (!camera.chase || p.q > 4) pixelText(c,event.text,p.x,p.y-5-(reduced ? 0 : age/65),'#fff299');
}
