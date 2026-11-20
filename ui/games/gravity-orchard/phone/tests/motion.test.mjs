import test from 'node:test';
import assert from 'node:assert/strict';
import { createMotionController } from '../motion.mjs';
import { MOTION_TUNING as T } from '../tuning.mjs';
import { createSensorEnvironment } from './sensor-environment.mjs';

const SAFE = { x: 0, y: 0, brake: true };
function make(options) {
  const fake = createSensorEnvironment(options);
  const inputs = [], statuses = [];
  const controller = createMotionController({
    emitInput: value => inputs.push(value), onStatus: value => statuses.push(value),
    environment: fake.environment, now: fake.now,
  });
  return {
    ...fake, fake, inputs, statuses, controller,
    get input() { return inputs.at(-1); }, get status() { return statuses.at(-1); },
  };
}
async function ready(options, { beta = 0, gamma = 0 } = {}) {
  const setup = make(options);
  assert.equal(await setup.controller.requestPermissionFromGesture(), true);
  setup.fake.sample(beta, gamma);
  setup.fake.advance(T.calibrationStableMs);
  assert.equal(setup.status.state, 'ready');
  assert.deepEqual(setup.input, SAFE, 'calibration completion cannot steer');
  assert.equal(setup.controller.resume(), true);
  return setup;
}
function checkInputs(values) {
  for (const value of values) {
    assert.deepEqual(Object.keys(value).sort(), ['brake', 'x', 'y']);
    assert.ok(Number.isFinite(value.x) && Math.abs(value.x) <= 1);
    assert.ok(Number.isFinite(value.y) && Math.abs(value.y) <= 1);
    assert.ok(Math.hypot(value.x, value.y) <= 1.0001);
    assert.equal(typeof value.brake, 'boolean');
  }
}

test('insecure origins give an immediate complete touch path without asking permission', async () => {
  const s = make({ secure: false });
  assert.equal(s.status.state, 'insecure');
  assert.equal(await s.controller.requestPermissionFromGesture(), false);
  assert.equal(s.fake.permissionCalls, 0);
  s.controller.setMode('touch');
  assert.equal(s.status.state, 'ready');
  assert.equal(s.controller.resume(), true);
  s.controller.setTouchVector(1, 1);
  assert.deepEqual(s.input, { x: 0.7071, y: 0.7071, brake: false });
  s.controller.setBrake(true);
  assert.deepEqual(s.input, { x: 0.7071, y: 0.7071, brake: true });
  s.controller.setTouchVector(-1, -0.2);
  assert.ok(s.input.x < 0 && s.input.y < 0 && s.input.brake);
  s.controller.setBrake(false);
  assert.equal(s.input.brake, false);
  checkInputs(s.inputs);
  s.controller.dispose();
});

test('unsupported devices never try to install a sensor listener', async () => {
  const s = make({ supported: false });
  assert.equal(s.status.state, 'unsupported');
  assert.equal(await s.controller.requestPermissionFromGesture(), false);
  assert.equal(s.fake.environment.listenerCount('deviceorientation'), 0);
  s.controller.setMode('touch');
  assert.equal(s.controller.resume(), true);
  s.controller.dispose();
});

test('platform permission is requested synchronously in the invoking gesture, once while pending', async () => {
  let resolvePermission;
  const s = make({ permission: () => new Promise(resolve => { resolvePermission = resolve; }) });
  const pending = s.controller.requestPermissionFromGesture();
  assert.equal(s.fake.permissionCalls, 1, 'no microtask/await before requestPermission');
  assert.equal(s.controller.requestPermissionFromGesture(), pending);
  assert.equal(s.fake.permissionCalls, 1);
  assert.equal(s.status.state, 'needs-permission');
  resolvePermission('granted');
  assert.equal(await pending, true);
  assert.equal(s.status.state, 'calibrating');
  assert.equal(s.status.calibrated, false);
  s.controller.dispose();
});

for (const [name, permission] of [
  ['denial', () => 'denied'],
  ['rejected promise', () => Promise.reject(new Error('blocked'))],
  ['synchronous rejection', () => { throw new Error('blocked'); }],
]) {
  test(`${name} offers touch and does not reprompt in a loop`, async () => {
    const s = make({ permission });
    assert.equal(await s.controller.requestPermissionFromGesture(), false);
    assert.equal(s.status.state, 'denied');
    assert.equal(await s.controller.requestPermissionFromGesture(), false);
    assert.equal(s.fake.permissionCalls, 1);
    assert.deepEqual(s.input, SAFE);
    s.controller.setMode('touch');
    assert.equal(s.controller.resume(), true);
    s.controller.setTouchVector(0.3, 0.5);
    assert.deepEqual(s.input, { x: 0.3, y: 0.5, brake: false });
    s.controller.dispose();
  });
}

test('browsers without the permission method still require an actual finite reading', async () => {
  const s = make();
  delete s.fake.environment.DeviceOrientationEvent.requestPermission;
  await s.controller.requestPermissionFromGesture();
  assert.equal(s.status.state, 'calibrating');
  assert.equal(s.controller.resume(), false);
  s.fake.advance(T.firstSampleTimeoutMs);
  assert.equal(s.status.state, 'no-samples');
  assert.deepEqual(s.input, SAFE);
  s.controller.dispose();
});

test('granted permission without readings times out safely and explicit recenter can retry', async () => {
  const s = make();
  await s.controller.requestPermissionFromGesture();
  s.fake.advance(T.firstSampleTimeoutMs - 1);
  assert.equal(s.status.state, 'calibrating');
  s.fake.advance(1);
  assert.equal(s.status.state, 'no-samples');
  assert.equal(s.fake.environment.listenerCount('deviceorientation'), 0);
  assert.equal(s.fake.pendingTimers, 0);
  assert.equal(s.controller.calibrate(), true);
  s.fake.sample(37, 4);
  s.fake.advance(T.calibrationStableMs);
  assert.equal(s.status.state, 'ready');
  assert.equal(s.fake.permissionCalls, 1);
  assert.deepEqual(s.input, SAFE);
  s.controller.dispose();
});

test('null, wrong-type, nonfinite and out-of-range samples never establish readiness', async () => {
  const s = make();
  await s.controller.requestPermissionFromGesture();
  for (const [beta, gamma] of [[null, null], [undefined, 0], [NaN, 0], [0, Infinity], ['0', 0], [181, 0], [0, 91]]) {
    s.fake.sample(beta, gamma);
    s.fake.advance(100);
    assert.equal(s.status.calibrated, false);
    assert.deepEqual(s.input, SAFE);
  }
  s.fake.advance(T.firstSampleTimeoutMs);
  assert.equal(s.status.state, 'no-samples');
  checkInputs(s.inputs);
  s.controller.dispose();
});

test('a comfortable noisy neutral calibrates without assuming the phone is flat', async () => {
  const s = make();
  await s.controller.requestPermissionFromGesture();
  for (let i = 0; i < 12; ++i) {
    s.fake.sample(47 + (i % 2 ? 0.3 : -0.3), 8 + (i % 3 - 1) * 0.2);
    s.fake.advance(50);
  }
  assert.equal(s.status.state, 'ready');
  assert.deepEqual(s.input, SAFE);
  s.controller.resume();
  s.fake.sample(47.5, 8.4);
  s.fake.advance(1000);
  assert.deepEqual(s.input, { x: 0, y: 0, brake: false }, 'natural holding noise stays in dead zone');
  s.fake.sample(62, 8);
  s.fake.advance(1000);
  assert.ok(s.input.y > 0.4 && s.input.y < 0.7, 'deliberate relative forward tilt steers down');
  checkInputs(s.inputs);
  s.controller.dispose();
});

test('a finite sample followed by an unchanged hold can finish calibration', async () => {
  const s = await ready(undefined, { beta: 32, gamma: -5 });
  s.fake.advance(60000);
  assert.equal(s.status.state, 'ready');
  assert.equal(s.status.calibrated, true);
  assert.deepEqual(s.input, { x: 0, y: 0, brake: false });
  assert.equal(s.fake.pendingTimers, 0, 'no sensor or transport heartbeat timer is kept running');
  s.controller.dispose();
});

test('unstable calibration restarts its hold window and has a bounded retry timeout', async () => {
  const s = make();
  await s.controller.requestPermissionFromGesture();
  for (let i = 0; i < 40; ++i) {
    s.fake.sample(i % 2 ? 35 : 55, 0);
    s.fake.advance(200);
  }
  assert.equal(s.status.state, 'no-samples');
  assert.equal(s.status.reason, 'unstable');
  assert.equal(s.fake.pendingTimers, 0);
  assert.deepEqual(s.input, SAFE);
  s.controller.dispose();
});

test('invalid sample during the stable window cannot count as a good held pose', async () => {
  const s = make();
  await s.controller.requestPermissionFromGesture();
  s.fake.sample(40, 0);
  s.fake.advance(500);
  s.fake.sample(null, null);
  s.fake.advance(200);
  assert.equal(s.status.state, 'calibrating');
  assert.equal(s.status.calibrated, false);
  s.fake.sample(42, 0);
  s.fake.advance(T.calibrationStableMs);
  assert.equal(s.status.state, 'ready');
  s.controller.dispose();
});

for (const [angle, expected] of [[0, [1, 0]], [90, [0, -1]], [180, [-1, 0]], [270, [0, 1]], [-90, [0, 1]], [360, [1, 0]]]) {
  test(`screen angle ${angle} maps device-right tilt to the expected screen vector`, async () => {
    const s = await ready({ angle });
    s.fake.sample(0, 25);
    s.fake.advance(1500);
    assert.deepEqual(s.input, { x: expected[0], y: expected[1], brake: false });
    s.fake.sample(25, 0);
    s.fake.advance(1500);
    assert.deepEqual(s.input, { x: -expected[1] || 0, y: expected[0], brake: false },
      'device-forward tilt rotates into the matching screen direction');
    checkInputs(s.inputs);
    s.controller.dispose();
  });
}

test('beta wrap and physically equivalent gamma/beta Euler branches remain continuous', async () => {
  const beta = await ready(undefined, { beta: 179, gamma: 0 });
  beta.fake.sample(-179, 0);
  beta.fake.advance(1000);
  assert.deepEqual(beta.input, { x: 0, y: 0, brake: false }, 'two degrees across beta wrap stays dead-zoned');
  beta.controller.dispose();

  const gamma = await ready(undefined, { beta: 30, gamma: 89 });
  // A smooth gravity path across the Euler branch: beta flips to 150 and
  // gamma to -89 (alpha changes too but is deliberately unused).
  gamma.fake.sample(150, -89, { alpha: 180 });
  gamma.fake.advance(1000);
  assert.deepEqual(gamma.input, { x: 0, y: 0, brake: false });
  gamma.fake.sample(150, -89, { alpha: 0 });
  gamma.fake.advance(1000);
  assert.deepEqual(gamma.input, { x: 0, y: 0, brake: false }, 'compass heading does not affect output');
  gamma.controller.dispose();
});

test('calibration itself tolerates an Euler branch crossing without averaging a false neutral', async () => {
  const s = make();
  await s.controller.requestPermissionFromGesture();
  for (let i = 0; i < 12; ++i) {
    s.fake.sample(i % 2 ? 150 : 30, i % 2 ? -89.7 : 89.7);
    s.fake.advance(50);
  }
  assert.equal(s.status.state, 'ready');
  s.controller.resume();
  s.fake.sample(150, -89.7);
  s.fake.advance(1000);
  assert.deepEqual(s.input, { x: 0, y: 0, brake: false });
  s.controller.dispose();
});

test('even vertical/face-down neutral poses produce finite bounded controls', async () => {
  for (const pose of [{ beta: 90, gamma: 0 }, { beta: -90, gamma: 0 }, { beta: 180, gamma: 0 }]) {
    const s = await ready(undefined, pose);
    s.fake.sample(pose.beta === 180 ? 160 : pose.beta - 20, 20);
    s.fake.advance(1000);
    checkInputs(s.inputs);
    s.controller.dispose();
  }
});

test('filtering is bounded, settles the last event, then holds it without a false disconnection', async () => {
  const s = await ready();
  s.fake.sample(0, 25);
  s.fake.advance(16);
  assert.ok(s.input.x > 0 && s.input.x < 0.3, 'single sudden reading is low-pass filtered');
  s.fake.advance(1500);
  assert.deepEqual(s.input, { x: 1, y: 0, brake: false });
  const count = s.inputs.length;
  s.fake.advance(120000);
  assert.equal(s.status.state, 'ready');
  assert.deepEqual(s.input, { x: 1, y: 0, brake: false });
  assert.equal(s.inputs.length, count, 'heartbeat is GO2 responsibility, not sensor polling');
  s.controller.setBrake(true);
  assert.deepEqual(s.input, { x: 1, y: 0, brake: true });
  s.controller.setBrake(false);
  assert.deepEqual(s.input, { x: 1, y: 0, brake: false });
  s.controller.dispose();
});

test('recenter neutralises immediately and cannot create a force spike or auto-resume', async () => {
  const s = await ready();
  s.fake.sample(15, 17);
  s.fake.advance(1000);
  assert.ok(Math.hypot(s.input.x, s.input.y) > 0.4);
  const start = s.inputs.length;
  const statusStart = s.statuses.length;
  s.controller.calibrate();
  assert.deepEqual(s.input, SAFE);
  assert.ok(s.statuses.slice(statusStart).some(status => status.requestPause === true && status.reason === 'recenter'));
  s.fake.sample(15, 17);
  s.fake.advance(T.calibrationStableMs);
  assert.equal(s.status.state, 'ready');
  assert.ok(s.inputs.slice(start).every(value => value.x === 0 && value.y === 0 && value.brake));
  s.controller.setBrake(false);
  assert.deepEqual(s.input, SAFE, 'release cannot disarm calibration safety');
  s.controller.resume();
  s.fake.advance(1000);
  assert.deepEqual(s.input, { x: 0, y: 0, brake: false });
  s.controller.dispose();
});

test('foreground recenter can use an uninterrupted held sample without requiring artificial movement', async () => {
  const s = await ready(undefined, { beta: 39, gamma: 6 });
  s.fake.sample(39, 22);
  s.fake.advance(30000);
  assert.ok(s.input.x > 0.2);
  s.controller.calibrate();
  assert.deepEqual(s.input, SAFE);
  s.fake.advance(T.calibrationStableMs);
  assert.equal(s.status.state, 'ready');
  assert.equal(s.status.calibrated, true);
  assert.deepEqual(s.input, SAFE);
  s.controller.resume();
  s.fake.advance(1000);
  assert.deepEqual(s.input, { x: 0, y: 0, brake: false });
  s.controller.dispose();
});

test('rotation pauses once and requires a fresh recenter before remapped steering', async () => {
  const s = await ready();
  s.fake.sample(0, 25);
  s.fake.advance(1000);
  s.fake.rotate(90);
  assert.equal(s.status.state, 'paused');
  assert.equal(s.status.reason, 'rotation');
  assert.equal(s.status.requestPause, true);
  assert.equal(s.status.calibrated, false);
  assert.deepEqual(s.input, SAFE);
  assert.equal(s.controller.resume(), false);
  const statusCount = s.statuses.length;
  s.fake.environment.dispatch('orientationchange');
  assert.equal(s.statuses.length, statusCount, 'duplicate modern/legacy rotation notifications are deduplicated');
  s.controller.calibrate();
  s.fake.sample(0, 0);
  s.fake.advance(T.calibrationStableMs);
  s.controller.resume();
  s.fake.sample(0, 25);
  s.fake.advance(1500);
  assert.deepEqual(s.input, { x: 0, y: -1, brake: false });
  s.controller.dispose();
});

test('hidden page detaches capture, clears pending forces and never silently resumes', async () => {
  const s = await ready();
  s.fake.sample(0, 25);
  s.fake.advance(16);
  s.fake.hide();
  assert.equal(s.fake.environment.listenerCount('deviceorientation'), 0);
  assert.equal(s.fake.pendingTimers, 0);
  assert.deepEqual(s.input, SAFE);
  assert.equal(s.status.requestPause, true);
  s.fake.sample(0, -25);
  s.fake.advance(5000);
  assert.deepEqual(s.input, SAFE);
  s.fake.show();
  assert.deepEqual(s.input, SAFE);
  assert.equal(s.controller.resume(), false, 'pre-hide pose cannot arm a resumed match');
  s.controller.calibrate();
  s.fake.advance(T.firstSampleTimeoutMs);
  assert.equal(s.status.state, 'no-samples', 'must receive a post-hide finite reading');
  s.controller.calibrate();
  s.fake.sample(42, 0);
  s.fake.advance(T.calibrationStableMs);
  assert.equal(s.controller.resume(), true);
  s.controller.dispose();
});

test('blur/pagehide block force and foreground focus alone cannot restore it', async () => {
  for (const event of ['blur', 'pagehide']) {
    const s = await ready();
    s.fake.environment.dispatch(event);
    assert.deepEqual(s.input, SAFE);
    assert.equal(s.status.reason, event);
    assert.equal(s.fake.pendingTimers, 0);
    s.fake.environment.dispatch('focus');
    assert.deepEqual(s.input, SAFE);
    assert.equal(s.controller.resume(), false);
    s.controller.dispose();
  }
});

test('explicit pause preserves neutral while clearing touch/Brake latches and calibration can finish paused', async () => {
  const s = await ready();
  s.controller.pause();
  assert.equal(s.status.calibrated, true);
  assert.equal(s.status.requestPause, false);
  assert.deepEqual(s.input, SAFE);
  s.controller.calibrate();
  s.controller.pause();
  s.fake.sample(35, 0);
  s.fake.advance(T.calibrationStableMs);
  assert.equal(s.status.state, 'ready');
  assert.deepEqual(s.input, SAFE);
  s.controller.setMode('touch');
  s.controller.resume();
  s.controller.setTouchVector(0.4, -0.2);
  s.controller.setBrake(true);
  s.controller.pause();
  s.controller.setBrake(false);
  s.controller.setTouchVector(1, 1);
  assert.deepEqual(s.input, SAFE);
  s.controller.resume();
  assert.deepEqual(s.input, { x: 0, y: 0, brake: false }, 'old drag cannot survive resume');
  s.controller.dispose();
});

test('a newly invalid sensor stream pauses; quiet but valid stationary sensors do not', async () => {
  const s = await ready();
  s.fake.sample(0, 25);
  s.fake.advance(1500);
  s.fake.sample(null, null);
  assert.equal(s.status.state, 'no-samples');
  assert.equal(s.status.reason, 'invalid-sample');
  assert.equal(s.status.requestPause, true);
  assert.deepEqual(s.input, SAFE);
  assert.equal(s.fake.pendingTimers, 0);
  s.controller.dispose();
});

test('late permission callbacks cannot re-enable tilt after touch, hidden page or disposal', async () => {
  for (const action of ['touch', 'hidden', 'dispose']) {
    let resolvePermission;
    const s = make({ permission: () => new Promise(resolve => { resolvePermission = resolve; }) });
    const pending = s.controller.requestPermissionFromGesture();
    if (action === 'touch') s.controller.setMode('touch');
    else if (action === 'hidden') s.fake.hide();
    else s.controller.dispose();
    const statuses = s.statuses.length, inputs = s.inputs.length;
    resolvePermission('granted');
    assert.equal(await pending, false);
    assert.equal(s.statuses.length, statuses);
    assert.equal(s.inputs.length, inputs);
    assert.equal(s.fake.environment.listenerCount('deviceorientation'), 0);
    assert.equal(s.fake.pendingTimers, 0);
    s.controller.dispose();
  }
});

test('disposal removes every listener/timer and ignores repeated disposal and late events', async () => {
  const s = await ready();
  s.fake.sample(10, 10);
  assert.ok(s.fake.pendingTimers > 0);
  s.controller.dispose();
  assert.deepEqual(s.input, SAFE);
  assert.equal(s.status.reason, 'disposed');
  assert.equal(s.fake.pendingTimers, 0);
  assert.equal(s.fake.listenerCount, 0);
  const inputCount = s.inputs.length, statusCount = s.statuses.length;
  s.controller.dispose();
  s.controller.calibrate();
  s.controller.setTouchVector(1, 1);
  s.controller.setBrake(false);
  s.controller.pause();
  assert.equal(s.controller.resume(), false);
  assert.equal(await s.controller.requestPermissionFromGesture(), false);
  s.fake.sample(50, 50);
  s.fake.rotate(180);
  s.fake.hide();
  s.fake.advance(60000);
  assert.equal(s.inputs.length, inputCount);
  assert.equal(s.statuses.length, statusCount);
});

test('unknown modes and malformed touch inputs fail safely, with no extra input metadata', () => {
  const s = make();
  assert.throws(() => s.controller.setMode('accelerometer'), TypeError);
  s.controller.setMode('touch');
  s.controller.resume();
  s.controller.setTouchVector(Infinity, 0);
  assert.deepEqual(s.input, SAFE);
  assert.equal(s.status.requestPause, true);
  s.controller.resume();
  s.controller.setBrake('false');
  assert.deepEqual(s.input, SAFE);
  checkInputs(s.inputs);
  assert.ok(s.statuses.every(status => !('beta' in status) && !('gamma' in status) && !('alpha' in status)));
  s.controller.dispose();
});
