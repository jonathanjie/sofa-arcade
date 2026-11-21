/* Browser-only, local diagnostic. No network, storage, calibration or gameplay.
 * Finite samples are counted; raw sensor values are never retained or exported. */
export function createSensorDiagnostic({ environment = globalThis, onStatus = () => {}, source = 'browser', timeoutMs = 8000 } = {}) {
  if (!['browser', 'simulated'].includes(source) || !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw new TypeError('Invalid diagnostic configuration.');
  const doc = environment.document;
  let state = {
    schemaVersion: 1,
    source,
    httpsLoaded: environment.location?.protocol === 'https:',
    secureContext: environment.isSecureContext === true,
    permission: 'unrequested',
    status: 'idle',
    evidence: 'none',
    sampleCount: 0,
  };
  let generation = 0;
  let disposed = false;
  let listening = false;
  let timer = null;

  function snapshot() { return { ...state }; }
  function publish(patch) {
    if (disposed) return;
    state = { ...state, ...patch };
    try { onStatus(snapshot()); } catch { /* Diagnostics never surface callback error contents. */ }
  }
  function clearProbe() {
    if (timer !== null) environment.clearTimeout(timer);
    timer = null;
    if (listening) environment.removeEventListener('deviceorientation', onOrientation);
    listening = false;
  }
  function onOrientation(event) {
    if (disposed || !listening || doc?.visibilityState === 'hidden') return;
    if (typeof event.beta !== 'number' || typeof event.gamma !== 'number' || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma) || event.beta < -180 || event.beta > 180 || event.gamma < -90 || event.gamma > 90) return;
    const browserEvent = source === 'browser' && event.isTrusted === true;
    // Synthetic DOM events never establish a real-browser sample claim.
    if (!browserEvent && source === 'browser') { publish({ evidence: 'synthetic' }); return; }
    if (timer !== null) environment.clearTimeout(timer);
    timer = null;
    publish({ status: 'samples-received', evidence: browserEvent ? 'browser-dispatched' : 'synthetic', sampleCount: Math.min(9999, state.sampleCount + 1) });
  }
  function begin(g) {
    if (disposed || g !== generation) return;
    if (doc?.visibilityState === 'hidden') { publish({ status: 'paused' }); return; }
    listening = true;
    environment.addEventListener('deviceorientation', onOrientation);
    publish({ status: 'waiting' });
    timer = environment.setTimeout(() => {
      if (disposed || g !== generation) return;
      clearProbe(); publish({ status: 'no-samples' });
    }, timeoutMs);
  }
  function startFromGesture() {
    if (disposed || state.status === 'awaiting-permission') return Promise.resolve(snapshot());
    clearProbe();
    const g = ++generation;
    state = { ...state, source, httpsLoaded: environment.location?.protocol === 'https:', secureContext: environment.isSecureContext === true, evidence: 'none', sampleCount: 0, permission: 'unrequested' };
    if (!state.secureContext) { publish({ status: 'insecure', permission: 'unavailable' }); return Promise.resolve(snapshot()); }
    const Orientation = environment.DeviceOrientationEvent;
    if (!Orientation || typeof environment.addEventListener !== 'function') { publish({ status: 'unsupported', permission: 'unavailable' }); return Promise.resolve(snapshot()); }
    if (typeof Orientation.requestPermission === 'function') {
      let permission;
      try {
        // This call is intentionally synchronous in the tap call stack, before
        // any promise, status callback, timer, networking or other asynchronous work.
        permission = Orientation.requestPermission();
      } catch {
        publish({ status: 'error', permission: 'error' }); return Promise.resolve(snapshot());
      }
      publish({ status: 'awaiting-permission' });
      return Promise.resolve(permission).then((value) => {
        if (disposed || g !== generation) return snapshot();
        if (value !== 'granted') { publish({ status: 'denied', permission: 'denied' }); return snapshot(); }
        publish({ permission: 'granted' }); begin(g); return snapshot();
      }, () => {
        if (!disposed && g === generation) publish({ status: 'error', permission: 'error' });
        return snapshot();
      });
    }
    publish({ permission: 'not-required' }); begin(g);
    return Promise.resolve(snapshot());
  }
  function stop() {
    if (disposed) return;
    generation++; clearProbe(); publish({ status: 'paused' });
  }
  function visibility() { if (doc?.visibilityState === 'hidden') stop(); }
  function dispose() {
    if (disposed) return;
    generation++; clearProbe(); doc?.removeEventListener?.('visibilitychange', visibility);
    state = { ...state, status: 'disposed' }; disposed = true;
  }
  doc?.addEventListener?.('visibilitychange', visibility);
  publish({ status: state.secureContext ? 'idle' : 'insecure' });
  return Object.freeze({ startFromGesture, stop, getState: snapshot, dispose });
}
