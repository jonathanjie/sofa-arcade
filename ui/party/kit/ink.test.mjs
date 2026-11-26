import test from 'node:test';
import assert from 'node:assert/strict';
import { Actor, P, drawFigure, mk, pathPose, playerLook, palette, layoutNameTags } from './ink.mjs';
import { LOOKS } from '../looks.mjs';

test('pose path reaches exact endpoints and interpolates joints and prop angles', () => {
  const end = mk({ head: [20, -101], ax: 1 });
  const path = [P.stand, end];
  assert.equal(pathPose(path, 0), P.stand);
  assert.equal(pathPose(path, 1), end);
  assert.deepEqual(pathPose(path, .5).head, [10, -111]);
  assert.equal(pathPose(path, .5).ax, .5);
});

test('actor carries time across steps and callbacks and handles an instant step', () => {
  let calls = 0;
  const actor = new Actor(P.stand);
  actor.push({ pose: P.crouch, d: .25 }, { fn: () => calls++ },
    { pose: P.ready, d: 0 }, { path: [P.cheer, P.leap], ez: 'lin', d: 1 });
  actor.update(.75);
  assert.equal(calls, 1);
  assert.deepEqual(actor.pose.head, P.cheer.head);
  actor.update(.5);
  assert.equal(actor.pose, P.leap);
  assert.ok(actor.idle);
});

test('all sixteen looks retain distinct scarf colours and grayscale badges', () => {
  assert.equal(palette.ink, '#141414');
  assert.equal(palette.butter, '#fcd34d');
  for (const [i, look] of LOOKS.entries()) {
    assert.equal(playerLook(i), look);
    assert.equal(playerLook(look), look);
  }
  assert.equal(new Set(LOOKS.map(look => look.colour)).size, 16);
  assert.equal(new Set(LOOKS.map(look => look.badge.join(''))).size, 16);
});

test('sixteen name tags fit inside the TV safe area without intersection', () => {
  const area = { x: 60, y: 25, width: 1800, height: 990 };
  const tags = layoutNameTags(16, area);
  assert.equal(tags.length, 16);
  for (const [i, tag] of tags.entries()) {
    assert.ok(tag.height >= 36 && tag.x >= area.x && tag.y >= area.y);
    assert.ok(tag.x + tag.width <= area.x + area.width && tag.y + tag.height <= area.y + area.height);
    for (const other of tags.slice(i + 1)) {
      assert.ok(tag.x + tag.width <= other.x || other.x + other.width <= tag.x ||
        tag.y + tag.height <= other.y || other.y + other.height <= tag.y);
    }
  }
});

test('each figure style renders a flipped player and returns finite local joints', () => {
  const ctx = Object.fromEntries(['save', 'restore', 'translate', 'scale', 'beginPath', 'moveTo',
    'lineTo', 'stroke', 'fill', 'arc', 'ellipse', 'closePath', 'fillRect'].map(key => [key, () => {}]));
  ctx.globalAlpha = 1;
  for (const style of ['classic', 'chunky', 'doodle', 'doodleshirt', 'sketch', 'googly']) {
    const joints = drawFigure(ctx, P.ready, 0, 0, { style, look: 15, badge: true, flip: true, goon: true });
    assert.ok([...joints.head, ...joints.handF, ...joints.eB].every(Number.isFinite));
    assert.equal(joints.ink, palette.goon);
  }
});
