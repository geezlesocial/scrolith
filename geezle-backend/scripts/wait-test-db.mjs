import net from 'node:net';

const host = process.env.TEST_DB_HOST || '127.0.0.1';
const port = Number(process.env.TEST_DB_PORT || 55432);
const deadline = Date.now() + Number(process.env.TEST_DB_WAIT_MS || 60_000);

const canConnect = () =>
  new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    socket.setTimeout(1_500);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
  });

while (Date.now() < deadline) {
  if (await canConnect()) {
    console.log(`Test database is reachable at ${host}:${port}`);
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}

console.error(`Timed out waiting for test database at ${host}:${port}`);
process.exit(1);
