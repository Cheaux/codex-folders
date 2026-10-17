import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { UserError, type Message } from './store.js';

export type Thread = { id: string; name?: string | null; preview?: string; cwd?: string; updatedAt?: number; parentThreadId?: string | null; [key: string]: unknown };
export interface CodexApi {
  list(archived?: boolean): Promise<Thread[]>;
  read(id: string): Promise<Thread>;
  messages(id: string): Promise<Message[]>;
  create(cwd: string): Promise<Thread>;
  close(): void;
}
export class RpcError extends UserError { constructor(readonly code: number, message: string) { super(message); } }
export class AppServer implements CodexApi {
  private process?: ChildProcessWithoutNullStreams;
  private initializing?: Promise<void>;
  private nextId = 0;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  private errorTail = '';
  constructor(readonly executable = process.env.CODEX_FOLDERS_CODEX_BIN || 'codex', readonly timeoutMs = 20000) {}
  private start(): Promise<void> {
    if (this.initializing) return this.initializing;
    this.initializing = (async () => {
      const child = this.process = spawn(this.executable, ['app-server', '--stdio'], { stdio: ['pipe', 'pipe', 'pipe'], env: process.env });
      child.stderr.on('data', data => { this.errorTail = (this.errorTail + String(data)).slice(-1500); });
      child.stdin.on('error', error => this.fail(new UserError(`Cannot write to Codex App Server: ${error.message}`)));
      child.on('error', error => this.fail(new UserError(`Cannot start Codex: ${error.message}. Run codex-folders doctor.`)));
      child.on('exit', () => this.fail(new UserError(`Codex App Server disconnected.${this.errorTail ? ' Run codex-folders doctor for diagnostics.' : ''}`)));
      const lines = createInterface({ input: child.stdout });
      lines.on('line', line => {
        let message: any;
        try { message = JSON.parse(line); } catch { return; }
        if (message.method && message.id !== undefined) { this.send({ id: message.id, error: { code: -32601, message: 'This client only performs chat organization.' } }); return; }
        const request = this.pending.get(message.id);
        if (!request) return;
        clearTimeout(request.timer); this.pending.delete(message.id);
        if (message.error) request.reject(new RpcError(message.error.code, message.error.message));
        else request.resolve(message.result);
      });
      await this.raw('initialize', { clientInfo: { name: 'codex_folders', version: '0.1.0' }, capabilities: { experimentalApi: false } });
      this.send({ method: 'initialized', params: {} });
    })();
    return this.initializing;
  }
  private send(value: unknown) { this.process?.stdin.write(JSON.stringify(value) + '\n'); }
  private fail(error: Error) { for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error); } this.pending.clear(); }
  private raw(method: string, params: unknown): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new UserError(`Codex request timed out: ${method}.`)); }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer }); this.send({ id, method, params });
    });
  }
  async request(method: string, params: unknown): Promise<any> { await this.start(); return this.raw(method, params); }
  async list(archived = false): Promise<Thread[]> {
    const threads: Thread[] = []; let cursor: string | undefined; const seen = new Set<string>();
    do {
      const result = await this.request('thread/list', { limit: 100, archived, sourceKinds: ['cli', 'vscode', 'appServer'], ...(cursor ? { cursor } : {}) });
      if (!Array.isArray(result.data)) throw new UserError('Codex returned an unsupported chat list.');
      threads.push(...result.data.filter((t: Thread) => !t.parentThreadId));
      cursor = result.nextCursor || undefined;
      if (cursor && seen.has(cursor)) throw new UserError('Codex returned a repeated pagination cursor.');
      if (cursor) seen.add(cursor);
    } while (cursor);
    return threads;
  }
  async read(id: string): Promise<Thread> {
    const result = await this.request('thread/read', { threadId: id, includeTurns: false });
    if (result.thread?.id !== id) throw new UserError('Codex returned a different chat than requested.');
    return result.thread;
  }
  async messages(id: string): Promise<Message[]> {
    const items: { turnId: string; item: any }[] = []; let cursor: string | undefined; const seen = new Set<string>();
    do {
      const result = await this.request('thread/turns/list', { threadId: id, itemsView: 'full', limit: 50, sortDirection: 'asc', ...(cursor ? { cursor } : {}) });
      if (!Array.isArray(result.data)) throw new UserError('This Codex version does not provide paginated chat history.');
      for (const turn of result.data) for (const item of turn.items ?? []) items.push({ turnId: turn.id, item });
      cursor = result.nextCursor || undefined;
      if (cursor && seen.has(cursor)) throw new UserError('Codex returned a repeated history cursor.');
      if (cursor) seen.add(cursor);
    } while (cursor);
    return extractMessages(id, items);
  }
  async create(cwd: string): Promise<Thread> {
    const result = await this.request('thread/start', { cwd });
    if (!result.thread?.id) throw new UserError('Codex did not create a chat.');
    return result.thread;
  }
  close() {
    const child = this.process;
    if (!child) return;
    this.fail(new UserError('Codex connection closed.'));
    child.stdin.end();
    const timer = setTimeout(() => child.kill(), 1000); timer.unref();
    child.once('exit', () => clearTimeout(timer));
    this.process = undefined;
  }
}
export function extractMessages(threadId: string, items: { turnId: string; item: any }[]): Message[] {
  const result: Message[] = [];
  for (const { turnId, item } of items) {
    let text = ''; let role = '';
    if (item.type === 'userMessage') {
      role = 'user'; text = (item.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
    } else if (item.type === 'agentMessage' && (!item.phase || item.phase === 'final_answer')) { role = 'assistant'; text = item.text ?? ''; }
    if (text.trim() && item.id) result.push({ id: item.id, threadId, turnId, role, text });
  }
  return result;
}
