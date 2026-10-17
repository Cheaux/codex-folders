"""Compatibility entry point for already-running pre-extraction launchers.

New launchers call the shared backend directly. Keep this path until old loaded
launchers have exited; it contains no terminal implementation of its own.
"""
import os
import subprocess
import sys

host = os.environ.get('CODEX_TERMINAL_BIN', 'codex-terminal')
backend = subprocess.check_output([host, 'backend-path'], text=True).strip()
os.execv(sys.executable, [sys.executable, backend, *sys.argv[1:]])
