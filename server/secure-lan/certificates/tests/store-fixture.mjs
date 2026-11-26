import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCertificateStore } from '../index.mjs';

export const identities = ['127.0.0.1', '192.168.1.22', 'orchard.local'];

export async function fixture(t, options = {}) {
  const appDataDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'sofa-go6-cert-')));
  const privateDir = path.join(appDataDir, 'secure-lan-v1');
  const privateFile = path.join(privateDir, 'installation.json');
  t.after(async () => {
    t.mock.restoreAll();
    await fs.chmod(appDataDir, 0o700).catch(() => {});
    await fs.chmod(privateDir, 0o700).catch(() => {});
    await fs.rm(appDataDir, { recursive: true, force: true });
  });
  return { appDataDir, privateDir, privateFile, store: createCertificateStore({ appDataDir, ...options }) };
}

export async function rewrite(file, change) {
  const record = JSON.parse(await fs.readFile(file, 'utf8'));
  change(record);
  await fs.writeFile(file, JSON.stringify(record), { mode: 0o600 });
}
