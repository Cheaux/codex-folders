import { version } from './version.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Service, resumeCommand } from './service.js';

export function createMcpServer(service: Service) {
  const server = new McpServer({ name: 'codex-folders', version });
  const id = z.string().min(1).max(180); const text = z.string().max(16000);
  const tool = (name: string, description: string, schema: z.ZodRawShape, readOnly: boolean, run: (args: any) => unknown | Promise<unknown>) => {
    server.registerTool(name, { description, inputSchema: schema, annotations: { readOnlyHint: readOnly, destructiveHint: name === 'folders_delete', openWorldHint: false } }, async args => {
      try {
        const value = await run(args);
        return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], structuredContent: { result: value } };
      } catch (error) { return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }] }; }
    });
  };
  tool('folders_list', 'List local chat folders, project roots, paths, and direct chat counts.', {}, true, () => ({ folders: service.folders(), browserCommand: 'codex-folders' }));
  tool('folders_create', 'Create a folder or project. Projects share context across their descendant folders and cannot nest in another project.', {
    name: z.string().min(1).max(160), parent_id: id.nullable().optional(), is_project: z.boolean().optional(), instructions: text.optional(), default_cwd: z.string().max(4096).optional(),
  }, false, a => service.createFolder({ name: a.name, parentId: a.parent_id, isProject: a.is_project, instructions: a.instructions, defaultCwd: a.default_cwd }));
  tool('folders_update', 'Rename or move a folder, or edit project instructions/default directory. Existing chat working directories stay intact.', {
    folder_id: id, name: z.string().max(160).optional(), parent_id: id.nullable().optional(), instructions: text.optional(), default_cwd: z.string().max(4096).nullable().optional(),
  }, false, a => {
    const changes: any = {};
    for (const [input, field] of [['name', 'name'], ['parent_id', 'parentId'], ['instructions', 'instructions'], ['default_cwd', 'defaultCwd']]) if (a[input!] !== undefined) changes[field!] = a[input!];
    return service.updateFolder(a.folder_id, changes);
  });
  tool('folders_delete', 'Delete a folder and its subfolders, returning their chats to All chats. This removes project settings/memory if the project is deleted; it never deletes Codex chats.', { folder_id: id, confirm: z.literal(true) }, false, a => service.store.deleteFolder(a.folder_id));
  tool('chats_list', 'List actual saved Codex chats with IDs, titles, working directories, and folder assignments. Use null for the All chats home (chats outside folders). Omit folder_id for an inventory across all folders.', {
    folder_id: id.nullable().optional(), project_id: id.optional(), query: z.string().max(1000).optional(), include_archived: z.boolean().optional(), limit: z.number().int().min(1).max(200).default(50), offset: z.number().int().min(0).default(0),
  }, true, async a => {
    await service.refresh(); const chats = service.store.chats({ folderId: a.folder_id, projectId: a.project_id, query: a.query, includeArchived: a.include_archived });
    return { chats: chats.slice(a.offset, a.offset + a.limit), total: chats.length, nextOffset: a.offset + a.limit < chats.length ? a.offset + a.limit : null };
  });
  tool('chats_move', 'Assign explicit chat IDs to a folder, or null to return them to All chats. For “this chat,” use the hook-supplied current thread ID or codex-folders current --json, never the newest chat.', { thread_ids: z.array(id).min(1).max(200), folder_id: id.nullable() }, false, a => service.moveChats(a.thread_ids, a.folder_id));
  tool('chats_undo_move', 'Undo a chat move unless a later move would be overwritten.', { move_id: id.optional() }, false, a => service.store.undo(a.move_id));
  tool('chats_resume_command', 'Return the terminal command to resume a specific chat. Does not switch the active Codex UI or open a nested terminal.', { thread_id: id }, true, async a => { await service.ensureChat(a.thread_id); return { command: resumeCommand(a.thread_id) }; });
  tool('chats_new_command', 'Prepare the terminal command to start a new chat in a folder. Its first Codex turn assigns the actual chat ID and loads shared context. Preparing the command does not create a chat or start inference.', { folder_id: id, cwd: z.string().max(4096).optional() }, true, a => service.newChat(a.folder_id, a.cwd));
  tool('project_context_get', 'Load the current chat’s shared project instructions, revisioned brief, and optionally relevant sibling-chat references. Pass the exact current thread ID.', { thread_id: id, query: z.string().max(2000).optional() }, true, a => service.context(a.thread_id, a.query));
  tool('project_search', 'Search only messages from chats currently assigned to this project and its subfolders. Refreshes the local index; returns source thread/turn IDs and synchronization errors.', { project_id: id, query: z.string().min(1).max(2000), limit: z.number().int().min(1).max(30).default(8) }, true, a => service.search(a.project_id, a.query, a.limit));
  tool('project_message_read', 'Read the full source of a search hit in bounded chunks. Pass its message ID; project membership is checked again, including after moves.', { project_id: id, message_id: z.string().min(1).max(400), offset: z.number().int().min(0).default(0) }, true, a => service.store.readMessage(a.project_id, a.message_id, a.offset));
  tool('project_memory_update', 'Upsert durable decisions, progress, and next steps in a shared project brief. Read the revision first; reconcile conflicts. Supplied sources must belong to this project.', {
    project_id: id, expected_revision: z.number().int().min(0),
    upsert: z.array(z.object({ key: z.string().min(1).max(160), text: text.min(1), sourceThreadId: id.optional(), sourceTurnId: id.optional() })).max(100).default([]),
    remove_keys: z.array(z.string().max(160)).max(100).default([]),
  }, false, a => service.updateMemory(a.project_id, a.expected_revision, a.upsert, a.remove_keys));
  tool('project_memory_history', 'Inspect the last 50 saved revisions of a project brief.', { project_id: id }, true, a => { service.store.memory(a.project_id); return service.store.memoryHistory(a.project_id); });
  return server;
}
export async function serve(service: Service) {
  const server = createMcpServer(service);
  const shutdown = () => { service.close(); void server.close(); };
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
  process.stdin.once('end', () => { service.close(); });
  await server.connect(new StdioServerTransport());
}
