import assert from 'node:assert/strict';
import test from 'node:test';
import { createSensorDiagnostic } from '../diagnostic.mjs';

function fakeEnvironment(options = {}) {
  const listeners = new Map(); const documentListeners = new Map(); const timers = new Map(); let next = 1;
  const environment = {
    isSecureContext: true,
    location: { protocol: 'https:' },
    DeviceOrientationEvent: class {},
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    setTimeout(fn) { const id = next++; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    document: {
      visibilityState: 'visible',
      addEventListener(type, fn) { documentListeners.set(type, fn); },
      removeEventListener(type) { documentListeners.delete(type); },
    },
    ...options,
  };
  return {
    environment, timers, listeners, documentListeners,
    emit(event) { for (const fn of listeners.get('deviceorientation') || []) fn(event); },
    timeout() { for (const fn of [...timers.values()]) fn(); },
    hide() { environment.document.visibilityState = 'hidden'; documentListeners.get('visibilitychange')?.(); },
  };
}

test('insecure and unsupported contexts do not request permission or attach probes', async () => {
  let asked = 0;
  for (const overrides of [{ isSecureContext: false }, { DeviceOrientationEvent: null }]) {
    const f = fakeEnvironment({ DeviceOrientationEvent: { requestPermission() { asked++; } }, ...overrides });
    const probe = createSensorDiagnostic({ environment: f.environment, source: 'simulated' });
    await probe.startFromGesture();
    assert.equal(probe.getState().status, overrides.isSecureContext === false ? 'insecure' : 'unsupported');
    assert.equal(f.timers.size, 0); assert.equal(f.listeners.size, 0); probe.dispose();
  }
  assert.equal(asked, 0);
});

test('permission request executes synchronously before status callbacks or async work', async () => {
  const calls = [];
  const f = fakeEnvironment({ DeviceOrientationEvent: { requestPermission() { calls.push('permission'); return Promise.resolve('granted'); } } });
  const probe = createSensorDiagnostic({ environment: f.environment, source: 'simulated', onStatus() { calls.push('status'); } });
  calls.length = 0;
  const pending = probe.startFromGesture();
  assert.equal(calls[0], 'permission');
  assert.equal(probe.getState().status, 'awaiting-permission');
  await pending; assert.equal(probe.getState().status, 'waiting'); assert.equal(probe.getState().sampleCount, 0); probe.dispose();
});

test('denial, rejection and a synchronous permission error stay distinct from readings', async () => {
  for (const requestPermission of [() => Promise.resolve('denied'), () => Promise.reject(new Error('secret path')), () => { throw new Error('secret path'); }]) {
    const f = fakeEnvironment({ DeviceOrientationEvent: { requestPermission } });
    const events = []; const probe = createSensorDiagnostic({ environment: f.environment, source: 'simulated', onStatus: (state) => events.push(state) });
    await probe.startFromGesture();
    assert.ok(['denied', 'error'].includes(probe.getState().status));
    assert.equal(probe.getState().sampleCount, 0); assert.equal(f.timers.size, 0);
    assert.ok(!JSON.stringify(events).includes('secret')); probe.dispose();
  }
});

test('finite beta/gamma are required; null, infinity, numeric strings and impossible angles do not count', async () => {
  const f = fakeEnvironment(); const probe = createSensorDiagnostic({ environment: f.environment, source: 'simulated' });
  await probe.startFromGesture();
  for (const event of [{ beta: null, gamma: 0 }, { beta: Infinity, gamma: 0 }, { beta: 0, gamma: NaN }, { beta: '0', gamma: 0 }, { beta: 181, gamma: 0 }, { beta: 0, gamma: 91 }]) f.emit(event);
  assert.equal(probe.getState().sampleCount, 0); f.timeout(); assert.equal(probe.getState().status, 'no-samples');
  assert.equal(f.listeners.get('deviceorientation').size, 0); probe.dispose();
});

test('synthetic events cannot establish browser evidence; simulated runs are explicitly labelled', async () => {
  const f = fakeEnvironment(); const actual = createSensorDiagnostic({ environment: f.environment });
  await actual.startFromGesture(); f.emit({ beta: 0, gamma: 0, isTrusted: false });
  assert.equal(actual.getState().evidence, 'synthetic'); assert.equal(actual.getState().sampleCount, 0);
  f.emit({ beta: 0, gamma: 0, isTrusted: true });
  assert.equal(actual.getState().evidence, 'browser-dispatched'); assert.equal(actual.getState().sampleCount, 1);
  assert.equal(actual.getState().status, 'samples-received'); assert.equal(f.timers.size, 0); actual.dispose();
  const simulated = createSensorDiagnostic({ environment: f.environment, source: 'simulated' });
  await simulated.startFromGesture(); f.emit({ beta: 4, gamma: 7, isTrusted: true });
  assert.equal(simulated.getState().source, 'simulated'); assert.equal(simulated.getState().evidence, 'synthetic');
  assert.equal(simulated.getState().sampleCount, 1);
  assert.deepEqual(Object.keys(simulated.getState()).sort(), ['schemaVersion', 'source', 'httpsLoaded', 'secureContext', 'permission', 'status', 'evidence', 'sampleCount'].sort());
  simulated.dispose();
});

test('visibility loss fences pending permission, stops readings and requires another gesture', async () => {
  let resolve;
  const f = fakeEnvironment({ DeviceOrientationEvent: { requestPermission() { return new Promise((r) => { resolve = r; }); } } });
  const probe = createSensorDiagnostic({ environment: f.environment, source: 'simulated' });
  const pending = probe.startFromGesture(); f.hide(); resolve('granted'); await pending;
  assert.equal(probe.getState().status, 'paused'); assert.equal(f.listeners.size, 0); assert.equal(f.timers.size, 0);
  probe.dispose();
});

test('repeated start/stop and dispose remove only owned listeners and late work', async () => {
  const f = fakeEnvironment(); let updates = 0;
  const probe = createSensorDiagnostic({ environment: f.environment, source: 'simulated', onStatus() { updates++; } });
  await probe.startFromGesture(); await probe.startFromGesture(); assert.equal(f.listeners.get('deviceorientation').size, 1); assert.equal(f.timers.size, 1);
  probe.stop(); assert.equal(f.timers.size, 0); assert.equal(f.listeners.get('deviceorientation').size, 0);
  await probe.startFromGesture(); probe.dispose(); probe.dispose(); const before = updates;
  f.emit({ beta: 0, gamma: 0 }); f.timeout(); await probe.startFromGesture();
  assert.equal(updates, before); assert.equal(f.timers.size, 0); assert.equal(f.documentListeners.size, 0); assert.equal(probe.getState().status, 'disposed');
});

test('HTTP loopback eligibility is reported separately from HTTPS loading', async () => {
  const f = fakeEnvironment({ location: { protocol: 'http:' }, isSecureContext: true });
  const probe = createSensorDiagnostic({ environment: f.environment, source: 'simulated' });
  await probe.startFromGesture(); assert.equal(probe.getState().httpsLoaded, false); assert.equal(probe.getState().secureContext, true);
  probe.dispose();
});

test('a completed permission result after disposal cannot attach listeners', async () => {
  let resolve;
  const f = fakeEnvironment({ DeviceOrientationEvent: { requestPermission() { return new Promise((r) => { resolve = r; }); } } });
  const probe = createSensorDiagnostic({ environment: f.environment, source: 'simulated' });
  const pending = probe.startFromGesture(); probe.dispose(); resolve('granted'); await pending;
  assert.equal(f.listeners.size, 0); assert.equal(f.timers.size, 0); assert.equal(probe.getState().status, 'disposed');
});
