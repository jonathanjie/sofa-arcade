#!/usr/bin/env node
import { startLanServer } from '../server/lan.mjs';

const index = process.argv.indexOf('--port');
const port = index === -1 ? 4177 : Number(process.argv[index + 1]);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Choose a port from 1 to 65535: node scripts/lan-server.mjs --port 4177');
  process.exitCode = 1;
} else {
  try {
    const host = await startLanServer({ port });
    console.log('\nSofa Arcade is running on your Mac.');
    console.log('Open one of these addresses on the Mac; then scan its room QR with both phones:');
    for (const url of host.urls) console.log('  ' + url);
    if (!host.urls.length) console.log(`  ${host.origin}/ (connect to Wi-Fi to make the game reachable by phones)`);
    console.log('\nKeep this window open while playing. Press Control+C to stop.');
    console.log('Room state is saved locally in .sofa-lan/rooms.sqlite.\n');
    const stop = async () => { await host.close(); process.exitCode = 0; };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  } catch (error) {
    console.error(error.code === 'EADDRINUSE'
      ? `Port ${port} is already in use. Close the other host or run: node scripts/lan-server.mjs --port ${port + 1}`
      : `The local host could not start: ${error.message}`);
    process.exitCode = 1;
  }
}
