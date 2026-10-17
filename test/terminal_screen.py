"""Interpret captured ANSI as a terminal screen rather than asserting stale repaint bytes."""
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
def screen(recording, columns=100, rows=28):
    code = """
const { Terminal } = require('@xterm/headless');
const terminal = new Terminal({cols: Number(process.argv[1]), rows: Number(process.argv[2]), allowProposedApi: true});
terminal.write(require('node:fs').readFileSync(0), () => {
  const buffer = terminal.buffer.active;
  console.log(Array.from({length: terminal.rows}, (_, y) => buffer.getLine(buffer.baseY + y)?.translateToString(true) || '').join('\\n'));
  terminal.dispose();
});
"""
    result = subprocess.run(['node', '-e', code, str(columns), str(rows)], input=recording, cwd=ROOT, capture_output=True, check=True)
    return result.stdout.decode()
