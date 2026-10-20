import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Library,
  LayoutGrid,
  History,
  Target,
  Settings2,
  FileUp,
  ShieldCheck,
  CircleHelp,
  ChevronLeft,
  ChevronRight,
  Check,
  MoreHorizontal,
  Download,
  Trash2,
  Timer,
  Plus,
  Mic2,
  FileText,
  AlertCircle,
} from 'lucide-react';
import type { Workspace, Paper, Session, Source, Stage, Mode } from '../shared/types';
import { api, upload, PREVIEW, ApiError } from './api';
import { Button, Dialog, CitationButtons, FeedbackView, Busy, Empty } from './components';
type View = 'home' | 'papers' | 'history' | 'focus' | 'settings' | 'reader' | 'session';
const initial: Workspace = {
  papers: [],
  sessions: [],
  config: {
    groqConfigured: false,
    model: '',
    personalOnly: true,
    preview: PREVIEW,
    dailyCallLimit: 30,
    maxQuestions: 10,
  },
};
const date = (s: string) =>
  new Date(s).toLocaleDateString('en', { month: 'short', day: 'numeric' });
export function App() {
  const [data, setData] = useState(initial),
    [loading, setLoading] = useState(true),
    [view, setView] = useState<View>('home'),
    [paper, setPaper] = useState<Paper>(),
    [session, setSession] = useState<Session>(),
    [start, setStart] = useState<Paper>(),
    [startMode, setStartMode] = useState<Mode>('practice'),
    [citation, setCitation] = useState<Source>(),
    [tutorial, setTutorial] = useState(false),
    [error, setError] = useState(''),
    [working, setWorking] = useState(''),
    [toast, setToast] = useState(''),
    [confirm, setConfirm] = useState<{
      title: string;
      body: string;
      action: () => Promise<void>;
    }>();
  const fileRef = useRef<HTMLInputElement>(null),
    heading = useRef<HTMLDivElement>(null);
  const refresh = useCallback(async () => {
    const w = await api<Workspace>('/workspace');
    setData(w);
    return w;
  }, []);
  useEffect(() => {
    refresh()
      .then((w) => {
        if (!PREVIEW && !w.papers.length && !sessionStorage.getItem('defense-oriented')) {
          setTutorial(true);
          sessionStorage.setItem('defense-oriented', '1');
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [refresh]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(''), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const navigate = (v: View) => {
    setView(v);
    setError('');
    requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  async function run(task: () => Promise<void>, label: string) {
    setWorking(label);
    setError('');
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This action was interrupted. Try again.');
    } finally {
      setWorking('');
    }
  }
  const useSample = () => {
    setStartMode('practice');
    return run(async () => {
      const p = await api<Paper>('/papers/sample', {});
      await refresh();
      setPaper(p);
      setStart(p);
    }, 'Opening the sample…');
  };
  const onFile = (file?: File) => {
    if (!file) return;
    if (PREVIEW) {
      setError(
        'This hosted preview uses synthetic data only. Run the local app to upload a paper.',
      );
      return;
    }
    if (file.size > 10 * 1024 * 1024 || !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Choose a PDF smaller than 10 MB.');
      return;
    }
    void run(async () => {
      const p = await upload(file);
      await refresh();
      setPaper(p);
      navigate('reader');
      setToast('Paper saved privately. Review the extracted pages before rehearsing.');
    }, 'Reading your PDF…');
  };
  const openSession = (s: Session) =>
    void run(async () => {
      const latest = await api<Session>(`/sessions/${s.id}`);
      setSession(latest);
      setPaper(data.papers.find((p) => p.id === s.paperId));
      navigate('session');
    }, 'Opening the saved rehearsal…');
  const openPaper = (p: Paper) => {
    setPaper(p);
    navigate('reader');
  };
  const onSession = (s: Session) => {
    setSession(s);
    setData((d) => ({ ...d, sessions: [s, ...d.sessions.filter((x) => x.id !== s.id)] }));
  };
  const nav = [
    { view: 'home' as View, label: 'Studio', icon: LayoutGrid },
    { view: 'papers' as View, label: 'My papers', icon: Library },
    { view: 'history' as View, label: 'Practice history', icon: History },
    { view: 'focus' as View, label: 'Focus areas', icon: Target },
  ];
  const active = data.sessions.find((s) => s.status === 'active');
  return (
    <div className={`shell view-${view}`}>
      <a className="skip-link" href="#main">
        Skip to workspace
      </a>
      <header className="workspace-masthead">
        <div className="masthead-inner">
          <button
            className="wordmark"
            onClick={() => navigate('home')}
            aria-label="PanelReady home"
          >
            <span className="wordmark-symbol" aria-hidden="true">
              P<span />
            </span>
            <span>
              Panel<em>Ready</em>
            </span>
          </button>
          <span className="masthead-purpose">A private room for your research.</span>
          <div className="utility-nav">
            <button onClick={() => setTutorial(true)} aria-label="A quick orientation">
              <CircleHelp size={19} />
            </button>
            <button onClick={() => navigate('settings')} aria-label="AI & privacy">
              <ShieldCheck size={18} />
              <span>AI & privacy</span>
            </button>
            <span className="workspace-person" aria-label="Francis, personal workspace">
              F
            </span>
          </div>
        </div>
        <div className="navigation-line">
          <nav className="workspace-nav" aria-label="Workspace">
            {nav.map((n) => {
              const selected =
                view === n.view ||
                (view === 'reader' && n.view === 'papers') ||
                (view === 'session' && n.view === 'home');
              return (
                <button
                  key={n.view}
                  onClick={() => navigate(n.view)}
                  aria-label={n.label}
                  aria-current={selected ? 'page' : undefined}
                  className={selected ? 'active' : ''}
                >
                  <n.icon size={17} />
                  <span>{n.label}</span>
                  {n.view === 'papers' && data.papers.length > 0 && (
                    <small>{data.papers.length}</small>
                  )}
                </button>
              );
            })}
          </nav>
          <span className="workspace-presence">
            <span />
            {PREVIEW ? 'Synthetic sample workspace' : 'Saved on this computer'}
          </span>
        </div>
      </header>
      <div className="main-wrap">
        {view !== 'home' && view !== 'session' && (
          <header className="topbar">
            <span className="breadcrumb">
              Your workspace <span>/</span>{' '}
              {view === 'reader'
                ? 'Source review'
                : nav.find((n) => n.view === view)?.label || 'AI & privacy'}
            </span>
          </header>
        )}
        <main id="main" ref={heading} tabIndex={-1}>
          {PREVIEW && (
            <div className="preview-notice">
              <BookOpen size={15} />
              <span>Interactive sample preview · scripted cues, no AI · resets on reload</span>
            </div>
          )}
          {error && (
            <div className="error-banner" role="alert">
              <AlertCircle size={18} />
              <div>{error}</div>
              <button onClick={() => setError('')} aria-label="Dismiss error">
                ×
              </button>
            </div>
          )}
          {working && (
            <div className="work-banner" role="status">
              <Busy label={working} />
            </div>
          )}
          {loading ? (
            <div className="loading-workspace">
              <div className="skeleton title" />
              <div className="skeleton hero" />
              <Busy label="Opening your workspace…" />
            </div>
          ) : view === 'home' ? (
            <StudioDesk
              papers={data.papers}
              sessions={data.sessions}
              active={active}
              working={Boolean(working)}
              onUpload={() => fileRef.current?.click()}
              onSample={useSample}
              onPaper={openPaper}
              onSession={openSession}
              onHistory={() => navigate('history')}
              onLaunch={(mode) => {
                setStartMode(mode);
                const current = data.papers.find((p) => !p.sample) || data.papers[0];
                if (current) setStart(current);
                else
                  void run(async () => {
                    const sample = await api<Paper>('/papers/sample', {});
                    await refresh();
                    setPaper(sample);
                    setStart(sample);
                  }, 'Opening the sample…');
              }}
            />
          ) : view === 'papers' ? (
            <>
              <PageHeading
                eyebrow="YOUR SOURCE MATERIAL"
                title="A library of your work."
                text="Keep the paper close. Every grounded question starts here."
              />
              <div className="toolbar">
                <span>
                  {data.papers.length} {data.papers.length === 1 ? 'paper' : 'papers'} in your
                  private library
                </span>
                <Button
                  onClick={() => fileRef.current?.click()}
                  disabled={PREVIEW || Boolean(working)}
                >
                  <Plus size={17} />
                  Add a PDF
                </Button>
              </div>
              <div className="paper-grid">
                {data.papers.map((p) => (
                  <article className="library-card" key={p.id}>
                    <div className="library-card-top">
                      <FileText size={24} />
                      <span className="sample-label">
                        {p.sample ? 'Synthetic sample' : 'Private PDF'}
                      </span>
                    </div>
                    <h2>{p.title}</h2>
                    <p>
                      {p.pageCount} physical pages · added {date(p.createdAt)}
                    </p>
                    <div className="library-card-actions">
                      <Button variant="secondary" onClick={() => openPaper(p)}>
                        Review source
                        <ArrowRight size={15} />
                      </Button>
                      <button
                        className="icon-button"
                        aria-label={`Remove ${p.title}`}
                        onClick={() =>
                          setConfirm({
                            title: 'Remove this paper?',
                            body: 'Its extracted text and all associated practice sessions will be removed from this computer.',
                            action: async () => {
                              await api(`/papers/${p.id}`, undefined, 'DELETE');
                              await refresh();
                            },
                          })
                        }
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {!data.papers.length && (
                <Empty
                  title="Give your ideas a place to begin."
                  text={
                    PREVIEW
                      ? 'Open the synthetic paper to explore the full rehearsal flow.'
                      : 'Upload a text-based PDF, up to 10 MB and 120 pages. Or explore the sample first.'
                  }
                  action={useSample}
                  label="Open sample paper"
                />
              )}
              <UploadZone
                disabled={PREVIEW || Boolean(working)}
                onFile={onFile}
                onChoose={() => fileRef.current?.click()}
              />
            </>
          ) : view === 'reader' && paper ? (
            <Reader
              paper={paper}
              onBack={() => navigate('papers')}
              onStart={() => {
                setStartMode('practice');
                setStart(paper);
              }}
            />
          ) : view === 'session' && paper && session ? (
            <Rehearsal
              session={session}
              paper={paper}
              onSession={onSession}
              onOpenCitation={setCitation}
              onExit={() => {
                void refresh();
                navigate('history');
              }}
              onError={setError}
            />
          ) : view === 'history' ? (
            <>
              <PageHeading
                eyebrow="THE PRACTICE YOU PUT IN"
                title="Every rehearsal matters."
                text="Return to an unfinished thought, or see how a session unfolded."
              />
              {data.sessions.length ? (
                data.sessions.map((s) => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    onOpen={() => openSession(s)}
                    onDelete={() =>
                      setConfirm({
                        title: 'Remove this session?',
                        body: 'This removes its answers, coaching, and draft from your local history.',
                        action: async () => {
                          await api(`/sessions/${s.id}`, undefined, 'DELETE');
                          await refresh();
                        },
                      })
                    }
                  />
                ))
              ) : (
                <Empty
                  title="Your first rehearsal is waiting."
                  text="Sessions and answers are saved here automatically in the local app."
                  action={useSample}
                  label="Try a sample rehearsal"
                />
              )}
            </>
          ) : view === 'focus' ? (
            <FocusAreas sessions={data.sessions} onOpen={openSession} />
          ) : view === 'settings' ? (
            <>
              <PageHeading
                eyebrow="AI & PRIVACY"
                title="Your research. Your choice."
                text="Sample practice works now. Connect your own Groq key when you’re ready."
              />
              <div className="settings-grid">
                <section className="settings-card">
                  <div className="section-head">
                    <h2>The AI panel</h2>
                    <span className="support">
                      {data.config.groqConfigured ? 'Configured locally' : 'Setup needed'}
                    </span>
                  </div>
                  <p>Groq is called by the local server. Your key never enters the browser.</p>
                  <ol>
                    <li>
                      Open <code>.env.example</code> in the project folder and save a copy as{' '}
                      <code>.env</code>.
                    </li>
                    <li>
                      Add your own key to <code>GROQ_API_KEY</code>. Set{' '}
                      <code>GROQ_ENABLED=true</code>.
                    </li>
                    <li>
                      Restart the app. Choose a paper, then explicitly approve its excerpts and your
                      session answers.
                    </li>
                  </ol>
                  <p className="small muted">
                    Keep the key in the local file. Don’t paste it into chat. No account creation or
                    paid plan is required by this app.
                  </p>
                  <div className="config-line">
                    <span>Configured model</span>
                    <code>{data.config.model || 'openai/gpt-oss-20b'}</code>
                  </div>
                  <div className="config-line">
                    <span>Daily app limit</span>
                    <span>{data.config.dailyCallLimit} AI requests</span>
                  </div>
                  <a
                    className="text-button"
                    href="https://console.groq.com/docs/rate-limits"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Groq’s current free limits
                    <ArrowUpRight size={14} />
                  </a>
                </section>
                <section className="settings-card">
                  <ShieldCheck size={26} />
                  <h2>A private starting point</h2>
                  <p>
                    The working app runs on localhost. Your extracted pages, answers, and drafts
                    live in a private local database.
                  </p>
                  <p>
                    Nothing is sent to Groq until you approve a selected paper for an AI session.
                    Only selected text excerpts and answers are shared; the original PDF is not
                    uploaded to Groq.
                  </p>
                  <p className="small">
                    Groq says inference content is not retained by default, with exceptions for
                    reliability or abuse monitoring. Review its current policy before sharing.
                  </p>
                  <a
                    className="text-button"
                    href="https://console.groq.com/docs/your-data"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Read Groq’s data policy
                    <ArrowUpRight size={14} />
                  </a>
                  {!PREVIEW && (
                    <a className="button secondary export" href="/api/export">
                      <Download size={16} />
                      Export my local workspace
                    </a>
                  )}
                  <p className="small muted">
                    This is rehearsal support. AI feedback can be wrong and is never committee
                    approval.
                  </p>
                </section>
              </div>
            </>
          ) : null}
          <footer>
            <span>
              PanelReady <span className="footer-dot">·</span> a little clearer, every time.
            </span>
            <span>
              {PREVIEW ? 'Synthetic sample preview' : 'Private by default'}{' '}
              <ShieldCheck size={12} />
            </span>
          </footer>
        </main>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        aria-label="Upload thesis PDF"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
      {start && (
        <StartDialog
          paper={start}
          initialMode={startMode}
          configured={data.config.groqConfigured}
          onClose={() => setStart(undefined)}
          onStart={(s) => {
            onSession(s);
            setPaper(start);
            setStart(undefined);
            navigate('session');
          }}
          onSetup={() => {
            setStart(undefined);
            navigate('settings');
          }}
        />
      )}
      {citation && (
        <Dialog
          title={`Source excerpt · PDF page ${citation.page}`}
          onClose={() => setCitation(undefined)}
        >
          <p className="small muted">Physical PDF page · validated source ID {citation.id}</p>
          <blockquote className="source-excerpt">{citation.text}</blockquote>
          <p className="small muted">
            Check the surrounding extracted page for context. A matching citation confirms the
            excerpt, not the correctness of every AI claim.
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              setCitation(undefined);
              navigate('reader');
            }}
          >
            Review the full source
            <ArrowRight size={15} />
          </Button>
        </Dialog>
      )}
      {tutorial && (
        <Dialog title="Welcome to your rehearsal room." onClose={() => setTutorial(false)}>
          <div className="tutorial-steps">
            {[
              [
                'Bring your paper',
                'Upload a text-based PDF and check the extracted pages. No data leaves your computer at this step.',
              ],
              [
                'Choose your rehearsal',
                'Practice gives coaching after each answer. Mock defense saves feedback for the end and uses a continuous timer.',
              ],
              [
                'Follow the evidence',
                'Open source chips to inspect exact excerpts. Answer in English, Tagalog, or a mix. AI coaching is tentative, never committee approval.',
              ],
            ].map(([title, text], i) => (
              <section key={title}>
                <span>0{i + 1}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </section>
            ))}
          </div>
          <div className="notice">
            Start with the synthetic sample. Its scripted cues demonstrate the flow and do not
            assess your answer.
          </div>
          <Button
            onClick={() => {
              setTutorial(false);
              void useSample();
            }}
          >
            Explore the sample
            <ArrowRight size={16} />
          </Button>
        </Dialog>
      )}
      {confirm && (
        <Dialog title={confirm.title} onClose={() => setConfirm(undefined)}>
          <p>{confirm.body}</p>
          <div className="dialog-actions">
            <Button variant="secondary" onClick={() => setConfirm(undefined)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const action = confirm.action;
                setConfirm(undefined);
                void run(action, 'Removing from your workspace…');
              }}
            >
              Remove
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
function StudioDesk({
  papers,
  sessions,
  active,
  working,
  onUpload,
  onSample,
  onPaper,
  onSession,
  onHistory,
  onLaunch,
}: {
  papers: Paper[];
  sessions: Session[];
  active?: Session;
  working: boolean;
  onUpload: () => void;
  onSample: () => void;
  onPaper: (p: Paper) => void;
  onSession: (s: Session) => void;
  onHistory: () => void;
  onLaunch: (m: Mode) => void;
}) {
  const currentPaper = papers.find((p) => !p.sample) || papers[0];
  return (
    <div className="studio-desk">
      <div className="desk-greeting">
        <span>Welcome back, Francis.</span>
        <span>Your research. Your voice.</span>
      </div>
      <section className="desk-opening">
        <div className="desk-introduction">
          <h1>
            Know your research.
            <br />
            <em>Own the room.</em>
          </h1>
          <p>
            Turn the work you’ve written into an argument you can stand behind. A little more
            clarity, one question at a time.
          </p>
          <div className="desk-actions">
            <Button onClick={onUpload} disabled={working || PREVIEW}>
              <Plus size={18} />
              Bring your thesis
            </Button>
            <button className="text-button" onClick={onSample} disabled={working}>
              Explore a sample
              <ArrowUpRight size={17} />
            </button>
          </div>
          <p className="desk-privacy">
            <ShieldCheck size={15} />
            {PREVIEW
              ? 'Synthetic paper only. No uploads or AI calls in this preview.'
              : 'Your paper stays on this computer. You decide what to share.'}
          </p>
        </div>
        <div className="desk-folio">
          <div className="folio-binding" aria-hidden="true">
            <span>PANELREADY</span>
          </div>
          <div className="folio-content">
            <div className="folio-top">
              <BookOpen size={24} />
              <span>{currentPaper ? 'On your desk' : 'Your next chapter'}</span>
            </div>
            <h2>
              {currentPaper ? (
                currentPaper.title
              ) : (
                <>
                  Good research.
                  <br />A clearer voice.
                </>
              )}
            </h2>
            <p>
              {currentPaper
                ? `${currentPaper.pageCount} physical PDF pages · ${currentPaper.sample ? 'synthetic teaching paper' : 'private source material'}`
                : 'Bring your thesis into the room. Trace each question back to the work behind it.'}
            </p>
            <div className="folio-bottom">
              {currentPaper ? (
                <button onClick={() => onPaper(currentPaper)}>
                  Review your source
                  <ArrowRight size={18} />
                </button>
              ) : (
                <span>
                  <FileText size={17} />
                  PDF · up to 10 MB · 120 pages
                </span>
              )}
            </div>
          </div>
        </div>
      </section>
      <section className="practice-desk" aria-labelledby="practice-title">
        <div className="practice-heading">
          <h2 id="practice-title">Put your thinking into words.</h2>
          <p>
            {currentPaper
              ? 'Rehearse with the paper on your desk.'
              : 'Start with a fictional teaching paper, or bring your own.'}
          </p>
        </div>
        <div className="practice-options">
          <button
            className="practice-option"
            disabled={working}
            onClick={() => onLaunch('practice')}
          >
            <span className="practice-icon">
              <BookOpen size={23} />
            </span>
            <div>
              <h3>Guided practice</h3>
              <p>
                Pause after each answer. Follow the evidence and find a stronger way to explain.
              </p>
              <span>One question at a time</span>
            </div>
            <ArrowUpRight size={22} />
          </button>
          <button className="practice-option" disabled={working} onClick={() => onLaunch('mock')}>
            <span className="practice-icon">
              <Timer size={23} />
            </span>
            <div>
              <h3>Timed mock defense</h3>
              <p>Stay with the panel’s questions. Review your answers and coaching at the end.</p>
              <span>5–45 minutes · your pace</span>
            </div>
            <ArrowUpRight size={22} />
          </button>
        </div>
      </section>
      <div className="desk-bottom">
        <section className="desk-continuity">
          <div className="section-head">
            <h2>{active ? 'An unfinished conversation.' : 'A record of your practice.'}</h2>
            {sessions.length > 0 && (
              <button className="text-button" onClick={onHistory}>
                All sessions
                <ArrowRight size={16} />
              </button>
            )}
          </div>
          {active ? (
            <button className="desk-resume" onClick={() => onSession(active)}>
              <span className="resume-symbol">
                <Mic2 size={22} />
              </span>
              <div>
                <span>
                  {active.provider === 'sample'
                    ? 'Sample rehearsal · scripted cues'
                    : 'Saved rehearsal'}
                </span>
                <h3>{active.title}</h3>
                <p>
                  {active.turns.length} answers saved ·{' '}
                  {active.mode === 'mock' ? 'Mock defense' : 'Guided practice'}
                </p>
              </div>
              <ArrowRight size={21} />
            </button>
          ) : sessions.length ? (
            sessions
              .slice(0, 2)
              .map((s) => <SessionRow key={s.id} session={s} onOpen={() => onSession(s)} />)
          ) : (
            <div className="desk-empty">
              <History size={21} />
              <p>
                Your rehearsals will live here.
                <br />
                <span>Saved answers, unfinished thoughts, and the next thing to work on.</span>
              </p>
            </div>
          )}
        </section>
        <aside className="desk-note">
          <span aria-hidden="true">“</span>
          <p>
            You don’t need a perfect answer.
            <br />
            <em>You need a reason you can explain.</em>
          </p>
          <div>Reason. Evidence. Boundary.</div>
        </aside>
      </div>
    </div>
  );
}
function PageHeading({ title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <div className="page-heading">
      <h1>{title}</h1>
      <p>{text}</p>
    </div>
  );
}
function UploadZone({
  disabled,
  onFile,
  onChoose,
}: {
  disabled: boolean;
  onFile: (file?: File) => void;
  onChoose: () => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={`upload-zone ${over ? 'drag-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) onFile(e.dataTransfer.files[0]);
      }}
    >
      <FileUp size={27} />
      <h3>{PREVIEW ? 'Your real paper belongs in the local app.' : 'Drop your paper here.'}</h3>
      <p>PDF only · up to 10 MB · 120 physical pages · text-based</p>
      <button className="text-button" disabled={disabled} onClick={onChoose}>
        Choose a PDF
        <ArrowRight size={15} />
      </button>
    </div>
  );
}
function SessionRow({
  session: s,
  onOpen,
  onDelete,
}: {
  session: Session;
  onOpen: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="session-row">
      <button className="session-row-main" onClick={onOpen}>
        <span className="session-icon">
          {s.mode === 'mock' ? <Timer size={21} /> : <Mic2 size={21} />}
        </span>
        <div>
          <h3>{s.title}</h3>
          <p>
            {s.mode === 'mock' ? 'Mock defense' : 'Practice'} · {s.stage} · {s.turns.length}{' '}
            {s.turns.length === 1 ? 'answer' : 'answers'}
            {s.provider === 'sample' ? ' · Sample' : ''}
          </p>
        </div>
        <div className="session-meta">
          <span className={`session-status ${s.status}`}>
            {s.status === 'active' ? 'In progress' : 'Completed'}
          </span>
          <span>{date(s.startedAt)}</span>
        </div>
        <ArrowUpRight size={17} />
      </button>
      {onDelete && (
        <button
          className="icon-button"
          aria-label={`Remove session from ${date(s.startedAt)}`}
          onClick={onDelete}
        >
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
}
function Reader({
  paper,
  onBack,
  onStart,
}: {
  paper: Paper;
  onBack: () => void;
  onStart: () => void;
}) {
  const [page, setPage] = useState(1),
    [query, setQuery] = useState('');
  useEffect(() => setPage(1), [paper.id]);
  const content = paper.pages[page - 1];
  const matches =
    query.length > 1
      ? paper.pages.filter((p) => p.text.toLowerCase().includes(query.toLowerCase()))
      : [];
  return (
    <>
      <button className="back-link" onClick={onBack}>
        <ChevronLeft size={15} />
        My papers
      </button>
      <div className="reader-heading">
        <PageHeading
          eyebrow={paper.sample ? 'SYNTHETIC TEACHING PAPER' : 'SOURCE REVIEW'}
          title={paper.title}
          text={`${paper.pageCount} physical PDF pages · text extraction · saved privately`}
        />
        <Button onClick={onStart}>
          Start rehearsal
          <ArrowRight size={17} />
        </Button>
      </div>
      <div className="reader-grid">
        <aside className="reader-index">
          <h2>Keep the source close.</h2>
          <p>Check that the extracted text reflects your paper before practising.</p>
          <label htmlFor="source-search">Find text in the paper</label>
          <input
            id="source-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search words or a phrase"
          />
          {query.length > 1 && (
            <div className="search-results">
              {matches.length ? (
                matches.map((p) => (
                  <button key={p.number} onClick={() => setPage(p.number)}>
                    PDF page {p.number}
                    <ArrowRight size={13} />
                  </button>
                ))
              ) : (
                <p>No matching extracted text.</p>
              )}
            </div>
          )}
          <div className="reader-warnings">
            {paper.warnings.map((w) => (
              <p key={w}>
                <AlertCircle size={14} />
                <span>{w}</span>
              </p>
            ))}
          </div>
          {paper.sample && (
            <a className="text-button" href="/sample-thesis.pdf" download>
              Download sample PDF
              <Download size={14} />
            </a>
          )}
          <span className="small muted">
            Scanned pages need OCR before upload. Tables, images, and formulas may need manual
            checking.
          </span>
        </aside>
        <section className="source-page">
          <div className="source-page-head">
            <span className="eyebrow">EXTRACTED SOURCE TEXT</span>
            <span>
              PDF PAGE {page} OF {paper.pageCount}
            </span>
          </div>
          <div className="source-page-text">
            {content?.text || 'No readable text was extracted from this page.'}
          </div>
          <div className="source-page-nav">
            <button
              className="icon-button"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              aria-label="Previous PDF page"
            >
              <ChevronLeft size={20} />
            </button>
            <label>
              Page{' '}
              <select
                aria-label="PDF page"
                value={page}
                onChange={(e) => setPage(Number(e.target.value))}
              >
                {paper.pages.map((p) => (
                  <option key={p.number} value={p.number}>
                    {p.number}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="icon-button"
              disabled={page === paper.pageCount}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Next PDF page"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
function StartDialog({
  paper,
  initialMode,
  configured,
  onClose,
  onStart,
  onSetup,
}: {
  paper: Paper;
  configured: boolean;
  initialMode: Mode;
  onClose: () => void;
  onStart: (s: Session) => void;
  onSetup: () => void;
}) {
  const [stage, setStage] = useState<Stage>('proposal'),
    [mode, setMode] = useState<Mode>(initialMode),
    [duration, setDuration] = useState(15),
    [provider, setProvider] = useState<'sample' | 'groq'>(paper.sample ? 'sample' : 'groq'),
    [approved, setApproved] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function begin() {
    setBusy(true);
    setError('');
    try {
      onStart(
        await api<Session>('/sessions', {
          paperId: paper.id,
          stage,
          mode,
          provider,
          durationMinutes: duration,
          ...(provider === 'groq' && approved
            ? { approval: { paperId: paper.id, scope: 'selected-paper-and-answers' } }
            : {}),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title="Set the room for your defense."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="selected-paper">
        <FileText size={19} />
        <div>
          {paper.title}
          <small>
            {paper.pageCount} physical pages · {paper.sample ? 'synthetic sample' : 'private paper'}
          </small>
        </div>
      </div>
      <fieldset>
        <legend>Where are you in your research?</legend>
        <div className="choice-grid">
          {(['proposal', 'final'] as const).map((v) => (
            <label className={stage === v ? 'choice selected' : 'choice'} key={v}>
              <input type="radio" name="stage" checked={stage === v} onChange={() => setStage(v)} />
              <strong>{v === 'proposal' ? 'Proposal defense' : 'Final defense'}</strong>
              <span>
                {v === 'proposal'
                  ? 'Design, rationale & feasibility'
                  : 'Evidence, interpretation & limits'}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>How would you like to practise?</legend>
        <div className="choice-grid">
          {(['practice', 'mock'] as const).map((v) => (
            <label className={mode === v ? 'choice selected' : 'choice'} key={v}>
              <input type="radio" name="mode" checked={mode === v} onChange={() => setMode(v)} />
              {v === 'practice' ? <BookOpen size={20} /> : <Timer size={20} />}
              <strong>{v === 'practice' ? 'Guided practice' : 'Mock defense'}</strong>
              <span>
                {v === 'practice' ? 'Feedback after each answer' : 'A timer. Feedback at the end.'}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {mode === 'mock' && (
        <label className="duration-label">
          Session length
          <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            <option value={5}>5 minutes</option>
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={45}>45 minutes</option>
          </select>
        </label>
      )}
      {paper.sample && configured && !PREVIEW && (
        <label className="duration-label">
          Panel
          <select
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value as 'sample' | 'groq');
              setApproved(false);
            }}
          >
            <option value="sample">Scripted sample — no AI calls</option>
            <option value="groq">Groq AI — needs approval below</option>
          </select>
        </label>
      )}
      {provider === 'sample' ? (
        <div className="notice">
          <BookOpen size={18} />
          <p>
            <strong>Sample rehearsal, clearly labelled.</strong> Questions use a fictional paper.
            Feedback is scripted guidance and does not assess your answer. No AI service is called.
          </p>
        </div>
      ) : !configured ? (
        <div className="notice">
          <Settings2 size={19} />
          <p>
            <strong>Your AI panel needs a local key.</strong> The paper is saved. Configure Groq in
            your local environment to practise with it.{' '}
            <button className="text-button" onClick={onSetup}>
              Open setup instructions
              <ArrowRight size={14} />
            </button>
          </p>
        </div>
      ) : (
        <div className="consent">
          <h3>Choose what leaves this computer.</h3>
          <p>
            For <strong>{paper.title}</strong>, the server sends up to six selected source excerpts
            per question or answer, your typed answer, and recent panel questions to Groq. It does
            not send the original PDF. Approval covers this session, including follow-ups.
          </p>
          <a href="https://console.groq.com/docs/your-data" target="_blank" rel="noreferrer">
            Review Groq’s data policy
          </a>
          <label>
            <input
              type="checkbox"
              checked={approved}
              onChange={(e) => setApproved(e.target.checked)}
            />
            <span>
              I approve sharing this selected paper’s excerpts and my session answers with Groq.
            </span>
          </label>
        </div>
      )}
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <span className="small muted">
          English, Tagalog, or both.
          <br />
          Up to 10 questions per session.
        </span>
        <Button
          disabled={busy || (provider === 'groq' && (!configured || !approved))}
          onClick={() => void begin()}
        >
          {busy ? <Busy label="Setting the first question…" /> : 'Enter the rehearsal room'}
          {!busy && <ArrowRight size={16} />}
        </Button>
      </div>
    </Dialog>
  );
}
function Rehearsal({
  session: s,
  paper,
  onSession,
  onOpenCitation,
  onExit,
  onError,
}: {
  session: Session;
  paper: Paper;
  onSession: (s: Session) => void;
  onOpenCitation: (source: Source) => void;
  onExit: () => void;
  onError: (error: string) => void;
}) {
  const [answer, setAnswer] = useState(s.draft),
    [busy, setBusy] = useState(false),
    [draftStatus, setDraftStatus] = useState(''),
    [now, setNow] = useState(Date.now()),
    [ending, setEnding] = useState(false),
    [endConfirm, setEndConfirm] = useState(false),
    [notebookTab, setNotebookTab] = useState<'evidence' | 'guide'>('evidence'),
    [notebookOpen, setNotebookOpen] = useState(false);
  const revision = useRef(s.draftRevision),
    saved = useRef(s.draft),
    saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    chain = useRef(Promise.resolve()),
    requestId = useRef(crypto.randomUUID()),
    answerRef = useRef<HTMLTextAreaElement>(null),
    autoEnded = useRef(false),
    latestDraft = useRef({ answer, busy, status: s.status, phase: s.phase });
  latestDraft.current = { answer, busy, status: s.status, phase: s.phase };
  useEffect(() => {
    setAnswer(s.draft);
    saved.current = s.draft;
    revision.current = s.draftRevision;
    requestId.current = crypto.randomUUID();
    setDraftStatus('');
    if (s.phase === 'answering')
      requestAnimationFrame(() => answerRef.current?.focus({ preventScroll: true }));
  }, [s.id, s.question.text, s.phase]);
  useEffect(() => {
    if (s.mode === 'mock' && s.status === 'active') {
      const timer = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(timer);
    }
  }, [s.id, s.status, s.mode]);
  const seconds = Math.max(
    0,
    Math.ceil((Date.parse(s.startedAt) + s.durationMinutes * 60000 - now) / 1000),
  );
  async function persistDraft() {
    clearTimeout(saveTimer.current);
    await chain.current;
    const current = latestDraft.current;
    if (
      current.status === 'active' &&
      current.phase === 'answering' &&
      !current.busy &&
      current.answer !== saved.current
    ) {
      const result = await api<{ revision: number }>(
        `/sessions/${s.id}/draft`,
        { text: current.answer, revision: revision.current },
        'PATCH',
      );
      revision.current = result.revision;
      saved.current = current.answer;
    }
  }
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (
        latestDraft.current.answer !== saved.current &&
        latestDraft.current.phase === 'answering'
      ) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      void persistDraft().catch(() => {});
    };
  }, [s.id]);
  async function leave() {
    try {
      await persistDraft();
      onExit();
    } catch (e) {
      onError((e as Error).message);
    }
  }
  async function finish() {
    setEnding(true);
    try {
      await persistDraft();
      onSession(await api<Session>(`/sessions/${s.id}/end`, {}));
    } catch (e) {
      onError((e as Error).message);
      autoEnded.current = false;
    } finally {
      setEnding(false);
      setEndConfirm(false);
    }
  }
  useEffect(() => {
    if (
      s.mode === 'mock' &&
      s.status === 'active' &&
      seconds === 0 &&
      !busy &&
      !ending &&
      !autoEnded.current
    ) {
      autoEnded.current = true;
      void finish();
    }
  }, [now, s.status, busy, ending]);
  useEffect(() => {
    if (s.status !== 'active' || s.phase !== 'answering' || busy || answer === saved.current)
      return;
    setDraftStatus('Waiting to save…');
    saveTimer.current = setTimeout(() => {
      const text = answer;
      chain.current = chain.current.then(async () => {
        setDraftStatus('Saving draft…');
        try {
          const result = await api<{ revision: number }>(
            `/sessions/${s.id}/draft`,
            { text, revision: revision.current },
            'PATCH',
          );
          revision.current = result.revision;
          saved.current = text;
          setDraftStatus(PREVIEW ? 'In this preview tab' : 'Draft saved');
        } catch (e) {
          setDraftStatus('Draft not saved');
          onError((e as Error).message);
        }
      });
    }, 700);
    return () => clearTimeout(saveTimer.current);
  }, [answer, s.phase, s.status, s.id, busy]);
  async function action(task: () => Promise<Session>) {
    setBusy(true);
    onError('');
    clearTimeout(saveTimer.current);
    try {
      await chain.current;
      const next = await task();
      revision.current = next.draftRevision;
      onSession(next);
    } catch (e) {
      const error = e as ApiError;
      onError(
        error.message + (error.retryAfter ? ` Retry in about ${error.retryAfter} seconds.` : ''),
      );
    } finally {
      setBusy(false);
    }
  }
  const last = s.turns[s.turns.length - 1],
    sample = s.provider === 'sample';
  if (s.status === 'completed')
    return (
      <>
        <button className="back-link" onClick={onExit}>
          <ChevronLeft size={15} />
          Practice history
        </button>
        <div className="report-header">
          <h1>
            A little clearer
            <br />
            <em>than before.</em>
          </h1>
          <p>
            {s.turns.length} {s.turns.length === 1 ? 'answer' : 'answers'} saved ·{' '}
            {s.mode === 'mock' ? 'Mock' : 'Guided'} {s.stage} defense · {paper.title}
          </p>
        </div>
        {sample && (
          <div className="notice">
            This was a sample rehearsal. The cues below are scripted examples, not an evaluation of
            your answers.
          </div>
        )}
        {s.draft && (
          <section className="unfinished">
            <h2>Your unsubmitted draft</h2>
            <p>
              The timer or session ended before this was submitted. No feedback was generated for
              this draft.
            </p>
            <blockquote>{s.draft}</blockquote>
          </section>
        )}
        {!s.turns.length ? (
          <Empty
            title="A start is still a start."
            text="No answers were submitted in this session. You can begin a new rehearsal from your paper."
          />
        ) : (
          s.turns.map((turn, i) => (
            <article className="report-turn" key={turn.id}>
              <div className="eyebrow">
                QUESTION {String(i + 1).padStart(2, '0')} · {turn.question.focus}
              </div>
              <h2>{turn.question.text}</h2>
              <CitationButtons
                ids={turn.question.citationIds}
                sources={paper.sources}
                onOpen={onOpenCitation}
              />
              <details>
                <summary>Your saved answer</summary>
                <p className="saved-answer">{turn.answer}</p>
              </details>
              {turn.feedback && (
                <FeedbackView feedback={turn.feedback} paper={paper} onOpen={onOpenCitation} />
              )}
            </article>
          ))
        )}
        <Button variant="secondary" onClick={onExit}>
          Return to practice history
          <ArrowRight size={16} />
        </Button>
      </>
    );
  return (
    <>
      <div className="rehearsal-top">
        <button className="back-link" onClick={() => void leave()} disabled={busy || ending}>
          <ChevronLeft size={15} />
          Save & leave
        </button>
        <div className="rehearsal-badges">
          <span className="sample-label">
            {sample ? 'Sample · scripted cues' : 'Groq AI · tentative coaching'}
          </span>
          {s.mode === 'mock' && (
            <span
              className={`timer ${seconds < 60 ? 'urgent' : ''}`}
              aria-label={`${Math.floor(seconds / 60)} minutes ${seconds % 60} seconds remaining`}
            >
              <Timer size={16} />
              {String(Math.floor(seconds / 60)).padStart(2, '0')}:
              {String(seconds % 60).padStart(2, '0')}
            </span>
          )}
        </div>
        <button
          className="text-button"
          onClick={() => setEndConfirm(true)}
          disabled={busy || ending}
        >
          End session
        </button>
      </div>
      <div className="session-paper-title">
        <FileText size={14} />
        {paper.title}
        <span>
          {' '}
          {s.stage} defense / {s.mode === 'mock' ? 'mock defense' : 'guided practice'}
        </span>
      </div>
      <div className="rehearsal-stagebar" aria-label="Rehearsal progress">
        <ol>
          <li className="complete">
            <Check size={14} />
            <span>Read the question</span>
          </li>
          <li
            className={s.phase === 'answering' ? 'current' : 'complete'}
            aria-current={s.phase === 'answering' ? 'step' : undefined}
          >
            <span className="stage-dot">2</span>
            <span>Make your case</span>
          </li>
          <li
            className={s.phase !== 'answering' ? 'current' : ''}
            aria-current={s.phase !== 'answering' ? 'step' : undefined}
          >
            <span className="stage-dot">3</span>
            <span>{s.mode === 'mock' ? 'Continue' : 'Reflect & refine'}</span>
          </li>
        </ol>
        <span>{s.turns.length} of 10 answers saved</span>
      </div>
      <div className="rehearsal-layout">
        <section className="question-room">
          <div className="question-meta">
            <span className="eyebrow">
              {s.question.kind === 'followup' ? 'Follow-up question' : 'Panel question'} ·{' '}
              {s.question.focus}
            </span>
            <span>
              {String(s.turns.length + (s.phase === 'answering' ? 1 : 0)).padStart(2, '0')} / 10
            </span>
          </div>
          <h1 id="panel-question" key={s.question.text}>
            {s.question.text}
          </h1>
          <CitationButtons
            ids={s.question.citationIds}
            sources={paper.sources}
            onOpen={onOpenCitation}
          />
          <button
            className="mobile-notebook-toggle"
            aria-expanded={notebookOpen}
            aria-controls="evidence-notebook"
            onClick={() => setNotebookOpen(!notebookOpen)}
          >
            <BookOpen size={17} />
            <span>{notebookOpen ? 'Close evidence notebook' : 'Open evidence notebook'}</span>
            <span>{s.question.citationIds.length} excerpts</span>
          </button>
          <aside
            id="evidence-notebook"
            className={`evidence-notebook ${notebookOpen ? 'is-open' : ''}`}
            aria-label="Evidence notebook"
          >
            <div className="notebook-heading">
              <BookOpen size={21} />
              <h2>Keep the source close.</h2>
            </div>
            <div className="notebook-switch" role="group" aria-label="Notebook view">
              <button
                aria-pressed={notebookTab === 'evidence'}
                onClick={() => setNotebookTab('evidence')}
              >
                Source excerpts <span>{s.question.citationIds.length}</span>
              </button>
              <button
                aria-pressed={notebookTab === 'guide'}
                onClick={() => setNotebookTab('guide')}
              >
                Answer guide
              </button>
            </div>
            {notebookTab === 'evidence' ? (
              <div className="notebook-content" tabIndex={0} role="region" aria-label="Question source excerpts">
                <p className="notebook-context">
                  The passages linked to this question. Read them alongside the full page.
                </p>
                {s.question.citationIds.map((id) => {
                  const source = paper.sources.find((x) => x.id === id);
                  return source ? (
                    <article className="notebook-excerpt" key={id}>
                      <button onClick={() => onOpenCitation(source)}>
                        <span>PDF page {source.page}</span>
                        <ArrowUpRight size={16} />
                        <span className="sr-only">Open source excerpt</span>
                      </button>
                      <p>{source.text}</p>
                    </article>
                  ) : null;
                })}
                {!s.question.citationIds.length && (
                  <p>No source excerpts are attached to this question.</p>
                )}
              </div>
            ) : (
              <div className="notebook-content answer-guide" tabIndex={0} role="region" aria-label="Answer guide reading area">
                <p>Build an answer the panel can follow.</p>
                <dl>
                  <div>
                    <dt>Reason</dt>
                    <dd>Explain the choice you made and why it fits your research question.</dd>
                  </div>
                  <div>
                    <dt>Evidence</dt>
                    <dd>
                      Point to a specific passage. Separate what the paper says from your
                      interpretation.
                    </dd>
                  </div>
                  <div>
                    <dt>Boundary</dt>
                    <dd>Say where the claim stops. Name what your study cannot establish.</dd>
                  </div>
                </dl>
              </div>
            )}
            <div className="notebook-footnote">
              <ShieldCheck size={16} />
              <p>
                {sample
                  ? 'Synthetic paper. Scripted cues demonstrate the room; they do not assess your answer.'
                  : 'AI coaching is tentative. A matching citation does not prove a claim is correct.'}
              </p>
            </div>
          </aside>
          {s.phase === 'answering' ? (
            <form
              className="answer-composer"
              onSubmit={(e) => {
                e.preventDefault();
                void action(() =>
                  api<Session>(`/sessions/${s.id}/answers`, {
                    answer,
                    requestId: requestId.current,
                    questionText: s.question.text,
                  }),
                );
              }}
            >
              <div className="answer-label">
                <label htmlFor="answer">Your answer</label>
                <span>English, Tagalog, or both</span>
              </div>
              <p className="answer-prompt" id="answer-prompt">
                Make a claim. Give your reason. Show where the evidence leads.
              </p>
              <textarea
                aria-describedby="answer-prompt"
                ref={answerRef}
                id="answer"
                value={answer}
                maxLength={6000}
                disabled={busy || ending}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Start with your decision. Explain your reasoning. Bring it back to your paper."
                rows={6}
              />
              <div className="answer-bottom">
                <span className="draft-status" role="status">
                  {draftStatus || 'Take a breath. Find your words.'}
                  <small>{answer.length.toLocaleString()} / 6,000 characters</small>
                </span>
                <Button type="submit" disabled={answer.trim().length < 3 || busy || ending}>
                  {busy ? (
                    <Busy label={sample ? 'Opening sample cues…' : 'The panel is considering…'} />
                  ) : s.mode === 'mock' ? (
                    'Submit answer'
                  ) : (
                    'Reflect on my answer'
                  )}
                  {!busy && <ArrowRight size={16} />}
                </Button>
              </div>
            </form>
          ) : (
            <div className="answer-received">
              <span>
                <Check size={17} />
                Answer saved
              </span>
              {s.mode === 'mock' ? (
                <>
                  <h2>Keep your train of thought.</h2>
                  <p>Coaching is held until the end of your mock defense.</p>
                </>
              ) : (
                last?.feedback && (
                  <FeedbackView feedback={last.feedback} paper={paper} onOpen={onOpenCitation} />
                )
              )}
              {last && (
                <details className="answer-recall">
                  <summary>Read your submitted answer</summary>
                  <p className="saved-answer">{last.answer}</p>
                </details>
              )}
              <div className="next-actions">
                <Button
                  disabled={busy}
                  onClick={() =>
                    void action(() => api<Session>(`/sessions/${s.id}/next`, { kind: 'followup' }))
                  }
                >
                  {busy ? <Busy label="Setting the next question…" /> : 'Take the follow-up'}
                  {!busy && <ArrowRight size={16} />}
                </Button>
                <button
                  disabled={busy}
                  className="text-button"
                  onClick={() =>
                    void action(() => api<Session>(`/sessions/${s.id}/next`, { kind: 'panel' }))
                  }
                >
                  A new panel question
                  <ArrowUpRight size={15} />
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
      {endConfirm && (
        <Dialog title="Close this rehearsal?" onClose={() => setEndConfirm(false)}>
          <p>
            Your submitted answers and saved draft stay in history.{' '}
            {s.mode === 'mock'
              ? 'End-of-session coaching will now become visible.'
              : 'You can return to the completed session any time.'}
          </p>
          <div className="dialog-actions">
            <Button variant="secondary" onClick={() => setEndConfirm(false)}>
              Keep practising
            </Button>
            <Button disabled={ending} onClick={() => void finish()}>
              {ending ? 'Saving…' : 'End & review'}
              <ArrowRight size={15} />
            </Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
function FocusAreas({ sessions, onOpen }: { sessions: Session[]; onOpen: (s: Session) => void }) {
  const areas = new Map<string, { count: number; session: Session; sample: boolean }>();
  for (const s of sessions) {
    if (s.mode === 'mock' && s.status === 'active') continue;
    for (const t of s.turns) {
      const f = t.feedback;
      if (f && (f.sample || f.support !== 'supported')) {
        const key = `${f.sample ? 'sample:' : ''}${f.weakArea}`;
        areas.set(key, { count: (areas.get(key)?.count || 0) + 1, session: s, sample: f.sample });
      }
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="A DIRECTION FOR YOUR NEXT SESSION"
        title="Give the hard parts attention."
        text="Return to reasoning that needs work. No invented readiness score."
      />
      {areas.size ? (
        <div className="focus-list">
          {[...areas.entries()].map(([name, a], i) => (
            <article key={name}>
              <div>
                <span className="eyebrow">
                  {a.sample ? 'SAMPLE REHEARSAL TOPIC' : 'AI-SUGGESTED FOCUS · VERIFY'}
                </span>
                <h2>{name.replace(/^sample:/, '')}</h2>
                <p>
                  {a.sample
                    ? 'Scripted cue from sample practice.'
                    : 'Flagged for another look in saved coaching.'}{' '}
                  {a.count} {a.count === 1 ? 'answer' : 'answers'}.
                </p>
              </div>
              <button className="text-button" onClick={() => onOpen(a.session)}>
                Revisit session
                <ArrowUpRight size={16} />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="Let the questions show you where to focus."
          text="Topics appear after you receive coaching. In a mock defense, they stay hidden until the end."
        />
      )}
    </>
  );
}
