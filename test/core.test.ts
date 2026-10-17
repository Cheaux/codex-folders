import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, dataDirectory } from '../src/store.js';
import { Service, resumeCommand, shellQuote } from '../src/service.js';
import { extractMessages, RpcError, type CodexApi, type Thread } from '../src/codex.js';
import { hookOutput } from '../src/hooks.js';
import { keyboardAction, fit, folderTree, clean, browserChats, moveDestinations } from '../src/browser.js';

function fixture(t: any) {
  const directory = mkdtempSync(join(tmpdir(), 'codex-folders-test-')); const store = new Store(directory);
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); }); return store;
}
function chat(store: Store, id: string, archived = false) { store.upsertChat({ id, title: `Chat ${id}`, cwd: '/workspace', updatedAt: 1, archived, missing: false }); }

test('nested folders share their nearest project; project roots cannot nest or cycle', t => {
  const s = fixture(t); const work = s.createFolder({ name: 'Work' }); const a = s.createFolder({ name: 'Client A', parentId: work.id, isProject: true });
  const research = s.createFolder({ name: 'Research', parentId: a.id });
  assert.equal(s.projectForFolder(research.id)?.id, a.id); assert.equal(s.path(research.id), 'Work/Client A/Research');
  assert.throws(() => s.createFolder({ name: 'Nested project', parentId: research.id, isProject: true }), /cannot be nested/);
  assert.throws(() => s.updateFolder(work.id, { parentId: research.id }), /descendants/);
  assert.throws(() => s.updateFolder(work.id, { isProject: true }), /nest/);
  const b = s.createFolder({ name: 'B', isProject: true }); assert.throws(() => s.updateFolder(work.id, { parentId: b.id }), /nest/);
  assert.throws(() => s.createFolder({ name: '../escape' }), /slashes/);
  assert.throws(() => s.createFolder({ name: 'Work' }), /already/);
});

test('chat moves preserve cwd, are atomic and undoable, and cannot overwrite newer moves', t => {
  const s = fixture(t); const p = s.createFolder({ name: 'P', isProject: true }); const f = s.createFolder({ name: 'F', parentId: p.id });
  chat(s, 'one'); chat(s, 'two'); const first = s.moveChats(['one', 'two'], f.id);
  assert.equal(first.moved, 2); assert.equal(s.chat('one')?.cwd, '/workspace');
  assert.throws(() => s.moveChats(['one', 'absent'], p.id), /Unknown chat/); assert.equal(s.assignment('one'), f.id);
  const up = s.moveUp(['one']); assert.equal(s.assignment('one'), p.id);
  assert.throws(() => s.undo(first.moveId), /overwrite a newer/);
  s.undo(up.moveId); s.undo(first.moveId); assert.equal(s.assignment('one'), null); assert.equal(s.assignment('two'), null);
});
test('All chats is the home outside folders; moving, undo and deletion keep lists exclusive', t => {
  const s = fixture(t); const p = s.createFolder({ name: 'Alpha', isProject: true }); const child = s.createFolder({ name: 'Research', parentId: p.id });
  for (const id of ['home', 'filed', 'nested', 'archived', 'missing']) chat(s, id, id === 'archived');
  s.moveChats(['filed'], p.id); s.moveChats(['nested'], child.id); s.markMissing('missing');
  assert.deepEqual(browserChats(s, 'all').map(c => c.id), ['home']);
  assert.deepEqual(browserChats(s, p.id).map(c => c.id), ['filed']);
  assert.equal(browserChats(s, 'all', 'nested').length, 0);
  const moved = s.moveChats(['home'], child.id); assert.equal(browserChats(s, 'all').length, 0);
  s.undo(moved.moveId); assert.deepEqual(browserChats(s, 'all').map(c => c.id), ['home']);
  s.deleteFolder(p.id); assert.deepEqual(new Set(browserChats(s, 'all').map(c => c.id)), new Set(['home', 'filed', 'nested']));
  assert.equal(s.chats({ includeArchived: true, includeMissing: true }).length, 5, 'metadata inventory remains complete');
});
test('move picker puts real folders first and All chats/Cancel last', t => {
  const s = fixture(t); const z = s.createFolder({ name: 'Zebra' }); const a = s.createFolder({ name: 'Alpha' });
  const choices = moveDestinations(new Service(s));
  assert.deepEqual(choices.map(c => c.name), ['Alpha', 'Zebra', 'All chats', 'Cancel']);
  assert.deepEqual(choices.map(c => c.value), [a.id, z.id, null, undefined]);
  assert.deepEqual(folderTree(s.folders()).map(c => c.id), ['all', a.id, z.id]);
});

test('removing a folder unfiles chats and removes project memory, never chat records', t => {
  const s = fixture(t); const p = s.createFolder({ name: 'P', isProject: true }); const f = s.createFolder({ name: 'F', parentId: p.id });
  chat(s, 'one'); s.moveChats(['one'], f.id); s.updateMemory(p.id, 0, [{ key: 'goal', text: 'ship' }]);
  assert.deepEqual(s.deleteFolder(p.id), { unfiled: 1, foldersDeleted: 2 });
  assert.equal(s.chat('one')?.folderId, null); assert.equal(s.db.prepare('SELECT count(*) AS n FROM memory_history').get()?.n, 0);
});

test('revisioned memory prevents lost updates between two database connections', t => {
  const s = fixture(t); const second = new Store(s.directory); t.after(() => second.close());
  const p = s.createFolder({ name: 'P', isProject: true });
  s.updateMemory(p.id, 0, [{ key: 'goal', text: 'first' }]);
  assert.throws(() => second.updateMemory(p.id, 0, [{ key: 'goal', text: 'lost update' }]), /revision conflict/);
  second.updateMemory(p.id, 1, [{ key: 'next', text: 'second' }]);
  assert.equal(s.memory(p.id).notes.length, 2); assert.equal(s.memoryHistory(p.id).length, 2);
  assert.throws(() => s.updateMemory(p.id, 2, [{ key: 'bad source', text: 'no', sourceThreadId: 'outside' }]), /source/);
});

test('search enforces current project membership, archive/missing status, and parameter safety', t => {
  const s = fixture(t); const a = s.createFolder({ name: 'A', isProject: true }); const b = s.createFolder({ name: 'B', isProject: true });
  const child = s.createFolder({ name: 'Research', parentId: a.id });
  for (const id of ['one', 'two', 'archived']) { chat(s, id, id === 'archived'); s.moveChats([id], id === 'two' ? b.id : child.id); s.replaceMessages(id, 1, [{ id: 'm', threadId: id, turnId: 'turn', role: 'user', text: `sapphire decision ${id}` }]); }
  assert.deepEqual(s.search(a.id, 'sapphire').map(h => h.threadId), ['one']);
  assert.match(s.readMessage(a.id, 'one:m').text, /sapphire/);
  assert.equal(s.search(a.id, '" OR * DROP TABLE messages;').length, 0);
  s.moveChats(['one'], b.id); assert.equal(s.search(a.id, 'sapphire').length, 0); assert.equal(s.search(b.id, 'sapphire').length, 2);
  assert.throws(() => s.readMessage(a.id, 'one:m'), /not available/);
  s.markMissing('one'); assert.deepEqual(s.search(b.id, 'sapphire').map(h => h.threadId), ['two']);
});

test('history extraction excludes tools, reasoning, hooks, and commentary', () => {
  const items = [
    { type: 'userMessage', id: 'u', content: [{ type: 'text', text: 'user request' }, { type: 'image', url: 'ignored' }] },
    { type: 'agentMessage', id: 'a', phase: 'final_answer', text: 'settled answer' },
    { type: 'agentMessage', id: 'legacy', text: 'legacy final' },
    { type: 'agentMessage', id: 'comment', phase: 'commentary', text: 'still working' },
    { type: 'reasoning', id: 'r', text: 'private' }, { type: 'commandExecution', id: 'cmd', output: 'secret' },
    { type: 'hookPrompt', id: 'hook', text: 'injected context' },
  ];
  assert.deepEqual(extractMessages('t', items.map(item => ({ item, turnId: 'turn' }))).map(m => m.text), ['user request', 'settled answer', 'legacy final']);
});

test('hooks are bounded, restore project memory, and work without an App Server', t => {
  const s = fixture(t); const p = s.createFolder({ name: 'P', isProject: true, instructions: 'Use the team conventions.' }); chat(s, 'one'); s.moveChats(['one'], p.id);
  s.updateMemory(p.id, 0, Array.from({ length: 30 }, (_, i) => ({ key: `note-${i}`, text: 'x'.repeat(10000) })));
  const output = hookOutput(s, { hook_event_name: 'SessionStart', session_id: 'one' }) as any;
  assert.match(output.hookSpecificOutput.additionalContext, /current thread ID: "one"/);
  assert.match(output.hookSpecificOutput.additionalContext, /Use the team conventions/);
  assert.ok(output.hookSpecificOutput.additionalContext.length < 24000);
  const unfiled = hookOutput(s, { hook_event_name: 'UserPromptSubmit', session_id: 'two', prompt: 'hello' }) as any;
  assert.match(unfiled.hookSpecificOutput.additionalContext, /All chats/); assert.doesNotMatch(unfiled.hookSpecificOutput.additionalContext, /team conventions/);
  assert.equal(hookOutput(s, { hook_event_name: 'Stop', session_id: 'one' }), null);
});

test('browser control-arrow combinations, alternative keys, tree and terminal text safety', () => {
  assert.equal(keyboardAction({ name: 'right', ctrl: true }), 'move'); assert.equal(keyboardAction({ sequence: '\x1b[1;5D' }), 'up');
  assert.equal(keyboardAction({ name: 'm' }), 'move'); assert.equal(keyboardAction({ name: 'u' }), 'up'); assert.equal(keyboardAction({ sequence: '?' }), 'help');
  assert.equal(keyboardAction({ name: 'right' }), null); assert.equal(clean('\x1b[31mMalicious\nname'), ' [31mMalicious name');
  assert.ok(fit('中文🙂', 8).includes('中文')); assert.ok(!fit('hello\x1b[2J', 8).includes('\x1b'));
  assert.equal(folderTree([{ id: 'p', parentId: null, name: 'Proyecto', isProject: true, instructions: '', defaultCwd: null }])[1]?.folder?.name, 'Proyecto');
});

test('database permissions and Codex home isolation', t => {
  const s = fixture(t); assert.equal(statSync(s.directory).mode & 0o777, 0o700); assert.equal(statSync(join(s.directory, 'folders.db')).mode & 0o777, 0o600);
  assert.equal(dataDirectory({ CODEX_HOME: '/tmp/isolated-codex' }), '/tmp/isolated-codex/folders');
  assert.notEqual(dataDirectory({ CODEX_HOME: '/tmp/a' }), dataDirectory({ CODEX_HOME: '/tmp/b' }));
  assert.throws(() => resumeCommand('id; rm -rf /'), /Invalid/);
});

test('end-to-end service: project chats share decisions with sources; unrelated projects cannot', async t => {
  const s = fixture(t); let historyRequests = 0;
  const threads: Thread[] = [{ id: 'a', name: 'Architecture', cwd: '/workspace', updatedAt: 10 }, { id: 'b', name: 'Implementation', cwd: '/workspace', updatedAt: 10 }, { id: 'c', name: 'Other client', cwd: '/workspace', updatedAt: 10 }];
  const api: CodexApi = { list: async archived => archived ? [] : threads, read: async id => { const row = threads.find(t => t.id === id); if (!row) throw Error('not found'); return row; }, messages: async id => { historyRequests++; return [{ id: 'msg', threadId: id, turnId: 'turn-1', role: 'assistant', text: id === 'a' ? 'We chose SQLite for project memory.' : 'No storage decision yet.' }]; }, create: async () => { throw Error('unused'); }, close() {} };
  const service = new Service(s, api); const project = service.createFolder({ name: 'Client A', isProject: true }); const other = service.createFolder({ name: 'Client B', isProject: true });
  await service.moveChats(['a', 'b'], project.id); await service.moveChats(['c'], other.id);
  service.updateMemory(project.id, 0, [{ key: 'storage', text: 'Use SQLite.', sourceThreadId: 'a', sourceTurnId: 'turn-1' }]);
  const context = await service.context('b', 'SQLite') as any;
  assert.equal(context.project.id, project.id); assert.equal(context.notes[0].text, 'Use SQLite.'); assert.equal(context.hits[0].threadId, 'a');
  await service.search(project.id, 'SQLite'); assert.equal(historyRequests, 2, 'unchanged chats reuse their index');
  const isolated = await service.context('c', 'SQLite') as any; assert.equal(isolated.notes.length, 0); assert.equal(isolated.hits.length, 0);
  await service.moveChats(['a'], other.id); assert.equal((await service.search(project.id, 'SQLite')).hits.length, 0);
});

test('a chat omitted from list filters is not treated as deleted without verification', async t => {
  const s = fixture(t); chat(s, 'outside-list'); chat(s, 'deleted');
  const service = new Service(s, { list: async () => [], read: async id => { if (id === 'deleted') throw new RpcError(-32602, 'Thread not found'); return { id, name: 'Still exists', cwd: '/work', updatedAt: 2 }; }, messages: async () => [], create: async () => { throw Error('unused'); }, close() {} });
  await service.refresh(true);
  assert.equal(s.chat('outside-list')?.missing, false); assert.equal(s.chat('deleted')?.missing, true);
});

test('new chat uses a normal Codex first turn, an exact folder ID, and safely quoted argv', async t => {
  const s = fixture(t); const folder = s.createFolder({ name: "Client 'A' $(ignored)", isProject: true, defaultCwd: tmpdir() });
  const service = new Service(s, { list: async () => [], read: async () => { throw Error('must not read an unpersisted chat'); }, messages: async () => [], create: async () => { throw Error('must not precreate an empty thread'); }, close() {} });
  const launch = await service.newChat(folder.id);
  assert.equal(launch.cwd, tmpdir()); assert.deepEqual(launch.args.slice(0, 2), ['-C', tmpdir()]); assert.match(launch.args[2]!, /current --json/); assert.ok(launch.args[2]?.includes(folder.id));
  assert.equal(s.chats().length, 0); assert.equal(shellQuote("a'b"), "'a'\\''b'");
});
