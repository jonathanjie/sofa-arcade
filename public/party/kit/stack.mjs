import { compileSprite } from './sprites.mjs';

const TURN = 2 * Math.PI;
const HEADINGS = 32;
const FRAME_LIMIT = 64;

export function stackHeading(angle) {
  const step = Math.round((angle % TURN) * HEADINGS / TURN);
  return (step + HEADINGS) % HEADINGS;
}

/** Compile one palette variant. All slices share a footprint, bottom first. */
export function compileStack(document, layers, palette) {
  const width = layers[0]?.[0]?.length;
  const height = layers[0]?.length;
  if (!width || layers.some(rows => rows.length !== height || rows.some(row => row.length !== width))) {
    throw new RangeError('Stack slices must be nonempty grids with matching dimensions');
  }
  const slices = layers.map(rows => compileSprite(document, rows, palette));
  const shaded = slices.map((slice, index) => {
    const copy = document.createElement('canvas');
    copy.width = width;
    copy.height = height;
    const c = copy.getContext('2d');
    c.drawImage(slice, 0, 0);
    c.globalCompositeOperation = 'source-atop';
    c.fillStyle = 'rgba(0,0,0,' + (0.38 * (1 - index / Math.max(1, slices.length - 1))) + ')';
    c.fillRect(0, 0, width, height);
    return copy;
  });
  return { document, width, height, depth: slices.length, slices, shaded, frames: new Map() };
}

function bake(stack, heading, scale, gap, shade) {
  const radius = Math.ceil(Math.hypot(stack.width, stack.height) * scale / 2) + 2;
  const rise = Math.ceil((stack.depth - 1) * gap);
  const canvas = stack.document.createElement('canvas');
  canvas.width = radius * 2;
  canvas.height = radius * 2 + rise;
  const c = canvas.getContext('2d');
  c.imageSmoothingEnabled = false;
  c.translate(radius, radius + rise);
  c.save();
  c.rotate(heading * TURN / HEADINGS);
  c.scale(stack.width * scale / 2 + 1, stack.height * scale / 2 + 1);
  const shadow = c.createRadialGradient(0, 0, 0, 0, 0, 1);
  shadow.addColorStop(0, '#10132199');
  shadow.addColorStop(1, '#10132100');
  c.fillStyle = shadow;
  c.fillRect(-1, -1, 2, 2);
  c.restore();
  for (const slice of shade ? stack.shaded : stack.slices) {
    c.save();
    c.rotate(heading * TURN / HEADINGS);
    c.drawImage(slice, -stack.width * scale / 2, -stack.height * scale / 2, stack.width * scale, stack.height * scale);
    c.restore();
    c.translate(0, -gap);
  }
  return { canvas, x: radius, y: radius + rise };
}

/** Draw at ground centre. Angle is in radians, sliceGap is in art pixels. */
export function drawStack(context, stack, x, y, { angle = 0, scale = 1, sliceGap = 1, shade = true } = {}) {
  scale = Math.max(1, Math.round(scale));
  const heading = stackHeading(angle);
  const key = [heading, scale, sliceGap, shade].join('/');
  let frame = stack.frames.get(key);
  if (!frame) {
    frame = bake(stack, heading, scale, sliceGap * scale, shade);
    if (stack.frames.size >= FRAME_LIMIT) stack.frames.delete(stack.frames.keys().next().value);
    stack.frames.set(key, frame);
  }
  context.imageSmoothingEnabled = false;
  context.drawImage(frame.canvas, Math.round(x) - frame.x, Math.round(y) - frame.y);
}
