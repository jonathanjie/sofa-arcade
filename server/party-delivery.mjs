/** Explicit party delivery closure. Keep the browser list free of authority code. */
export const PARTY_BROWSER_FILES = Object.freeze([
  'index.mjs',
  'client.mjs',
  'looks.mjs',
  'party.css',
  'frame/phone.mjs',
  'frame/tv.mjs',
  'games/registry.mjs',
  'games/tap-race/phone.mjs',
  'games/tap-race/tv.mjs',
  'kit/animation.mjs',
  'kit/sprites.mjs',
  'phone/controls.mjs',
].map(file => Object.freeze({ url: `/party/${file}`, source: `ui/party/${file}` })));

export const PARTY_HOST_FILES = Object.freeze([
  'games/party/registry.mjs',
  'games/party/tap-race.mjs',
  'server/party-delivery.mjs',
  'server/party/http.mjs',
  'server/party/rooms.mjs',
  'server/realtime/party/index.mjs',
  'server/realtime/party/protocol.mjs',
  'server/realtime/party/round.mjs',
  'server/reject-upgrade.mjs',
]);
