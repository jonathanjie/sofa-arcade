// Give the rejection time to flush, then release a peer that keeps its half open.
const UPGRADE_CLOSE_GRACE_MS = 250;

export function rejectUpgrade(socket, status, reason) {
  if (socket.destroyed) return;
  const destroy = () => socket.destroy();
  const deadline = setTimeout(destroy, UPGRADE_CLOSE_GRACE_MS);
  deadline.unref();
  socket.on('error', destroy);
  socket.once('close', () => {
    clearTimeout(deadline);
    socket.off('error', destroy);
  });
  socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}
