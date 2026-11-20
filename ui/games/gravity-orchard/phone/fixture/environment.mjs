/** Synthetic sensor/lifecycle environment. Never ship or use for compatibility claims. */
class TrackedTarget extends EventTarget {
  #listeners = new Map();
  addEventListener(type, handler, options) {
    if (!handler) return;
    let handlers = this.#listeners.get(type);
    if (!handlers) this.#listeners.set(type, handlers = new Set());
    handlers.add(handler);
    super.addEventListener(type, handler, options);
  }
  removeEventListener(type, handler, options) {
    this.#listeners.get(type)?.delete(handler);
    super.removeEventListener(type, handler, options);
  }
  get listenerCount() {
    return [...this.#listeners.values()].reduce((sum, handlers) => sum + handlers.size, 0);
  }
}

export function createSyntheticEnvironment({ scenario = 'permission', angle = 0 } = {}) {
  let currentTime = 0;
  let nextTimer = 1;
  const timers = new Map();
  const permissionCalls = [];
  const environment = new TrackedTarget();
  const document = new TrackedTarget();
  const orientation = new TrackedTarget();
  document.hidden = false;
  document.visibilityState = 'visible';
  orientation.angle = angle;
  environment.document = document;
  environment.screen = { orientation };
  environment.orientation = angle;
  environment.isSecureContext = scenario !== 'insecure';
  environment.ondeviceorientation = null;
  environment.performance = { now: () => currentTime };
  environment.setTimeout = (callback, delay = 0) => {
    const id = nextTimer++;
    timers.set(id, { at: currentTime + Math.max(0, Number(delay) || 0), callback });
    return id;
  };
  environment.clearTimeout = id => timers.delete(id);
  if (scenario !== 'unsupported') {
    environment.DeviceOrientationEvent = class SyntheticDeviceOrientationEvent {};
    if (scenario !== 'granted') {
      environment.DeviceOrientationEvent.requestPermission = () => {
        // Only call metadata is recorded, never the raw beta/gamma samples.
        permissionCalls.push({ userActivation: Boolean(navigator.userActivation?.isActive) });
        if (scenario === 'rejected') return Promise.reject(new Error('Synthetic browser permission rejection'));
        return Promise.resolve(scenario === 'denied' ? 'denied' : 'granted');
      };
    }
  }

  function advance(milliseconds) {
    const end = currentTime + Math.max(0, Number(milliseconds) || 0);
    let count = 0;
    while (true) {
      const pending = [...timers].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!pending) break;
      if (++count > 10000) throw new Error('Synthetic environment timer loop exceeded bound');
      timers.delete(pending[0]);
      currentTime = Math.max(currentTime, pending[1].at);
      pending[1].callback();
    }
    currentTime = end;
  }

  function sample({ beta = 35, gamma = 0 } = {}) {
    const event = new Event('deviceorientation');
    Object.defineProperties(event, {
      beta: { value: beta }, gamma: { value: gamma }, alpha: { value: null }, absolute: { value: false },
    });
    environment.dispatchEvent(event);
  }

  return {
    environment,
    now: () => currentTime,
    permissionCalls,
    advance,
    sample,
    stableSamples({ beta = 35, gamma = 0, count = 20, stepMs = 50, noise = 0 } = {}) {
      for (let index = 0; index < count; index++) {
        const deviation = noise * [0, .5, -1, .75, -.25][index % 5];
        sample({ beta: beta + deviation, gamma: gamma - deviation });
        advance(stepMs);
      }
    },
    rotate(nextAngle) {
      orientation.angle = nextAngle;
      environment.orientation = nextAngle;
      orientation.dispatchEvent(new Event('change'));
      environment.dispatchEvent(new Event('orientationchange'));
    },
    setHidden(hidden) {
      document.hidden = Boolean(hidden);
      document.visibilityState = hidden ? 'hidden' : 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
    },
    blur() { environment.dispatchEvent(new Event('blur')); },
    focus() { environment.dispatchEvent(new Event('focus')); },
    pagehide() { environment.dispatchEvent(new Event('pagehide')); },
    stats() {
      return {
        listenerCount: environment.listenerCount + document.listenerCount + orientation.listenerCount,
        timerCount: timers.size, permissionCalls: permissionCalls.length, time: currentTime,
        hidden: document.hidden, angle: orientation.angle,
      };
    },
  };
}
