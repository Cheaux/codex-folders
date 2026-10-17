import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { AppServer } from '../src/codex.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('App Server transport reads real protocol messages and extracts only visible chat messages', async t => {
  const api = new AppServer(resolve('test/fixtures/codex')); t.after(() => api.close());
  assert.equal((await api.list()).length, 2); assert.equal((await api.read('thread-a')).name, 'Architecture decision');
  const messages = await api.messages('thread-a'); assert.equal(messages.length, 2); assert.equal(messages[1]?.turnId, 'turn-1');
  await assert.rejects(api.read('absent'), /not found/);
  assert.equal((await api.create('/tmp')).cwd, '/tmp');
});

test('bundled command speaks clean MCP over stdio and CLI/hook commands share its database', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'codex-folders-process-')); const env = { ...process.env, CODEX_THREAD_ID: 'fixture-current-thread', CODEX_FOLDERS_DATA_DIR: directory, CODEX_FOLDERS_CODEX_BIN: resolve('test/fixtures/codex') } as Record<string, string>;
  const client = new Client({ name: 'process-test', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve('dist/cli.js'), 'serve'], env, stderr: 'pipe' });
  t.after(async () => { await client.close(); rmSync(directory, { recursive: true, force: true }); });
  await client.connect(transport);
  assert.ok((await client.listTools()).tools.length >= 12);
  const created = await client.callTool({ name: 'folders_create', arguments: { name: 'Fixture project', is_project: true } }); const projectId = (created.structuredContent as any).result.id;
  await client.callTool({ name: 'chats_move', arguments: { thread_ids: ['thread-a'], folder_id: projectId } });
  const searched = await client.callTool({ name: 'project_search', arguments: { project_id: projectId, query: 'SQLite' } }); assert.equal((searched.structuredContent as any).result.hits.length, 1);
  const command = (args: string[], input?: string) => spawnSync(process.execPath, ['dist/cli.js', ...args], { env, input, encoding: 'utf8' });
  const current = command(['current', '--json']); assert.equal(JSON.parse(current.stdout).threadId, env.CODEX_THREAD_ID);
  const absent = spawnSync(process.execPath, ['dist/cli.js', 'current', '--json'], { encoding: 'utf8', env: { ...env, CODEX_THREAD_ID: '', CODEX_SESSION_ID: '' } }); assert.equal(absent.status, 1); assert.match(absent.stderr, /explicit thread ID/);
  const hook = command(['hook'], JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 'thread-a', prompt: 'SQLite' }));
  assert.equal(hook.status, 0); assert.match(JSON.parse(hook.stdout).hookSpecificOutput.additionalContext, /Fixture project/);
  const malformed = command(['hook'], 'malformed'); assert.equal(malformed.status, 0); assert.equal(malformed.stdout, '');
  const result = command(['folder', 'list', '--json']); assert.equal(JSON.parse(result.stdout).folders[0].id, projectId);
});
