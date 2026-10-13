import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const dir = mkdtempSync(path.join(tmpdir(), 'defense-delivery-'));
const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: '4320',
    DEFENSE_DATA_DIR: dir,
    GROQ_ENABLED: 'false',
    GROQ_API_KEY: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
try {
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Startup timed out')), 15000);
    child.stdout.once('data', () => {
      clearTimeout(t);
      resolve();
    });
    child.once('exit', (code) => {
      clearTimeout(t);
      reject(new Error(`Server stopped: ${code}`));
    });
  });
  const root = 'http://127.0.0.1:4320',
    home = await fetch(root);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Defense Studio/);
  const cookie = home.headers.get('set-cookie')!.split(';')[0],
    headers = { Cookie: cookie, 'Content-Type': 'application/json', 'X-Defense-Request': '1' };
  const health = await fetch(root + '/health');
  assert.equal(health.status, 200);
  const p = await fetch(root + '/api/papers/sample', { method: 'POST', headers, body: '{}' });
  assert.equal(p.status, 200);
  const s = await fetch(root + '/api/sessions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      paperId: 'sample-library',
      stage: 'proposal',
      mode: 'practice',
      provider: 'sample',
      durationMinutes: 15,
    }),
  });
  assert.equal(s.status, 201);
  const data = await s.json();
  assert.equal(data.provider, 'sample');
  assert.equal(data.question.citationIds[0], 'p1-s1');
  console.log(
    `Delivered project smoke passed from ${process.cwd()}: production page, cookie, API, synthetic paper and session.`,
  );
} finally {
  child.kill('SIGTERM');
  await new Promise<void>((resolve) => child.once('exit', () => resolve()));
  rmSync(dir, { recursive: true, force: true });
}
