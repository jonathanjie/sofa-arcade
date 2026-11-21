/** Deterministic local test adapter. It is not a browser/device compatibility test. */
export function createSensorEnvironment({ secure = true, supported = true, permission = () => 'granted', angle = 0 } = {}) {
  let time = 0, nextTimer = 0, permissionCalls = 0;
  const timers = new Map();
  function target(extra = {}) {
    const events = new Map();
    return Object.assign(extra, {
      addEventListener(kind, listener) {
        if (!events.has(kind)) events.set(kind, new Set());
        events.get(kind).add(listener);
      },
      removeEventListener(kind, listener) { events.get(kind)?.delete(listener); },
      dispatch(kind, properties = {}) {
        for (const listener of [...(events.get(kind) ?? [])]) listener({ type: kind, ...properties });
      },
      listenerCount(kind) {
        return kind ? (events.get(kind)?.size ?? 0) : [...events.values()].reduce((sum, set) => sum + set.size, 0);
      },
    });
  }
  const document = target({ hidden: false, visibilityState: 'visible' });
  const orientation = target({ angle });
  const environment = target({
    isSecureContext: secure,
    document,
    screen: { orientation },
    DeviceOrientationEvent: supported ? { requestPermission() { ++permissionCalls; return permission(); } } : undefined,
    setTimeout(fn, delay) {
      const id = ++nextTimer;
      timers.set(id, { fn, at: time + delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    performance: { now: () => time },
  });
  return {
    environment, now: () => time,
    get permissionCalls() { return permissionCalls; },
    get pendingTimers() { return timers.size; },
    get listenerCount() { return environment.listenerCount() + document.listenerCount() + orientation.listenerCount(); },
    sample(beta, gamma, extra = {}) { environment.dispatch('deviceorientation', { beta, gamma, ...extra }); },
    hide() { document.hidden = true; document.visibilityState = 'hidden'; document.dispatch('visibilitychange'); },
    show() { document.hidden = false; document.visibilityState = 'visible'; document.dispatch('visibilitychange'); },
    rotate(value) { orientation.angle = value; orientation.dispatch('change'); },
    advance(ms) {
      const end = time + ms;
      let turns = 0;
      while (true) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= end)
          .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        if (++turns > 10000) throw new Error('Unbounded timer work');
        const [id, timer] = due;
        time = timer.at;
        timers.delete(id);
        timer.fn();
      }
      time = end;
    },
  };
}
