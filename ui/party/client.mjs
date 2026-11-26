const ROOMS = '/api/party/rooms';
const ROOM_CODE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;
const RETRY_MIN_MS = 250;
const RETRY_MAX_MS = 2000;
const CLOCK_SAMPLES = 3;
const CLOCK_GAP_MS = 100;
const CLOCK_TIMEOUT_MS = 350;
const CLOCK_REFRESH_MS = 30_000;

export function cleanCode(value) {
  const code = value.trim().toUpperCase();
  return ROOM_CODE.test(code) ? code : null;
}

export function newRequestId() {
  // getRandomValues also works on ordinary HTTP over the local network.
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function partyRequest(path, body) {
  const options = body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : {};
  const response = await fetch(ROOMS + path, options);
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error), { status: response.status, code: data.code });
  return data;
}

export function partySession(role, code, value) {
  try {
    const key = `sofa-party:${role}:${code}`;
    if (value === null) sessionStorage.removeItem(key);
    else if (value !== undefined) sessionStorage.setItem(key, JSON.stringify(value));
    else return JSON.parse(sessionStorage.getItem(key));
  } catch { /* Rooms still work if the browser disables storage. */ }
  return null;
}

export function createPartyClockSync(send, now = () => performance.now()) {
  let timer;
  let pending;
  let sequence = 0;
  let remaining = 0;
  let bestTrip = Infinity;
  let offset = null;

  function nextSample() {
    remaining--;
    pending = { id: sequence++, sentAt: now() };
    send({ type: 'clock-ping', id: pending.id });
    timer = setTimeout(completeSample, CLOCK_TIMEOUT_MS);
  }

  function start() {
    stop();
    remaining = CLOCK_SAMPLES;
    bestTrip = Infinity;
    nextSample();
  }

  function completeSample() {
    clearTimeout(timer);
    pending = undefined;
    timer = remaining > 0 ? setTimeout(nextSample, CLOCK_GAP_MS) : setTimeout(start, CLOCK_REFRESH_MS);
  }

  function stop() {
    clearTimeout(timer);
    pending = undefined;
  }

  return {
    start,
    stop,
    receive({ id, serverAt }) {
      if (!pending || id !== pending.id || !Number.isFinite(serverAt) || serverAt < 0) return;
      const trip = now() - pending.sentAt;
      if (trip >= 0 && trip < CLOCK_TIMEOUT_MS && trip < bestTrip) {
        bestTrip = trip;
        offset = serverAt - (pending.sentAt + trip / 2);
      }
      completeSample();
    },
    serverNow: () => offset === null ? null : now() + offset,
  };
}

export function connectParty({ credential, onView, onStatus, onError }) {
  const url = new URL('/api/realtime/party', location.origin);
  url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  let socket;
  let timer;
  let stopped = false;
  let ready = false;
  let delay = RETRY_MIN_MS;
  let round = 0;
  let seq = 0;
  const clock = credential.playerId ? createPartyClockSync(send) : null;

  function send(command) {
    if (!ready || socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(command));
    return true;
  }

  function open() {
    if (stopped) return;
    const active = new WebSocket(url);
    socket = active;
    active.addEventListener('open', () => {
      if (stopped || socket !== active) return;
      active.send(JSON.stringify({ type: 'auth', protocol: 1, code: credential.code, token: credential.token }));
    });
    active.addEventListener('message', ({ data }) => {
      if (stopped || socket !== active) return;
      let packet;
      try { packet = JSON.parse(data); } catch { return; }
      if (!packet || typeof packet !== 'object') return;
      if (packet.type === 'welcome') {
        if (ready || !Number.isSafeInteger(packet.view?.round)) return;
        round = packet.view.round;
        ready = true;
        seq = 0;
        delay = RETRY_MIN_MS;
        onView(packet.view);
        onStatus('connected');
        if (!stopped) clock?.start();
      } else if (ready && packet.type === 'clock-pong') {
        clock?.receive(packet);
      } else if (ready && packet.type === 'snapshot' && Number.isSafeInteger(packet.view?.round) && packet.view.round >= round) {
        round = packet.view.round;
        onView(packet.view);
      } else if (ready && packet.type === 'error') {
        onError(packet.message);
      }
    });
    active.addEventListener('close', ({ code }) => {
      if (stopped || socket !== active) return;
      ready = false;
      clock?.stop();
      if (code === 4403 || code === 4409) {
        stopped = true;
        onStatus(code === 4403 ? 'seat-lost' : 'replaced');
        return;
      }
      onStatus('reconnecting');
      timer = setTimeout(open, delay);
      delay = Math.min(delay * 2, RETRY_MAX_MS);
    });
  }

  onStatus('connecting');
  open();
  return {
    send,
    serverNow: () => clock?.serverNow() ?? null,
    input(input) { return send({ type: 'input', round, seq: seq++, input }); },
    dispose() {
      stopped = true;
      clock?.stop();
      clearTimeout(timer);
      if (socket && socket.readyState === WebSocket.OPEN) socket.close();
      // Closing CONNECTING produces a browser console error. Close on open instead.
      else if (socket?.readyState === WebSocket.CONNECTING) {
        const pending = socket;
        pending.addEventListener('open', () => pending.close(), { once: true });
      }
    },
  };
}
