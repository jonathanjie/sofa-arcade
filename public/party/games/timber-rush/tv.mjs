// Tree stack, side changes and axe poses adapted from goofyfish/public/games/chopping.html (MIT, © Kamran Ahmed).
import {
  drawFigure,
  drawGround,
  drawNameTag,
  drawPaper,
  drawPopup,
  inkShape,
  palette,
  P,
} from '../../kit/ink.mjs';
import { createArcadeLoop } from '../../kit/animation.mjs';

function axe(c, x, y, angle, scale = 1) {
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  c.scale(scale, scale);
  c.fillStyle = palette.ink;
  c.fillRect(-3, -28, 6, 36);
  c.beginPath();
  c.moveTo(-4, -28);
  c.lineTo(13, -32);
  c.lineTo(17, -18);
  c.lineTo(-4, -19);
  inkShape(c, palette.butter);
  c.restore();
}

function drawLane(c, tree, name, scene, clock, reduced) {
  const { side, logs, branches, down } = tree;
  const age = clock - tree.lastChop;
  const struck = age >= 0 && age < 240 && !reduced;
  const swing = struck ? Math.max(0, 1 - Math.max(0, age - 50) / 190) : 0;
  c.save();
  if (swing && down) c.translate(Math.sin(age / 10) * 3 * swing, 0);
  // The stump stays planted while the cut stack drops into place.
  c.beginPath();
  c.moveTo(-20, 191);
  c.lineTo(-13, 180);
  c.lineTo(-13, 158);
  c.lineTo(13, 158);
  c.lineTo(13, 180);
  c.lineTo(20, 191);
  c.closePath();
  inkShape(c, '#e6d6ba');
  c.beginPath();
  c.moveTo(-22, 39);
  c.quadraticCurveTo(-13, 26, -10, 16);
  c.lineTo(-13, 18);
  c.lineTo(0, 0);
  c.lineTo(12, 17);
  c.lineTo(9, 16);
  c.quadraticCurveTo(15, 29, 24, 38);
  c.quadraticCurveTo(13, 43, 0, 40);
  c.quadraticCurveTo(-12, 44, -22, 39);
  inkShape(c, '#dddcd0');
  for (let i = 0; i < branches.length; i++) {
    const y = 158 - i * 28 + swing * 12;
    const side = branches[i];
    c.strokeStyle = palette.ink;
    c.lineWidth = 5;
    c.lineCap = 'round';
    if (side) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(side * 33, y - 10);
      c.lineTo(side * 48, y - 24);
      c.moveTo(side * 34, y - 11);
      c.lineTo(side * 53, y - 12);
      c.stroke();
    }
    c.beginPath();
    c.roundRect(-13, y - 16, 26, 30, 4);
    inkShape(c, i % 2 ? '#e6d6ba' : '#f3e7cd', 2.5);
    c.beginPath();
    c.moveTo(-7, y - 11);
    c.quadraticCurveTo(-3, y - 6, -6, y + 4);
    c.strokeStyle = '#978877';
    c.lineWidth = 1.6;
    c.stroke();
  }
  const pose = down ? P.wince : swing ? P.punch : P.ready;
  c.save();
  c.translate(side * 43, 194);
  c.scale(-side * 0.73, down ? 0.42 : 0.73);
  drawFigure(c, pose, 0, 0, { look: tree.look, goon: tree.left });
  axe(c, ...pose.hF, swing ? 1.35 : -0.45);
  c.restore();
  drawGround(c, -80, 80, 193, tree.look);
  if (swing) {
    c.fillStyle = palette.butter;
    for (let i = 0; i < 5; i++)
      c.fillRect(side * (14 + i * 6) * (1 - swing), 155 - i * 4 - (1 - swing) * 18, 5, 3);
  }
  c.restore();
  c.fillStyle = '#d3cab8';
  c.fillRect(-67, 201, 134, 6);
  c.fillStyle = palette.ink;
  c.fillRect(-67, 201, (134 * tree.bar) / scene.barMs, 6);
  drawNameTag(c, name, tree.look, { x: -82, y: 213, width: 164, height: 28 });
  c.font = 'bold 17px system-ui';
  c.textAlign = 'center';
  c.fillStyle = palette.ink;
  let label = logs === 1 ? '1 log' : logs + ' logs';
  if (scene.mode === 'fell-race') label += ' · ' + Math.floor(logs / scene.logsPerTree) + '/3 trees';
  if (scene.mode === 'lumber-team') label += ' · ' + ['Birch', 'Cedar'][tree.team];
  c.fillText(tree.left ? 'Left round' : down ? 'BONK! −2s' : label, 0, 261);
}

export function mountTimberTv(canvas) {
  const c = canvas.getContext('2d');
  const paper = document.createElement('canvas');
  let area, view, arrival;
  function resize(next) {
    area = next.safe;
    canvas.width = paper.width = next.width;
    canvas.height = paper.height = next.height;
    drawPaper(paper.getContext('2d'), { x: 0, y: 0, width: next.width, height: next.height });
  }
  const loop = createArcadeLoop((at, reduced) => {
    if (!area || !view?.scene) return;
    const scene = view.scene;
    c.drawImage(paper, 0, 0);
    const cols = Math.ceil(scene.trees.length / (scene.trees.length > 8 ? 2 : 1));
    const rows = Math.ceil(scene.trees.length / cols);
    const w = area.width / cols,
      h = (area.height - 40) / rows;
    const scale = Math.min(w / 176, h / 274);
    const center = (i) => [
      area.x + ((i % cols) + 0.5) * w,
      area.y + 40 + Math.floor(i / cols) * h + (h - 274 * scale) / 2,
    ];
    const clock = scene.now + Math.min(100, at - arrival);
    c.fillStyle = palette.ink;
    c.textAlign = 'center';
    c.font = 'bold 23px system-ui';
    c.fillText(
      scene.mode === 'lumber-team'
        ? 'BIRCH  ' + scene.teams[0] + '     /     CEDAR  ' + scene.teams[1]
        : scene.mode === 'sabotage'
          ? 'SABOTAGE  /  Ten clean chops send an axe'
          : 'FELL RACE  /  First to three trees',
      canvas.width / 2,
      28,
    );
    for (const [i, tree] of scene.trees.entries()) {
      c.save();
      c.translate(...center(i));
      c.scale(scale, scale);
      drawLane(c, tree, view.roster.find((p) => p.id === tree.id)?.name ?? 'Guest', scene, clock, reduced);
      c.restore();
    }
    for (const flight of scene.flights) {
      if (clock - flight.at >= 650) continue;
      const [a, b] = [flight.from, flight.to].map((id) =>
        center(scene.trees.findIndex((t) => t.id === id)),
      );
      const u = reduced ? 1 : (clock - flight.at) / 650;
      axe(
        c,
        a[0] + (b[0] - a[0]) * u,
        a[1] + (b[1] - a[1]) * u + 90 - Math.sin(Math.PI * u) * 65,
        u * 8,
        1.4,
      );
    }
    if (scene.now < 3200) {
      const side = reduced || Math.floor(clock / 650) % 2 === 0 ? '│╱   ☞  [←]  →' : '╲│   ←  [→]  ☜';
      drawPopup(
        c,
        'Tap the side clear of the lowest branch.    ' + side,
        canvas.width / 2,
        area.height * 0.51,
        area,
      );
    }
  });
  return {
    resize,
    push(next) {
      view = next;
      arrival = performance.now();
    },
    setReducedMotion: loop.setReducedMotion,
    dispose: loop.dispose,
  };
}
