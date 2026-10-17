import test from 'node:test';
import assert from 'node:assert/strict';
import stringWidth from 'string-width';
import { renderBrowser, type BrowserView } from '../src/browser-view.js';
import { fit } from '../src/terminal-text.js';

const plain = (value: string) => value.replace(/\x1b\[[0-9;]*m/g, '');
const state: BrowserView = { columns: 100, rows: 28, tree: [{ id: 'all', label: 'All chats' }, { id: 'new-folder', label: '+ New folder' }], folderIndex: 0, focus: 'folders', view: 'all', viewName: 'All chats', chats: Array.from({ length: 95 }, (_, index) => ({ id: `id-${index}`, title: `Conversation ${index + 1} 中文🙂`, cwd: '/workspace', updatedAt: 1, archived: false, missing: false, indexedAt: 0, folderId: null })), cursor: 0, selected: [], query: '', message: '', folderCount: 0, currentLocation: 'All chats · /workspace' };
test('first use exposes creation, one active selection and a bounded chat list', () => {
  const frame = renderBrowser({ ...state, color: true }); const text = plain(frame);
  assert.match(text, /\[N\] New folder/); assert.match(text, /\+ New folder/); assert.match(text, /No folders yet/);
  assert.equal((text.match(/›/g) || []).length, 1); assert.match(text, /1–12 of 95/);
  assert.doesNotMatch(text, /Conversation 13|id-0|Ctrl\+X|◀|◆|▱/);
  assert.match(frame, /\x1b\[7m/);
  const chats = plain(renderBrowser({ ...state, focus: 'chats', cursor: 30 }));
  assert.equal((chats.match(/›/g) || []).length, 1); assert.match(chats, /M Move chat/); assert.match(chats, /Tab Folders/);
});
test('terminal layouts fit wide, narrow and short viewports with Unicode', () => {
  for (const [columns, rows] of [[150, 40], [100, 28], [76, 24], [70, 24], [40, 16], [32, 14], [20, 16], [20, 10]]) {
    for (const focus of ['folders', 'chats'] as const) {
      for (const view of ['all', 'folder']) {
        const lines = plain(renderBrowser({ ...state, columns: columns!, rows: rows!, focus, view })).split('\n');
        assert.ok(lines.length < rows!, `${columns}×${rows}: ${lines.length} lines`);
        assert.ok(lines.every(line => stringWidth(line) < columns!), `${columns}×${rows} overflow`);
        assert.match(lines.join('\n'), view === 'all' ? /N New folder/ : /C\]? New chat/); assert.match(lines.join('\n'), /Esc Back/);
      }
    }
  }
  assert.equal(stringWidth(fit('family 👩‍👩‍👧‍👦 中文 é', 12)), 12);
});
test('empty, filtered, selected and error states explain the next action', () => {
  const empty = plain(renderBrowser({ ...state, chats: [], folderCount: 1, view: 'folder', viewName: 'Research' }));
  assert.match(empty, /No chats in this folder/); assert.match(empty, /Press C to start a new chat/); assert.match(empty, /\[C\] New chat/);
  const occupied = plain(renderBrowser({ ...state, view: 'folder', chats: state.chats.slice(0, 1), focus: 'chats' }));
  assert.match(occupied, /C New chat/); assert.doesNotMatch(occupied, /No chats|move an existing|Choose a chat in All chats|Unfiled/);
  const filtered = plain(renderBrowser({ ...state, chats: [], query: 'storage' }));
  assert.match(filtered, /No matching chats/); assert.match(filtered, /Search: storage/);
  assert.match(plain(renderBrowser({ ...state, selected: ['id-0', 'id-1'], focus: 'chats' })), /2 selected/);
  assert.match(plain(renderBrowser({ ...state, message: 'Offline: API unavailable' })), /Offline: API unavailable/);
  const injected = renderBrowser({ ...state, viewName: '\x1b[2Jbad\nname', chats: [{ ...state.chats[0]!, title: '\x1b[2Jbad\nname' }] });
  assert.ok(!injected.includes('\x1b[2J')); assert.equal(plain(injected).split('\n').length, plain(renderBrowser(state)).split('\n').length);
});
