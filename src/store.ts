import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export type Folder = { id: string; parentId: string | null; name: string; isProject: boolean; instructions: string; defaultCwd: string | null };
export type Chat = { id: string; title: string; cwd: string; updatedAt: number; archived: boolean; missing: boolean; indexedAt: number; folderId: string | null };
export type MemoryNote = { key: string; text: string; sourceThreadId?: string; sourceTurnId?: string };
export type Message = { id: string; threadId: string; turnId: string; role: string; text: string };
export type SearchHit = Message & { title: string; score: number };
export class UserError extends Error {}

export function dataDirectory(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(env.CODEX_FOLDERS_DATA_DIR || join(env.CODEX_HOME || join(homedir(), '.codex'), 'folders'));
}
function nameCheck(name: string): string {
  name = name.normalize('NFC').trim();
  if (!name || name.length > 160 || /[\x00-\x1f\x7f/\\]/.test(name) || ['.', '..'].includes(name)) throw new UserError('Use a folder name of 1–160 characters, without slashes or control characters.');
  return name;
}
const folderRow = (r: any): Folder => ({ id: r.id, parentId: r.parent_id, name: r.name, isProject: !!r.is_project, instructions: r.instructions, defaultCwd: r.default_cwd });
const chatRow = (r: any): Chat => ({ id: r.id, title: r.title, cwd: r.cwd, updatedAt: r.updated_at, archived: !!r.archived, missing: !!r.missing, indexedAt: r.indexed_at, folderId: r.folder_id ?? null });

export class Store {
  readonly db: DatabaseSync;
  constructor(readonly directory = dataDirectory()) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    chmodSync(directory, 0o700);
    const filename = join(directory, 'folders.db');
    this.db = new DatabaseSync(filename);
    chmodSync(filename, 0o600);
    if (Number(this.db.prepare('PRAGMA user_version').get()?.user_version) > 1) { this.db.close(); throw new UserError('This project database was created by a newer Codex Folders version. Upgrade the command.'); }
    this.db.exec(`PRAGMA busy_timeout=1500; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY, parent_id TEXT REFERENCES folders(id), name TEXT NOT NULL,
        is_project INTEGER NOT NULL DEFAULT 0, instructions TEXT NOT NULL DEFAULT '', default_cwd TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS folder_sibling ON folders(COALESCE(parent_id,''),name);
      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, cwd TEXT NOT NULL, updated_at REAL NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0, missing INTEGER NOT NULL DEFAULT 0, indexed_at REAL NOT NULL DEFAULT -1
      );
      CREATE TABLE IF NOT EXISTS assignments (thread_id TEXT PRIMARY KEY REFERENCES chats(id), folder_id TEXT NOT NULL REFERENCES folders(id));
      CREATE TABLE IF NOT EXISTS memory (
        project_id TEXT PRIMARY KEY REFERENCES folders(id) ON DELETE CASCADE,
        revision INTEGER NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '[]'
      );
      CREATE TABLE IF NOT EXISTS memory_history (
        id INTEGER PRIMARY KEY, project_id TEXT NOT NULL, revision INTEGER NOT NULL, notes TEXT NOT NULL, saved_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE, turn_id TEXT NOT NULL, role TEXT NOT NULL, body TEXT NOT NULL);
      CREATE VIRTUAL TABLE IF NOT EXISTS message_search USING fts5(body, content='messages', content_rowid='rowid', tokenize='unicode61');
      CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN INSERT INTO message_search(rowid,body) VALUES (new.rowid,new.body); END;
      CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN INSERT INTO message_search(message_search,rowid,body) VALUES ('delete',old.rowid,old.body); END;
      CREATE TABLE IF NOT EXISTS moves (id TEXT PRIMARY KEY, changes TEXT NOT NULL, undone INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
      PRAGMA user_version=1;`);
  }
  close() { this.db.close(); }
  transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = work(); this.db.exec('COMMIT'); return value; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  folders(): Folder[] { return this.db.prepare('SELECT * FROM folders ORDER BY name COLLATE NOCASE,id').all().map(folderRow); }
  folder(id: string): Folder {
    const r = this.db.prepare('SELECT * FROM folders WHERE id=?').get(id);
    if (!r) throw new UserError(`Folder not found: ${id}`);
    return folderRow(r);
  }
  ancestors(id: string): Folder[] {
    const result: Folder[] = []; const visited = new Set<string>();
    let current: string | null = id;
    while (current) {
      if (visited.has(current)) throw new UserError('Invalid folder cycle.');
      visited.add(current); const f = this.folder(current); result.push(f); current = f.parentId;
    }
    return result;
  }
  path(id: string): string { return this.ancestors(id).reverse().map(f => f.name).join('/'); }
  descendants(id: string): string[] {
    this.folder(id); const result = [id]; const all = this.folders();
    for (let i = 0; i < result.length; i++) for (const f of all) if (f.parentId === result[i]) result.push(f.id);
    return result;
  }
  projectForFolder(id: string | null): Folder | null { return id ? this.ancestors(id).find(f => f.isProject) ?? null : null; }
  projectForChat(threadId: string): Folder | null { return this.projectForFolder(this.assignment(threadId)); }
  createFolder(input: { name: string; parentId?: string | null; isProject?: boolean; instructions?: string; defaultCwd?: string | null }): Folder {
    return this.transaction(() => {
      const parentId = input.parentId ?? null;
      if (parentId) this.folder(parentId);
      if (input.isProject && this.projectForFolder(parentId)) throw new UserError('Projects cannot be nested inside another project.');
      const id = randomUUID();
      try { this.db.prepare('INSERT INTO folders(id,parent_id,name,is_project,instructions,default_cwd) VALUES(?,?,?,?,?,?)').run(id, parentId, nameCheck(input.name), +(input.isProject ?? false), input.instructions ?? '', input.defaultCwd ?? null); }
      catch (error: any) { if (String(error.message).includes('UNIQUE')) throw new UserError('A sibling folder already has that name.'); throw error; }
      return this.folder(id);
    });
  }
  updateFolder(id: string, update: Partial<Omit<Folder, 'id'>>): Folder {
    return this.transaction(() => {
      const current = this.folder(id); const next = { ...current, ...update, name: nameCheck(update.name ?? current.name) };
      const subtree = this.descendants(id);
      if (next.parentId && subtree.includes(next.parentId)) throw new UserError('A folder cannot be moved into itself or its descendants.');
      const outerProject = this.projectForFolder(next.parentId);
      const childProject = subtree.slice(1).some(child => this.folder(child).isProject);
      if ((next.isProject && (outerProject || childProject)) || (outerProject && childProject)) throw new UserError('This move would nest one project inside another.');
      try { this.db.prepare('UPDATE folders SET parent_id=?,name=?,is_project=?,instructions=?,default_cwd=? WHERE id=?').run(next.parentId, next.name, +next.isProject, next.instructions, next.defaultCwd, id); }
      catch (error: any) { if (String(error.message).includes('UNIQUE')) throw new UserError('A sibling folder already has that name.'); throw error; }
      return this.folder(id);
    });
  }
  deleteFolder(id: string): { unfiled: number; foldersDeleted: number } {
    return this.transaction(() => {
      const ids = this.descendants(id); let unfiled = 0;
      for (const child of ids.reverse()) {
        unfiled += Number(this.db.prepare('DELETE FROM assignments WHERE folder_id=?').run(child).changes);
        this.db.prepare('DELETE FROM memory_history WHERE project_id=?').run(child);
        this.db.prepare('DELETE FROM folders WHERE id=?').run(child);
      }
      return { unfiled, foldersDeleted: ids.length };
    });
  }
  upsertChat(chat: Omit<Chat, 'folderId' | 'indexedAt'>): void {
    this.db.prepare(`INSERT INTO chats(id,title,cwd,updated_at,archived,missing) VALUES(?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET title=excluded.title,cwd=excluded.cwd,updated_at=excluded.updated_at,archived=excluded.archived,missing=excluded.missing`).run(chat.id, chat.title, chat.cwd, chat.updatedAt, +chat.archived, +chat.missing);
  }
  markMissing(id: string) { this.db.prepare('UPDATE chats SET missing=1 WHERE id=?').run(id); }
  chat(id: string): Chat | null { const row = this.db.prepare('SELECT c.*,a.folder_id FROM chats c LEFT JOIN assignments a ON a.thread_id=c.id WHERE c.id=?').get(id); return row ? chatRow(row) : null; }
  chats(options: { folderId?: string | null; projectId?: string; includeArchived?: boolean; includeMissing?: boolean; query?: string } = {}): Chat[] {
    let chats = this.db.prepare('SELECT c.*,a.folder_id FROM chats c LEFT JOIN assignments a ON a.thread_id=c.id ORDER BY c.updated_at DESC,c.id').all().map(chatRow);
    if (!options.includeArchived) chats = chats.filter(c => !c.archived);
    if (!options.includeMissing) chats = chats.filter(c => !c.missing);
    if (options.folderId !== undefined) chats = chats.filter(c => c.folderId === options.folderId);
    if (options.projectId) { const ids = new Set(this.descendants(options.projectId)); chats = chats.filter(c => c.folderId && ids.has(c.folderId)); }
    if (options.query) { const q = options.query.toLocaleLowerCase(); chats = chats.filter(c => `${c.title} ${c.cwd}`.toLocaleLowerCase().includes(q)); }
    return chats;
  }
  assignment(threadId: string): string | null { return (this.db.prepare('SELECT folder_id FROM assignments WHERE thread_id=?').get(threadId)?.folder_id as string | undefined) ?? null; }
  private setAssignment(threadId: string, folderId: string | null) {
    if (folderId) this.db.prepare('INSERT INTO assignments(thread_id,folder_id) VALUES(?,?) ON CONFLICT(thread_id) DO UPDATE SET folder_id=excluded.folder_id').run(threadId, folderId);
    else this.db.prepare('DELETE FROM assignments WHERE thread_id=?').run(threadId);
  }
  moveChats(threadIds: string[], folderId: string | null): { moveId: string; moved: number } {
    return this.moveEach(threadIds.map(threadId => ({ threadId, folderId })));
  }
  moveUp(threadIds: string[]) {
    return this.moveEach(threadIds.map(threadId => { const current = this.assignment(threadId); return { threadId, folderId: current ? this.folder(current).parentId : null }; }));
  }
  private moveEach(destinations: { threadId: string; folderId: string | null }[]) {
    if (!destinations.length) throw new UserError('Select at least one chat.');
    return this.transaction(() => {
      const seen = new Set<string>(); const changes: { threadId: string; before: string | null; after: string | null }[] = [];
      for (const { threadId, folderId } of destinations) {
        if (seen.has(threadId)) continue; seen.add(threadId);
        if (!this.chat(threadId)) throw new UserError(`Unknown chat: ${threadId}`);
        if (folderId) this.folder(folderId);
        const before = this.assignment(threadId);
        if (before === folderId) continue;
        changes.push({ threadId, before, after: folderId }); this.setAssignment(threadId, folderId);
      }
      const moveId = randomUUID(); this.db.prepare('INSERT INTO moves VALUES(?,?,0,?)').run(moveId, JSON.stringify(changes), new Date().toISOString());
      return { moveId, moved: changes.length };
    });
  }
  undo(moveId?: string) {
    return this.transaction(() => {
      const row = moveId ? this.db.prepare('SELECT * FROM moves WHERE id=? AND undone=0').get(moveId) : this.db.prepare('SELECT * FROM moves WHERE undone=0 ORDER BY rowid DESC LIMIT 1').get();
      if (!row) throw new UserError('No move is available to undo.');
      const changes = JSON.parse(row.changes as string) as { threadId: string; before: string | null; after: string | null }[];
      for (const change of changes) {
        if (this.assignment(change.threadId) !== change.after) throw new UserError('A chat moved again since this operation; undo would overwrite a newer change.');
        if (change.before) this.folder(change.before);
      }
      for (const change of changes) this.setAssignment(change.threadId, change.before);
      this.db.prepare('UPDATE moves SET undone=1 WHERE id=?').run(row.id as string);
      return { restored: changes.length };
    });
  }
  memory(projectId: string): { revision: number; notes: MemoryNote[] } {
    if (!this.folder(projectId).isProject) throw new UserError('Select a project folder.');
    const row = this.db.prepare('SELECT * FROM memory WHERE project_id=?').get(projectId);
    return row ? { revision: Number(row.revision), notes: JSON.parse(row.notes as string) } : { revision: 0, notes: [] };
  }
  updateMemory(projectId: string, expectedRevision: number, upsert: MemoryNote[], removeKeys: string[] = []) {
    return this.transaction(() => {
      const current = this.memory(projectId);
      if (current.revision !== expectedRevision) throw new UserError(`Memory revision conflict: expected ${expectedRevision}, current ${current.revision}. Read and reconcile the current notes before retrying.`);
      const notes = new Map(current.notes.map(note => [note.key, note]));
      for (const key of removeKeys) notes.delete(key);
      for (const note of upsert) {
        if (!note.key.trim() || note.key.length > 160 || !note.text.trim() || note.text.length > 16000) throw new UserError('Memory entries need a short key and 1–16000 characters of text.');
        if (note.sourceThreadId && this.projectForChat(note.sourceThreadId)?.id !== projectId) throw new UserError('A memory source must be a chat assigned to this project.');
        notes.set(note.key, note);
      }
      const serialized = JSON.stringify([...notes.values()]); const revision = current.revision + 1;
      this.db.prepare('INSERT INTO memory VALUES(?,?,?) ON CONFLICT(project_id) DO UPDATE SET revision=excluded.revision,notes=excluded.notes').run(projectId, revision, serialized);
      this.db.prepare('INSERT INTO memory_history(project_id,revision,notes,saved_at) VALUES(?,?,?,?)').run(projectId, revision, serialized, new Date().toISOString());
      return { revision, notes: [...notes.values()] };
    });
  }
  memoryHistory(projectId: string) { return this.db.prepare('SELECT revision,notes,saved_at AS savedAt FROM memory_history WHERE project_id=? ORDER BY revision DESC LIMIT 50').all(projectId).map((r: any) => ({ ...r, notes: JSON.parse(r.notes) })); }
  replaceMessages(threadId: string, updatedAt: number, messages: Message[]) {
    this.transaction(() => {
      this.db.prepare('DELETE FROM messages WHERE thread_id=?').run(threadId);
      const insert = this.db.prepare('INSERT OR IGNORE INTO messages(id,thread_id,turn_id,role,body) VALUES(?,?,?,?,?)');
      for (const m of messages) insert.run(`${threadId}:${m.id}`, threadId, m.turnId, m.role, m.text);
      this.db.prepare('UPDATE chats SET indexed_at=? WHERE id=?').run(updatedAt, threadId);
    });
  }
  search(projectId: string, query: string, limit = 8): SearchHit[] {
    if (!this.folder(projectId).isProject) throw new UserError('Select a project folder.');
    const words = [...new Set(query.match(/[\p{L}\p{N}_]{2,}/gu) ?? [])].slice(0, 24);
    if (!words.length) return [];
    const match = words.map(word => `"${word}"`).join(' OR ');
    const folderIds = this.descendants(projectId); const marks = folderIds.map(() => '?').join(',');
    return this.db.prepare(`SELECT m.id,m.thread_id AS threadId,m.turn_id AS turnId,m.role,snippet(message_search,0,'','',' … ',64) AS text,c.title,bm25(message_search) AS score
      FROM message_search JOIN messages m ON m.rowid=message_search.rowid JOIN chats c ON c.id=m.thread_id JOIN assignments a ON a.thread_id=c.id
      WHERE message_search MATCH ? AND a.folder_id IN (${marks}) AND c.archived=0 AND c.missing=0 ORDER BY score LIMIT ?`).all(match, ...folderIds, Math.min(Math.max(limit, 1), 30)) as unknown as SearchHit[];
  }
  readMessage(projectId: string, messageId: string, offset = 0) {
    if (!this.folder(projectId).isProject) throw new UserError('Select a project folder.');
    const row = this.db.prepare('SELECT m.*,c.title,c.archived,c.missing FROM messages m JOIN chats c ON c.id=m.thread_id WHERE m.id=?').get(messageId) as any;
    if (!row || row.archived || row.missing || this.projectForChat(row.thread_id)?.id !== projectId) throw new UserError('This message is not available in the selected project. Search the project again for current references.');
    return { id: row.id, threadId: row.thread_id, turnId: row.turn_id, title: row.title, role: row.role, text: row.body.slice(offset, offset + 8000), nextOffset: offset + 8000 < row.body.length ? offset + 8000 : null };
  }
}
