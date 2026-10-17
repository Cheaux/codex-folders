"""Exercise the launcher, official PTY isolation, draft restoration and view switching."""
import fcntl
import json
import os
import pathlib
import pty
import re
import selectors
import signal
import struct
import subprocess
import tempfile
import termios
import time
from terminal_screen import screen

ROOT = pathlib.Path(__file__).resolve().parents[1]
CLI = ROOT / 'dist/cli.js'

class Terminal:
    def __init__(self, env, args=None):
        self.master, slave = pty.openpty()
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 28, 100, 0, 0))
        self.process = subprocess.Popen(['node', str(CLI), 'launch', '--', *(args or [])], stdin=slave, stdout=slave, stderr=slave, env=env, start_new_session=True)
        os.close(slave)
        self.selector = selectors.DefaultSelector()
        self.selector.register(self.master, selectors.EVENT_READ)
        self.output = ''
        self.recording = bytearray()
    def wait(self, text, timeout=12):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if text in self.output:
                self.output = ''
                return
            for _, _ in self.selector.select(.1):
                try:
                    chunk = os.read(self.master, 65536)
                except OSError:
                    chunk = b''
                self.output += chunk.decode(errors='replace')
                self.recording.extend(chunk)
                if not chunk:
                    raise AssertionError(f'Exited before {text!r}: {self.output[-3000:]}')
        raise AssertionError(f'Timeout for {text!r}: {self.output[-3000:]}')
    def send(self, value):
        os.write(self.master, value.encode())
        time.sleep(.12)
    def modes(self):
        enabled = set()
        for match in re.finditer(rb'\x1b\[\?([0-9;]+)([hl])', self.recording):
            for value in match[1].split(b';'):
                mode = int(value)
                if match[2] == b'h': enabled.add(mode)
                else: enabled.discard(mode)
        return enabled
    def title(self):
        values = re.findall(rb'\x1b\][02];([^\x07\x1b]*)(?:\x07|\x1b\\)', self.recording)
        return values[-1].decode() if values else None
    def collect(self, timeout=.3):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            for _, _ in self.selector.select(.05):
                try: chunk = os.read(self.master, 65536)
                except OSError: return
                if not chunk: return
                self.recording.extend(chunk)
                self.output += chunk.decode(errors='replace')
    def resize(self, rows, columns):
        fcntl.ioctl(self.master, termios.TIOCSWINSZ, struct.pack('HHHH', rows, columns, 0, 0))
        self.process.send_signal(signal.SIGWINCH)
        time.sleep(.12)
    def close(self):
        if self.process.poll() is None:
            self.process.terminate()
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait()
        self.selector.close()
        os.close(self.master)

with tempfile.TemporaryDirectory(prefix='codex-folders-launcher-') as directory:
    env = {**os.environ, 'TERM': 'xterm-256color', 'CODEX_FOLDERS_DATA_DIR': directory, 'CODEX_TERMINAL_DATA_DIR': str(pathlib.Path(directory) / 'terminal'),
           'CODEX_FOLDERS_CODEX_BIN': str(ROOT / 'test/fixtures/codex'), 'CODEX_FOLDERS_TEST_TERMINAL': '1'}
    env.pop('CODEX_FOLDERS_WRAPPED', None)
    terminal = Terminal(env)
    try:
        terminal.wait('FIXTURE_ORIGINAL')
        assert {1003, 1004, 1006, 2004} <= terminal.modes()
        assert 1007 not in terminal.modes()
        assert terminal.title() == 'Original chat'
        terminal.send('/folders')
        terminal.wait('› /folders')
        terminal.send('\r')
        terminal.wait('[N] New folder')
        assert not {1000, 1002, 1003, 1004, 1006, 1007, 2004} & terminal.modes()
        frame = screen(terminal.recording)
        assert 'Loading folders' not in frame and 'Unfiled' not in frame
        terminal.send('q')
        terminal.wait('FIXTURE_ORIGINAL')
        terminal.send('unfinished draft')
        terminal.wait('› unfinished draft')
        terminal.send('\x1b[<64;10;5M')
        terminal.wait('Transcript offset 1')
        assert '› unfinished draft' in screen(terminal.recording)
        terminal.send('\x1b[I')
        terminal.wait('Focus reports 1')
        terminal.send('\x12')
        terminal.wait('Original chat renamed')
        assert terminal.title() == 'Original chat renamed'
        terminal.send('\x18f')
        terminal.wait('[N] New folder')
        terminal.send('q')
        terminal.wait('› unfinished draft')
        assert {1003, 1004, 1006, 2004} <= terminal.modes()
        terminal.send('\x15')
        terminal.wait('› ')
        terminal.send('\x1b[A')
        terminal.wait('› previous message')
        terminal.send('\x15')
        terminal.wait('› ')
        terminal.send('/resumedbg')
        terminal.wait('› /resumedbg')
        terminal.send('\r')
        terminal.wait('FIXTURE_NATIVE_PICKER 1')
        assert '[N] New folder' not in screen(terminal.recording)
        terminal.send('\x1b')
        terminal.wait('Transcript offset 1')
        terminal.send('/resumedbg')
        terminal.wait('› /resumedbg')
        terminal.send('\r')
        terminal.wait('FIXTURE_NATIVE_PICKER 2')
        terminal.send('\r')
        terminal.wait('Native selected chat')
        assert terminal.title() == 'Native selected chat'
        terminal.send('/resume')
        terminal.wait('› /resume')
        terminal.send('\r')
        terminal.wait('[N] New folder')
        terminal.send('\t')
        terminal.wait('Enter Open chat')
        terminal.send('\r')
        terminal.wait('FIXTURE_RESUMED thread-a')
        assert {1002, 1004, 1006, 2004} <= terminal.modes() and 1003 not in terminal.modes()
        assert terminal.title() == 'Resumed thread-a'
        terminal.send('\x18b')
        terminal.wait('FIXTURE_ORIGINAL')
        assert {1003, 1004, 1006, 2004} <= terminal.modes() and 1002 not in terminal.modes()
        assert terminal.title() == 'Native selected chat'
        terminal.send('\x18b')
        terminal.wait('FIXTURE_RESUMED thread-a')
        terminal.send('resumed draft')
        terminal.wait('› resumed draft')
        terminal.send('\x1b[<64;10;5M')
        terminal.wait('Transcript offset 1')
        assert '› resumed draft' in screen(terminal.recording)
        terminal.resize(25, 80)
        terminal.wait('FIXTURE_RESUMED thread-a')
        assert {1002, 1004, 1006, 2004} <= terminal.modes()
        terminal.send('\x04')
        terminal.wait('FIXTURE_ORIGINAL')
        terminal.send('\x04')
        assert terminal.process.wait(timeout=5) == 0
        terminal.collect()
        assert not {1, 9, 1000, 1002, 1003, 1004, 1006, 1007, 2004} & terminal.modes()
        assert b'\x1b[22;0t' in terminal.recording and b'\x1b[23;0t' in terminal.recording
    finally:
        terminal.close()
    print('PASS: /folders, /resume, /resumedbg, scrolling/drafts, history, titles, view modes, resize, cleanup')

    # Script usage must never acquire a PTY or draw an overlay.
    result = subprocess.run(['node', str(CLI), 'launch', '--', '--version'], env=env, capture_output=True, text=True, check=True)
    assert result.stdout.strip() == 'codex-cli fixture'
    assert '\x1b' not in result.stdout
    print('PASS: noninteractive Codex passthrough')

    # Installing and removing the shim must preserve another user's executable.
    env['CODEX_FOLDERS_BIN_DIR'] = str(pathlib.Path(directory) / 'bin')
    def run(*args, check=True):
        return subprocess.run(['node', str(CLI), *args], env=env, capture_output=True, text=True, check=check)
    installed = json.loads(run('enable').stdout)
    shim = pathlib.Path(installed['shimPath'])
    result = subprocess.run([str(shim), '--version'], env=env, capture_output=True, text=True, check=True)
    assert result.stdout.strip() == 'codex-cli fixture'
    run('enable')  # Idempotent.
    shim.write_text('#!/bin/sh\necho my wrapper\n')
    run('disable')  # Removes only Folders; the host owns its shim.
    host_command = [env.get('CODEX_TERMINAL_BIN', 'codex-terminal')]
    assert subprocess.run([*host_command, 'disable'], env=env, capture_output=True).returncode == 1
    assert shim.read_text().endswith('echo my wrapper\n')
    shim.unlink()
    subprocess.run([*host_command, 'disable'], env=env, capture_output=True, check=True)
    assert not shim.exists()
    print('PASS: reversible shim installation, passthrough, preservation of modified files')
