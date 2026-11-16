import net from 'node:net';

/** Fail if another server is already answering on the configured loopback port. */
export async function assertPortAvailable(port, host = '127.0.0.1') {
  await new Promise((resolve, reject) => {
    const probe = net.createConnection({ port, host });
    probe.setTimeout(1000, () => {
      probe.destroy();
      reject(new Error(`Port ${port} check timed out at ${host}.`));
    });
    probe.once('connect', () => {
      probe.destroy();
      reject(new Error(`Port ${port} is already answering at ${host}.`));
    });
    probe.once('error', error => {
      probe.destroy();
      if (error.code === 'ECONNREFUSED' || error.code === 'EHOSTUNREACH') resolve();
      else reject(new Error(`Port ${port} could not be checked at ${host}: ${error.message}`));
    });
  });
}
