// Ground and ink shapes adapted from goofyfish/.claude/skills/game/references/snippets.js.
// MIT © 2026 Kamran Ahmed. See docs/third-party/goofyfish-LICENSE.txt.
import { LOOKS } from '../looks.mjs';
import { createJuice } from './animation.mjs';

export const palette = Object.freeze({
  paper: '#fffaf0', dot: '#ded7c9', ink: '#141414', far: '#9a9a9a', goon: '#888888', butter: '#fcd34d',
});

export function playerLook(look) {
  return Number.isInteger(look) ? LOOKS[look] : look;
}

export function drawPaper(ctx, { x, y, width, height }) {
  ctx.save();
  ctx.fillStyle = palette.paper;
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = palette.dot;
  ctx.beginPath();
  for (let row = y + 8; row + 1 <= y + height; row += 16) {
    for (let col = x + 8; col + 1 <= x + width; col += 16) {
      ctx.moveTo(col + 1, row);
      ctx.arc(col, row, 1, 0, Math.PI * 2);
    }
  }
  ctx.fill();
  ctx.restore();
}

export function drawGround(ctx, left, right, y, seed = 0) {
  ctx.save();
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const height = x => y + Math.sin(x / 17 + seed) + .6 * Math.cos(x / 7 + seed);
  ctx.moveTo(left, height(left));
  for (let x = left + 6; x < right; x += 6) ctx.lineTo(x, height(x));
  ctx.lineTo(right, height(right));
  ctx.stroke();
  ctx.restore();
}

export function inkShape(ctx, fill = palette.butter, width = 2) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = width;
  ctx.strokeStyle = palette.ink;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

export function drawBadge(ctx, look, x, y, size) {
  const { colour, badge } = playerLook(look);
  const unit = size / 9;
  ctx.save();
  ctx.fillStyle = colour;
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = palette.ink;
  badge.forEach((row, i) => [...row].forEach((bit, j) => {
    if (bit === '#') ctx.fillRect(x + (j + 1) * unit, y + (i + 1) * unit, unit, unit);
  }));
  ctx.restore();
}

// Keep each name with its roster slot, even when two actors occupy the same position.
export function layoutNameTags(count, { x, y, width, height }, columns = Math.ceil(Math.sqrt(count))) {
  const cellWidth = width / columns;
  const cellHeight = height / Math.ceil(count / columns);
  const tagWidth = Math.min(240, cellWidth * .94);
  const tagHeight = Math.min(40, cellHeight * .25, tagWidth / 4);
  return Array.from({ length: count }, (_, i) => ({
    x: x + (i % columns + .5) * cellWidth - tagWidth / 2,
    y: y + (Math.floor(i / columns) + 1) * cellHeight - tagHeight,
    width: tagWidth, height: tagHeight,
  }));
}

function drawText(ctx, text, x, y, width, height) {
  ctx.font = 'bold ' + Math.floor(height * .65) + 'px system-ui';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const chars = Array.from(text);
  while (chars.length && ctx.measureText(chars.join('') + '…').width > width) chars.pop();
  const label = ctx.measureText(text).width <= width ? text : chars.join('') + '…';
  ctx.fillStyle = palette.ink;
  ctx.fillText(label, x, y + height / 2, width);
}

export function drawNameTag(ctx, text, look, { x, y, width, height }) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x + 1, y + 1, width - 2, height - 2, height / 4);
  inkShape(ctx, palette.paper);
  drawBadge(ctx, look, x + height * .15, y + height * .1, height * .8);
  drawText(ctx, text, x + height * 1.1, y, width - height * 1.3, height);
  ctx.restore();
}

export function drawPopup(ctx, text, x, y, area) {
  ctx.save();
  const height = Math.min(42, area.height);
  ctx.font = 'bold ' + Math.floor(height * .65) + 'px system-ui';
  const padding = Math.min(12, area.width / 5);
  const width = Math.min(area.width, ctx.measureText(text).width + 2 * padding);
  const left = Math.max(area.x, Math.min(x - width / 2, area.x + area.width - width));
  const top = Math.max(area.y, Math.min(y - height, area.y + area.height - height));
  ctx.beginPath();
  ctx.roundRect(left + 1, top + 1, width - 2, height - 2, height / 3);
  inkShape(ctx);
  drawText(ctx, text, left + padding, top, width - 2 * padding, height);
  ctx.restore();
}

// Keep event time in host milliseconds. Labels remain visible when motion is reduced.
export function createInkEffects() {
  const particles = createJuice();
  let labels = [];
  let reduced = false;
  return {
    clear() {
      particles.clear();
      labels = [];
    },
    setReducedMotion(value) {
      reduced = value;
      particles.setReducedMotion(value);
    },
    impact({ x, y, colour = palette.butter, label, time, strong = false }) {
      particles.impact({ x, y, colour, time, strong });
      if (label) {
        labels.push({ text: label, x, y, time });
        if (labels.length > 16) labels.shift();
      }
    },
    offset(time) {
      return reduced ? [0, 0] : particles.offset(time);
    },
    draw(ctx, time, area) {
      ctx.save();
      particles.draw(ctx, time);
      labels = labels.filter(label => time - label.time < 700);
      for (const label of labels) {
        const age = time - label.time;
        if (age >= 0) drawPopup(ctx, label.text, label.x, label.y - (reduced ? 0 : age / 25), area);
      }
      ctx.restore();
    },
  };
}
