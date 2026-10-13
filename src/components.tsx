import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { ArrowUpRight, X, BookOpen, ArrowRight, LoaderCircle } from 'lucide-react';
import type { Source, Feedback, Paper } from '../shared/types';
export function Button({
  children,
  onClick,
  variant = '',
  disabled = false,
  type = 'button',
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}) {
  return (
    <button
      type={type}
      className={`button ${variant} ${className}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
export function Busy({ label = 'Reading your paper…' }: { label?: string }) {
  return (
    <span className="busy">
      <LoaderCircle size={17} />
      {label}
    </span>
  );
}
export function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const old = document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      // Close before unmounting so the document is no longer inert when focus returns.
      dialog?.close();
      if (old?.isConnected) (old as HTMLElement)?.focus?.({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      className={wide ? 'dialog wide' : 'dialog'}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="dialog-head">
        <h2 id="dialog-title">{title}</h2>
        <button className="icon-button" aria-label="Close dialog" onClick={onClose}>
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function CitationButtons({
  ids,
  sources,
  onOpen,
}: {
  ids: string[];
  sources: Source[];
  onOpen: (source: Source) => void;
}) {
  return (
    <div className="citation-buttons">
      {ids.map((id) => {
        const source = sources.find((s) => s.id === id);
        return source ? (
          <button key={id} onClick={() => onOpen(source)}>
            <BookOpen size={13} />
            PDF p. {source.page}
            <ArrowUpRight size={13} />
          </button>
        ) : null;
      })}
    </div>
  );
}
export function FeedbackView({
  feedback,
  paper,
  onOpen,
}: {
  feedback: Feedback;
  paper: Paper;
  onOpen: (s: Source) => void;
}) {
  const label = {
    supported: 'Supported by retrieved excerpts',
    partial: 'Partially supported',
    unsupported: 'Unsupported claim to revisit',
    absent: 'Information absent from retrieved excerpts',
    sample: 'Scripted example · not an assessment',
  }[feedback.support];
  return (
    <div className="feedback-view">
      <h3>
        {feedback.sample ? 'Build a clearer response.' : 'A moment to sharpen your reasoning.'}
      </h3>
      <span className={`support ${feedback.support}`}>{label}</span>
      <p>{feedback.summary}</p>
      <div className="feedback-sections">
        <section>
          <div>
            <h4>{feedback.sample ? 'Start here' : 'What works'}</h4>
            <p>{feedback.strength}</p>
          </div>
        </section>
        <section>
          <div>
            <h4>{feedback.sample ? 'Rehearsal cue' : 'What to strengthen'}</h4>
            <p>{feedback.improve}</p>
          </div>
        </section>
        <section>
          <div>
            <h4>Your next move</h4>
            <p>{feedback.nextStep}</p>
          </div>
        </section>
      </div>
      {feedback.evidence.map((e, i) => {
        const source = paper.sources.find((s) => s.id === e.citationId);
        return source ? (
          <blockquote key={i}>
            <p>“{e.quote}”</p>
            <button onClick={() => onOpen(source)}>
              See the excerpt · PDF p. {source.page}
              <ArrowUpRight size={13} />
            </button>
          </blockquote>
        ) : null;
      })}
    </div>
  );
}
export function Empty({
  title,
  text,
  action,
  label,
}: {
  title: string;
  text: string;
  action?: () => void;
  label?: string;
}) {
  return (
    <div className="empty">
      <BookOpen size={26} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action && (
        <Button onClick={action}>
          {label}
          <ArrowRight size={16} />
        </Button>
      )}
    </div>
  );
}
