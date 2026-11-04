import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { uid, json, parse } from './catalog.mjs';
export class Jobs {
  constructor(root, recover = false) {
    mkdirSync(root, { recursive: true });
    this.db = new DatabaseSync(join(root, 'tasks.sqlite'));
    this.db.exec(
      `PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,kind TEXT NOT NULL,label TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'queued',done INTEGER NOT NULL DEFAULT 0,total INTEGER NOT NULL DEFAULT 0,phase TEXT NOT NULL DEFAULT '',payload TEXT NOT NULL,result TEXT NOT NULL DEFAULT '{}',error TEXT,created_at INTEGER,updated_at INTEGER);CREATE INDEX IF NOT EXISTS jobs_state ON jobs(state,created_at);CREATE TABLE IF NOT EXISTS upload_files(batch_id TEXT,key TEXT,path TEXT,name TEXT,size INTEGER,mtime INTEGER,offset INTEGER NOT NULL DEFAULT 0,state TEXT NOT NULL DEFAULT 'waiting',result TEXT,error TEXT,PRIMARY KEY(batch_id,key));`,
    );
    if (recover)
      this.db.exec(
        "UPDATE jobs SET state='paused',phase='服务重启后可继续' WHERE state IN('running','pause_requested','cancel_requested')",
      );
  }
  get(id) {
    const r = this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id);
    return r ? { ...r, payload: parse(r.payload), result: parse(r.result) } : null;
  }
  list() {
    return this.db
      .prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT 100')
      .all()
      .map((r) => ({ ...r, payload: parse(r.payload), result: parse(r.result) }));
  }
  enqueue(kind, label, payload = {}) {
    if (kind === 'index') {
      const queued = this.db
        .prepare(
          "SELECT id,payload FROM jobs WHERE kind='index' AND state='queued' ORDER BY created_at LIMIT 1",
        )
        .get();
      if (queued) {
        const old = parse(queued.payload);
        if (old.root === payload.root) {
          old.ids = [...new Set([...(old.ids || []), ...(payload.ids || [])])];
          old.force ||= payload.force;
          old.all ||= payload.all;
          this.update(queued.id, { payload: old });
          return this.get(queued.id);
        }
      }
    }
    const id = uid();
    this.db
      .prepare('INSERT INTO jobs(id,kind,label,payload,created_at,updated_at) VALUES(?,?,?,?,?,?)')
      .run(id, kind, label, json(payload), Date.now(), Date.now());
    return this.get(id);
  }
  update(id, patch) {
    const keys = Object.keys(patch).filter((k) =>
      ['state', 'done', 'total', 'phase', 'payload', 'result', 'error'].includes(k),
    );
    if (!keys.length) return;
    this.db
      .prepare(`UPDATE jobs SET ${keys.map((k) => `${k}=?`).join(',')},updated_at=? WHERE id=?`)
      .run(
        ...keys.map((k) =>
          ['payload', 'result'].includes(k) ? json(patch[k]) : (patch[k] ?? null),
        ),
        Date.now(),
        id,
      );
  }
  control(id, action) {
    const job = this.get(id);
    if (!job) throw new Error('任务不存在');
    if (action === 'pause' && ['running', 'queued', 'waiting_source'].includes(job.state))
      this.update(id, { state: job.state === 'running' ? 'pause_requested' : 'paused' });
    if (action === 'cancel' && !['completed', 'cancelled'].includes(job.state))
      this.update(id, { state: job.state === 'running' ? 'cancel_requested' : 'cancelled' });
    if (action === 'resume' && ['paused', 'failed'].includes(job.state))
      this.update(id, { state: job.kind === 'upload' ? 'waiting_source' : 'queued', error: null });
    return this.get(id);
  }
  close() {
    this.db.close();
  }
}
