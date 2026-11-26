// Run with Node from any directory. Chromium paints the same sprites as the TV;
// cwebp encodes both shelf sizes from one lossless master in memory.
import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ui = new URL('../../../', import.meta.url);
const output = new URL('../covers/whiteout-drift/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  // Serve only the local modules used by this composition; no network assets.
  await page.route('http://cover.local/**', async (route) => {
    const path = new URL(route.request().url()).pathname.slice(1);
    if (!path)
      return route.fulfill({
        contentType: 'text/html',
        body: '<style>*{margin:0}</style><canvas width="1280" height="720"></canvas>',
      });
    const modules = ['party/games/whiteout-drift/art.mjs', 'party/looks.mjs', 'party/kit/sprites.mjs'];
    if (!modules.includes(path)) return route.abort();
    return route.fulfill({ contentType: 'text/javascript', body: await readFile(new URL(path, ui)) });
  });
  await page.goto('http://cover.local/');
  await page.evaluate(async () => {
    const {
      rect,
      polygon,
      glow,
      noise,
      drawBuildingBlock,
      drawCarSprite,
      headlights,
      drawIcePatch,
      drawHydrant,
      drawCone,
    } = await import('/party/games/whiteout-drift/art.mjs');
    const { createLookArt } = await import('/party/looks.mjs');
    const c = document.querySelector('canvas').getContext('2d');
    c.imageSmoothingEnabled = false;
    rect(c, '#324252', 0, 0, 1280, 720);
    c.save();
    c.translate(640, 360);
    c.rotate(-0.13);
    c.translate(-640, -360);
    for (let i = 0; i < 18500; i++) {
      rect(
        c,
        i % 3 ? '#c1d1d226' : '#12223845',
        noise(i) * 1500 - 100,
        noise(i + 972) * 1000 - 140,
        2 + (i % 5),
        1 + (i % 2),
      );
    }
    for (let x = -120; x < 1450; x += 72) rect(c, '#b0b3a17a', x, 360, 37, 3);
    for (let y = -110; y < 900; y += 60) rect(c, '#b0b3a172', 820, y, 3, 26);
    for (let i = 0; i < 7; i++) rect(c, '#a6bdca82', 470, 323 + i * 18, 49, 8);
    const blocks = [
      [-70, -130, 680, 385, 13],
      [1020, -105, 450, 350, 84],
      [-80, 595, 650, 370, 34],
      [1070, 560, 430, 350, 67],
    ];
    for (const [x, y, w, h, seed] of blocks) {
      c.save();
      c.translate(x, y);
      c.scale(3, 3);
      drawBuildingBlock(c, 0, 0, w / 3, h / 3, seed);
      c.restore();
    }
    for (const [x, y] of [
      [565, 259],
      [1042, 249],
      [542, 579],
      [1100, 544],
    ]) {
      glow(c, x, y, 135, '#ffac4f88');
      glow(c, x, y, 40, '#ffd682bd');
      rect(c, '#ffedb1', x - 4, y - 4, 8, 8);
    }
    createLookArt(document).cat(c, 1038, 110, 6);
    for (let i = 0; i < 7; i++) drawCone(c, 1030 + 30 * i, 261, i === 0, 2);
    for (let i = 0; i < 6; i++) drawCone(c, 370 + 32 * i, 578, false, 2);
    drawIcePatch(c, 865, 405, 119, 29, 160);
    // Paired drift trails follow each driver's own turn, not the street grid.
    for (const [x, y, bend] of [
      [860, 377, 1],
      [493, 424, -1],
      [646, 509, 1],
    ]) {
      for (const d of [-14, 14]) {
        c.beginPath();
        c.moveTo(x - 690, y + 172 + d);
        c.bezierCurveTo(x - 380, y + 170 + d, x - 250, y - 112 * bend + d, x - 128, y - 37 * bend + d);
        c.quadraticCurveTo(x - 55, y + 9 * bend + d, x, y + d);
        c.lineWidth = 7;
        c.strokeStyle = '#192737b3';
        c.stroke();
      }
    }
    function car(x, y, a, scale, cop, phase) {
      c.save();
      c.translate(x, y);
      c.rotate(a);
      c.scale(scale, scale);
      headlights(c, cop, phase);
      drawCarSprite(c, {
        colour: '#ffc543',
        role: cop ? 1 : 0,
        ai: +cop,
        sirenPhase: phase,
        boost: !cop,
        hp: 2,
      });
      if (!cop) {
        // Mouse ears and a tiny scarf peeking out of the gold coupe.
        rect(c, '#563d4e', -5, -5, 4, 4);
        rect(c, '#efb99e', -4, -5, 2, 2);
        rect(c, '#ffe1b4', -2, -3, 4, 4);
        rect(c, '#263241', 1, -2, 1, 1);
      }
      c.restore();
    }
    car(501, 420, -0.75, 3.7, true, true);
    car(653, 520, 0.88, 3.6, true, false);
    car(850, 359, -0.38, 5.3, false, false);
    drawHydrant(c, 913, 367, 1, 3);
    for (let i = 0; i < 180; i++) {
      const a = noise(i + 55) * 4 + 1,
        r = noise(i + 238) ** 1.5 * 80;
      rect(
        c,
        i % 4 ? '#dae6edaa' : '#ffda89',
        913 + Math.cos(a) * r,
        356 + Math.sin(a) * r,
        2 + (i % 5),
        2 + (i % 4),
      );
    }
    c.restore();
    for (let i = 0; i < 860; i++)
      rect(
        c,
        i % 3 ? '#d8eff854' : '#effffdb0',
        noise(i + 5) * 1280,
        noise(2 * i + 45) * 720,
        1 + (i % 4),
        1 + (i % 3),
      );
    const shade = c.createLinearGradient(0, 0, 810, 120);
    shade.addColorStop(0, '#0b1728e8');
    shade.addColorStop(0.65, '#11203595');
    shade.addColorStop(1, 'transparent');
    rect(c, shade, 0, 0, 820, 305);
    c.save();
    c.translate(54, 52);
    c.transform(1, 0, -0.11, 1, 0, 0);
    c.fillStyle = '#ffcf77';
    c.font = 'bold 19px monospace';
    c.fillText('SOFA ARCADE   /   NIGHT PATROL', 4, 2);
    c.font = '1000 95px system-ui';
    c.lineWidth = 7;
    c.strokeStyle = '#172b40';
    c.strokeText('WHITEOUT', 0, 99);
    c.fillStyle = '#e8f5fa';
    c.fillText('WHITEOUT', 0, 99);
    c.font = '1000 123px system-ui';
    c.strokeText('DRIFT', 0, 207);
    c.fillStyle = '#ffcb67';
    c.fillText('DRIFT', 0, 207);
    for (let i = 0; i < 3; i++)
      polygon(c, '#ffcb67', [
        [413 + 17 * i, 196],
        [428 + 17 * i, 172],
        [437 + 17 * i, 172],
        [422 + 17 * i, 196],
      ]);
    c.restore();
  });
  const png = await page.locator('canvas').screenshot();
  const rawPath = fileURLToPath(new URL('./raw/whiteout-drift.webp', import.meta.url));
  execFileSync('cwebp', ['-quiet', '-z', '6', '-exact', '-o', rawPath, '--', '-'], { input: png });
  for (const [name, width, height] of [
    ['cover.webp', 1280, 720],
    ['cover-560.webp', 560, 315],
  ]) {
    execFileSync(
      'cwebp',
      [
        '-quiet',
        '-q',
        '88',
        '-resize',
        String(width),
        String(height),
        '-o',
        fileURLToPath(new URL(name, output)),
        '--',
        '-',
      ],
      { input: png },
    );
  }
} finally {
  await browser.close();
}
