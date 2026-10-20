import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { Repository } from '../server/repository';
import { samplePaper, sampleFeedback, sampleQuestion, sourcesFromPages } from '../shared/sample';
import { validateQuestion, validateFeedback, GroqProvider, retrieve } from '../server/provider';
import { ingestPdf, MAX_UPLOAD_BYTES } from '../server/ingest';
import { readConfig } from '../server/config';
const paper = samplePaper();
test('retained sources cover full long text, keep physical pages and stable IDs', () => {
  const text = Array.from({ length: 1000 }, (_, i) => `sentence${i}`).join(' ');
  const sources = sourcesFromPages([{ number: 19, text }]);
  assert.equal(sources.map((s) => s.text).join(' '), text);
  assert.ok(sources.every((s) => s.page === 19 && s.id.startsWith('p19-')));
});
test('question validation rejects foreign citation IDs and model-made page labels', () => {
  assert.throws(() =>
    validateQuestion(
      { text: 'Why this design?', focus: 'Design', citationIds: ['p999-s1'] },
      paper.sources,
    ),
  );
  assert.throws(() =>
    validateQuestion(
      { text: 'Why does page 99 show positive results?', focus: 'Design', citationIds: ['p1-s1'] },
      paper.sources,
    ),
  );
  assert.equal(
    validateQuestion(
      { text: 'Why this design?', focus: 'Design', citationIds: ['p1-s1'] },
      paper.sources,
    ).kind,
    'panel',
  );
});
test('feedback rejects fabricated quotes and foreign evidence; supports exact quotes', () => {
  const f = sampleFeedback(sampleQuestion(0, 'proposal'));
  const { sample, ...raw } = f;
  const { kind, ...followup } = f.followup;
  const valid = { ...raw, support: 'partial', followup };
  assert.equal(validateFeedback(valid, paper.sources).sample, false);
  assert.throws(() =>
    validateFeedback(
      {
        ...valid,
        evidence: [
          {
            citationId: 'p1-s1',
            quote: 'Participants reported that their grades improved by 80 percent.',
          },
        ],
      },
      paper.sources,
    ),
  );
  assert.throws(() =>
    validateFeedback(
      {
        ...valid,
        evidence: [{ citationId: 'other-paper', quote: paper.sources[0].text.slice(0, 50) }],
      },
      paper.sources,
    ),
  );
  assert.throws(() => validateFeedback({ ...valid, evidence: [] }, paper.sources));
  assert.equal(
    validateFeedback({ ...valid, support: 'absent', evidence: [] }, paper.sources).support,
    'absent',
  );
});
test('retrieval is bounded, exact and never creates new excerpts', () => {
  const many = {
    ...paper,
    sources: sourcesFromPages([{ number: 1, text: 'proposed methodology '.repeat(1800) }]),
  };
  const selected = retrieve(many, 'sampling', 0);
  assert.ok(selected.length <= 6);
  assert.ok(selected.reduce((n, s) => n + s.text.length, 0) <= 6500);
  assert.ok(selected.every((s) => many.sources.some((x) => x.id === s.id && x.text === s.text)));
});
test('private repository persists across reopen, isolates owners, cascades deletion and keeps budgets', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'defense-repo-'));
  try {
    let repo = new Repository(dir);
    repo.savePaper('alice', paper);
    assert.equal(repo.papers('bob').length, 0);
    assert.throws(() => repo.paper('bob', paper.id));
    repo.reserveCall('alice', 1, 0);
    repo.close();
    repo = new Repository(dir);
    assert.equal(repo.paper('alice', paper.id).title, paper.title);
    assert.throws(() => repo.reserveCall('alice', 1, 0));
    assert.equal(statSync(path.join(dir, 'studio.sqlite')).mode & 0o777, 0o600);
    repo.deletePaper('alice', paper.id);
    assert.equal(repo.papers('alice').length, 0);
    repo.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('PDF extraction validates real page count and source text on synthetic fixture', async () => {
  const p = await ingestPdf(readFileSync('public/sample-thesis.pdf'), 'sample.pdf');
  assert.equal(p.pageCount, 5);
  assert.match(p.pages[1].text, /Purposive sampling seeks twelve/);
  assert.ok(
    p.sources.some(
      (s) =>
        s.id === 'p4-s1' && s.page === 4 && s.text.includes('No interviews have been conducted'),
    ),
  );
  assert.equal(p.sample, false);
});
test('rejects non-PDF, corrupt, oversize, scanned and >120-page uploads', async () => {
  await assert.rejects(ingestPdf(Buffer.from('not pdf'), 'paper.docx'));
  await assert.rejects(ingestPdf(Buffer.from('%PDF-fake'), 'fake.pdf'));
  await assert.rejects(ingestPdf(Buffer.alloc(MAX_UPLOAD_BYTES + 1), 'huge.pdf'));
  const blank = await PDFDocument.create();
  blank.addPage();
  await assert.rejects(ingestPdf(Buffer.from(await blank.save()), 'scan.pdf'), /No readable text/);
  const tooMany = await PDFDocument.create();
  for (let i = 0; i < 121; i++) tooMany.addPage();
  await assert.rejects(ingestPdf(Buffer.from(await tooMany.save()), 'many.pdf'), /120 pages/);
});
test('mocked Groq transport uses fixed endpoint and data role, returns validated question, handles quota', async () => {
  const config = { ...readConfig(), apiKey: 'synthetic-test-only', groqEnabled: true };
  let seen: any;
  const transport = async (url: any, init: any) => {
    assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
    seen = JSON.parse(init.body);
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                text: 'Why this design?',
                focus: 'Design',
                citationIds: ['p1-s1'],
              }),
            },
          },
        ],
      }),
    );
  };
  const provider = new GroqProvider(config, transport as typeof fetch);
  const s: any = {
    stage: 'proposal',
    turns: [],
    question: sampleQuestion(0, 'proposal'),
    provider: 'groq',
    paperId: paper.id,
    consent: {
      paperId: paper.id,
      scope: 'selected-paper-and-answers',
      approvedAt: new Date().toISOString(),
    },
  };
  await provider.question(paper, s);
  assert.match(seen.messages[0].content, /UNTRUSTED DATA/);
  assert.equal(seen.messages.length, 2);
  assert.equal(seen.response_format.type, 'json_object');
  const quota = new GroqProvider(
    config,
    (async () =>
      new Response('{}', { status: 429, headers: { 'retry-after': '7' } })) as typeof fetch,
  );
  await assert.rejects(
    quota.question(paper, s),
    (e: any) => e.code === 'PROVIDER_QUOTA' && e.retryAfter === 7,
  );
});

function approvedSession(): any {
  return {
    stage: 'proposal',
    turns: [],
    question: sampleQuestion(0, 'proposal'),
    provider: 'groq',
    paperId: paper.id,
    consent: {
      paperId: paper.id,
      scope: 'selected-paper-and-answers',
      approvedAt: new Date().toISOString(),
    },
  };
}
function groundedFeedback(s = approvedSession()) {
  const { sample, ...f } = sampleFeedback(s.question);
  const { kind, ...followup } = f.followup;
  return { ...f, support: 'supported', followup };
}
test('supported feedback cannot use blank, whitespace-padded, empty-source or invalid-ID evidence', () => {
  const valid = groundedFeedback();
  for (const quote of [
    '',
    ' '.repeat(20),
    '\t\n\r'.repeat(12),
    'A' + ' '.repeat(30),
    '.'.repeat(30),
  ])
    assert.throws(() =>
      validateFeedback({ ...valid, evidence: [{ citationId: 'p1-s1', quote }] }, paper.sources),
    );
  for (const citationId of ['', ' '.repeat(20), 'p0-s1', 'p1-s0', 'p999-s1', 'foreign-paper']) {
    assert.throws(() =>
      validateFeedback(
        { ...valid, evidence: [{ citationId, quote: paper.sources[0].text.slice(0, 80) }] },
        paper.sources,
      ),
    );
    assert.throws(() =>
      validateQuestion(
        { text: 'Why this design?', focus: 'Design', citationIds: [citationId] },
        paper.sources,
      ),
    );
  }
  assert.throws(() =>
    validateFeedback(
      { ...valid, followup: { ...valid.followup, citationIds: ['p999-s1'] } },
      paper.sources,
    ),
  );
  assert.throws(() => validateFeedback(valid, [{ id: 'p1-s1', page: 1, text: ' '.repeat(80) }]));
  const checked = validateFeedback(
    {
      ...valid,
      evidence: [{ citationId: 'p1-s1', quote: '  ' + paper.sources[0].text.slice(0, 80) + '  ' }],
    },
    paper.sources,
  );
  assert.equal(checked.support, 'supported');
  assert.equal(checked.evidence[0].quote, paper.sources[0].text.slice(0, 80).trim());
});
test('every Groq transport call fails closed for disabled/missing-key/unapproved/mismatched sessions', async () => {
  let calls = 0;
  const transport = (async () => {
    calls++;
    throw new Error('Should not transmit');
  }) as typeof fetch;
  const base = { ...readConfig(), groqEnabled: true, apiKey: 'synthetic-test-only' };
  const cases = [
    { config: { ...base, groqEnabled: false }, s: approvedSession() },
    { config: { ...base, apiKey: '   ' }, s: approvedSession() },
    { config: base, s: { ...approvedSession(), consent: undefined } },
    { config: base, s: { ...approvedSession(), paperId: 'another-paper' } },
    {
      config: base,
      s: {
        ...approvedSession(),
        consent: { ...approvedSession().consent, paperId: 'another-paper' },
      },
    },
    {
      config: base,
      s: { ...approvedSession(), consent: { ...approvedSession().consent, scope: 'wrong-scope' } },
    },
    { config: base, s: { ...approvedSession(), provider: 'sample' } },
  ];
  for (const { config, s } of cases) {
    const provider = new GroqProvider(config, transport);
    await assert.rejects(provider.question(paper, s));
    await assert.rejects(provider.feedback(paper, s, 'A typed research answer.'));
  }
  assert.equal(calls, 0);
});
test('feedback sends at most six exact excerpts including anchors and bounded characters', async () => {
  const many = {
    ...paper,
    sources: Array.from({ length: 12 }, (_, i) => ({
      id: `p${i + 1}-s1`,
      page: i + 1,
      text: `Research excerpt ${i + 1}: methodology, evidence and limitation context for the synthetic study.`,
    })),
  };
  const s = approvedSession();
  s.question = {
    text: 'Which research limitations matter?',
    focus: 'Limitations',
    kind: 'panel',
    citationIds: many.sources.slice(8, 12).map((x) => x.id),
  };
  let sent: any;
  const transport = async (_url: any, init: any) => {
    const body = JSON.parse(init.body);
    sent = JSON.parse(body.messages[1].content);
    const first = sent.SOURCE_EXCERPTS[0];
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: 'A tentative observation.',
                strength: 'You state a clear decision.',
                improve: 'Explain the boundary of the claim.',
                nextStep: 'Rehearse the boundary clearly.',
                support: 'supported',
                weakArea: 'Limitations',
                evidence: [{ citationId: first.id, quote: first.text }],
                followup: {
                  text: 'What would change your decision?',
                  focus: 'Limitations',
                  citationIds: [first.id],
                },
              }),
            },
          },
        ],
      }),
    );
  };
  await new GroqProvider(
    { ...readConfig(), groqEnabled: true, apiKey: 'synthetic-test-only' },
    transport as typeof fetch,
  ).feedback(many, s, 'The limitations should bound the claims.');
  assert.equal(sent.SOURCE_EXCERPTS.length, 6);
  assert.ok(
    s.question.citationIds.every((id: string) =>
      sent.SOURCE_EXCERPTS.some((x: any) => x.id === id),
    ),
  );
  assert.ok(sent.SOURCE_EXCERPTS.reduce((n: number, x: any) => n + x.text.length, 0) <= 6500);
});

test('invalid saved answer anchors fail closed, while a first question can use a one-page paper', async () => {
  const config = { ...readConfig(), groqEnabled: true, apiKey: 'synthetic-test-only' };
  let calls = 0;
  const onePage = {
    ...paper,
    pages: paper.pages.slice(0, 1),
    pageCount: 1,
    sources: paper.sources.filter((s) => s.page === 1),
  };
  const transport = async () => {
    calls++;
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                text: 'What claim can this paper support?',
                focus: 'Evidence',
                citationIds: ['p1-s1'],
              }),
            },
          },
        ],
      }),
    );
  };
  const provider = new GroqProvider(config, transport as typeof fetch);
  const s = approvedSession();
  await provider.question(onePage, s);
  assert.equal(calls, 1);
  s.question = { ...s.question, citationIds: ['p999-s1'] };
  await assert.rejects(provider.feedback(paper, s, 'A typed answer.'));
  assert.equal(calls, 1);
});


test('Groq failures return actionable codes with one transport attempt and a bounded signal', async () => {
  const config = { ...readConfig(), groqEnabled: true, apiKey: 'synthetic-test-only' };
  const cases = [
    { status: 401, code: 'PROVIDER_KEY' },
    { status: 403, code: 'PROVIDER_KEY' },
    { status: 500, code: 'PROVIDER_ERROR' },
    { status: 200, code: 'PROVIDER_FORMAT' },
    { status: 0, code: 'PROVIDER_UNAVAILABLE' },
  ];
  for (const scenario of cases) {
    let calls = 0;
    const transport = (async (_url: unknown, init: RequestInit) => {
      calls++;
      assert.ok(init.signal instanceof AbortSignal);
      assert.equal(init.signal.aborted, false);
      if (!scenario.status) throw new DOMException('Synthetic timeout', 'TimeoutError');
      return new Response('{}', { status: scenario.status });
    }) as typeof fetch;
    const provider = new GroqProvider(config, transport);
    await assert.rejects(provider.question(paper, approvedSession()), (e: any) => e.code === scenario.code);
    assert.equal(calls, 1, 'Provider failures must not cause automatic retries');
  }
});
