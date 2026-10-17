"""Exercise the bundled browser using a PTY and an isolated fake Codex API."""
import fcntl
import json
import os
import pathlib
import pty
import selectors
import struct
import subprocess
import tempfile
import termios
import time
from terminal_screen import screen

ROOT = pathlib.Path(__file__).resolve().parents[1]
CLI = ROOT / 'dist/cli.js'

def command(env, *args):
    result = subprocess.run(['node', str(CLI), *args], env=env, capture_output=True, text=True, check=True)
    return json.loads(result.stdout)

class Terminal:
    def __init__(self, env, columns=100, rows=28):
        self.master, slave = pty.openpty()
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', rows, columns, 0, 0))
        self.process = subprocess.Popen(['node', str(CLI)], stdin=slave, stdout=slave, stderr=slave, env=env, start_new_session=True)
        os.close(slave)
        self.selector = selectors.DefaultSelector()
        self.selector.register(self.master, selectors.EVENT_READ)
        self.output = ''
        self.recording = bytearray()
        self.columns, self.rows = columns, rows

    def wait(self, text, timeout=8):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if text in self.output:
                self.output = ''
                return
            for _, _ in self.selector.select(min(.2, max(0, deadline-time.monotonic()))):
                try:
                    chunk = os.read(self.master, 65536)
                except OSError:
                    chunk = b''
                self.output += chunk.decode(errors='replace')
                self.recording.extend(chunk)
                if not chunk:
                    raise AssertionError(f'Terminal exited before {text!r}: {self.output[-2500:]}')
        raise AssertionError(f'Timed out waiting for {text!r}: {self.output[-2500:]}')

    def send(self, value):
        os.write(self.master, value.encode())

    def close(self):
        if self.process.poll() is None:
            self.process.terminate()
        try:
            self.process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            self.process.kill()
        self.selector.close()
        os.close(self.master)

with tempfile.TemporaryDirectory(prefix='codex-folders-create-') as directory:
    env = {**os.environ, 'TERM': 'xterm-256color', 'CODEX_FOLDERS_DATA_DIR': directory,
           'CODEX_FOLDERS_CODEX_BIN': str(ROOT / 'test/fixtures/codex')}
    terminal = Terminal(env)
    try:
        terminal.wait('No folders yet')
        terminal.send('N')
        terminal.wait('Folder name')
        terminal.send('\r')
        terminal.wait('Enter a name without slashes')
        terminal.send('Client A\r')
        terminal.wait('Share context between chats')
        terminal.send('\r')
        terminal.wait('Created Client A')
        terminal.send('n')
        terminal.wait('Folder name in Client A')
        terminal.send('Research\r')
        terminal.wait('Created Research')  # Nested folders inherit; no extra sharing question.
        folders = command(env, 'folder', 'list')['folders']
        project = next(f for f in folders if f['name'] == 'Client A')
        child = next(f for f in folders if f['name'] == 'Research')
        assert project['isProject'] and child['parentId'] == project['id'] and not child['isProject']
        terminal.send('\x1b[B')  # Select the visible + New folder row.
        terminal.wait('Enter to create a folder')
        terminal.send('\r')
        terminal.wait('Folder name')
        terminal.send('Personal\r')
        terminal.wait('Share context between chats')
        terminal.send('\x1b[B\r')
        terminal.wait('Created Personal')
        personal = next(f for f in command(env, 'folder', 'list')['folders'] if f['name'] == 'Personal')
        assert personal['parentId'] is None and not personal['isProject']
        terminal.send('q')
        assert terminal.process.wait(timeout=5) == 0
    finally:
        terminal.close()
    print('PASS: discoverable N/create row, name validation, shared/simple folders, inherited subfolder context')

with tempfile.TemporaryDirectory(prefix='codex-folders-pty-') as directory:
    env = {**os.environ, 'TERM': 'xterm-256color', 'CODEX_FOLDERS_DATA_DIR': directory,
           'CODEX_FOLDERS_CODEX_BIN': str(ROOT / 'test/fixtures/codex')}
    project = command(env, 'project', 'create', 'Alpha')
    terminal = Terminal(env)
    try:
        terminal.wait('Enter Browse chats')
        assert 'Unfiled' not in screen(terminal.recording)
        terminal.send('m')
        terminal.wait('Press Tab to choose a chat first')
        assert len(command(env, 'list', '--folder', 'all', '--json')['chats']) == 2
        terminal.send('\t')
        terminal.wait('Enter Open chat')
        terminal.send('\x1b[1;5C')
        terminal.wait('Move chats to')
        terminal.send('\r')  # The first actual folder is the default destination.
        terminal.wait('Moved 1 chat(s) to Alpha')
        assert command(env, 'list', '--folder', project['id'], '--json')['chats'][0]['id'] == 'thread-a'
        frame = screen(terminal.recording)
        assert 'Chats · All chats (1)' in frame and 'Architecture decision' not in frame
        terminal.send('\t\x1b[B\r')  # Open Alpha; the moved chat is there, outside the home list.
        terminal.wait('Enter Open chat')
        terminal.send('\x1b[1;5D')
        terminal.wait('Moved 1 chat(s) up one level')
        assert len(command(env, 'list', '--folder', 'all', '--json')['chats']) == 2
        terminal.send('z')
        terminal.wait('Restored 1 chat(s)')
        terminal.send('m')
        terminal.wait('Move chats to')
        terminal.send('\x1b[B\r')  # All chats follows the actual folders.
        terminal.wait('Moved 1 chat(s) to All chats')
        terminal.send('\t\x1b[A\r')
        terminal.wait('Enter Open chat')
        terminal.send(' ')
        terminal.wait('1 selected')
        terminal.send('\x1b[B')
        terminal.wait('Implementation follow-up')
        terminal.send(' ')
        terminal.wait('2 selected')
        terminal.send('m')
        terminal.wait('Move chats to')
        terminal.send('\r')
        terminal.wait('Moved 2 chat(s) to Alpha')
        assert 'Chats · All chats (0)' in screen(terminal.recording)
        terminal.send('z')
        terminal.wait('Restored 2 chat(s)')
        assert len(command(env, 'list', '--folder', 'all', '--json')['chats']) == 2
        terminal.send('q')
        assert terminal.process.wait(timeout=5) == 0
    finally:
        terminal.close()
    print('PASS: All chats excludes folder chats; folders-first move, move back, Ctrl+arrows, multi-select and undo')

    command(env, 'project', 'create', 'Investigación 中文🙂')
    terminal = Terminal(env, columns=40, rows=16)
    try:
        terminal.wait('N New folder')
        terminal.send('q')
        assert terminal.process.wait(timeout=5) == 0
    finally:
        terminal.close()
    print('PASS: narrow terminal with Unicode folder names')

    terminal = Terminal(env)
    try:
        terminal.wait('Enter Browse chats')
        terminal.send('\t')
        terminal.wait('Enter Open chat')
        terminal.send('\r')
        terminal.wait('FIXTURE_RESUMED thread-a')
        assert terminal.process.wait(timeout=5) == 0
    finally:
        terminal.close()
    print('PASS: resume hands the terminal to Codex with the exact selected ID')

    terminal = Terminal(env)
    try:
        terminal.wait('Enter Browse chats')
        terminal.send('\x1b[B')
        terminal.wait('[C] New chat')
        terminal.send('c')
        terminal.wait('FIXTURE_NEW_CHAT')
        assert terminal.process.wait(timeout=5) == 0
    finally:
        terminal.close()
    print('PASS: new project chat launches standard Codex with a setup turn')
