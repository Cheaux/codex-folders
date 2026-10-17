import { fit } from './terminal-text.js';
import type { Chat, Folder } from './store.js';

export type TreeEntry = { id: string; label: string; folder?: Folder };
export type BrowserView = {
  columns: number; rows: number; tree: TreeEntry[]; folderIndex: number;
  focus: 'folders' | 'chats'; view: string; viewName: string; chats: Chat[];
  cursor: number; selected: string[]; query: string; message: string;
  folderCount: number; currentLocation: string; color?: boolean;
};
export function renderBrowser(state: BrowserView): string {
  const width = Math.max(16, Math.min(110, state.columns - 4));
  const compact = state.columns < 76;
  const selectedFolder = state.tree[state.folderIndex];
  const creating = state.focus === 'folders' && selectedFolder?.id === 'new-folder';
  const canNewChat = state.view !== 'all' && !creating;
  const cta = canNewChat ? '[C] New chat   [N] New folder' : '[N] New folder';
  const wrapHeader = width < 13 + cta.length + 2;
  const height = Math.max(1, Math.min(12, state.rows - (width < 32 ? 12 : 11) - (width >= 32 && wrapHeader ? 1 : 0)));
  const leftWidth = compact ? width : Math.min(28, Math.max(22, Math.floor(width * .28)));
  const rightWidth = compact ? width : width - leftWidth - 3;
  const color = state.color ?? !process.env.NO_COLOR;
  const style = (text: string, code: string) => color ? `\x1b[${code}m${text}\x1b[0m` : text;
  const muted = (text: string) => style(text, '2');
  const heading = (text: string, active: boolean) => style(text, active ? '1;36' : '1');
  const row = (text: string, size: number, active: boolean, chosen = false) => {
    const value = fit(`${active ? '›' : ' '} ${text}`, size);
    return active ? style(value, '7') : chosen ? style(value, '1') : value;
  };
  if (state.rows < 12 || (width < 32 && state.rows < 14)) {
    const available = Math.max(1, state.rows - 5);
    const items = state.focus === 'folders' ? state.tree.map(entry => entry.label) : state.chats.map(chat => chat.title);
    const current = state.focus === 'folders' ? state.folderIndex : state.cursor;
    const start = Math.max(0, Math.min(current - Math.floor(available / 2), items.length - available));
    return [heading(fit(state.focus === 'folders' ? 'Folders' : 'Chats', width), true),
      ...Array.from({ length: available }, (_, index) => row(items[index + start] || '', width, index + start === current && items.length > 0)),
      style(fit(canNewChat ? 'C New chat' : 'N New folder', width), '1'), muted(fit('Tab Panels', width)), muted(fit('Esc Back  ? Help', width))].map(line => '  ' + line).join('\n');
  }
  const folderStart = Math.max(0, Math.min(state.folderIndex - Math.floor(height / 2), state.tree.length - height));
  const chatStart = Math.max(0, Math.min(state.cursor - Math.floor(height / 2), state.chats.length - height));
  const lines: string[] = [];
  const add = (line = '') => lines.push('  ' + line);
  if (!wrapHeader) add(heading(fit('Codex Folders', width - cta.length), false) + style(cta, '1;36'));
  else { add(heading(width < 32 ? 'Folders' : 'Codex Folders', false)); add(style(fit(width < 32 ? canNewChat ? 'C New chat' : 'N New folder' : canNewChat ? 'C New chat · N New folder' : 'N New folder', width), '1;36')); }
  add();
  const chatHeading = creating ? 'New folder' : `Chats · ${state.viewName} (${state.chats.length})`;
  if (compact) {
    add(heading(fit(state.focus === 'folders' ? 'Folders' : chatHeading, width), true));
    add(muted('─'.repeat(width)));
  } else {
    add(heading(fit('Folders', leftWidth), state.focus === 'folders') + '   ' + heading(fit(chatHeading, rightWidth), state.focus === 'chats'));
    add(muted('─'.repeat(leftWidth) + '   ' + '─'.repeat(rightWidth)));
  }
  for (let index = 0; index < height; index++) {
    const entry = state.tree[index + folderStart]; const chat = state.chats[index + chatStart];
    let left = entry ? row(entry.label, leftWidth, state.focus === 'folders' && index + folderStart === state.folderIndex, entry.id === state.view) : fit('', leftWidth);
    if (entry?.id === 'new-folder' && !(state.focus === 'folders' && index + folderStart === state.folderIndex)) left = style(left, '36');
    const emptyText = state.query ? ['No matching chats.'] : state.view === 'all' ? ['All chats is clear.', 'Chats in folders stay in their folders.'] : ['No chats in this folder.', 'Press C to start a new chat here.', 'Or move an existing chat with M.'];
    let right = chat ? row(`${state.selected.length ? state.selected.includes(chat.id) ? '[x] ' : '[ ] ' : ''}${chat.title}`, rightWidth, state.focus === 'chats' && index + chatStart === state.cursor)
      : muted(fit(!state.chats.length ? emptyText[index] || '' : '', rightWidth));
    if (creating) right = muted(fit(['Press Enter to name your folder.', 'Then choose whether its chats share', 'instructions and project memory.'][index] || '', rightWidth));
    if (compact) add(state.focus === 'folders' ? left : right);
    else add(left + '   ' + right);
  }
  const range = creating ? '' : state.chats.length ? `${chatStart + 1}–${Math.min(chatStart + height, state.chats.length)} of ${state.chats.length}` : '0 chats';
  const folderCount = state.folderCount;
  if (compact) add(muted(fit(state.focus === 'chats' ? range : `${folderCount} folder${folderCount === 1 ? '' : 's'}`, width)));
  else add(muted(fit(`${folderCount} folder${folderCount === 1 ? '' : 's'}`, leftWidth) + '   ' + fit(range, rightWidth)));
  add();
  const normalStatus = state.selected.length ? `${state.selected.length} selected · M to move them together`
    : creating ? 'Enter to create a folder.' : !state.folderCount ? 'No folders yet. Press N to create your first folder.'
    : state.focus === 'folders' ? selectedFolder?.folder?.isProject ? 'Shares instructions and memory across its chats.' : 'Enter to browse this folder’s chats.'
    : state.currentLocation;
  add(state.message ? fit(state.message, width) : muted(fit(state.query ? `Search: ${state.query}` : normalStatus, width)));
  if (width >= 68) {
    add(style(fit(creating ? 'Enter Create folder    Esc Back' : state.focus === 'folders' ? 'N New folder    Enter Browse chats    / Search    Esc Back' : `${canNewChat ? 'C New chat' : 'N New folder'}    M Move chat    Enter Open chat    Esc Back`, width), '1'));
    add(muted(fit(`↑↓ Navigate    Tab ${state.focus === 'folders' ? 'Chats' : 'Folders'}    ${state.focus === 'folders' ? selectedFolder?.folder ? 'C New chat    ' : '' : 'Space Select · / Search    '}? More`, width)));
  } else if (width >= 32) {
    add(style(fit(state.focus === 'folders' ? 'N New folder · Esc Back' : `${canNewChat ? 'C New chat' : 'N New folder'} · M Move · Esc Back`, width), '1'));
    add(muted(fit('↑↓ Navigate · Tab Panels · ? Help', width)));
  } else {
    add(style(fit('N New folder', width), '1'));
    add(muted(fit('Tab Panels', width))); add(muted(fit('Esc Back  ? Help', width)));
  }
  return lines.join('\n');
}
