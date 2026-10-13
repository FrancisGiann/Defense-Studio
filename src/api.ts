import type { Workspace, Paper, Session } from '../shared/types';
import { samplePaper, sampleQuestion, sampleFeedback } from '../shared/sample';
export const PREVIEW = import.meta.env.VITE_PREVIEW_ONLY === 'true';
export class ApiError extends Error {
  constructor(
    message: string,
    public code = '',
    public retryAfter?: number,
  ) {
    super(message);
  }
}
let sample: Workspace = {
  papers: [],
  sessions: [],
  config: {
    groqConfigured: false,
    model: 'openai/gpt-oss-20b',
    personalOnly: true,
    preview: true,
    dailyCallLimit: 30,
    maxQuestions: 10,
  },
};
export async function api<T>(
  path: string,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
): Promise<T> {
  if (PREVIEW) return preview(path, body, method) as T;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers:
        body instanceof FormData
          ? { 'X-Defense-Request': '1' }
          : { 'Content-Type': 'application/json', 'X-Defense-Request': '1' },
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('The local workspace is unreachable. Start the app, then retry.', 'OFFLINE');
  }
  const data = await res.json();
  if (!res.ok)
    throw new ApiError(
      data.error?.message || 'Something interrupted this action. Try again.',
      data.error?.code,
      data.error?.retryAfter,
    );
  return data;
}
function preview(path: string, body: any, method: string): unknown {
  if (path === '/workspace') return structuredClone(sample);
  if (path === '/papers/sample') {
    const p = samplePaper();
    if (!sample.papers.length) sample.papers.push(p);
    return p;
  }
  if (path === '/sessions' && method === 'POST') {
    const s: Session = {
      id: crypto.randomUUID(),
      paperId: 'sample-library',
      title: samplePaper().title,
      stage: body.stage,
      mode: body.mode,
      provider: 'sample',
      status: 'active',
      phase: 'answering',
      startedAt: new Date().toISOString(),
      durationMinutes: body.durationMinutes,
      question: sampleQuestion(0, body.stage),
      turns: [],
      draft: '',
      draftRevision: 0,
      modelCalls: 0,
    };
    sample.sessions.unshift(s);
    return structuredClone(s);
  }
  if (path.startsWith('/papers/') && method === 'DELETE') {
    sample.papers = [];
    sample.sessions = [];
    return { ok: true };
  }
  const id = path.split('/')[2],
    s = sample.sessions.find((s) => s.id === id);
  if (!s) throw new ApiError('This sample session has ended. Start a new rehearsal.');
  if (method === 'DELETE') {
    sample.sessions = sample.sessions.filter((x) => x.id !== id);
    return { ok: true };
  }
  if (path.endsWith('/draft')) {
    s.draft = body.text;
    s.draftRevision++;
    return { revision: s.draftRevision };
  }
  if (path.endsWith('/answers')) {
    const f = sampleFeedback(s.question);
    s.turns.push({
      id: body.requestId,
      question: s.question,
      answer: body.answer,
      feedback: f,
      submittedAt: new Date().toISOString(),
    });
    s.pendingFollowup = f.followup;
    s.phase = 'reviewing';
    s.draft = '';
    s.draftRevision++;
    if (s.turns.length === 10) {
      s.status = 'completed';
      s.endedAt = new Date().toISOString();
    }
  }
  if (path.endsWith('/next')) {
    s.question =
      body.kind === 'followup' && s.pendingFollowup
        ? s.pendingFollowup
        : sampleQuestion(s.turns.length, s.stage);
    s.phase = 'answering';
    s.draft = '';
    s.draftRevision++;
    delete s.pendingFollowup;
  }
  if (path.endsWith('/end')) {
    s.status = 'completed';
    s.endedAt = new Date().toISOString();
  }
  const view = structuredClone(s);
  if (view.mode === 'mock' && view.status === 'active')
    view.turns = view.turns.map(({ feedback, ...t }) => t);
  return view;
}
export async function upload(file: File) {
  const body = new FormData();
  body.append('file', file);
  return api<Paper>('/papers', body);
}
