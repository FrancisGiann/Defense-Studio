import { test } from 'node:test';
import { request as httpRequest } from 'node:http';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp, errorHandler } from '../server/app';
import { Repository } from '../server/repository';
import { sampleQuestion, sampleFeedback } from '../shared/sample';
import type { PanelProvider } from '../server/provider';
import type { Session } from '../shared/types';
test('HTTP security, upload, consent, mock privacy, drafts, retries, limits and persistence', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'defense-api-'));
  const repo = new Repository(dir);
  let calls = 0,
    fail = false;
  const provider: PanelProvider = {
    async question(_p, s) {
      calls++;
      return sampleQuestion(s.turns.length, s.stage);
    },
    async feedback(_p, s) {
      calls++;
      if (fail) throw new Error('synthetic transport interruption');
      return { ...sampleFeedback(s.question), sample: false, support: 'partial' };
    },
  };
  const config = {
    port: 4849,
    dataDir: dir,
    groqEnabled: true,
    apiKey: 'synthetic-test-only',
    model: 'openai/gpt-oss-20b',
    dailyCallLimit: 30,
    requestGapMs: 0,
    maxQuestions: 10,
  };
  const app = createApp(config, repo, provider);
  app.get('/', (_req, res) => res.send('synthetic test bootstrap'));
  app.use(errorHandler);
  const server = app.listen(config.port, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const root = `http://127.0.0.1:${config.port}`;
  let cookie = '';
  const request = async (
    route: string,
    body?: unknown,
    method = body === undefined ? 'GET' : 'POST',
    headers: Record<string, string> = {},
  ) => {
    const res = await fetch(root + route, {
      method,
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
        'X-Defense-Request': '1',
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, data: await res.json() };
  };
  try {
    assert.equal((await request('/api/workspace')).status, 401);
    const boot = await fetch(root);
    cookie = boot.headers.get('set-cookie')!.split(';')[0];
    assert.match(boot.headers.get('set-cookie')!, /HttpOnly/);
    assert.match(boot.headers.get('set-cookie')!, /SameSite=Strict/);
    assert.equal(
      (await request('/api/workspace', undefined, 'GET', { Origin: 'https://evil.example' }))
        .status,
      403,
    );
    assert.equal(
      await new Promise<number>((resolve, reject) => {
        const req = httpRequest(
          root + '/api/workspace',
          { headers: { Host: 'evil.example', Cookie: cookie } },
          (res) => {
            res.resume();
            resolve(res.statusCode!);
          },
        );
        req.on('error', reject);
        req.end();
      }),
      403,
    );
    assert.equal(
      (await request('/api/papers/sample', {}, 'POST', { 'X-Defense-Request': '' })).status,
      403,
    );
    const p = (await request('/api/papers/sample', {})).data;
    assert.equal(
      (
        await request('/api/sessions', {
          paperId: p.id,
          stage: 'proposal',
          mode: 'practice',
          provider: 'groq',
          durationMinutes: 15,
        })
      ).status,
      403,
    );
    assert.equal(calls, 0);
    const form = new FormData();
    form.append(
      'file',
      new Blob([readFileSync('public/sample-thesis.pdf')], { type: 'application/pdf' }),
      'synthetic.pdf',
    );
    const uploaded = await fetch(root + '/api/papers', {
      method: 'POST',
      headers: { Cookie: cookie, 'X-Defense-Request': '1' },
      body: form,
    });
    assert.equal(uploaded.status, 201);
    const real = await uploaded.json();
    assert.equal(real.pageCount, 5);
    assert.equal(
      (
        await request('/api/sessions', {
          paperId: real.id,
          stage: 'proposal',
          mode: 'practice',
          provider: 'sample',
          durationMinutes: 15,
        })
      ).status,
      400,
    );
    let s: Session = (
      await request('/api/sessions', {
        paperId: p.id,
        stage: 'proposal',
        mode: 'practice',
        provider: 'sample',
        durationMinutes: 15,
      })
    ).data;
    assert.equal(
      (
        await request(
          `/api/sessions/${s.id}/draft`,
          { text: 'A locally saved English / Tagalog answer.', revision: 0 },
          'PATCH',
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await request(
          `/api/sessions/${s.id}/draft`,
          { text: 'stale overwrite', revision: 0 },
          'PATCH',
        )
      ).status,
      409,
    );
    assert.equal(
      (await request(`/api/sessions/${s.id}`)).data.draft,
      'A locally saved English / Tagalog answer.',
    );
    const answer = {
      answer: 'Qualitative design explores experiences, hindi causal effects.',
      requestId: randomUUID(),
      questionText: s.question.text,
    };
    s = (await request(`/api/sessions/${s.id}/answers`, answer)).data;
    assert.equal(s.turns.length, 1);
    assert.equal(s.turns[0].feedback?.sample, true);
    assert.equal((await request(`/api/sessions/${s.id}/answers`, answer)).data.turns.length, 1);
    assert.equal(
      (await request(`/api/sessions/${s.id}/answers`, { ...answer, requestId: randomUUID() }))
        .status,
      409,
    );
    s = (await request(`/api/sessions/${s.id}/next`, { kind: 'followup' })).data;
    assert.equal(s.question.kind, 'followup');
    for (let i = 1; i < 10; i++) {
      s = (
        await request(`/api/sessions/${s.id}/answers`, {
          ...answer,
          requestId: randomUUID(),
          questionText: s.question.text,
        })
      ).data;
      if (i < 9) s = (await request(`/api/sessions/${s.id}/next`, { kind: 'panel' })).data;
    }
    assert.equal(s.status, 'completed');
    assert.equal(s.turns.length, 10);
    let mock: Session = (
      await request('/api/sessions', {
        paperId: p.id,
        stage: 'final',
        mode: 'mock',
        provider: 'sample',
        durationMinutes: 5,
      })
    ).data;
    mock = (
      await request(`/api/sessions/${mock.id}/answers`, {
        ...answer,
        requestId: randomUUID(),
        questionText: mock.question.text,
      })
    ).data;
    assert.equal(mock.turns[0].feedback, undefined);
    assert.equal(
      (await request('/api/workspace')).data.sessions.find((x: any) => x.id === mock.id).turns[0]
        .feedback,
      undefined,
    );
    mock = (await request(`/api/sessions/${mock.id}/end`, {})).data;
    assert.ok(mock.turns[0].feedback);
    let ai: Session = (
      await request('/api/sessions', {
        paperId: real.id,
        stage: 'final',
        mode: 'practice',
        provider: 'groq',
        durationMinutes: 15,
        approval: { paperId: real.id, scope: 'selected-paper-and-answers' },
      })
    ).data;
    assert.equal(calls, 1);
    assert.equal(ai.consent?.paperId, real.id);
    fail = true;
    assert.equal(
      (
        await request(`/api/sessions/${ai.id}/answers`, {
          ...answer,
          requestId: randomUUID(),
          questionText: ai.question.text,
        })
      ).status,
      500,
    );
    ai = (await request(`/api/sessions/${ai.id}`)).data;
    assert.equal(ai.turns.length, 0);
    assert.equal(ai.draft, answer.answer);
    fail = false;
    ai = (
      await request(`/api/sessions/${ai.id}/answers`, {
        ...answer,
        requestId: randomUUID(),
        questionText: ai.question.text,
      })
    ).data;
    assert.equal(ai.turns.length, 1);
    const expired: Session = (
      await request('/api/sessions', {
        paperId: p.id,
        stage: 'proposal',
        mode: 'mock',
        provider: 'sample',
        durationMinutes: 5,
      })
    ).data;
    expired.startedAt = new Date(Date.now() - 6 * 60000).toISOString();
    repo.saveSession('personal', expired);
    const end = (
      await request(`/api/sessions/${expired.id}/answers`, {
        ...answer,
        requestId: randomUUID(),
        questionText: expired.question.text,
      })
    ).data;
    assert.equal(end.status, 'completed');
    assert.equal(end.turns.length, 0);
    assert.equal(end.draft, answer.answer);

    const resumed = (
      await request('/api/sessions', {
        paperId: real.id,
        stage: 'proposal',
        mode: 'practice',
        provider: 'groq',
        durationMinutes: 15,
        approval: { paperId: real.id, scope: 'selected-paper-and-answers' },
      })
    ).data;
    config.groqEnabled = false;
    const beforeDisabled = calls;
    const disabledAnswer = await request(`/api/sessions/${resumed.id}/answers`, {
      ...answer,
      requestId: randomUUID(),
      questionText: resumed.question.text,
    });
    assert.equal(disabledAnswer.status, 503);
    assert.equal(disabledAnswer.data.error.code, 'AI_DISABLED');
    const disabledNext = await request(`/api/sessions/${ai.id}/next`, { kind: 'panel' });
    assert.equal(disabledNext.status, 503);
    assert.equal(disabledNext.data.error.code, 'AI_DISABLED');
    assert.equal(calls, beforeDisabled);
    assert.equal((await request(`/api/sessions/${resumed.id}`)).data.draft, answer.answer);
    config.groqEnabled = true;
    assert.equal((await request('/api/papers/' + real.id, undefined, 'DELETE')).status, 200);
    assert.equal((await request(`/api/sessions/${ai.id}`)).status, 404);
    assert.ok(repo.sessions('personal').length >= 3);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    repo.close();
    const reopened = new Repository(dir);
    reopened.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('restarted app blocks persisted Groq sessions when AI is disabled, with zero provider calls', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'defense-disabled-restart-'));
  let repo = new Repository(dir);
  const { samplePaper } = await import('../shared/sample');
  const paper = samplePaper();
  repo.savePaper('personal', paper);
  const saved: Session = {
    id: randomUUID(),
    paperId: paper.id,
    title: paper.title,
    stage: 'proposal',
    mode: 'practice',
    provider: 'groq',
    status: 'active',
    phase: 'answering',
    startedAt: new Date().toISOString(),
    durationMinutes: 15,
    question: sampleQuestion(0, 'proposal'),
    turns: [],
    draft: '',
    draftRevision: 0,
    modelCalls: 1,
    consent: {
      paperId: paper.id,
      scope: 'selected-paper-and-answers',
      approvedAt: new Date().toISOString(),
    },
  };
  repo.saveSession('personal', saved);
  const reviewing = { ...saved, id: randomUUID(), phase: 'reviewing' as const };
  repo.saveSession('personal', reviewing);
  repo.close();
  repo = new Repository(dir);
  let calls = 0;
  const provider: PanelProvider = {
    async question() {
      calls++;
      throw new Error('Must not transmit');
    },
    async feedback() {
      calls++;
      throw new Error('Must not transmit');
    },
  };
  const config = {
    port: 4850,
    dataDir: dir,
    groqEnabled: false,
    apiKey: 'retained-synthetic-key',
    model: 'openai/gpt-oss-20b',
    dailyCallLimit: 30,
    requestGapMs: 0,
    maxQuestions: 10,
  };
  const app = createApp(config, repo, provider);
  app.get('/', (_req, res) => res.send('local bootstrap'));
  app.use(errorHandler);
  const server = app.listen(config.port, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try {
    const root = 'http://127.0.0.1:4850',
      boot = await fetch(root),
      cookie = boot.headers.get('set-cookie')!.split(';')[0];
    const headers = {
      Cookie: cookie,
      'Content-Type': 'application/json',
      'X-Defense-Request': '1',
    };
    for (const [id, action, body] of [
      [
        saved.id,
        'answers',
        {
          answer: 'A saved session answer after disabling.',
          requestId: randomUUID(),
          questionText: saved.question.text,
        },
      ],
      [reviewing.id, 'next', { kind: 'panel' }],
    ] as const) {
      const response = await fetch(`${root}/api/sessions/${id}/${action}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 503);
      assert.equal((await response.json()).error.code, 'AI_DISABLED');
    }
    assert.equal(calls, 0);
    assert.equal(repo.session('personal', saved.id).modelCalls, 1);
    assert.equal(
      repo.session('personal', saved.id).draft,
      'A saved session answer after disabling.',
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    repo.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
