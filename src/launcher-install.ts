import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, accessSync, constants, openSync, readSync, closeSync, lstatSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataDirectory, UserError } from './store.js';

type Installation = { realCodex: string; shimPath: string; content: string };
const legacyPath = () => join(dataDirectory(), 'launcher.json');
const legacy = (): Installation | undefined => { try { return JSON.parse(readFileSync(legacyPath(), 'utf8')); } catch { return undefined; } };
export const manifestPath = () => fileURLToPath(new URL('../terminal-extension.json', import.meta.url));
export function terminalEnvironment() {
  return { ...process.env,
    ...(process.env.CODEX_FOLDERS_CODEX_BIN && !process.env.CODEX_TERMINAL_CODEX_BIN ? { CODEX_TERMINAL_CODEX_BIN: process.env.CODEX_FOLDERS_CODEX_BIN } : {}),
    ...(process.env.CODEX_FOLDERS_BIN_DIR && !process.env.CODEX_TERMINAL_BIN_DIR ? { CODEX_TERMINAL_BIN_DIR: process.env.CODEX_FOLDERS_BIN_DIR } : {}),
  };
}
export function terminalHost(args: string[], optional = false): any {
  const result = spawnSync(process.env.CODEX_TERMINAL_BIN || 'codex-terminal', args, { encoding: 'utf8', env: terminalEnvironment(), timeout: 15000 });
  if (result.error && (result.error as NodeJS.ErrnoException).code === 'ENOENT' && optional) return undefined;
  if (result.error || result.status !== 0) throw new UserError(result.stderr?.trim() || 'Install Codex Terminal Extensions for terminal shortcuts. Folder tools work independently.');
  return JSON.parse(result.stdout);
}
export function registerTerminal(optional = false) { return terminalHost(['register', manifestPath()], optional); }
export function launcherStatus(): Installation | undefined {
  const status = terminalHost(['status', '--json'], true);
  if (status) return status.enabled && status.providers.some((provider: { id: string }) => provider.id === 'codex-folders') ? status : undefined;
  return legacy();
}
function wrapper(path: string) {
  let fd: number | undefined;
  try { fd = openSync(path,'r'); const data=Buffer.alloc(100); const size=readSync(fd,data,0,data.length,0); return /^#!\/bin\/sh\n# codex-(?:folders-terminal-launcher|terminal-extensions-launcher)\n/.test(data.toString('utf8',0,size)); }
  catch { return false; } finally { if (fd !== undefined) closeSync(fd); }
}
export function officialCodex() {
  const override=process.env.CODEX_TERMINAL_CODEX_BIN || process.env.CODEX_FOLDERS_CODEX_BIN;
  const saved=legacy();
  const candidates=override ? override.includes('/') ? [resolve(override)] : (process.env.PATH || '').split(delimiter).map(path=>resolve(path,override))
    : [...(saved ? [saved.realCodex] : []), ...(process.env.PATH || '').split(delimiter).map(path=>resolve(path,'codex'))];
  for(const path of candidates) try { accessSync(path,constants.X_OK); if(!wrapper(path)) return path; } catch {}
  throw new UserError('Cannot find the original Codex executable. Set CODEX_TERMINAL_CODEX_BIN.');
}
export function enableLauncher() {
  registerTerminal();
  const status=terminalHost(['status','--json']);
  return terminalHost(['enable', ...(!status.enabled && legacy() ? ['--migrate-from',legacyPath()] : [])]);
}
export function disableLauncher() {
  const status=terminalHost(['status','--json'], true);
  if(status) { terminalHost(['unregister','codex-folders']); return { disabled:true, removed:false, sharedHostPreserved:true, otherExtensionsPreserved:true }; }
  const saved=legacy(); if(!saved) return { disabled:true,removed:false };
  if(existsSync(saved.shimPath)) {
    if(lstatSync(saved.shimPath).isSymbolicLink() || readFileSync(saved.shimPath,'utf8')!==saved.content) throw new UserError('The previous launcher was modified and has been preserved.');
    unlinkSync(saved.shimPath);
  }
  unlinkSync(legacyPath()); return { disabled:true,removed:true };
}
