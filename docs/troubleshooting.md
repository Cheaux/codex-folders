---
title: Troubleshoot Codex Folders
description: Fix missing Codex Folders commands, launcher PATH, optional hooks, original resume access and common installation problems.
permalink: /troubleshooting/
---
{% include nav.html %}

# Troubleshooting

Start with:

```sh
codex-folders doctor
codex-terminal status --json
command -v codex
```

## Folders commands do not appear

Install Codex Command Extensions, run `codex-folders enable`, and open a new `codex` terminal. Confirm `~/.local/bin` precedes the original CLI directory in PATH. Terminal status should show an enabled shared launcher and a `codex-folders` provider. Existing wrappers keep the code loaded when they started; you do not have to close active work to open a new one.

The native Codex plugin alone supplies MCP tools, hooks, and the skill. The shared host supplies slash-command interception and suggestions. See [installation]({{ '/install/' | relative_url }}).

## npm rejects the GitHub URL

Download the `.tgz` using `curl -fLO` first, then install its local path with npm. Current npm defaults may reject direct remote-URL package installs. The documented installation preserves those defaults and uses `--ignore-scripts`.

## No automatic project context

Review both Codex Folders hooks in `/hooks`, and make sure the current chat is assigned to a **project** folder, not just a plain organizing folder. Confirm CODEX_HOME and CODEX_FOLDERS_DATA_DIR match the installation's profile. Ask Codex to load project context explicitly to distinguish a hook issue from missing membership.

## A chat disappeared from All chats

All chats intentionally contains only chats outside folders. Look in its folder or move it back to All chats. Archived or missing Codex conversations are excluded. Use F5 to refresh. This plugin does not archive or delete Codex conversations when filing them.

## Use the original resume picker

Type `/resumedbg`. Its suggestion reads “Open the original chat picker”. `/resume ID` remains native. To disable only the Folders routes in future host sessions, run `codex-folders disable`; other providers remain registered.

## Scrolling, colors, or titles look wrong

Record your Codex version, host version, terminal emulator, and steps to reproduce. Open a fresh terminal after updates. The host relays terminal modes, titles, theme queries, and resize between retained views; these behaviors have PTY tests but depend on terminal/CLI compatibility.

Compare with `/resumedbg` or the original Codex executable directly. Avoid killing the shared Codex daemon to troubleshoot a launcher display issue. If the terminal is left in an unexpected input mode after a crash, exit that wrapper and use your terminal's reset facility.

## Memory use increases with open views

Retained views keep real Codex processes alive. Exit views you no longer need. Opening another folder overlay does not stop existing work; this also means that retained sessions continue to consume resources.

## Shared host conflicts or is missing

The host preserves unrelated existing launchers and reports a conflict rather than overwriting them. See [custom paths]({{ '/install/#custom-paths-and-launchers' | relative_url }}). `CODEX_TERMINAL_CODEX_BIN` selects the original executable, and `CODEX_TERMINAL_BIN` selects the host command.

If the host is unavailable, the standalone `codex-folders` browser and conversational plugin still work. `codex-folders disable` removes only this provider. `codex-terminal disable` removes the shared launcher for every provider; use it deliberately.

## Report a bug

[Open an issue](https://github.com/Cheaux/codex-folders/issues/new/choose) with versions, OS, terminal, expected/actual behavior, and a minimal reproduction using fictional chats. Redact chat text, local paths, tokens, project briefs, and database files. Include host status only after checking it for private paths.
