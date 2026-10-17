import { spawn } from 'node:child_process';
import { terminalEnvironment, manifestPath } from './launcher-install.js';

/** Compatibility entry point; all terminal presentation belongs to the shared host. */
export async function launch(args: string[]) {
  const child = spawn(process.env.CODEX_TERMINAL_BIN || 'codex-terminal', ['launch', '--extension', manifestPath(), '--', ...args], { stdio: 'inherit', env: terminalEnvironment() });
  const signals: NodeJS.Signals[] = ['SIGWINCH','SIGTERM','SIGHUP','SIGINT'];
  const forward = Object.fromEntries(signals.map(signal => [signal, () => { child.kill(signal); }])) as Record<NodeJS.Signals, () => void>;
  for (const signal of signals) process.on(signal, forward[signal]);
  try { process.exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', () => reject(Error('Install Codex Command Extensions to use the terminal launcher. Folder MCP tools and the standalone browser work independently.')));
    child.once('exit', code => resolve(code ?? 1));
  }); } finally { for (const signal of signals) process.off(signal, forward[signal]); }
}
