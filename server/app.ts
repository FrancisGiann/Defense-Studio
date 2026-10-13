import express from 'express';
import multer from 'multer';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { Repository, PERSONAL_OWNER } from './repository';
import { AppError } from './errors';
import { ingestPdf, MAX_UPLOAD_BYTES } from './ingest';
import { GroqProvider, assertGroqAccess, type PanelProvider } from './provider';
import { samplePaper, sampleQuestion, sampleFeedback } from '../shared/sample';
import type { ServerConfig } from './config';
import type { Session } from '../shared/types';
export function publicSession(s: Session): Session {
  return s.mode === 'mock' && s.status === 'active'
    ? { ...s, turns: s.turns.map(({ feedback, ...turn }) => turn) }
    : s;
}
export function createApp(
  config: ServerConfig,
  repo: Repository,
  provider: PanelProvider = new GroqProvider(config),
) {
  const app = express();
  app.disable('x-powered-by');
  const browserToken = randomBytes(32).toString('hex'),
    locks = new Set<string>();
  let uploadBusy = false;
  const allowedHosts = new Set([`127.0.0.1:${config.port}`, `localhost:${config.port}`]);
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Content-Security-Policy': `default-src 'self'; script-src 'self' ${process.env.NODE_ENV === 'production' ? '' : "'unsafe-inline'"}; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self' ws://127.0.0.1:* ws://localhost:*; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`,
    });
    if (!allowedHosts.has(req.headers.host || ''))
      return next(
        new AppError(
          403,
          'HOST_BLOCKED',
          'Personal mode accepts this computer’s localhost address only.',
        ),
      );
    const origin = req.headers.origin;
    if (
      origin &&
      ![`http://127.0.0.1:${config.port}`, `http://localhost:${config.port}`].includes(origin)
    )
      return next(
        new AppError(403, 'ORIGIN_BLOCKED', 'Open Defense Studio directly on localhost.'),
      );
    if (req.headers['sec-fetch-site'] === 'cross-site')
      return next(new AppError(403, 'CROSS_SITE', 'Cross-site requests are not allowed.'));
    // Local browser bootstrap is the personal-mode trust boundary, not production authentication.
    if (req.path === '/' && req.method === 'GET') {
      res.cookie('defense_local', browserToken, { httpOnly: true, sameSite: 'strict', path: '/' });
    }
    next();
  });
  app.get('/health', (_req, res) => res.json({ ok: true, mode: 'personal' }));
  app.use('/api', (req, _res, next) => {
    const token =
      req.headers.cookie
        ?.split(';')
        .map((v) => v.trim())
        .find((v) => v.startsWith('defense_local='))
        ?.slice('defense_local='.length) || '';
    if (
      token.length !== browserToken.length ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(browserToken))
    )
      return next(
        new AppError(
          401,
          'LOCAL_SESSION',
          'Open the app’s home page to begin a private local session.',
        ),
      );
    if (req.method !== 'GET' && req.headers['x-defense-request'] !== '1')
      return next(
        new AppError(
          403,
          'REQUEST_BLOCKED',
          'This action must come from the Defense Studio workspace.',
        ),
      );
    next();
  });
  app.use(express.json({ limit: '24kb' }));
  const owner = PERSONAL_OWNER;
  app.get('/api/workspace', (_req, res) =>
    res.json({
      papers: repo.papers(owner),
      sessions: repo.sessions(owner).map(publicSession),
      config: {
        groqConfigured: config.groqEnabled && Boolean(config.apiKey),
        model: config.model,
        personalOnly: true,
        preview: false,
        dailyCallLimit: config.dailyCallLimit,
        maxQuestions: config.maxQuestions,
      },
    }),
  );
  app.post('/api/papers/sample', (_req, res) => {
    let p;
    try {
      p = repo.paper(owner, 'sample-library');
    } catch {
      p = samplePaper();
      repo.savePaper(owner, p);
    }
    res.json(p);
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0, parts: 1 },
    fileFilter: (_req, file, cb) => {
      if (!['application/pdf', 'application/octet-stream'].includes(file.mimetype))
        cb(new AppError(400, 'PDF_ONLY', 'Choose a PDF file. Other formats are not supported.'));
      else cb(null, true);
    },
  });
  app.post('/api/papers', (req, res, next) => {
    if (uploadBusy)
      return next(
        new AppError(429, 'UPLOAD_BUSY', 'One PDF is being read. Wait a moment and retry.'),
      );
    uploadBusy = true;
    upload.single('file')(req, res, async (error) => {
      try {
        if (error) throw error;
        if (!req.file) throw new AppError(400, 'FILE_MISSING', 'Choose a PDF to upload.');
        const paper = await ingestPdf(req.file.buffer, req.file.originalname);
        repo.savePaper(owner, paper);
        res.status(201).json(paper);
      } catch (e) {
        next(e);
      } finally {
        uploadBusy = false;
      }
    });
  });
  app.delete('/api/papers/:id', (req, res) => {
    repo.deletePaper(owner, req.params.id);
    res.json({ ok: true });
  });
  app.delete('/api/sessions/:id', (req, res) => {
    if (locks.has(req.params.id))
      throw new AppError(
        409,
        'BUSY',
        'Let the current request finish before removing this session.',
      );
    repo.deleteSession(owner, req.params.id);
    res.json({ ok: true });
  });
  const createSchema = z
    .object({
      paperId: z.string().max(100),
      stage: z.enum(['proposal', 'final']),
      mode: z.enum(['practice', 'mock']),
      provider: z.enum(['sample', 'groq']),
      durationMinutes: z.number().int().min(5).max(60),
      approval: z
        .object({ paperId: z.string(), scope: z.literal('selected-paper-and-answers') })
        .optional(),
    })
    .strict();
  async function call(s: Session, task: () => Promise<any>) {
    assertGroqAccess(config, repo.paper(owner, s.paperId), s);
    if (s.modelCalls >= 24)
      throw new AppError(
        429,
        'SESSION_LIMIT',
        'This session’s AI request limit is reached. Finish and review your session.',
      );
    repo.reserveCall(owner, config.dailyCallLimit, config.requestGapMs);
    s.modelCalls++;
    repo.saveSession(owner, s);
    return task();
  }
  app.post('/api/sessions', async (req, res) => {
    const b = createSchema.parse(req.body),
      paper = repo.paper(owner, b.paperId);
    if (b.provider === 'sample' && !paper.sample)
      throw new AppError(
        400,
        'SAMPLE_ONLY',
        'Scripted sample practice uses the synthetic paper. Your paper needs the configured AI panel.',
      );
    if (b.provider === 'groq' && !(config.groqEnabled && config.apiKey))
      throw new AppError(
        503,
        'SETUP_REQUIRED',
        'Add your Groq key to the local .env file and enable Groq, then restart. Sample rehearsal is available now.',
      );
    if (b.provider === 'groq' && b.approval?.paperId !== paper.id)
      throw new AppError(
        403,
        'CONSENT_REQUIRED',
        'Approve this selected paper and your session answers before starting the AI panel.',
      );
    const s: Session = {
      id: randomUUID(),
      paperId: paper.id,
      title: paper.title,
      stage: b.stage,
      mode: b.mode,
      provider: b.provider,
      status: 'active',
      phase: 'answering',
      startedAt: new Date().toISOString(),
      durationMinutes: b.durationMinutes,
      question: sampleQuestion(0, b.stage),
      turns: [],
      draft: '',
      draftRevision: 0,
      modelCalls: 0,
      ...(b.provider === 'groq'
        ? {
            consent: {
              paperId: paper.id,
              approvedAt: new Date().toISOString(),
              scope: 'selected-paper-and-answers',
            },
          }
        : {}),
    };
    // Do not save a fabricated question for an AI session on provider failure.
    if (s.provider === 'groq') {
      assertGroqAccess(config, paper, s);
      repo.reserveCall(owner, config.dailyCallLimit, config.requestGapMs);
      s.modelCalls++;
      s.question = await provider.question(paper, s);
    }
    repo.saveSession(owner, s);
    res.status(201).json(publicSession(s));
  });
  const expired = (s: Session) =>
    s.mode === 'mock' && Date.now() >= Date.parse(s.startedAt) + s.durationMinutes * 60000;
  const complete = (s: Session) => {
    s.status = 'completed';
    s.endedAt = new Date().toISOString();
    repo.saveSession(owner, s);
  };
  app.get('/api/sessions/:id', (req, res) =>
    res.json(publicSession(repo.session(owner, req.params.id))),
  );
  app.patch('/api/sessions/:id/draft', (req, res) => {
    const b = z
        .object({ text: z.string().max(6000), revision: z.number().int().nonnegative() })
        .strict()
        .parse(req.body),
      s = repo.session(owner, req.params.id);
    if (locks.has(s.id)) throw new AppError(409, 'BUSY', 'An answer is being submitted.');
    if (s.status !== 'active' || s.phase !== 'answering')
      throw new AppError(409, 'SESSION_STATE', 'This question no longer accepts drafts.');
    if (s.draftRevision !== b.revision)
      throw new AppError(
        409,
        'DRAFT_CONFLICT',
        'A newer draft exists. Reload this session before continuing.',
      );
    s.draft = b.text;
    s.draftRevision++;
    repo.saveSession(owner, s);
    res.json({ revision: s.draftRevision });
  });
  async function locked(id: string, fn: () => Promise<void>) {
    if (locks.has(id))
      throw new AppError(409, 'BUSY', 'The panel is already working on this session.');
    locks.add(id);
    try {
      await fn();
    } finally {
      locks.delete(id);
    }
  }
  app.post('/api/sessions/:id/answers', async (req, res) => {
    const b = z
      .object({
        answer: z.string().trim().min(3).max(6000),
        requestId: z.string().uuid(),
        questionText: z.string().max(700),
      })
      .strict()
      .parse(req.body);
    await locked(req.params.id, async () => {
      const s = repo.session(owner, req.params.id),
        paper = repo.paper(owner, s.paperId);
      if (s.turns.some((t) => t.id === b.requestId)) {
        res.json(publicSession(s));
        return;
      }
      if (s.status !== 'active' || s.phase !== 'answering')
        throw new AppError(
          409,
          'SESSION_STATE',
          'This question is already submitted. Continue to the next question.',
        );
      if (s.question.text !== b.questionText)
        throw new AppError(
          409,
          'STALE_QUESTION',
          'The question has changed. Reload before submitting.',
        );
      s.draft = b.answer;
      s.draftRevision++;
      repo.saveSession(owner, s);
      if (expired(s)) {
        complete(s);
        res.json(publicSession(s));
        return;
      }
      const feedback =
        s.provider === 'sample'
          ? sampleFeedback(s.question)
          : await call(s, () => provider.feedback(paper, s, b.answer));
      // Merge the latest reserved-call state; draft updates are locked during the call.
      s.turns.push({
        id: b.requestId,
        question: s.question,
        answer: b.answer,
        feedback,
        submittedAt: new Date().toISOString(),
      });
      s.pendingFollowup = feedback.followup;
      s.phase = 'reviewing';
      s.draft = '';
      s.draftRevision++;
      repo.saveSession(owner, s);
      if (s.turns.length >= config.maxQuestions || expired(s)) complete(s);
      res.json(publicSession(s));
    });
  });
  app.post('/api/sessions/:id/next', async (req, res) => {
    const b = z
      .object({ kind: z.enum(['panel', 'followup']) })
      .strict()
      .parse(req.body);
    await locked(req.params.id, async () => {
      const s = repo.session(owner, req.params.id);
      if (s.status !== 'active' || s.phase !== 'reviewing')
        throw new AppError(409, 'SESSION_STATE', 'Submit the current answer before moving on.');
      if (expired(s)) {
        complete(s);
        res.json(publicSession(s));
        return;
      }
      if (b.kind === 'followup' && s.pendingFollowup) s.question = s.pendingFollowup;
      else
        s.question =
          s.provider === 'sample'
            ? sampleQuestion(s.turns.length, s.stage)
            : await call(s, () => provider.question(repo.paper(owner, s.paperId), s));
      s.phase = 'answering';
      delete s.pendingFollowup;
      s.draft = '';
      s.draftRevision++;
      repo.saveSession(owner, s);
      res.json(publicSession(s));
    });
  });
  app.post('/api/sessions/:id/end', async (req, res) => {
    await locked(req.params.id, async () => {
      const s = repo.session(owner, req.params.id);
      if (s.status === 'active') complete(s);
      res.json(publicSession(s));
    });
  });
  app.get('/api/export', (_req, res) => {
    res.attachment('defense-studio-backup.json').json({
      version: 1,
      exportedAt: new Date().toISOString(),
      papers: repo.papers(owner),
      sessions: repo.sessions(owner).map(publicSession),
    });
  });
  // Error middleware is installed after static / Vite middleware by index.ts.
  return app;
}
export const errorHandler: express.ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof AppError) {
    if (error.retryAfter) res.set('Retry-After', String(error.retryAfter));
    res
      .status(error.status)
      .json({ error: { code: error.code, message: error.message, retryAfter: error.retryAfter } });
  } else if (error instanceof z.ZodError)
    res
      .status(400)
      .json({ error: { code: 'INVALID_INPUT', message: 'Check the form values and try again.' } });
  else if (error instanceof multer.MulterError)
    res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
      error: {
        code: 'UPLOAD_LIMIT',
        message:
          error.code === 'LIMIT_FILE_SIZE'
            ? 'Choose a PDF smaller than 10 MB.'
            : 'Upload one PDF at a time.',
      },
    });
  else
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message:
          'The workspace could not complete this action. Your saved work is still available; retry.',
      },
    });
};
