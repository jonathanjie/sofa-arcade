/** Compile one letter-grid frame at native pixel size. A dot is transparent. */
export function compileSprite(document, rows, palette) {
  const canvas = document.createElement('canvas');
  canvas.width = rows[0].length;
  canvas.height = rows.length;
  const context = canvas.getContext('2d');
  rows.forEach((row, y) => {
    [...row].forEach((letter, x) => {
      if (!palette[letter]) return;
      context.fillStyle = palette[letter];
      context.fillRect(x, y, 1, 1);
    });
  });
  return canvas;
}

/** Positions and scales use whole pixels to preserve the coded edges. */
export function drawSprite(context, sprite, x, y, scale, scaleY = scale) {
  const width = sprite.width * Math.max(1, Math.round(scale));
  const height = sprite.height * Math.max(1, Math.round(scaleY));
  context.imageSmoothingEnabled = false;
  context.drawImage(sprite, Math.round(x), Math.round(y), width, height);
}

/** Largest whole-pixel scale in an equal-cell grid, or 0 if the sprite cannot fit. */
export function fitSpriteScale(sprite, playerCount, area, { columns, gap = 0 } = {}) {
  if (!Number.isInteger(playerCount) || playerCount < 1 || sprite.width <= 0 || sprite.height <= 0) return 0;
  const first = columns ?? 1;
  const last = columns ?? playerCount;
  if (!Number.isInteger(first) || first < 1 || first > playerCount) return 0;
  let scale = 0;
  for (let count = first; count <= last; count++) {
    const rows = Math.ceil(playerCount / count);
    const cellWidth = (area.width - (count - 1) * gap) / count;
    const cellHeight = (area.height - (rows - 1) * gap) / rows;
    scale = Math.max(scale, Math.floor(Math.min(cellWidth / sprite.width, cellHeight / sprite.height)));
  }
  return scale;
}
