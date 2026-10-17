---
title: Install Codex Folders
description: Install built Codex Folders and shared terminal host releases, enable in-terminal commands, review hooks, update, or remove the plugin.
permalink: /install/
---
{% include nav.html %}

# Install Codex Folders

## Requirements

- Node.js **24+** and npm on your `PATH`.
- Official Codex CLI with `codex plugin` and App Server support. Tested with **0.163.0**; compatible versions are checked by `doctor` rather than assumed.
- Python **3** for Codex Command Extensions.
- An interactive Linux terminal for the verified installation below. The host's macOS backend is untested; Windows terminal integration is unavailable. CLI/MCP on Windows is unverified.

## Install the two release packages

No clone or build is needed. The shared host supplies terminal input, command suggestions, retained views, and one launcher; Folders supplies the folder feature.

```sh
mkdir -p /tmp/codex-folders-install
cd /tmp/codex-folders-install

curl -fLO https://github.com/Cheaux/codex-command-extensions/releases/download/v0.1.2/codex-terminal-extensions-0.1.2.tgz
curl -fLO https://github.com/Cheaux/codex-folders/releases/download/v0.1.1/codex-folders-0.1.1.tgz

npm install --global --prefix "$HOME/.local" --ignore-scripts ./codex-terminal-extensions-0.1.2.tgz ./codex-folders-0.1.1.tgz
export PATH="$HOME/.local/bin:$PATH"
codex-folders install
codex-folders enable
```

Keep the PATH line in `~/.zshrc` or `~/.bashrc` if your shell doesn't already use it. Downloading archives before installation respects npm's default remote-source restrictions.

Open a **new `codex` terminal**. Existing conversations and jobs can keep running. In the new session, review the two Codex Folders hooks in **`/hooks`** and trust them if you want automatic shared project context. Hook trust is your choice; installation does not grant it. Explicit MCP tools work without it.

Type `/folders`, press **N**, and enter a folder name. Choose whether its chats should share instructions and memory. Select the folder and press **C** to start a new chat, or choose an existing chat in All chats and press **M** to file it.

## Verify downloads

Each release includes SHA256SUMS. Verify the archives before npm installation:

```sh
curl -fsSL https://github.com/Cheaux/codex-command-extensions/releases/download/v0.1.2/SHA256SUMS -o host-SHA256SUMS
curl -fsSL https://github.com/Cheaux/codex-folders/releases/download/v0.1.1/SHA256SUMS -o folders-SHA256SUMS
sha256sum -c host-SHA256SUMS
sha256sum -c folders-SHA256SUMS
```

On macOS use `shasum -a 256 -c` instead. Checksums detect a mismatched download; they are published with the release, not a separate signature.

## Check the installation

```sh
node --version
python3 --version
codex-folders --version
codex-folders doctor
codex-terminal status --json
command -v codex
```

The terminal status should list `codex-folders` as a provider. `command -v codex` should resolve to the host-owned user-local launcher after enable. The official executable remains installed and is launched by that wrapper.

## Custom paths and launchers

Use `CODEX_HOME` to select a Codex profile. `CODEX_FOLDERS_DATA_DIR` overrides the folder database directory. Keep the same values when installing, launching, and using tools.

If the real executable is outside PATH, set `CODEX_TERMINAL_CODEX_BIN` to its absolute path before enabling. `CODEX_FOLDERS_CODEX_BIN` remains a compatibility alias. Use `CODEX_TERMINAL_BIN` for a custom `codex-terminal` executable and `CODEX_TERMINAL_BIN_DIR` for its shim directory. Put that directory first in PATH. `CODEX_TERMINAL_PYTHON` selects Python.

The shared host refuses to overwrite an unrelated existing launcher. Inspect `codex-terminal status --json` and resolve the competing launcher deliberately; do not replace it blindly. You can use `codex-folders launch --` to invoke the shared host explicitly. With no host, `codex-folders` opens a standalone browser in a normal terminal, and the conversational plugin still works.

Other extensions, including [Codex Remote](https://github.com/Cheaux/codex-remote), register independently with the same host. Folders does not need Remote.

## Update

Download the desired Folders release to a local file, verify its checksum, and install it with the same npm prefix and `--ignore-scripts`. Run `codex-folders install` and `codex-folders enable` again, then open a new Codex terminal. Review changed hooks when Codex requests it. Update the shared host separately when required by the release notes. Existing wrappers retain their loaded code until you exit them; they need not be interrupted for installation.

## Disable or remove

```sh
# Remove only Folders terminal commands; preserve other providers and shared host.
codex-folders disable

# Remove the Codex plugin and its terminal registration; keep folder data.
codex-folders uninstall
npm uninstall --global --prefix "$HOME/.local" codex-folders
```

`codex-terminal disable` removes the shared launcher's owned shim and affects all providers in new terminals. Use that only if you intend to remove the shared terminal integration too.

Folder data stays in `${CODEX_HOME:-~/.codex}/folders/` unless you deliberately use `codex-folders uninstall --purge`. Purging deletes folder settings, assignments, search index, and brief history. It does not delete the original Codex conversations. Back up the folder data before purging.
