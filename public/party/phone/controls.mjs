const ANALOG_INTERVAL_MS = 50;
const clamp = value => Math.max(-1, Math.min(1, value));

function control(root, tag, className, label) {
  const node = root.ownerDocument.createElement(tag);
  node.className = className;
  node.setAttribute('aria-label', label);
  root.append(node);
  return node;
}

export function mountButton(root, { label, onPress }) {
  const button = control(root, 'button', 'party-tap', label);
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', onPress);
  return {
    setEnabled(value) { button.disabled = !value; },
    dispose() { button.remove(); },
  };
}

function analogSampler(onInput) {
  let next;
  let timer;
  return {
    offer(value) {
      next = value;
      if (timer === undefined) {
        timer = setTimeout(() => {
          timer = undefined;
          onInput(next);
        }, ANALOG_INTERVAL_MS);
      }
    },
    clear() {
      clearTimeout(timer);
      timer = undefined;
    },
  };
}

export function mountStick(root, { label = 'Direction', onInput }) {
  const pad = control(root, 'button', 'party-stick', label);
  const sampler = analogSampler(onInput);
  pad.type = 'button';
  pad.textContent = '↑ ↓ ← →';
  const keys = {
    ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
    ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
  };
  let pointer = null;
  const stop = () => {
    pointer = null;
    if (!pad.disabled) sampler.offer({ x: 0, y: 0 });
  };
  function steer(event) {
    if (event.pointerId !== pointer) return;
    const box = pad.getBoundingClientRect();
    const x = clamp(2 * (event.clientX - box.left) / box.width - 1);
    const y = clamp(2 * (event.clientY - box.top) / box.height - 1);
    sampler.offer({ x, y });
  }
  pad.addEventListener('pointerdown', event => {
    if (pad.disabled || pointer !== null || event.button !== 0) return;
    pointer = event.pointerId;
    pad.setPointerCapture(pointer);
    steer(event);
  });
  pad.addEventListener('pointermove', steer);
  pad.addEventListener('lostpointercapture', event => { if (event.pointerId === pointer) stop(); });
  pad.addEventListener('keydown', event => {
    if (pad.disabled || !Object.hasOwn(keys, event.key)) return;
    event.preventDefault();
    sampler.offer(keys[event.key]);
  });
  pad.addEventListener('keyup', event => { if (Object.hasOwn(keys, event.key)) stop(); });
  pad.addEventListener('blur', stop);
  return {
    setEnabled(value) {
      if (pad.disabled === !value) return;
      pad.disabled = !value;
      if (!value) {
        if (pointer !== null && pad.hasPointerCapture(pointer)) pad.releasePointerCapture(pointer);
        pointer = null;
        sampler.clear();
      }
    },
    dispose() { pad.remove(); sampler.clear(); },
  };
}

export function mountSlide(root, { label = 'Position', onInput }) {
  const slider = control(root, 'input', 'party-slider', label);
  slider.type = 'range';
  slider.min = '-1';
  slider.max = '1';
  slider.step = '0.01';
  slider.value = '0';
  const sampler = analogSampler(onInput);
  slider.addEventListener('input', () => sampler.offer(slider.valueAsNumber));
  return {
    setEnabled(value) {
      slider.disabled = !value;
      if (!value) sampler.clear();
    },
    dispose() { slider.remove(); sampler.clear(); },
  };
}

export function mountTilt(root, { onInput }) {
  const view = root.ownerDocument.defaultView;
  const touch = mountStick(root, { label: 'Touch direction', onInput });
  const mode = control(root, 'button', 'party-secondary', 'Enable tilt');
  const sampler = analogSampler(onInput);
  const sensor = view.DeviceOrientationEvent;
  mode.type = 'button';
  mode.textContent = 'Enable tilt';
  mode.hidden = !view.isSecureContext || !sensor;
  let disposed = false;
  let enabled = true;
  let listening = false;
  let asking = false;
  let neutral;
  function updateMode(label) {
    mode.textContent = label;
    mode.setAttribute('aria-label', label);
  }
  function motion(event) {
    if (!enabled || !Number.isFinite(event.gamma) || !Number.isFinite(event.beta)) return;
    if (!neutral) {
      neutral = { beta: event.beta, gamma: event.gamma };
      touch.setEnabled(false);
      updateMode('Use touch');
    }
    const degreesForFullInput = 30;
    sampler.offer({
      x: clamp((event.gamma - neutral.gamma) / degreesForFullInput),
      y: clamp((event.beta - neutral.beta) / degreesForFullInput),
    });
  }
  function stop() {
    const wasTilting = Boolean(neutral);
    view.removeEventListener('deviceorientation', motion);
    sampler.clear();
    listening = false;
    neutral = undefined;
    touch.setEnabled(enabled);
    if (wasTilting && enabled && !disposed) onInput({ x: 0, y: 0 });
  }
  mode.addEventListener('click', async () => {
    if (asking || !enabled || !sensor || mode.hidden) return;
    if (listening) {
      stop();
      updateMode('Enable tilt');
      return;
    }
    asking = true;
    mode.disabled = true;
    let granted = true;
    try {
      if (typeof sensor.requestPermission === 'function') granted = await sensor.requestPermission() === 'granted';
    } catch { granted = false; }
    asking = false;
    if (disposed) return;
    if (granted) {
      listening = true;
      view.addEventListener('deviceorientation', motion);
    }
    updateMode(granted ? 'Cancel tilt' : 'Tilt unavailable');
    mode.disabled = !enabled;
  });
  return {
    setEnabled(value) {
      enabled = value;
      touch.setEnabled(value && !neutral);
      mode.disabled = !value || asking;
      if (!value) {
        sampler.clear();
        neutral = undefined;
        if (listening) updateMode('Cancel tilt');
      }
    },
    dispose() {
      disposed = true;
      stop();
      touch.dispose();
      mode.remove();
    },
  };
}
