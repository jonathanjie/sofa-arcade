import test from 'node:test';
import assert from 'node:assert/strict';
import { createTutorial, TUTORIAL_LESSONS } from './tutorial.mjs';

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('tutorial is gated by meaningful local actions, resumes, and never sends real commands', () => {
  const storage = memoryStorage();
  let commands = 0;
  const ctx = { submit: () => { commands += 1; } };
  const tutorial = createTutorial({ storage });
  const act = (action, dataset = {}) => tutorial.handleAction(action, { dataset }, ctx);
  tutorial.open();
  act('tutorial-next');
  assert.equal(tutorial.getState().step, 0, 'cannot skip an unfinished exercise through next');
  act('tutorial-start');
  act('tutorial-plot', { plot: '2' });
  assert.equal(tutorial.getState().done, false, 'must select the building first');
  act('tutorial-select-build');
  act('tutorial-plot', { plot: '10' });
  assert.equal(tutorial.getState().done, false, 'invalid coordinates are ignored');
  act('tutorial-plot', { plot: '2' });
  assert.equal(tutorial.getState().done, true);
  act('tutorial-next');
  act('tutorial-work');
  act('tutorial-skip');
  assert.equal(tutorial.getState().open, false);
  tutorial.dispose();
  const resumed = createTutorial({ storage });
  resumed.open();
  assert.equal(resumed.getState().step, 2);
  assert.equal(resumed.getState().done, true);
  assert.equal(commands, 0);
  resumed.dispose();
});

test('all practice lessons are replayable, isolated, and dispose stops changes', () => {
  let notifications = 0;
  const tutorial = createTutorial({ storage: memoryStorage(), onChange: () => { notifications += 1; } });
  const ctx = { submit: () => assert.fail('Practice must not call a real command sender') };
  const act = (action, dataset = {}) => tutorial.handleAction(action, { dataset }, ctx);
  tutorial.open();
  act('tutorial-start');
  act('tutorial-select-build');
  act('tutorial-plot', { plot: '0' });
  const actions = [
    ['tutorial-work'], ['tutorial-street'], ['tutorial-income'],
    ['tutorial-law', { choiceId: 'diversity-parade' }], ['tutorial-seal'], ['tutorial-lobby'],
    ['tutorial-festival'], ['tutorial-score', { scoreId: 'treasury' }],
  ];
  for (const [action, dataset] of actions) {
    act('tutorial-next');
    act(action, dataset);
    assert.equal(tutorial.getState().done, true, action);
  }
  assert.equal(tutorial.getState().step, TUTORIAL_LESSONS.length - 1);
  act('tutorial-finish');
  assert.equal(tutorial.getState().open, false);
  tutorial.open();
  act('tutorial-replay');
  assert.equal(tutorial.getState().step, 0);
  const count = notifications;
  tutorial.dispose();
  tutorial.open();
  act('tutorial-start');
  assert.equal(notifications, count);
  assert.equal(tutorial.getState().open, false);
});

test('corrupt or unavailable tutorial storage cannot prevent practice', () => {
  const tutorial = createTutorial({ storage: { getItem: () => '{bad', setItem: () => { throw Error('disabled'); } } });
  tutorial.open();
  assert.equal(tutorial.getState().step, 0);
  assert.equal(tutorial.getState().open, true);
  tutorial.close();
  tutorial.dispose();
});
