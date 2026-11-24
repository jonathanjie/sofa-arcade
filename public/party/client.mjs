const ROOMS = '/api/party/rooms';
const ROOM_CODE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;
const RETRY_MIN_MS = 250;
const RETRY_MAX_MS = 2000;

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
      active.send(JSON.stringify({ type: 'auth', protocol: 1, code: credential.code, token: credential.token }));
    });
    active.addEventListener('message', ({ data }) => {
      if (stopped || socket !== active) return;
      let packet;
      try { packet = JSON.parse(data); } catch { return; }
      if (packet.type === 'error') onError(packet.message);
      if (packet.type !== 'welcome' && packet.type !== 'snapshot') return;
      round = packet.view.round;
      if (packet.type === 'welcome') {
        ready = true;
        seq = 0;
        delay = RETRY_MIN_MS;
        onStatus('connected');
      }
      onView(packet.view);
    });
    active.addEventListener('close', ({ code }) => {
      if (stopped || socket !== active) return;
      ready = false;
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
    input(input) { return send({ type: 'input', round, seq: seq++, input }); },
    dispose() {
      stopped = true;
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
