/** The real collection shell, TV view and two authenticated rendered controllers. */
import assert from 'node:assert/strict';
import { credentials, closeDialog, noHorizontalOverflow, waitUntil } from './support.mjs';
import { councilCommitments, choosePublicAction } from '../fixtures/odd-laws-policy.mjs';
import { SCENARIOS } from '../fixtures/odd-laws-scenarios.mjs';

const IDS = ['jon', 'lydia'];
const other = id => id === 'jon' ? 'lydia' : 'jon';
const actionPath = code => `/api/rooms/${code}/action`;
const commandResponse = (response, code) => new URL(response.url()).pathname === actionPath(code) && response.request().method() === 'POST';

async function request(run, pathname, { token, body, status = 200 } = {}) {
  run.protectCredential(token);
  const response = await fetch(run.origin + pathname, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { Origin: run.origin, 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(12_000),
  });
  const text = await response.text();
  const value = JSON.parse(text);
  run.protectCredential(value.hostToken);
  run.protectCredential(value.playerToken);
  assert.equal(response.status, status, `${pathname} returns ${status}; received code ${value.code || response.status}`);
  return { value, text };
}

/** Match only facts rendered by this viewer. No DOM test hook exposes authority. */
async function waitForRendered(page, room, playerId = null) {
  const state = room.state;
  const summary = {
    session: state.session, stage: state.stage, activePlayer: state.activePlayer,
    remaining: state.actionsRemaining, ready: state.council?.ready,
    scores: state.result?.scores, playerId,
    players: Object.fromEntries(IDS.map(id => [id, {
      coins: state.players[id].coins, influence: state.players[id].influence,
      buildings: state.players[id].city.filter(Boolean).map(plot => plot.instanceId).sort(),
    }])),
  };
  await waitUntil(() => page.evaluate(expected => {
    const root = document.querySelector(expected.playerId ? '.ols-phone' : '.ols-tv');
    if (!root) return false;
    const session = root.querySelector(expected.playerId ? '.ols-phone-session' : '.ols-tv-session-number');
    if (Number(session?.textContent.trim().split('/')[0]) !== expected.session) return false;
    for (const id of expected.playerId ? [expected.playerId] : ['jon', 'lydia']) {
      const scope = expected.playerId ? root.querySelector('.ols-phone-header') : root.querySelector(`.ols-tv-borough[data-player-id="${id}"]`);
      if (!scope) return false;
      for (const resource of ['coins', 'influence']) {
        if (Number(scope.querySelector(`[data-resource="${resource}"] strong`)?.textContent) !== expected.players[id][resource]) return false;
      }
      if (!expected.playerId) {
        const built = [...scope.querySelectorAll('.ols-city-grid [data-instance-id]')].map(node => node.dataset.instanceId).sort();
        if (JSON.stringify(built) !== JSON.stringify(expected.players[id].buildings)) return false;
      }
    }
    if (expected.stage === 'council') {
      if (expected.playerId) return !!root.querySelector(expected.ready[expected.playerId] ? '.ols-phone-locked' : '.ols-phone-council');
      return ['jon', 'lydia'].every(id => root.querySelector(`.ols-tv-ballot[data-envelope="${id}"]`)?.classList.contains('is-sealed') === expected.ready[id]);
    }
    if (expected.stage === 'actions') {
      if (expected.playerId) {
        const turn = root.querySelector('.ols-phone-turn');
        return !!turn && turn.classList.contains('your-turn') === (expected.activePlayer === expected.playerId) &&
          turn.querySelector('.ols-phone-pips')?.getAttribute('aria-label') === `${expected.remaining[expected.playerId]} actions remaining`;
      }
      return root.querySelector('.ols-tv-borough.is-active')?.dataset.playerId === expected.activePlayer &&
        ['jon', 'lydia'].every(id => root.querySelector(`.ols-tv-borough[data-player-id="${id}"] .ols-tv-pips`)?.getAttribute('aria-label') === `${expected.remaining[id]} city actions remaining`);
    }
    if (expected.stage === 'finished') {
      const table = root.querySelector(expected.playerId ? '.ols-phone-results table' : '.ols-tv-score-table');
      return !!table && [...table.querySelectorAll('tfoot td')].map(node => Number(node.textContent)).join(',') === `${expected.scores.jon},${expected.scores.lydia}`;
    }
    return false;
  }, summary), `Rendered ${playerId || 'TV'} projection at revision ${room.revision}, ${state.stage}`);
}

async function allRendered(live, room) {
  await Promise.all([[live.tv, null], ...IDS.map(id => [live.phones[id], id])].map(([page, id]) => waitForRendered(page, room, id)));
}

async function assertTouchTargets(run, page, selector, expectedCount, name) {
  const controls = await page.evaluate(selector => [...document.querySelectorAll(selector)].map(node => {
    const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
    return {
      action: node.dataset.action, width: rect.width, height: rect.height,
      visible: !!node.getClientRects().length && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0',
    };
  }), selector);
  const visible = controls.filter(control => control.visible);
  (run.evidence.phoneTargets ||= []).push({ name, viewport: page.viewportSize(), controls });
  assert.equal(visible.length, expectedCount, `${name}: expected visible control count; ${JSON.stringify(controls)}`);
  const small = visible.filter(control => control.width < 44 || control.height < 44);
  assert.deepEqual(small, [], `${name}: primary controls must be at least 44×44 CSS pixels`);
}

async function assertTVFits(run, page, name) {
  const bounds = await page.evaluate(() => {
    const rect = document.querySelector('.ols-tv').getBoundingClientRect();
    return { viewport: { width: innerWidth, height: innerHeight }, top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, height: rect.height, scrollY };
  });
  (run.evidence.tvLayouts ||= []).push({ name, ...bounds });
  assert.ok(bounds.top >= -1 && bounds.bottom <= bounds.viewport.height + 1 && bounds.left >= -1 && bounds.right <= bounds.viewport.width + 1,
    `The full TV board including active laws must fit without scrolling (${name}): ${JSON.stringify(bounds)}`);
}

async function assertSealedProjections(run, live, before, first, vote) {
  for (const viewer of ['public', 'host', ...IDS]) {
    const { value, text } = await request(run, `/api/rooms/${live.code}`, { token: live.tokens[viewer] });
    assert.equal(value.state.stage, 'council');
    assert.deepEqual(value.state.council.ready, { jon: first === 'jon', lydia: first === 'lydia' });
    assert.deepEqual(value.state.council.ownCommitment, viewer === first ? vote : null, `${viewer} receives only its own sealed commitment`);
    assert.deepEqual(value.state.lastCouncil, before.state.lastCouncil);
    for (const id of IDS) assert.equal(value.state.players[id].influence, before.state.players[id].influence, 'No bid is spent before both envelopes are sealed');
    for (const token of Object.values(live.tokens)) if (token) assert.ok(!text.includes(token), 'Room projections never serialize credentials');
  }
}

export async function openOddLaws(run, { candidate = false } = {}) {
  const tv = await run.page('tv', { width: 1920, height: 1080 });
  const phones = {
    jon: await run.page('jon', { width: 360, height: 800 }, { isMobile: true, hasTouch: true }),
    lydia: await run.page('lydia', { width: 390, height: 844 }, { isMobile: true, hasTouch: true }),
  };
  await tv.goto(run.origin);
  let code;
  if (candidate) {
    // The collection deliberately remains planned until this candidate passes.
    // Only room creation and initial credential delivery use the real API here.
    // All joining, starting, decisions, tutorial, results and rematches use UI.
    const { value: room } = await request(run, '/api/rooms', { body: { gameId: 'odd-laws-society' }, status: 201 });
    code = room.code;
    await tv.evaluate(({ code, token }) => localStorage.setItem('sofa-room:' + code, JSON.stringify({ hostToken: token, playerTokens: {} })), { code, token: room.hostToken });
    await tv.goto(`${run.origin}/?room=${code}`);
  } else {
    await tv.locator('[data-action="open-game"][data-game="odd-laws-society"]').click();
    await tv.locator('.odd-laws-detail [data-action="create"]').click();
  }
  await tv.locator('.room-code').waitFor();
  code ||= (await tv.locator('.room-code').innerText()).trim();
  const tokens = { host: await credentials(tv, code, 'host') };
  assert.ok(tokens.host);
  await Promise.all(IDS.map(async id => {
    const phone = phones[id];
    await phone.goto(`${run.origin}/?join=${code}&seat=${id}`);
    await phone.locator(`[data-action="claim"][data-player="${id}"]`).click();
    await phone.locator('.waiting-scene').waitFor();
    tokens[id] = await credentials(phone, code, id);
    assert.ok(tokens[id]);
  }));
  assert.ok(tokens.jon !== tokens.lydia && tokens.jon !== tokens.host && tokens.lydia !== tokens.host, 'Host and both controllers use separate authenticated credentials');
  await tv.locator('[data-action="start"]').click();
  const room = await waitUntil(async () => {
    const room = await run.room(code, tokens.host);
    return room.phase === 'playing' ? room : null;
  }, 'Real Odd Laws room starts');
  const live = { tv, phones, tokens, code, room, latency: { tv: [], jon: [], lydia: [] } };
  await allRendered(live, room);
  run.check(candidate ? 'Candidate room created by real authenticated API while catalog stays planned; two ordinary controllers join and TV starts through UI' : 'Playable collection card, host creation, two isolated phone joins and TV start all use the real rendered shell');
  return live;
}

async function clickCommand(run, live, page, selector, policy) {
  const before = live.room;
  const seen = live.observedActionIds ||= new Set();
  const navigations = [];
  let emitted;
  const observe = request => {
    if (emitted || new URL(request.url()).pathname !== actionPath(live.code) || request.method() !== 'POST') return;
    const command = request.postDataJSON();
    if (seen.has(command?.actionId)) return;
    emitted = { command, bytes: request.postData(), startedAt: performance.now() };
  };
  const navigated = frame => {
    if (frame === page.mainFrame()) navigations.push(new URL(frame.url()).pathname);
  };
  page.on('request', observe);
  page.on('framenavigated', navigated);
  // Match the newly emitted command, including its action ID and exact bytes.
  // A delayed response/retry for a previous click must never satisfy this one.
  // Begin reading as soon as the response arrives, before click auto-wait ends.
  const pending = page.waitForResponse(response => commandResponse(response, live.code) && emitted && response.request().postData() === emitted.bytes).then(async response => {
    assert.equal(response.status(), 200, `Rendered command ${emitted.command?.action?.type} must return HTTP 200; received ${response.status()}`);
    try {
      return { room: await response.json(), observation: 'command-response' };
    } catch (error) {
      // Chromium may release the CDP response cache after the real client reads
      // and cancels its stream. This is an observation-only recovery: never
      // replay the action or accept a non-200 response. The fresh authenticated
      // projection must pass the same exact match/revision and render fences.
      if (!/Protocol error \(Network\.getResponseBody\): No data found for resource with given identifier/.test(error.message)) throw error;
      return { room: await run.room(live.code, live.tokens.host), observation: 'http-200-plus-authenticated-get' };
    }
  });
  pending.catch(() => {});
  try {
    await page.locator(selector).click();
    const { room, observation } = await pending;
    assert.ok(emitted && Number.isFinite(emitted.startedAt), 'Latency starts when the browser emits this action request');
    const { command, startedAt } = emitted;
    assert.ok(typeof command.actionId === 'string' && command.actionId, 'Observed command carries a fresh idempotency ID');
    assert.equal(command.revision, before.revision, 'Observed command uses the acknowledged pre-click revision');
    assert.equal(command.action.matchId, before.state.matchId, 'Observed command belongs to this match');
    assert.equal(command.action.phaseId, before.state.phaseId, 'Observed command belongs to this phase');
    assert.equal(room.code, live.code);
    assert.equal(room.state.matchId, command.action.matchId);
    assert.equal(room.revision, command.revision + 1, 'Exactly this one serialized UI command advanced the authority');
    assert.deepEqual(navigations, [], 'A city/voting command must not navigate its controller');
    seen.add(command.actionId);
    (run.evidence.commandObservations ||= []).push({
      actionId: command.actionId, action: command.action.type, policy,
      matchId: command.action.matchId, revisionBefore: command.revision,
      revisionAfter: room.revision, status: 200, observation,
    });
    await Promise.all([[live.tv, 'tv', null], ...IDS.map(id => [live.phones[id], id, id])].map(async ([surface, name, id]) => {
      await waitForRendered(surface, room, id);
      live.latency[name].push({ policy, action: command.action.type, observation, milliseconds: performance.now() - startedAt });
    }));
    live.room = room;
    return { room, command };
  } finally {
    page.off('request', observe);
    page.off('framenavigated', navigated);
  }
}

export async function verifyOddPresentation(run, live) {
  for (const [page, name] of [[live.tv, 'council-tv-1920x1080'], [live.phones.jon, 'council-jon-360x800'], [live.phones.lydia, 'council-lydia-390x844']]) {
    await noHorizontalOverflow(page);
    await run.screenshot(page, name);
  }
  await assertTVFits(run, live.tv, 'council-1920x1080');
  await live.tv.setViewportSize({ width: 1280, height: 720 });
  await noHorizontalOverflow(live.tv);
  await run.screenshot(live.tv, 'council-tv-1280x720');
  await assertTVFits(run, live.tv, 'council-1280x720');
  for (const id of IDS) {
    await assertTouchTargets(run, live.phones[id], '[data-action="phone-law"], [data-action="phone-bid"], [data-action="phone-seal"]', 8, `${id} council`);
    assert.equal(await live.phones[id].locator(`[data-character="${id}"]`).getAttribute('data-character-state'), 'thinking');
  }
  run.check('Real council layouts at 1920×1080/1280×720 and 360×800/390×844; all eight primary voting targets meet 44px minimum');

  // A live OS preference change remounts presentation without replacing the
  // authenticated room/client. No action is submitted during this transition.
  const motionRoom = await run.room(live.code, live.tokens.host);
  for (const [page, role] of [[live.tv, 'host'], [live.phones.jon, 'jon']]) {
    const token = await credentials(page, live.code, role);
    assert.equal(await page.locator('.ols.ols-reduced-motion').count(), 1);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await waitUntil(() => page.evaluate(() => {
      const root = document.querySelector('.ols');
      return !!root && !root.classList.contains('ols-reduced-motion');
    }), `${role} responds to a live motion preference change`);
    await waitForRendered(page, motionRoom, role === 'host' ? null : role);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await waitUntil(() => page.evaluate(() => document.querySelector('.ols')?.classList.contains('ols-reduced-motion')), `${role} restores reduced motion without navigation`);
    await waitForRendered(page, motionRoom, role === 'host' ? null : role);
    assert.ok((await credentials(page, live.code, role)) === token, 'Changing presentation keeps the same authenticated credential');
  }
  const afterMotion = await run.room(live.code, live.tokens.host);
  assert.equal(afterMotion.revision, motionRoom.revision);
  assert.deepEqual(afterMotion.state, motionRoom.state, 'Changing motion preferences never mutates the real game');
  run.check('Live reduced-motion changes update the TV and phone presentation while preserving the acknowledged game and authenticated roles');

  // Shared settings still govern the newly injected score and gesture lifecycle.
  await live.phones.jon.locator('[data-action="audio"]').click();
  assert.equal(await live.phones.jon.getByRole('switch', { name: 'Background music', exact: true }).isDisabled(), true);
  assert.equal(await live.phones.jon.getByRole('switch', { name: 'Sound effects', exact: true }).isChecked(), false);
  await closeDialog(live.phones.jon);
  await live.tv.bringToFront();
  await live.tv.locator('[data-action="audio"]').click();
  await waitUntil(async () => /Playing on this screen/.test(await live.tv.locator('.audio-live-status').innerText()), 'Odd Laws host soundtrack unlocked by a real gesture');
  await live.tv.getByRole('switch', { name: 'Background music', exact: true }).uncheck();
  await live.tv.getByRole('switch', { name: 'Sound effects', exact: true }).uncheck();
  await live.tv.locator('#volume-slider').press('Home');
  for (let index = 0; index < 27; index++) await live.tv.locator('#volume-slider').press('ArrowRight');
  const count = await live.tv.evaluate(() => window.__sofaAcceptanceSseFrames);
  await waitUntil(async () => (await live.tv.evaluate(() => window.__sofaAcceptanceSseFrames)) > count, 'Real heartbeat while Odd Laws audio settings remain focused');
  assert.equal(await live.tv.locator('#volume-slider').evaluate(node => node === document.activeElement), true);
  await closeDialog(live.tv);
  await live.tv.reload();
  await allRendered(live, live.room);
  await live.tv.locator('[data-action="audio"]').click();
  assert.equal(await live.tv.getByRole('switch', { name: 'Background music', exact: true }).isChecked(), false);
  assert.equal(await live.tv.getByRole('switch', { name: 'Sound effects', exact: true }).isChecked(), false);
  assert.equal(await live.tv.locator('#volume-slider').inputValue(), '27');
  await closeDialog(live.tv);
  run.check('Only the host enables background music; real gesture unlock, saved music/effects/volume and focused audio setting survive heartbeat/reload');
}

export async function verifyOddTutorial(run, live) {
  const phone = live.phones.jon;
  const before = await run.room(live.code, live.tokens.host);
  const open = async () => {
    await phone.locator('[data-action="open-help"]').click();
    assert.equal(await phone.locator('[role="dialog"]').count(), 1, 'Help has one owner and one dialog');
    await phone.locator('[data-action="start-tutorial"]').click();
    await phone.locator('.ols-tutorial-dialog').waitFor();
  };
  for (const action of ['open-agenda', 'open-catalog']) {
    await phone.locator(`[data-action="${action}"]`).click();
    await phone.locator('.ols-drawer').waitFor();
    await noHorizontalOverflow(phone);
    await phone.keyboard.press('Escape');
    assert.equal(await phone.locator('.ols-drawer').count(), 0);
    assert.equal(await phone.locator(`[data-action="${action}"]`).evaluate(node => node === document.activeElement), true);
  }
  await open();
  await phone.locator('[data-action="tutorial-skip"]').click();
  assert.equal((await run.room(live.code, live.tokens.host)).revision, before.revision);
  await open();
  await phone.locator('[data-action="tutorial-start"]').click();
  await phone.locator('[data-action="tutorial-select-build"]').click();
  await phone.locator('[data-action="tutorial-plot"][data-plot="0"]').click();
  await phone.locator('[data-action="tutorial-next"]').click();
  for (const action of ['tutorial-work', 'tutorial-street', 'tutorial-income']) {
    await phone.locator(`[data-action="${action}"]`).click();
    if (action === 'tutorial-income') {
      // The acknowledged real match and scripted lesson both survive refresh.
      await phone.reload();
      await waitForRendered(phone, live.room, 'jon');
      await open();
      assert.equal(await phone.locator('.ols-tutorial-progress').getAttribute('aria-label'), 'Lesson 5 of 10: Income');
      assert.equal(await phone.locator('[data-action="tutorial-next"]').isEnabled(), true);
    }
    await phone.locator('[data-action="tutorial-next"]').click();
  }
  await phone.locator('[data-action="tutorial-law"][data-choice-id="diversity-parade"]').click();
  await phone.locator('[data-action="tutorial-next"]').click();
  for (const action of ['tutorial-seal', 'tutorial-lobby', 'tutorial-festival']) {
    await phone.locator(`[data-action="${action}"]`).click();
    await phone.locator('[data-action="tutorial-next"]').click();
  }
  for (const key of ['buildings', 'streets', 'festivals', 'civic', 'treasury']) await phone.locator(`[data-action="tutorial-score"][data-score-id="${key}"]`).click();
  await noHorizontalOverflow(phone);
  await run.screenshot(phone, 'tutorial-score-360x800');
  await phone.locator('[data-action="tutorial-finish"]').click();
  await open();
  await phone.locator('[data-action="tutorial-replay"]').click();
  assert.equal(await phone.locator('.ols-tutorial-progress').getAttribute('aria-label'), 'Lesson 1 of 10: Welcome');
  await phone.locator('[data-action="tutorial-skip"]').click();
  assert.deepEqual((await run.room(live.code, live.tokens.host)).state, before.state, 'Tutorial never mutates the real match');
  assert.ok((await credentials(phone, live.code, 'jon')) === live.tokens.jon);
  run.check('Help/agenda/almanac, all ten guided lessons, skip, saved refresh, finish and replay work without changing real room state or credentials');
}

async function verifySealedRecovery(run, live, before, first, vote) {
  const phone = live.phones[first];
  await phone.reload();
  await waitForRendered(phone, live.room, first);
  assert.equal(Number(await phone.locator('.ols-phone-locked-bid strong').innerText()), vote.bid);
  assert.ok((await credentials(phone, live.code, first)) === live.tokens[first]);
  await phone.context().setOffline(true);
  await phone.locator('.ols-connection').waitFor();
  assert.match(await phone.locator('.ols-connection').innerText(), /offline|reconnect|connecting/i);
  await run.screenshot(phone, `sealed-${first}-offline`);
  await phone.context().setOffline(false);
  await phone.locator('.ols-connection-dot.connected').waitFor();
  await waitForRendered(phone, live.room, first);
  await assertSealedProjections(run, live, before, first, vote);
  const saved = (await run.room(live.code, live.tokens.host)).state;
  await run.restartServer();
  // Native webviews relaunch at '/', so exercise that exact restoration path.
  await live.tv.goto(run.origin + '/');
  await waitForRendered(live.tv, live.room);
  assert.equal(new URL(live.tv.url()).searchParams.get('room'), live.code);
  await phone.goto(run.origin + '/');
  await waitForRendered(phone, live.room, first);
  assert.equal(new URL(phone.url()).searchParams.get('join'), live.code);
  assert.ok((await credentials(phone, live.code, first)) === live.tokens[first]);
  await Promise.all([live.tv, ...Object.values(live.phones)].map(surface => surface.locator('.ols-connection-dot.connected').waitFor()));
  assert.deepEqual((await run.room(live.code, live.tokens.host)).state, saved);
  await assertSealedProjections(run, live, before, first, vote);
  run.check('A sealed private vote restores after phone refresh, actual browser offline/reconnect, SQLite host restart and fresh root host/controller launches');
}

async function sealWithLostAcknowledgment(run, live, before, votes, policy) {
  // Commit the real command but lose every ordinary acknowledgment. Leave SSE
  // alive, then hold the recovery acknowledgment while the other seat reveals.
  // The controller must not treat a connected stream as proof of its POST.
  const first = other(before.state.chair), second = other(first);
  const phone = live.phones[first], url = run.origin + actionPath(live.code);
  const bodies = [], failures = [];
  let release;
  const released = new Promise(resolve => { release = resolve; });
  let recoveryReady, recoveryDone;
  const recovering = new Promise(resolve => { recoveryReady = resolve; });
  const recovered = new Promise(resolve => { recoveryDone = resolve; });
  const handler = async route => {
    if (route.request().method() !== 'POST') return route.continue();
    try {
      const body = route.request().postData();
      bodies.push(body);
      assert.ok(bodies.every(value => value === bodies[0]), 'Lost-response retries retain every byte of the original command');
      const response = await route.fetch();
      assert.equal(response.status(), 200, 'Authority committed or deduplicated the original command before response loss');
      if (bodies.length <= 4) { await route.abort('failed'); return; }
      assert.equal(bodies.length, 5, 'Exactly one recovery request remains in flight');
      recoveryReady();
      await released;
      await route.fulfill({ response });
      recoveryDone();
    } catch (error) {
      failures.push(error);
      recoveryReady(); recoveryDone();
      await route.abort('failed').catch(() => {});
    }
  };
  await phone.route(url, handler);
  try {
    await phone.locator(`[data-action="phone-law"][data-choice-id="${votes[first].choiceId}"]`).click();
    await phone.locator(`[data-action="phone-bid"][data-bid="${votes[first].bid}"]`).click();
    await phone.locator('[data-action="phone-seal"]').click();
    const sealed = await waitUntil(async () => {
      const room = await run.room(live.code, live.tokens.host);
      return room.revision === before.revision + 1 ? room : null;
    }, 'Lost-ack command commits through the actual room authority');
    live.room = sealed;
    await allRendered(live, sealed);
    await assertSealedProjections(run, live, before, first, votes[first]);
    const otherPhone = live.phones[second];
    await otherPhone.locator(`[data-action="phone-law"][data-choice-id="${votes[second].choiceId}"]`).click();
    await otherPhone.locator(`[data-action="phone-bid"][data-bid="${votes[second].bid}"]`).click();
    await clickCommand(run, live, otherPhone, '[data-action="phone-seal"]', policy);
    let recoveryTimeout;
    try {
      await Promise.race([recovering, new Promise((_, reject) => { recoveryTimeout = setTimeout(() => reject(new Error('The rendered controller never resolved its uncertain command after exhausted retries')), 12_000); })]);
    } finally { clearTimeout(recoveryTimeout); }
    if (failures.length) throw failures[0];
    assert.equal(live.room.state.activePlayer, first);
    const frames = await phone.evaluate(() => window.__sofaAcceptanceSseFrames);
    await waitUntil(async () => (await phone.evaluate(() => window.__sofaAcceptanceSseFrames)) >= frames + 2, 'Two real SSE frames while the recovery acknowledgment is pending');
    assert.equal(bodies.length, 5, 'Repeated stream updates do not duplicate command recovery');
    assert.equal(await phone.locator('[data-action="phone-work"]').getAttribute('aria-disabled'), 'true', 'An active seat waits for a conclusive acknowledgment before a distinct action');
    assert.equal(await phone.locator('.ols-connection-dot').getAttribute('aria-label'), 'reconnecting');
    await run.screenshot(phone, 'uncertain-command-recovery');
    release();
    await recovered;
    if (failures.length) throw failures[0];
    await phone.locator('.ols-connection-dot.connected').waitFor();
    await allRendered(live, live.room);
    assert.equal((await run.room(live.code, live.tokens.host)).revision, before.revision + 2, 'Four lost responses and one recovery acknowledgment never duplicate either vote');
    assert.equal(await phone.locator('[data-action="phone-work"]').getAttribute('aria-disabled'), null);
    run.check('Exhausted lost acknowledgments recover the same command while real SSE advances; a distinct action waits until recovery finishes', { droppedResponses: 4, recoveryRequests: 1 });
  } finally {
    release();
    await phone.unroute(url, handler);
  }
}

async function inspectUnavailable(run, live, view, id, { fullSeen, exhaustedSeen }) {
  const phone = live.phones[id], full = view.players[id].city.every(Boolean);
  const stack = view.market.find(stack => stack.remaining === 0 && !exhaustedSeen.has(stack.designId));
  if ((!full || fullSeen.has(id)) && !stack) return;
  const designId = stack?.designId || view.market[0].designId;
  await phone.locator('[data-action="phone-build"]').click();
  if (full) assert.match(await phone.locator('.ols-phone-notice').innerText(), /city is full/i);
  await phone.locator(`[data-action="phone-design"][data-design-id="${designId}"]`).click();
  if (!full) {
    const index = view.players[id].city.indexOf(null);
    await phone.locator(`[data-action="phone-plot"][data-row="${Math.floor(index / 3)}"][data-col="${index % 3}"]`).click();
  } else {
    assert.equal(await phone.locator('[data-action="phone-plot"][aria-disabled="true"]').count(), 9);
    fullSeen.add(id);
  }
  assert.equal(await phone.locator('[data-action="phone-confirm-build"]').getAttribute('aria-disabled'), 'true', 'Unavailable district cannot be purchased through the rendered control');
  if (stack) exhaustedSeen.add(stack.designId);
  await noHorizontalOverflow(phone);
  if (full || exhaustedSeen.size === 1) await run.screenshot(phone, `${full ? 'full-city' : 'sold-out'}-${id}`);
  await phone.locator('[data-action="phone-market"]').click();
  await phone.locator('[data-action="phone-back"]').click();
}

function checkFinalScore(room, rules, taken) {
  assert.equal(room.phase, 'finished');
  assert.equal(room.state.stage, 'finished');
  assert.deepEqual(taken, { jon: 18, lydia: 18 });
  for (const id of IDS) {
    const player = room.state.players[id];
    const buildings = player.city.reduce((sum, plot) => sum + (plot ? rules.buildings.find(building => building.id === plot.designId).prestige : 0), 0);
    const treasury = Math.min(4, Math.floor(player.coins / 3));
    assert.equal(player.score.buildings, buildings);
    assert.equal(player.score.treasury, treasury);
    assert.equal(player.score.total, buildings + player.score.streets + player.score.festivals + player.score.civic + treasury);
    assert.equal(room.state.result.scores[id], player.score.total);
  }
  const { jon, lydia } = room.state.result.scores;
  assert.equal(room.state.result.winner, jon === lydia ? 'tie' : jon > lydia ? 'jon' : 'lydia');
}

export async function playOddMatch(run, live, rules, { policy = 'rich', recovery = false, lostAcknowledgment = false, chair } = {}) {
  let room = live.room;
  assert.equal(room.state.chair, chair, 'Deterministic setup exercises the requested initial Chair');
  const taken = { jon: 0, lydia: 0 }, types = new Set(), fullSeen = new Set(), exhaustedSeen = new Set();
  const matchId = room.state.matchId;
  let councilCount = 0, lastCommand = null, lastActor = null, staleCommand = null;
  while (room.phase === 'playing') {
    assert.ok(taken.jon + taken.lydia <= 36, 'Rendered match terminates after 18 actions each');
    const view = room.state;
    if (view.stage === 'council') {
      councilCount++;
      const votes = councilCommitments(view, policy === 'rich' ? SCENARIOS.bids[view.session - 1] : { keep: true, sameChoice: true, jon: 0, lydia: 0 });
      const first = view.session % 2 === 1 ? 'jon' : 'lydia';
      if (recovery && councilCount === 1) {
        const phone = live.phones[first];
        await phone.locator(`[data-action="phone-law"][data-choice-id="${view.council.optionIds[0]}"]`).click();
        await phone.locator('[data-action="phone-bid"][data-bid="1"]').click();
        assert.equal((await run.room(live.code, live.tokens.host)).revision, room.revision, 'Unsealed draft never sends a room command');
        await phone.reload();
        await waitForRendered(phone, room, first);
        assert.equal(await phone.locator('[data-action="phone-law"][data-choice-id="keep"]').getAttribute('aria-pressed'), 'true');
        assert.equal(await phone.locator('[data-action="phone-bid"][data-bid="0"]').getAttribute('aria-pressed'), 'true');
        run.check('An unsealed draft stays local and refresh restores only acknowledged state');
      }
      if (lostAcknowledgment && councilCount === 1) await sealWithLostAcknowledgment(run, live, room, votes, policy);
      else for (const id of [first, other(first)]) {
        const phone = live.phones[id];
        await phone.locator(`[data-action="phone-law"][data-choice-id="${votes[id].choiceId}"]`).click();
        await phone.locator(`[data-action="phone-bid"][data-bid="${votes[id].bid}"]`).click();
        const accepted = await clickCommand(run, live, phone, '[data-action="phone-seal"]', policy);
        if (id === first) {
          await assertSealedProjections(run, live, room, first, votes[first]);
          const retry = await request(run, actionPath(live.code), { token: live.tokens[first], body: accepted.command });
          assert.equal(retry.value.revision, accepted.room.revision, 'An exact captured browser command retries once without new mutation');
          if (recovery && councilCount === 1) {
            await run.screenshot(live.tv, 'sealed-public-tv');
            await run.screenshot(phone, 'sealed-private-controller');
            await verifySealedRecovery(run, live, room, first, votes[first]);
          }
        }
      }
      room = live.room;
      assert.equal(room.state.stage, 'actions');
      assert.deepEqual(room.state.lastCouncil.choices, votes);
      for (const id of IDS) assert.equal(room.state.players[id].influence, view.players[id].influence - votes[id].bid, 'Both winning and losing bids pay exactly once');
      if (councilCount === 1) {
        await run.screenshot(live.tv, `${policy}-council-reveal-tv`);
        await assertTVFits(run, live.tv, `${policy}-reveal-1280x720`);
        for (const id of IDS) await assertTouchTargets(run, live.phones[id], '.ols-phone-actions button', 4, `${id} city actions`);
      } else if (policy === 'rich' && councilCount % 2 === 1) {
        await run.screenshot(live.tv, `${policy}-term-${room.state.term}-reveal-tv`);
        await assertTVFits(run, live.tv, `${policy}-term-${room.state.term}-1280x720`);
      }
      continue;
    }
    assert.equal(view.stage, 'actions');
    const id = view.activePlayer, phone = live.phones[id];
    if (policy === 'fill') await inspectUnavailable(run, live, view, id, { fullSeen, exhaustedSeen });
    if (staleCommand && view.session === 1 && view.actionIndex === 2) {
      const rejected = await request(run, actionPath(live.code), { token: live.tokens[id], body: { ...staleCommand, revision: room.revision, actionId: crypto.randomUUID() }, status: 409 });
      assert.equal(rejected.value.code, 'stale_phase');
      staleCommand = null;
    }
    assert.equal(await phone.locator(`[data-character="${id}"]`).getAttribute('data-character-state'), 'acting');
    const selected = choosePublicAction(view, id, rules, policy);
    let selector = `[data-action="phone-${selected.type}"]`;
    if (selected.type === 'build') {
      await phone.locator('[data-action="phone-build"]').click();
      await phone.locator(`[data-action="phone-design"][data-design-id="${selected.designId}"]`).click();
      await phone.locator(`[data-action="phone-plot"][data-row="${selected.row}"][data-col="${selected.col}"]`).click();
      if (taken[id] === 0 && policy === 'rich') {
        await noHorizontalOverflow(phone);
        await run.screenshot(phone, `build-preview-${id}`);
      }
      selector = '[data-action="phone-confirm-build"]';
    }
    const accepted = await clickCommand(run, live, phone, selector, policy);
    if (view.session === 1 && view.actionIndex === 0) staleCommand = accepted.command;
    assert.equal(accepted.room.revision, room.revision + 1);
    if (selected.type === 'build' && accepted.room.state.session === view.session) {
      const quote = rules.buildQuote(view, id, selected.designId);
      assert.equal(accepted.room.state.players[id].coins, view.players[id].coins - quote.cost);
      assert.equal(accepted.room.state.players[id].city[selected.row * 3 + selected.col].designId, selected.designId);
    }
    taken[id]++; types.add(selected.type);
    room = accepted.room; lastCommand = accepted.command; lastActor = id;
  }
  assert.equal(councilCount, 6);
  checkFinalScore(room, rules, taken);
  if (policy === 'rich') {
    assert.deepEqual([...types].sort(), ['build', 'festival', 'lobby', 'work']);
    assert.notEqual(room.state.result.winner, 'tie', 'Rich fixture exercises a distinct winner');
  }
  if (policy === 'tie') {
    assert.equal(room.state.result.winner, 'tie');
    assert.deepEqual(room.state.result.scores, { jon: 4, lydia: 4 });
  }
  if (policy === 'fill') {
    assert.equal(fullSeen.size, 2, 'Both full-city controller states were reached through legal decisions');
    assert.ok(exhaustedSeen.size >= 2, 'Multiple exhausted stacks were inspected through real controls');
  }
  await allRendered(live, room);
  for (const [page, name] of [[live.tv, 'tv'], ...IDS.map(id => [live.phones[id], id])]) {
    await noHorizontalOverflow(page);
    await run.screenshot(page, `${policy}-final-${name}`);
    if (name === 'tv') await assertTVFits(run, page, `${policy}-final-1280x720`);
    for (const id of name === 'tv' ? IDS : [name]) {
      const expected = room.state.result.winner === id || room.state.result.winner === 'tie' ? 'celebrate' : 'disappointed';
      assert.equal(await page.locator(`[data-character="${id}"]`).first().getAttribute('data-character-state'), expected);
    }
    const motion = await page.evaluate(() => window.__sofaAcceptanceMotion);
    assert.ok(motion.every(animation => animation.reduced && !animation.properties.some(key => ['transform', 'translate', 'rotate', 'scale'].includes(key))), 'Reduced motion emits no transform animation frames');
  }
  run.check(`${policy} complete six-session match, initial Chair ${chair}`, {
    initialChair: chair, actions: taken, types: [...types].sort(), scores: room.state.result.scores,
    winner: room.state.result.winner, fullCitiesInspected: [...fullSeen], exhaustedDesignsInspected: [...exhaustedSeen],
  });
  return { room, matchId, lastCommand, lastActor };
}

export async function rematchOddLaws(run, live, completed) {
  await live.tv.locator('[data-action="rematch"]').click();
  const room = await waitUntil(async () => {
    const room = await run.room(live.code, live.tokens.host);
    return room.state.matchId !== completed.matchId ? room : null;
  }, 'Rematch creates a new match identity');
  assert.equal(room.state.stage, 'council');
  assert.deepEqual(room.state.council.ready, { jon: false, lydia: false });
  for (const id of IDS) {
    assert.ok(room.state.players[id].city.every(plot => plot === null));
    assert.equal(room.state.players[id].coins, 4);
    assert.equal(room.state.players[id].influence, 2);
  }
  const stale = await request(run, actionPath(live.code), {
    token: live.tokens[completed.lastActor],
    body: { ...completed.lastCommand, revision: room.revision, actionId: crypto.randomUUID() }, status: 409,
  });
  assert.equal(stale.value.code, 'stale_match');
  assert.equal((await run.room(live.code, live.tokens.host)).revision, room.revision);
  live.room = room;
  await allRendered(live, room);
  for (const id of IDS) {
    assert.ok((await credentials(live.phones[id], live.code, id)) === live.tokens[id]);
    assert.equal(await live.phones[id].locator('[data-action="phone-bid"][data-bid="0"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await live.phones[id].locator('.ols-phone-locked').count(), 0);
  }
  run.check('TV rematch preserves authenticated controllers, resets city/draft state, and rejects a captured prior-match command');
}

export async function finishOddJourney(run, live) {
  await live.tv.locator('.ols-toolbar [data-action="exit"]').click();
  await live.tv.locator('.arcade-home').waitFor();
  await live.tv.goto(run.origin + '/');
  await live.tv.locator('.arcade-home').waitFor();
  assert.equal(new URL(live.tv.url()).search, '');
  assert.equal(await live.tv.locator('.ols').count(), 0);
  await live.tv.locator('[data-action="open-game"][data-game="sofa-kingdoms"]').first().click();
  await live.tv.locator('.game-detail [data-action="create"]').waitFor();
  assert.equal(await live.tv.locator('link[data-odd-laws-style]').count(), 0, 'Leaving disposes Odd Laws view styles');
  run.check('Component exit returns to the collection, bare-root relaunch stays there, and Sofa Kingdoms remains available');
  const summary = values => {
    const sorted = values.map(value => value.milliseconds).sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return { count: sorted.length, medianMs: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2, p95Ms: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)], maxMs: sorted.at(-1) };
  };
  run.evidence.renderedLatency = {
    methodology: 'Monotonic Node clock from Playwright actual browser POST request emission to matching rendered public resources, city instances, active turn/readiness or final scores. Three separate contexts on one Chromium runner and one real SQLite LAN server over loopback. Each response matches the emitted command ID/bytes and must be HTTP 200 with exactly one revision advance in the same match. If Chromium releases that response body from its CDP cache, a fresh authenticated GET supplies the expected projection; those samples include its additional round trip and identify that observation method. Includes HTTP/SSE delivery, rendering, driver scheduling and at most 40ms state-poll granularity. Median averages the middle two samples when even; p95 uses nearest rank. No home Wi-Fi, casting, physical screen or native-webview claims.',
    samples: live.latency,
    summary: Object.fromEntries(Object.entries(live.latency).map(([viewer, samples]) => [viewer, summary(samples)])),
  };
  assert.deepEqual(run.evidence.externalRequests, []);
  assert.deepEqual(run.evidence.failedResponses, []);
  assert.deepEqual(run.evidence.errors, []);
}
