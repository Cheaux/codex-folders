import { version } from './version.js';
import { parseArgs } from 'node:util';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync, unlinkSync, rmdirSync, writeSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { Service } from './service.js';
import { Store, UserError, dataDirectory } from './store.js';
import { hookOutput, type HookInput } from './hooks.js';
import { serve } from './mcp.js';
import { browse, clean } from './browser.js';
import { launch } from './launcher.js';
import { enableLauncher, disableLauncher, launcherStatus, registerTerminal } from './launcher-install.js';

const help = `Codex Folders ${version} — local chat projects and shared context

codex-folders                         Open the keyboard folder browser
codex-folders install                 Register and install the local Codex plugin
codex-folders enable                  Add /folders to new normal codex terminals
codex-folders disable                 Unregister folder shortcuts; preserve the shared host
codex-folders launch -- [CODEX_ARGS]   Launch official Codex with the folder overlay
codex-folders uninstall [--purge]      Remove plugin; preserve data unless --purge
codex-folders doctor                  Check runtime, local API, and database
codex-folders current --json          Identify this shell tool's current Codex chat
codex-folders list [--folder ID|all] [--json]
codex-folders folder list [--json]
codex-folders folder create NAME [--parent ID] [--project] [--cwd DIRECTORY]
codex-folders folder rename ID NAME
codex-folders folder move ID [--parent ID]
codex-folders folder delete ID --confirm
codex-folders project create NAME [--parent ID] [--cwd DIRECTORY]
codex-folders move THREAD_ID... --folder ID|all
codex-folders undo [MOVE_ID]
codex-folders new FOLDER_ID [--cwd DIRECTORY] [--launch]
codex-folders context [THREAD_ID] [--query TEXT] [--json]
codex-folders search PROJECT_ID QUERY [--json]
codex-folders memory PROJECT_ID [--revision N --upsert JSON --remove JSON] [--json]

In Codex: use $codex-folders:chat-folders or ask to organize chats or recall project context.
Browser: Ctrl+Right/m move · Ctrl+Left/u up · Space select · z undo · ? help.
Automatic context loading requires review and trust in Codex's /hooks screen.
Launcher: /folders or Ctrl+X then F opens folders; /resume opens the folder picker.
Codex Command Extensions owns the shared launcher. Remote independently registers /qr.
Ctrl+X then B returns to another open session. Existing Codex sessions are untouched.
`;
function currentThread() {
  const id = process.env.CODEX_THREAD_ID || process.env.CODEX_SESSION_ID;
  if (!id) throw new UserError('No current chat ID in this shell. Supply an explicit thread ID; do not choose a chat by recency.');
  return id;
}
function required(value: string | undefined, label: string): string { if (!value) throw new UserError(`Missing ${label}. Run codex-folders --help.`); return value; }
function codexCommand(args: string[]) {
  const run = spawnSync(process.env.CODEX_FOLDERS_CODEX_BIN || 'codex', args, { encoding: 'utf8', env: process.env, timeout: 45000 });
  if (run.error || run.status !== 0) throw new UserError(run.error?.message || run.stderr.trim() || `codex ${args.join(' ')} failed.`);
  return run.stdout.trim();
}
function print(value: any, json: boolean) {
  if (json || typeof value !== 'string') console.log(JSON.stringify(value, null, 2));
  else console.log(clean(value));
}
async function run() {
  const [command = 'browse', ...rest] = process.argv.slice(2);
  if (['--help', '-h', 'help'].includes(command)) { console.log(help); return; }
  if (command === '--version') { console.log(version); return; }
  if (command === 'launch') { await launch(rest[0] === '--' ? rest.slice(1) : rest); return; }
  if (command === 'enable') { print(enableLauncher(), true); return; }
  if (command === 'disable') { print(disableLauncher(), true); return; }
  if (command === 'terminal-browser') {
    if (process.env.CODEX_TERMINAL_RESULT_FD !== '3') throw new UserError('terminal-browser is an internal shared-host entry point.');
    const service = new Service();
    let selected: { args: string[] } | undefined;
    try { await browse(service, { onLaunch: command => { selected = command; }, onReady: () => process.stdout.write('\x1b[0m\x1b[2J\x1b[H') }); }
    finally { service.close(); }
    if (selected) writeSync(3, JSON.stringify({ type: 'codex', args: selected.args }) + '\n');
    return;
  }
  if (command === 'hook') {
    // Hooks never connect to App Server, block prompts, or create a model turn.
    if (!existsSync(join(dataDirectory(), 'folders.db'))) return;
    try {
      const raw = readFileSync(0, 'utf8'); if (raw.length > 1024 * 1024) return;
      const payload = JSON.parse(raw) as HookInput;
      const store = new Store();
      try { const output = hookOutput(store, payload); if (output) console.log(JSON.stringify(output)); }
      finally { store.close(); }
    } catch (error) { process.stderr.write(`Codex Folders context unavailable: ${error instanceof Error ? error.message : String(error)}\n`); }
    return;
  }
  const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: {
    json: { type: 'boolean' }, project: { type: 'boolean' }, parent: { type: 'string' }, cwd: { type: 'string' }, folder: { type: 'string' }, query: { type: 'string' },
    revision: { type: 'string' }, upsert: { type: 'string' }, remove: { type: 'string' }, confirm: { type: 'boolean' }, purge: { type: 'boolean' }, launch: { type: 'boolean' },
  } });
  if (command === 'current') { print({ threadId: currentThread(), source: 'current shell environment' }, !!values.json); return; }
  if (command === 'install') {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    if (!existsSync(join(root, '.agents/plugins/marketplace.json'))) throw new UserError('The package is missing its marketplace catalog. Reinstall the full package.');
    codexCommand(['plugin', 'marketplace', 'add', root, '--json']);
    const result = codexCommand(['plugin', 'add', 'codex-folders@codex-folders-local', '--json']);
    const store = new Store(); store.close();
    print({ installed: true, result: JSON.parse(result), terminal: registerTerminal(true), next: ['Install Codex Command Extensions, then run codex-folders enable and open a new Codex session.', 'Open /hooks and review/trust the two Codex Folders hooks to enable automatic project context.', 'Use /folders or Ctrl+X then F in the terminal launcher, or ask Codex to create a project folder.'] }, true); return;
  }
  if (command === 'uninstall') {
    disableLauncher();
    codexCommand(['plugin', 'remove', 'codex-folders@codex-folders-local', '--json']);
    codexCommand(['plugin', 'marketplace', 'remove', 'codex-folders-local']);
    if (values.purge) {
      const directory = dataDirectory();
      for (const name of ['folders.db', 'folders.db-wal', 'folders.db-shm']) if (existsSync(join(directory, name))) unlinkSync(join(directory, name));
      try { rmdirSync(directory); } catch {}
    }
    print({ removed: true, projectData: values.purge ? 'purged' : 'preserved', runtime: 'To remove the command too: npm uninstall --global --prefix ~/.local codex-folders' }, true); return;
  }
  const service = new Service();
  if (command === 'serve') { await serve(service); return; }
  try {
    if (command === 'browse') { await browse(service); return; }
    if (command === 'doctor') {
      const version = codexCommand(['--version']); const threads = await service.api.list();
      print({ ok: true, node: process.version, codex: version, localChatApi: 'ok', visibleChatCount: threads.length, database: service.store.directory, launcher: launcherStatus() || 'disabled', sqlite: service.store.db.prepare('SELECT sqlite_version() AS version').get(), automaticContext: 'Requires manual hook review/trust in /hooks; this command does not grant trust.' }, true); return;
    }
    if (command === 'list') {
      await service.refresh(true); const folderId = ['all', 'unfiled'].includes(values.folder || '') ? null : values.folder;
      const chats = service.store.chats({ folderId, query: values.query });
      print(values.json ? { chats } : chats.map(c => `${c.id}  ${clean(c.title)}  [${c.folderId ? service.store.path(c.folderId) : 'All chats'}]`).join('\n'), !!values.json); return;
    }
    if (command === 'folder' || command === 'project') {
      const [action = 'list', idOrName, newName] = positionals;
      if (action === 'list') print({ folders: service.folders() }, true);
      else if (action === 'create') print(service.createFolder({ name: required(idOrName, 'folder name'), parentId: values.parent, isProject: command === 'project' || !!values.project, defaultCwd: values.cwd }), true);
      else if (action === 'rename') print(service.updateFolder(required(idOrName, 'folder ID'), { name: required(newName, 'new name') }), true);
      else if (action === 'move') print(service.updateFolder(required(idOrName, 'folder ID'), { parentId: values.parent || null }), true);
      else if (action === 'delete') { if (!values.confirm) throw new UserError('Deleting a folder removes its project settings and memory. Add --confirm; Codex conversations will return to All chats.'); print(service.store.deleteFolder(required(idOrName, 'folder ID')), true); }
      else throw new UserError(`Unknown folder action: ${action}`);
      return;
    }
    if (command === 'move') { const target = required(values.folder, '--folder'); print(await service.moveChats(positionals, ['all', 'unfiled'].includes(target) ? null : target), true); return; }
    if (command === 'undo') { print(service.store.undo(positionals[0]), true); return; }
    if (command === 'new') {
      const launch = await service.newChat(required(positionals[0], 'folder ID'), values.cwd);
      if (values.launch) {
        if (!process.stdin.isTTY || !process.stdout.isTTY) throw new UserError('Use --launch from an interactive terminal, or omit it to return the new-chat command.');
        service.api.close();
        const { spawn } = await import('node:child_process');
        const child = spawn(launch.executable, launch.args, { stdio: 'inherit', env: process.env });
        await new Promise<void>((resolve, reject) => { child.once('error', reject); child.once('exit', () => resolve()); });
      } else print(launch, true);
      return;
    }
    if (command === 'context') { print(await service.context(positionals[0] || currentThread(), values.query), true); return; }
    if (command === 'search') { print(await service.search(required(positionals[0], 'project ID'), required(positionals.slice(1).join(' '), 'query')), true); return; }
    if (command === 'memory') {
      const projectId = required(positionals[0], 'project ID');
      if (values.upsert || values.remove) {
        const revision = Number(required(values.revision, '--revision')); if (!Number.isSafeInteger(revision) || revision < 0) throw new UserError('Use a nonnegative integer revision.');
        print(service.updateMemory(projectId, revision, JSON.parse(values.upsert || '[]'), JSON.parse(values.remove || '[]')), true);
      } else print(service.store.memory(projectId), true);
      return;
    }
    throw new UserError(`Unknown command: ${command}. Run codex-folders --help.`);
  } finally { service.close(); }
}
run().catch(error => {
  if (error instanceof Error && ['ExitPromptError', 'AbortPromptError'].includes(error.name)) { process.exitCode = 0; return; }
  process.stderr.write(`codex-folders: ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1;
});
