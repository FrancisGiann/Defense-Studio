import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import path from 'node:path';
import type { Paper, Session } from '../shared/types';
import { AppError } from './errors';
export const PERSONAL_OWNER = 'personal';
export class Repository {
  db: DatabaseSync;
  constructor(dir: string) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
    const file = path.join(dir, 'studio.sqlite');
    this.db = new DatabaseSync(file);
    chmodSync(file, 0o600);
    this.db.exec(`PRAGMA journal_mode=DELETE; PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON;
 CREATE TABLE IF NOT EXISTS papers (id TEXT NOT NULL, owner TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(owner,id));
 CREATE TABLE IF NOT EXISTS sessions (id TEXT NOT NULL, owner TEXT NOT NULL, paper_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(owner,id), FOREIGN KEY(owner,paper_id) REFERENCES papers(owner,id) ON DELETE CASCADE);
 CREATE TABLE IF NOT EXISTS budgets (owner TEXT PRIMARY KEY, day TEXT NOT NULL, calls INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0);`);
  }
  papers(owner: string): Paper[] {
    return this.db
      .prepare('SELECT body FROM papers WHERE owner=?')
      .all(owner)
      .map((r) => JSON.parse(r.body as string));
  }
  sessions(owner: string): Session[] {
    return this.db
      .prepare('SELECT body FROM sessions WHERE owner=?')
      .all(owner)
      .map((r) => JSON.parse(r.body as string))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }
  paper(owner: string, id: string): Paper {
    const row = this.db.prepare('SELECT body FROM papers WHERE owner=? AND id=?').get(owner, id);
    if (!row) throw new AppError(404, 'NOT_FOUND', 'That paper is no longer in your library.');
    return JSON.parse(row.body as string);
  }
  session(owner: string, id: string): Session {
    const row = this.db.prepare('SELECT body FROM sessions WHERE owner=? AND id=?').get(owner, id);
    if (!row) throw new AppError(404, 'NOT_FOUND', 'That session is no longer available.');
    return JSON.parse(row.body as string);
  }
  savePaper(owner: string, paper: Paper) {
    if (this.papers(owner).length >= 20 && !this.papers(owner).some((p) => p.id === paper.id))
      throw new AppError(
        409,
        'PAPER_LIMIT',
        'Your local library holds up to 20 papers. Remove an older paper first.',
      );
    this.db
      .prepare(
        'INSERT INTO papers VALUES(?,?,?) ON CONFLICT(owner,id) DO UPDATE SET body=excluded.body',
      )
      .run(paper.id, owner, JSON.stringify(paper));
  }
  saveSession(owner: string, session: Session) {
    if (
      this.sessions(owner).length >= 100 &&
      !this.sessions(owner).some((s) => s.id === session.id)
    )
      throw new AppError(
        409,
        'SESSION_LIMIT',
        'Your local history holds up to 100 sessions. Remove an older session first.',
      );
    this.db
      .prepare(
        'INSERT INTO sessions VALUES(?,?,?,?) ON CONFLICT(owner,id) DO UPDATE SET body=excluded.body',
      )
      .run(session.id, owner, session.paperId, JSON.stringify(session));
  }
  deletePaper(owner: string, id: string) {
    this.db.prepare('DELETE FROM papers WHERE owner=? AND id=?').run(owner, id);
  }
  deleteSession(owner: string, id: string) {
    this.db.prepare('DELETE FROM sessions WHERE owner=? AND id=?').run(owner, id);
  }
  reserveCall(owner: string, limit: number, gap: number, now = Date.now()) {
    const day = new Date(now).toISOString().slice(0, 10);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      let row = this.db.prepare('SELECT * FROM budgets WHERE owner=?').get(owner);
      if (!row || row.day !== day) {
        this.db
          .prepare(
            'INSERT INTO budgets VALUES(?,?,0,0) ON CONFLICT(owner) DO UPDATE SET day=excluded.day,calls=0,next_at=0',
          )
          .run(owner, day);
        row = { calls: 0, next_at: 0 };
      }
      if (Number(row.calls) >= limit)
        throw new AppError(
          429,
          'DAILY_LIMIT',
          'Your daily AI practice limit is reached. Continue tomorrow or use the labelled sample rehearsal.',
        );
      if (Number(row.next_at) > now)
        throw new AppError(
          429,
          'REQUEST_GAP',
          'Give the panel a moment before the next AI request.',
          Math.ceil((Number(row.next_at) - now) / 1000),
        );
      this.db
        .prepare('UPDATE budgets SET calls=calls+1,next_at=? WHERE owner=?')
        .run(now + gap, owner);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  close() {
    this.db.close();
  }
}
