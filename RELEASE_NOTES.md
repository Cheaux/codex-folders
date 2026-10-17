Codex Folders adds conversation folders, an in-terminal keyboard browser, new chats inside folders, and optional shared project instructions and memory to Codex CLI.

**Prerequisite:** [Codex Terminal Extensions v0.1.0](https://github.com/Cheaux/codex-terminal-extensions/releases/tag/v0.1.0) for `/folders`, `/resume`, `/resumedbg`, suggestions, and retained terminal views. CLI/MCP and the standalone browser work independently.

Requires Node.js 24+, npm, Codex CLI plugin/App Server support, and Python 3 for the host. Linux verified with Codex 0.163.0; macOS untested; Windows terminal integration unavailable. Codex only.

Download built packages first, then install their local paths:

```sh
mkdir -p /tmp/codex-folders-install
cd /tmp/codex-folders-install
curl -fLO https://github.com/Cheaux/codex-terminal-extensions/releases/download/v0.1.0/codex-terminal-extensions-0.1.0.tgz
curl -fLO https://github.com/Cheaux/codex-folders/releases/download/v0.1.0/codex-folders-0.1.0.tgz
npm install --global --prefix "$HOME/.local" --ignore-scripts ./codex-terminal-extensions-0.1.0.tgz ./codex-folders-0.1.0.tgz
export PATH="$HOME/.local/bin:$PATH"
codex-folders install
codex-folders enable
```

Open a new Codex terminal, review the two Folders hooks in `/hooks`, then type `/folders`. Existing sessions can stay running. Press N to create a folder, M to move chats, and C inside a folder to start a new chat. `/resumedbg` opens the original picker.

[Installation, checksums, updates and removal](https://cheaux.github.io/codex-folders/install/) · [Commands](https://cheaux.github.io/codex-folders/commands/) · [Shared context](https://cheaux.github.io/codex-folders/context/) · [Troubleshooting](https://cheaux.github.io/codex-folders/troubleshooting/)

SHA256SUMS verifies the accompanying TGZ. Community MIT-licensed project; not affiliated with OpenAI. No npm registry publication is required.
