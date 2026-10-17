import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../src/mcp.js';
import { Store } from '../src/store.js';
import { Service } from '../src/service.js';

test('real MCP discovery and calls organize chats and enforce revision/membership checks', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'codex-folders-mcp-')); const store = new Store(directory);
  const service = new Service(store, { list: async () => [], read: async id => ({ id, name: 'Exact chat', cwd: '/work' }), messages: async () => [], create: async () => ({ id: 'new' }), close() {} });
  const server = createMcpServer(service); const client = new Client({ name: 'folders-test', version: '1' }); const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.close(); service.close(); rmSync(directory, { recursive: true, force: true }); });
  await server.connect(serverTransport); await client.connect(clientTransport);
  const tools = await client.listTools(); assert.ok(tools.tools.some(tool => tool.name === 'project_search')); assert.ok(tools.tools.some(tool => tool.name === 'chats_move'));
  const created = await client.callTool({ name: 'folders_create', arguments: { name: 'Project', is_project: true } });
  const folder = (created.structuredContent as any).result; assert.ok(folder.id);
  await client.callTool({ name: 'chats_move', arguments: { thread_ids: ['exact-thread'], folder_id: folder.id } }); assert.equal(store.assignment('exact-thread'), folder.id);
  const saved = await client.callTool({ name: 'project_memory_update', arguments: { project_id: folder.id, expected_revision: 0, upsert: [{ key: 'goal', text: 'ship', sourceThreadId: 'exact-thread' }] } });
  assert.equal(saved.isError, undefined);
  const conflict = await client.callTool({ name: 'project_memory_update', arguments: { project_id: folder.id, expected_revision: 0, upsert: [] } }); assert.equal(conflict.isError, true);
  const context = await client.callTool({ name: 'project_context_get', arguments: { thread_id: 'exact-thread' } }); assert.equal((context.structuredContent as any).result.notes[0].text, 'ship');
  const outside = await client.callTool({ name: 'project_context_get', arguments: { thread_id: 'unrelated' } }); assert.equal((outside.structuredContent as any).result.project, null);
});
