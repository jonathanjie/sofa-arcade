import assert from 'node:assert/strict';
import test from 'node:test';
import { compileStack, drawStack, stackHeading } from './stack.mjs';

function canvasDocument() {
  return { createElement() {
    const c = {
      pixels: [], images: [],
      fillRect(...rect) { this.pixels.push([this.fillStyle, ...rect]); },
      drawImage(image) { this.images.push(image); },
      createRadialGradient() { return { addColorStop() {} }; },
      save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    };
    return { getContext: () => c };
  } };
}
const layers = [['a.', '.a'], ['.a', '..']];

test('compile preserves slice order, dimensions and transparent cells across palettes', () => {
  const doc = canvasDocument();
  for (const colour of ['red', 'blue']) {
    const stack = compileStack(doc, layers, { a: colour });
    assert.deepEqual([stack.width, stack.height, stack.depth], [2, 2, 2]);
    assert.deepEqual(stack.slices.map(slice => slice.getContext().pixels), [
      [[colour, 0, 0, 1, 1], [colour, 1, 1, 1, 1]], [[colour, 1, 0, 1, 1]],
    ]);
  }
  assert.throws(() => compileStack(doc, [['aa'], ['a']], {}), RangeError);
});

test('headings round to the nearest of 32 directions and wrap across zero', () => {
  const step = Math.PI / 16;
  for (const [angle, expected] of [[step * 0.49, 0], [step * 0.51, 1], [-step, 31], [2 * Math.PI, 0]]) {
    assert.equal(stackHeading(angle), expected);
  }
});

test('draw reuses a bitmap and bounds cached frames across scales', () => {
  const doc = canvasDocument();
  const stack = compileStack(doc, layers, { a: 'red' });
  const c = doc.createElement().getContext();
  drawStack(c, stack, 0, 0);
  drawStack(c, stack, 5, 7, { angle: 0.01 });
  assert.equal(c.images.length, 2);
  assert.equal(c.images[0], c.images[1]);
  for (const scale of [1, 2, 3]) {
    for (let i = 0; i < 32; i++) drawStack(c, stack, 1, 2, { angle: i * Math.PI / 16, scale });
  }
  assert.equal(stack.frames.size, 64);
  drawStack(c, stack, 0, 0);
  assert.notEqual(c.images.at(-1), c.images[0]);
  assert.equal(c.imageSmoothingEnabled, false);
});
