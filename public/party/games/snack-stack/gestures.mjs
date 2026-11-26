import { ARROWS, TRACE } from './cards.mjs';

export function button(root, label, className, onPress) {
  const node = root.ownerDocument.createElement('button');
  node.type = 'button';
  node.className = className;
  node.textContent = label;
  if (onPress) node.addEventListener('click', onPress);
  root.append(node);
  return node;
}

export function mountHold(root, send) {
  const pad = button(root, 'Hold', 'party-tap snack-pad');
  let pointer;
  let held = false;
  function down() {
    if (held) return;
    held = send('down');
    if (held) pad.textContent = 'Release';
  }
  function up() {
    if (!held) return;
    send('up');
    held = false;
    pad.textContent = 'Hold';
  }
  function cancel() {
    if (held) send('cancel');
    held = false;
    pad.textContent = 'Hold';
  }
  pad.addEventListener('pointerdown', event => {
    if (pointer !== undefined || event.button !== 0) return;
    pointer = event.pointerId;
    pad.setPointerCapture(pointer);
    down();
  });
  pad.addEventListener('pointerup', event => {
    if (event.pointerId !== pointer) return;
    pointer = undefined;
    up();
  });
  pad.addEventListener('lostpointercapture', event => {
    if (event.pointerId !== pointer) return;
    pointer = undefined;
    cancel();
  });
  pad.addEventListener('keydown', event => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    if (!event.repeat) down();
  });
  pad.addEventListener('keyup', event => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    up();
  });
  pad.addEventListener('blur', cancel);
  return {
    setEnabled(value) {
      if (!value && !pad.disabled) cancel();
      pad.disabled = !value;
    },
  };
}

export function mountSwipe(root, send) {
  const pad = button(root, ARROWS.join(' '), 'party-tap snack-pad snack-swipe');
  pad.setAttribute('aria-label', 'Swipe pad');
  let start;
  pad.addEventListener('pointerdown', event => {
    if (start || event.button !== 0) return;
    start = { x: event.clientX, y: event.clientY, id: event.pointerId };
    pad.setPointerCapture(event.pointerId);
  });
  function swipe(event) {
    if (event.pointerId !== start?.id) return;
    const x = event.clientX - start.x;
    const y = event.clientY - start.y;
    if (Math.max(Math.abs(x), Math.abs(y)) < 32) return;
    const direction = Math.abs(x) > Math.abs(y) ? (x > 0 ? 1 : 3) : (y > 0 ? 2 : 0);
    send('choose', direction);
    start = undefined;
  }
  pad.addEventListener('pointermove', swipe);
  pad.addEventListener('pointerup', swipe);
  pad.addEventListener('lostpointercapture', () => { start = undefined; });
  pad.addEventListener('keydown', event => {
    if (!event.key.startsWith('Arrow')) return;
    const index = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'].indexOf(event.key);
    if (index < 0) return;
    event.preventDefault();
    send('choose', index);
  });
  return { setEnabled(value) { pad.disabled = !value; } };
}

export function mountTrace(root, send) {
  const pad = button(root, '', 'party-tap snack-pad snack-trace');
  pad.setAttribute('aria-label', 'Trace from one to four');
  const canvas = root.ownerDocument.createElement('canvas');
  canvas.width = 320;
  canvas.height = 320;
  canvas.setAttribute('aria-hidden', 'true');
  pad.append(canvas);
  const context = canvas.getContext('2d');
  let pointer;
  let last = -Infinity;
  let progress = -1;
  function trace(event, starts = false) {
    if (event.pointerId !== pointer || (!starts && event.timeStamp - last < 50)) return;
    const box = canvas.getBoundingClientRect();
    const percent = (coordinate, origin, size) => Math.max(0, Math.min(100, Math.round((coordinate - origin) * 100 / size)));
    const point = [percent(event.clientX, box.left, box.width), percent(event.clientY, box.top, box.height)];
    send(starts ? 'trace-start' : 'point', point);
    last = event.timeStamp;
  }
  pad.addEventListener('pointerdown', event => {
    if (pointer !== undefined || event.button !== 0) return;
    pointer = event.pointerId;
    pad.setPointerCapture(pointer);
    trace(event, true);
  });
  pad.addEventListener('pointermove', trace);
  pad.addEventListener('pointerup', trace);
  pad.addEventListener('lostpointercapture', () => {
    if (pointer === undefined) return;
    pointer = undefined;
    send('trace-end');
  });
  pad.addEventListener('keydown', event => {
    if (/^[1-4]$/.test(event.key)) send(event.key === '1' ? 'trace-start' : 'point', TRACE[Number(event.key) - 1]);
  });
  function paint(count) {
    if (count === progress) return;
    progress = count;
    context.clearRect(0, 0, 320, 320);
    context.strokeStyle = '#342337';
    context.lineWidth = 16;
    context.lineJoin = 'round';
    context.beginPath();
    for (const [x, y] of TRACE) context.lineTo(x * 3.2, y * 3.2);
    context.stroke();
    context.font = '900 24px system-ui';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    TRACE.forEach(([x, y], index) => {
      const cx = x * 3.2;
      const cy = y * 3.2;
      context.fillStyle = index < count ? '#22564a' : '#342337';
      context.fillRect(cx - 22, cy - 22, 44, 44);
      context.fillStyle = '#fff5dc';
      context.fillText(String(index + 1), cx, cy);
    });
  }
  return { setEnabled(value) { pad.disabled = !value; }, update: paint };
}
