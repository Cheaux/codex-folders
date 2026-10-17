import { createPrompt, useState, useKeypress, useEffect } from '@inquirer/core';
import { select, input, confirm, editor } from '@inquirer/prompts';
import { spawn } from 'node:child_process';
import { Service } from './service.js';
import { UserError, type Folder, type Store } from './store.js';
import { renderBrowser, type TreeEntry } from './browser-view.js';
export { clean, fit } from './terminal-text.js';

type ViewId = string;
type ActionName = 'quit' | 'resume' | 'move' | 'up' | 'undo' | 'create' | 'newchat' | 'rename' | 'delete' | 'edit' | 'refresh' | 'search' | 'help';
type BrowserAction = { action: ActionName; view: ViewId; threadIds: string[]; focus: 'folders' | 'chats' };
export function folderTree(folders: Folder[], collapsed = new Set<string>()): TreeEntry[] {
  const rows: TreeEntry[] = [{ id: 'all', label: 'All chats' }];
  function visit(parentId: string | null, depth: number) {
    for (const f of folders.filter(f => f.parentId === parentId)) {
      const children = folders.some(child => child.parentId === f.id);
      rows.push({ id: f.id, label: `${'  '.repeat(depth)}${children ? collapsed.has(f.id) ? '▸ ' : '▾ ' : ''}${f.name}`, folder: f });
      if (!collapsed.has(f.id)) visit(f.id, depth + 1);
    }
  }
  visit(null, 0); return rows;
}
export function browserChats(store: Store, view: string, query?: string) {
  return store.chats({ folderId: view === 'all' ? null : view, query });
}
export function moveDestinations(service: Service) {
  return [...service.store.folders().map(folder => ({ name: service.store.path(folder.id), value: folder.id })).sort((a, b) => a.name.localeCompare(b.name)),
    { name: 'All chats', value: null }, { name: 'Cancel', value: undefined }];
}
export function keyboardAction(key: { name?: string; ctrl?: boolean; sequence?: string }): ActionName | null {
  if ((key.ctrl && key.name === 'right') || key.sequence === '\x1b[1;5C' || key.name === 'm') return 'move';
  if ((key.ctrl && key.name === 'left') || key.sequence === '\x1b[1;5D' || key.name === 'u') return 'up';
  return ({ q: 'quit', z: 'undo', n: 'create', c: 'newchat', r: 'rename', d: 'delete', e: 'edit', f5: 'refresh', '/': 'search', '?': 'help' } as Record<string, ActionName>)[(key.name || key.sequence || '').toLowerCase()] ?? null;
}
const browserPrompt = createPrompt<BrowserAction, { service: Service; view: ViewId; message: string; query: string; focus: 'folders' | 'chats' }>((config, done) => {
  const [view, setView] = useState(config.view); const [focus, setFocus] = useState(config.focus);
  const [message, setMessage] = useState(config.message);
  const [sidebar, setSidebar] = useState<string>(config.view);
  const [cursor, setCursor] = useState(0); const [selected, setSelected] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const folders = config.service.store.folders();
  const tree = [...folderTree(folders, collapsed), { id: 'new-folder', label: '+ New folder' }];
  const folderIndex = Math.max(0, tree.findIndex(e => e.id === sidebar));
  const [size, setSize] = useState({ columns: process.stdout.columns || 90, rows: process.stdout.rows || 28 });
  useEffect(() => { const resize = () => setSize({ columns: process.stdout.columns || 90, rows: process.stdout.rows || 28 }); process.stdout.on('resize', resize); return () => { process.stdout.off('resize', resize); }; }, []);
  const chats = browserChats(config.service.store, view, config.query);
  const current = chats[Math.min(cursor, Math.max(chats.length - 1, 0))];
  useKeypress(key => {
    const act = keyboardAction(key);
    if (act) { done({ action: act, view: focus === 'folders' && sidebar === 'new-folder' ? 'all' : view, focus, threadIds: selected.length ? selected : current ? [current.id] : [] }); return; }
    setMessage('');
    if (key.name === 'tab') { setFocus(focus === 'folders' ? 'chats' : 'folders'); return; }
    if (key.name === 'escape') { if (selected.length) setSelected([]); else done({ action: config.query ? 'search' : 'quit', view, focus, threadIds: [] }); return; }
    if (key.name === 'up' || key.name === 'down') {
      const delta = key.name === 'up' ? -1 : 1;
      if (focus === 'folders') { const next = tree[Math.max(0, Math.min(tree.length - 1, folderIndex + delta))]!.id; setSidebar(next); if (next !== 'new-folder') setView(next); setCursor(0); setSelected([]); }
      else setCursor(Math.max(0, Math.min(chats.length - 1, cursor + delta)));
    } else if (key.name === 'left' || key.name === 'right') {
      if (focus === 'folders' && tree[folderIndex]?.folder) { const next = new Set(collapsed); if (key.name === 'left') next.add(view); else next.delete(view); setCollapsed(next); }
      else if (key.name === 'left') setFocus('folders');
      else if (focus === 'folders') setFocus('chats');
    } else if (key.name === 'space' && focus === 'chats' && current) setSelected(selected.includes(current.id) ? selected.filter(id => id !== current.id) : [...selected, current.id]);
    else if (key.name === 'return' || key.name === 'enter') {
      if (focus === 'folders' && sidebar === 'new-folder') done({ action: 'create', view: 'all', focus, threadIds: [] });
      else if (focus === 'folders') setFocus('chats');
      else if (current) done({ action: 'resume', view, focus, threadIds: [current.id] });
    }
  });
  const viewName = view === 'all' ? 'All chats' : config.service.store.path(view);
  const location = current ? `${current.folderId ? config.service.store.path(current.folderId) : 'All chats'} · ${current.cwd}` : '';
  return renderBrowser({ ...size, tree, folderIndex, focus, view, viewName, chats, cursor, selected, query: config.query, message, folderCount: folders.length, currentLocation: location });
});

type PromptContext = { clearPromptOnDone: boolean; signal?: AbortSignal };
async function destination(service: Service, context: PromptContext, message = 'Move chats to…'): Promise<string | null | undefined> {
  return select({ message, choices: moveDestinations(service) }, context);
}
async function editProject(service: Service, view: string, context: PromptContext) {
  const project = service.store.projectForFolder(view);
  if (!project) throw new UserError('Choose a project or one of its subfolders first.');
  const kind = await select({ message: `Edit ${service.store.path(project.id)}`, choices: [{ name: 'Shared instructions', value: 'instructions' }, { name: 'Shared project brief', value: 'brief' }, { name: 'Default directory for new chats', value: 'cwd' }, { name: 'Cancel', value: 'cancel' }] }, context);
  if (kind === 'instructions') service.updateFolder(project.id, { instructions: await editor({ message: 'Edit project instructions', default: project.instructions }, context) });
  if (kind === 'cwd') service.updateFolder(project.id, { defaultCwd: (await input({ message: 'Default working directory (blank clears it)', default: project.defaultCwd || '' }, context)) || null });
  if (kind === 'brief') {
    const memory = service.store.memory(project.id);
    const raw = await editor({ message: 'Edit JSON memory entries (key, text, optional sourceThreadId/sourceTurnId)', default: JSON.stringify(memory.notes, null, 2) }, context);
    const parsed = JSON.parse(raw); if (!Array.isArray(parsed)) throw new UserError('The project brief must be a JSON array of memory entries.');
    service.updateMemory(project.id, memory.revision, parsed, memory.notes.map(note => note.key));
  }
}
export type BrowserLaunch = { executable: string; args: string[]; threadId?: string };
export type BrowserOptions = { onLaunch?: (launch: BrowserLaunch) => void; onReady?: () => void; signal?: AbortSignal; message?: string };
export async function browse(service: Service, options: BrowserOptions = {}) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new UserError('The browser needs an interactive terminal. Use codex-folders list --json or the MCP tools instead.');
  let view: ViewId = 'all'; let focus: 'folders' | 'chats' = 'folders'; let message = options.message || ''; let query = '';
  const context: PromptContext = { clearPromptOnDone: true, signal: options.signal };
  try { await service.refresh(true); } catch (error) { message = `Offline: ${error instanceof Error ? error.message : String(error)}`; }
  options.onReady?.();
  while (true) {
    const answer = await browserPrompt({ service, view, message, query, focus }, context);
    view = answer.view; focus = answer.focus; message = '';
    try {
      const ids = answer.threadIds;
      if (answer.action === 'quit') return;
      if (answer.action === 'resume') {
        const id = ids[0]!; await service.ensureChat(id);
        if (options.onLaunch) { options.onLaunch({ executable: process.env.CODEX_FOLDERS_CODEX_BIN || 'codex', args: ['resume', id], threadId: id }); return; }
        // Close the reader App Server before handing the terminal to Codex.
        service.api.close();
        const child = spawn(process.env.CODEX_FOLDERS_CODEX_BIN || 'codex', ['resume', id], { stdio: 'inherit', env: process.env });
        await new Promise<void>((resolve, reject) => { child.once('error', reject); child.once('exit', () => resolve()); }); return;
      }
      if (answer.action === 'move' || answer.action === 'up') {
        if (focus !== 'chats') throw new UserError('Press Tab to choose a chat first, then M to move it.');
        if (!ids.length) throw new UserError('No chats selected. Choose a chat from All chats first.');
        if (answer.action === 'up') { const result = service.store.moveUp(ids); message = `Moved ${result.moved} chat(s) up one level. Z to undo.`; }
        else { const target = await destination(service, context); if (target !== undefined) { const result = await service.moveChats(ids, target); message = `Moved ${result.moved} chat(s) to ${result.folder}. Z to undo.`; } }
      }
      if (answer.action === 'undo') message = `Restored ${service.store.undo().restored} chat(s).`;
      if (answer.action === 'search') query = await input({ message: 'Search chat titles/directories (blank clears)', default: query }, context);
      if (answer.action === 'refresh') { await service.refresh(true); message = 'Chat list refreshed.'; }
      if (answer.action === 'help') {
        await select({ message: 'More actions · Enter to return', choices: [{ name: 'N  New folder · C  New chat in this folder', value: 1 }, { name: 'M  Move selected chats · Space  Select multiple · Z  Undo', value: 1 }, { name: 'R  Rename folder · D  Remove folder · E  Shared context', value: 1 }, { name: '/  Search chats · F5  Refresh · Esc / Q  Back to Codex', value: 1 }, { name: 'Arrows  Navigate · Tab  Switch panel · Left/right  Collapse/expand', value: 1 }, { name: 'Ctrl+Right  Move · Ctrl+Left / U  Move up one folder', value: 1 }, { name: 'Opening a chat keeps your prior session alive. Ctrl+X then B returns to it.', value: 1 }, { name: 'In Codex: /resumedbg opens the original Codex resume picker.', value: 1 }] }, context);
      }
      if (answer.action === 'create') {
        const parentId = view === 'all' ? null : view;
        const name = await input({ message: parentId ? `Folder name in ${service.store.path(parentId)}` : 'Folder name', validate: value => {
          const text = value.trim(); return text.length > 0 && text.length <= 160 && !/[\x00-\x1f\x7f/\\]/.test(text) && !['.', '..'].includes(text) || 'Enter a name without slashes (1–160 characters).';
        } }, context);
        const isProject = service.store.projectForFolder(parentId) ? false : await select({ message: 'Share context between chats in this folder?', choices: [{ name: 'Yes — share instructions and project memory', value: true }, { name: 'No — just organize chats', value: false }] }, context);
        const folder = service.createFolder({ name, parentId, isProject }); view = folder.id; focus = 'folders';
        message = `Created ${folder.name}. Choose a chat in All chats, then M to move it here.`;
      }
      if (answer.action === 'newchat') {
        if (view === 'all') throw new UserError('Select a destination folder first.');
        const launch = await service.newChat(view); service.api.close();
        if (options.onLaunch) { options.onLaunch({ executable: launch.executable, args: launch.args }); return; }
        const child = spawn(launch.executable, launch.args, { stdio: 'inherit', env: process.env });
        await new Promise<void>((resolve, reject) => { child.once('error', reject); child.once('exit', () => resolve()); }); return;
      }
      if (answer.action === 'rename') { if (view === 'all') throw new UserError('Select a folder first.'); service.updateFolder(view, { name: await input({ message: 'Folder name', default: service.store.folder(view).name }, context) }); }
      if (answer.action === 'delete') {
        if (view === 'all') throw new UserError('Select a folder first.');
        if (await confirm({ message: `Remove ${service.store.path(view)} and its subfolders/settings? Chats return to All chats and are never deleted.`, default: false }, context)) { const result = service.store.deleteFolder(view); view = 'all'; message = `Removed ${result.foldersDeleted} folder(s); ${result.unfiled} chat(s) returned to All chats.`; }
      }
      if (answer.action === 'edit') { if (view === 'all') throw new UserError('Select a project folder first.'); await editProject(service, view, context); message = 'Project updated.'; }
    } catch (error) { if (error instanceof Error && error.name === 'ExitPromptError') { message = 'Cancelled.'; continue; } if (error instanceof Error && error.name === 'AbortPromptError') throw error; message = error instanceof Error ? error.message : String(error); }
  }
}
