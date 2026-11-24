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
