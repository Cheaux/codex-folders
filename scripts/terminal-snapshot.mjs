// Render a recorded PTY screen for visual QA; no browser or model required.
// node scripts/terminal-snapshot.mjs recording.ansi output.png [columns] [rows]
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const { Terminal } = createRequire(import.meta.url)('@xterm/headless');
const [input, output, columns = '110', rows = '28'] = process.argv.slice(2);
if (!input || !output) throw Error('Supply recording.ansi and output.png');
const terminal = new Terminal({ cols: Number(columns), rows: Number(rows), allowProposedApi: true });
await new Promise(resolve => terminal.write(readFileSync(input), resolve));
const cellWidth = 11, lineHeight = 25, padding = 16;
const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const palette = ['#151922', '#d98c8c', '#a4c9a2', '#d4bd89', '#9fb4d3', '#bdabcd', '#8ec8d0', '#d6d9df', '#747d8e', '#e6aaaa', '#bbdbb8', '#e2d2aa', '#bac9e1', '#d1c1df', '#b0dce2', '#edf0f5'];
const color = (cell, foreground) => {
  const n = foreground ? cell.getFgColor() : cell.getBgColor();
  if (foreground ? cell.isFgRGB() : cell.isBgRGB()) return '#' + n.toString(16).padStart(6, '0');
  if (foreground ? cell.isFgPalette() : cell.isBgPalette()) {
    if (n < 16) return palette[n];
    if (n >= 232) return '#' + (8 + (n - 232) * 10).toString(16).padStart(2, '0').repeat(3);
    const cube = [0, 95, 135, 175, 215, 255]; const value = n - 16;
    return '#' + [Math.floor(value / 36), Math.floor(value / 6) % 6, value % 6].map(i => cube[i].toString(16).padStart(2, '0')).join('');
  }
  return foreground ? palette[7] : palette[0];
};
const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${terminal.cols * cellWidth + padding * 2}" height="${terminal.rows * lineHeight + padding * 2}"><rect width="100%" height="100%" fill="${palette[0]}"/>`];
for (let row = 0; row < terminal.rows; row++) {
  const line = terminal.buffer.active.getLine(terminal.buffer.active.baseY + row); if (!line) continue;
  for (let column = 0; column < terminal.cols; column++) {
    const cell = line.getCell(column); if (!cell || !cell.getWidth()) continue;
    let fg = color(cell, true), bg = color(cell, false); if (cell.isInverse()) [fg, bg] = [bg, fg];
    const x = padding + column * cellWidth, y = padding + row * lineHeight;
    if (bg !== palette[0]) svg.push(`<rect x="${x}" y="${y}" width="${cell.getWidth() * cellWidth}" height="${lineHeight}" fill="${bg}"/>`);
    const chars = cell.getChars();
    if (chars && chars !== ' ') svg.push(`<text x="${x}" y="${y + 18}" fill="${fg}" opacity="${cell.isDim() ? .75 : 1}" font-family="Noto Sans Mono, monospace" font-size="18" font-weight="${cell.isBold() ? 700 : 400}">${escape(chars)}</text>`);
  }
}
svg.push('</svg>'); writeFileSync(output + '.svg', svg.join(''));
const result = spawnSync('rsvg-convert', ['-o', output, output + '.svg'], { encoding: 'utf8' });
if (result.status !== 0) throw Error(result.stderr || 'rsvg-convert is required for PNG previews.');
terminal.dispose(); console.log(output);
