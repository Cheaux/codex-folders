import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppServer, RpcError, type CodexApi, type Thread } from './codex.js';
import { Store, UserError, type Folder, type MemoryNote } from './store.js';

export function resumeCommand(threadId: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(threadId)) throw new UserError('Invalid thread ID for a resume command.');
  return `codex resume ${threadId}`;
}
export function shellQuote(value: string): string { return /^[a-zA-Z0-9_./:-]+$/.test(value) ? value : "'" + value.replaceAll("'", "'\\''") + "'"; }
export function validDirectory(directory: string): string {
  const absolute = resolve(directory);
  try { if (statSync(absolute).isDirectory()) return absolute; } catch {}
  throw new UserError(`Working directory does not exist: ${absolute}`);
}
export class Service {
  private lastRefresh = 0;
  private closed = false;
  constructor(readonly store = new Store(), readonly api: CodexApi = new AppServer()) {}
  close() { if (!this.closed) { this.closed = true; this.api.close(); this.store.close(); } }
  private saveThread(thread: Thread, archived = this.store.chat(thread.id)?.archived ?? false) {
    this.store.upsertChat({ id: thread.id, title: thread.name || thread.preview?.slice(0, 180) || 'Untitled chat', cwd: thread.cwd || '', updatedAt: Number(thread.updatedAt || 0), archived, missing: false });
  }
  async refresh(force = false) {
    if (!force && Date.now() - this.lastRefresh < 15000) return;
    const active = await this.api.list(false); const archived = await this.api.list(true);
    const present = new Set([...active, ...archived].map(t => t.id));
    this.store.transaction(() => {
      for (const t of active) this.saveThread(t, false);
      for (const t of archived) this.saveThread(t, true);
    });
    // List filters and older indexes can omit real chats. Verify before hiding one.
    for (const chat of this.store.chats({ includeArchived: true, includeMissing: true })) {
      if (present.has(chat.id) || chat.missing) continue;
      try { this.saveThread(await this.api.read(chat.id)); }
      catch (error) { if (error instanceof RpcError && /not found|does not exist|unknown thread/i.test(error.message)) this.store.markMissing(chat.id); }
    }
    this.lastRefresh = Date.now();
  }
  async ensureChat(id: string) { const t = await this.api.read(id); this.saveThread(t); return this.store.chat(id)!; }
  async moveChats(threadIds: string[], folderId: string | null) {
    for (const id of [...new Set(threadIds)]) await this.ensureChat(id);
    const result = this.store.moveChats(threadIds, folderId);
    return { ...result, folder: folderId ? this.store.path(folderId) : 'All chats' };
  }
  folders() { return this.store.folders().map(f => ({ ...f, path: this.store.path(f.id), projectId: this.store.projectForFolder(f.id)?.id ?? null, chatCount: this.store.chats({ folderId: f.id }).length })); }
  createFolder(input: Parameters<Store['createFolder']>[0]) {
    if (input.defaultCwd) input.defaultCwd = validDirectory(input.defaultCwd);
    if (!input.isProject && (input.instructions || input.defaultCwd)) throw new UserError('Instructions and a default directory belong on a project folder.');
    return this.store.createFolder(input);
  }
  updateFolder(id: string, input: Partial<Omit<Folder, 'id'>>) {
    if (input.defaultCwd) input.defaultCwd = validDirectory(input.defaultCwd);
    if (!(input.isProject ?? this.store.folder(id).isProject) && (input.instructions || input.defaultCwd)) throw new UserError('Instructions and a default directory belong on a project folder.');
    return this.store.updateFolder(id, input);
  }
  async synchronizeProject(projectId: string) {
    await this.refresh();
    const errors: { threadId: string; error: string }[] = [];
    for (const chat of this.store.chats({ projectId })) {
      if (chat.indexedAt === chat.updatedAt) continue;
      try {
        const messages = await this.api.messages(chat.id);
        this.store.replaceMessages(chat.id, chat.updatedAt, messages);
      } catch (error) {
        if (error instanceof RpcError && /not found|does not exist|unknown thread/i.test(error.message)) this.store.markMissing(chat.id);
        errors.push({ threadId: chat.id, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return errors;
  }
  async search(projectId: string, query: string, limit = 8) {
    const syncErrors = await this.synchronizeProject(projectId);
    return { hits: this.store.search(projectId, query, limit), syncErrors };
  }
  async context(threadId: string, query?: string) {
    const project = this.store.projectForChat(threadId);
    if (!project) return { threadId, project: null, message: 'This chat is not assigned to a project. Move it into a project folder to share context.' };
    const memory = this.store.memory(project.id);
    const search = query ? await this.search(project.id, query, 5) : { hits: [], syncErrors: [] };
    return { threadId, project: { ...project, path: this.store.path(project.id) }, ...memory, ...search,
      automaticContext: 'Requires trusted Codex Folders hooks in /hooks.', browserCommand: 'codex-folders' };
  }
  updateMemory(projectId: string, revision: number, notes: MemoryNote[], remove: string[] = []) { return this.store.updateMemory(projectId, revision, notes, remove); }
  async newChat(folderId: string, cwd?: string) {
    this.store.folder(folderId);
    const project = this.store.projectForFolder(folderId);
    const directory = validDirectory(cwd || project?.defaultCwd || process.cwd());
    // Empty App Server threads are not persisted before their first turn.
    // Launch ordinary Codex and bind its actual thread during that first turn.
    const setupPrompt = `Use $codex-folders:chat-folders to set up this new chat in folder ${JSON.stringify(this.store.path(folderId))}, folder ID ${JSON.stringify(folderId)}. Resolve this chat's actual thread ID by running codex-folders current --json, use chats_move to assign it to that folder, and load project_context_get. Briefly confirm readiness. Wait for my task before modifying project files.`;
    const executable = process.env.CODEX_FOLDERS_CODEX_BIN || 'codex';
    const args = ['-C', directory, setupPrompt];
    return { folderId, cwd: directory, executable, args, command: [executable, ...args].map(shellQuote).join(' '), firstTurn: 'Assigns the new chat to its project using normal Codex tools; does not start inference until you run this command.' };
  }
}
