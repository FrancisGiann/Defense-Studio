export type Stage = 'proposal' | 'final';
export type Mode = 'practice' | 'mock';
export type Source = { id: string; page: number; text: string };
export type Paper = {
  id: string;
  title: string;
  filename: string;
  createdAt: string;
  pageCount: number;
  sample: boolean;
  pages: { number: number; text: string }[];
  sources: Source[];
  warnings: string[];
};
export type Citation = Source;
export type Question = {
  text: string;
  focus: string;
  citationIds: string[];
  kind: 'panel' | 'followup';
};
export type Feedback = {
  summary: string;
  strength: string;
  improve: string;
  nextStep: string;
  evidence: { citationId: string; quote: string }[];
  support: 'supported' | 'partial' | 'unsupported' | 'absent' | 'sample';
  weakArea: string;
  followup: Question;
  sample: boolean;
};
export type Turn = {
  id: string;
  question: Question;
  answer: string;
  feedback?: Feedback;
  submittedAt: string;
};
export type Session = {
  id: string;
  paperId: string;
  title: string;
  stage: Stage;
  mode: Mode;
  provider: 'sample' | 'groq';
  status: 'active' | 'completed';
  phase: 'answering' | 'reviewing';
  startedAt: string;
  endedAt?: string;
  durationMinutes: number;
  question: Question;
  turns: Turn[];
  draft: string;
  draftRevision: number;
  modelCalls: number;
  pendingFollowup?: Question;
  consent?: { paperId: string; approvedAt: string; scope: string };
  nextRequestAt?: number;
};
export type Config = {
  groqConfigured: boolean;
  model: string;
  personalOnly: boolean;
  preview: boolean;
  dailyCallLimit: number;
  maxQuestions: number;
};
export type Workspace = { papers: Paper[]; sessions: Session[]; config: Config };
