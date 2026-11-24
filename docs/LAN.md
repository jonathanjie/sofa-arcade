# Play Sofa Arcade over your home Wi-Fi

The local host runs on your Mac. Both phones open pages served directly by that Mac, and room changes are pushed to the TV and phones as they happen. The turn-based games share room authority, turn validation and retry protection with the hosted implementation. Gravity Orchard uses the local realtime coordinator. Internet access is not needed during a local game once the files and Node.js are available.

## Start

1. Install Node.js **22.13 or newer** if it is not already installed. Use the official installer at https://nodejs.org/ .
2. Extract the Sofa Arcade local-play download, or open the complete project checkout.
3. Open Terminal in that folder and run:

```sh
node scripts/lan-server.mjs
```

No `npm install`, framework build, cloud account, or database setup is required for this mode. In a full checkout, `npm run lan` is an equivalent shortcut. On a Mac, you can also double-click `start-sofa.command` in the extracted folder.

4. Open the local address printed in Terminal on the Mac, for example `http://192.168.1.20:4177/`. Keep Terminal open.
5. Select an available game and host it on the TV. Scan the room QR code with both phones. All three devices should use the same home Wi-Fi/LAN. For Gravity Orchard, select **Enter the orchard** on the TV, then **Use touch controls** and **I'm ready** on both phones. For tilt, use a Mac app build with trusted phone access.

Cast the Mac browser to the TV as usual. The phone-to-Mac traffic stays on the LAN; casting itself can still add display delay. A direct cable or running the local page in the TV browser avoids a separate screencast step where supported.

To stop, press **Control+C** in Terminal. Room state is saved in `.sofa-lan/rooms.sqlite`; keep this folder to resume within the normal 24-hour room lifetime. Phone credentials remain in each browser. These local rooms are separate from rooms created on the public Site.

## Connecting the phones

Use the Mac's local network address printed by the server. `localhost` and `127.0.0.1` on a phone refer to the phone itself. The local host puts a LAN address into the QR even if the Mac page was opened through localhost.

If more than one address is printed, use the address associated with your home Wi-Fi. Opening that address on the Mac makes the room QR use the same address. VPN or guest networks can isolate devices; your normal home Wi-Fi is the easiest setup. If macOS asks about incoming connections for Node, allowing it on your trusted home network lets the phones reach the host.

If port 4177 is in use:

```sh
node scripts/lan-server.mjs --port 4178
```

A different port in this checkout still uses the same SQLite file. Use a separate checkout or a test harness with a temporary database for an independent host.

This is a local HTTP host for a trusted home network. It does not expose a public internet server, configure router port forwarding, or create a tunnel. Keep the host running only when you want to play locally.

## Implementation and tests

`server/lan.mjs` serves the authored UI and local assets, adapts Node's built-in SQLite to the existing `server/rooms.mjs` API, applies checked-in SQL migrations, and streams authenticated room updates at `/api/rooms/CODE/events`. For authenticated HTTP and SSE, credentials use the Authorization header and never appear in URLs or QR codes. Streams recheck credentials and maintain presence. Cross-origin requests, unknown Host headers, and access outside the intended static files are rejected.

Room API writes require one exact same-origin `Origin` header and one `Content-Type: application/json` header. Send a JSON object when the command has a body. This applies to the HTTP host and to the Mac app's HTTPS controller listener. Browsers add the Origin header to same-origin writes. Command-line clients and test harnesses must supply it explicitly. Use the same scheme, host and port as the request URL. The game page's content security policy blocks framing and allows local assets and the host's own WebSocket.

The default host permits 64 unexpired rooms. Each peer outside loopback can attempt six room creations per minute. A rate limit returns HTTP 429 and a full room store returns HTTP 503. The HTTP listener accepts 64 sockets, with eight reserved for local loopback connections. The HTTPS listener has its own 64-socket limit. The host accepts 24 live event streams across both listeners and up to two per seat in each room to allow reloads. Extra streams return HTTP 429. Gravity Orchard can keep up to 32 active coordinators and reclaims expired rooms when it needs a slot.

`ui/transport.mjs` reads local-host metadata and manages fetch/SSE reconnects. The published Site keeps its cloud transport. The local server does not change the public Site's hosting or database.

Run the focused local transport tests with:

```sh
node --test server/lan.test.mjs ui/transport.test.mjs
```
