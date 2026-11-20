/** Exercise late real API responses at the shell boundary, beyond adapter unit tests. */
import assert from 'node:assert/strict';
import { credentials } from './support.mjs';

async function holdResponse(run, page, url, method) {
  let release;
  let arrived;
  let settled;
  let failed;
  let rejectArrival;
  const gate = new Promise(resolve => { release = resolve; });
  const received = new Promise((resolve, reject) => { arrived = resolve; rejectArrival = reject; });
  const finished = new Promise((resolve, reject) => { settled = resolve; failed = reject; });
  finished.catch(() => {});
  const timeout = setTimeout(() => {
    const error = new Error('Timed out awaiting the delayed local API response');
    rejectArrival(error); failed(error); release();
  }, 12_000);
  const handler = async route => {
    if (route.request().method() !== method) return route.fallback();
    try {
      const response = await route.fetch();
      const body = await response.json();
      run.protectCredential(body.hostToken);
      run.protectCredential(body.playerToken);
      arrived({ code: body.code, status: response.status() });
      await gate;
      try { await route.fulfill({ response }); }
      catch (error) {
        // Correct navigation cleanup may already have aborted the fetch.
        if (!route.request().failure()) throw error;
      }
      clearTimeout(timeout); settled();
    } catch (error) { clearTimeout(timeout); rejectArrival(error); failed(error); }
  };
  await page.route(url, handler);
  return {
    received,
    async release() {
      release();
      await finished;
      await page.unroute(url, handler);
      // Let the response promise and its render callbacks settle before checking.
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    },
  };
}

async function exitToCollection(page) {
  await page.locator('[data-action="home"]').click();
  const leave = page.locator('[data-action="leave"]');
  if (await leave.count()) await leave.click();
  await page.locator('.arcade-home').waitFor();
}

async function remainsOnCollection(page) {
  assert.equal(await page.locator('.arcade-home').count(), 1, 'A stale response must not resurrect its old view');
  assert.equal(new URL(page.url()).search, '', 'A stale response must not rewrite navigation');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('sofa-last-local-session-v1') || 'null')), null, 'Explicit exit stays cleared after the delayed response');
  const invalidCredentialKeys = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('sofa-room:') && !/^sofa-room:[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/.test(key)));
  assert.deepEqual(invalidCredentialKeys, [], 'Late join credentials must never be saved under another/empty code');
}

async function createLobby(run, page) {
  await page.locator('[data-action="open-game"][data-game="sofa-kingdoms"]').first().click();
  await page.locator('[data-action="create"]').click();
  await page.locator('.room-code').waitFor();
  return (await page.locator('.room-code').innerText()).trim();
}

export async function verifyNavigationRaces(run, { tv, jon, lydia }) {
  // Create finishes on the server, but its response cannot reclaim an exited UI.
  await tv.locator('[data-action="open-game"][data-game="sofa-kingdoms"]').first().click();
  const create = await holdResponse(run, tv, run.origin + '/api/rooms', 'POST');
  await tv.locator('[data-action="create"]').click();
  const orphan = await create.received;
  assert.equal(orphan.status, 201);
  await exitToCollection(tv);
  await create.release();
  await remainsOnCollection(tv);
  run.check('Late room-create response cannot restore a room after collection navigation');

  // A read response is delayed while the player leaves the room-search screen.
  await jon.goto(run.origin + '/');
  await exitToCollection(jon);
  await jon.locator('[data-action="join-menu"]').click();
  await jon.locator('#room-input').fill(orphan.code);
  const find = await holdResponse(run, jon, `${run.origin}/api/rooms/${orphan.code}`, 'GET');
  await jon.locator('#join-form button[type="submit"]').click();
  await find.received;
  await exitToCollection(jon);
  await find.release();
  await remainsOnCollection(jon);
  run.check('Late find-room response cannot restore an abandoned room-search screen');

  // The next room has free seats, so this is an actual authenticated join.
  const code = await createLobby(run, tv);
  await jon.goto(`${run.origin}/?join=${code}&seat=jon`);
  await jon.locator('[data-action="claim"][data-player="jon"]').waitFor();
  const join = await holdResponse(run, jon, `${run.origin}/api/rooms/${code}/join`, 'POST');
  await jon.locator('[data-action="claim"][data-player="jon"]').click();
  await join.received;
  await exitToCollection(jon);
  await join.release();
  await remainsOnCollection(jon);
  run.check('Late join response cannot resurrect its view or save credentials under a changed room code');
  await exitToCollection(tv);

  // Start has both a real HTTP acknowledgment and SSE broadcasts. Leaving the
  // host disposes the stream; the remaining HTTP promise must also stay fenced.
  const startCode = await createLobby(run, tv);
  for (const [id, phone] of Object.entries({ jon, lydia })) {
    await phone.goto(`${run.origin}/?join=${startCode}&seat=${id}`);
    await phone.locator(`[data-action="claim"][data-player="${id}"]`).click();
    await phone.locator('.waiting-scene').waitFor();
    assert.ok(await credentials(phone, startCode, id));
  }
  const start = await holdResponse(run, tv, `${run.origin}/api/rooms/${startCode}/start`, 'POST');
  await tv.locator('[data-action="start"]').click();
  await start.received;
  await exitToCollection(tv);
  await start.release();
  await remainsOnCollection(tv);
  run.check('Late start response and prior-room SSE cannot restore a host after exit');
}
