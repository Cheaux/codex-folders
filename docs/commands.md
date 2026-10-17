---
title: Codex folder commands and shortcuts
description: Reference for folders, resume, original resume picker, browser shortcuts, command-line operations, and the 14 MCP tools.
permalink: /commands/
---
{% include nav.html %}

# Commands and shortcuts

## Inside Codex

| Command or key | Action |
| --- | --- |
| `/folders` | Open the folder browser. |
| `/resume` | Open the folder browser; arguments such as `/resume ID` stay native. |
| `/resumedbg` | Open the original Codex chat picker in the current view. |
| Ctrl+X, then F | Open folders without discarding the current draft. |
| Ctrl+X, then B | Cycle retained terminal views. |

Command suggestions include `/folders` and `/resumedbg`, the latter described as **Open the original chat picker**. These suggestions and routes belong to the shared terminal host, not Codex's native plugin command registry. Type commands normally into a newly launched host-backed Codex terminal. Pasted text is preserved as input.

Opening a chat retains the previous terminal view. Exiting a view returns to another retained view. Each live view consumes process memory; exit chats you no longer need. `/resumedbg` gives access to the original picker for comparison or fallback.

## In the browser

| Key | Action |
| --- | --- |
| ↑ / ↓ | Choose folder or chat. |
| Tab | Switch folders/chats panel. |
| Enter | Browse selected folder or open selected chat. |
| N | Create a folder; choose whether to share project context. |
| C | Start a new chat in the selected folder. |
| M / Ctrl+Right | Move selected chat(s); folders appear first. |
| Space | Select several chats before moving. |
| U / Ctrl+Left | Move selected chats up one level. |
| Z | Undo a move when a later move would not be overwritten. |
| R / D | Rename / remove the selected folder. Removal returns chats to All chats. |
| E | Edit the project's instructions, brief, or default new-chat directory. |
| / | Search chat titles and working directories. |
| F5 | Refresh saved chat list. |
| Left / Right | Collapse or expand a folder tree. |
| ? | Show more actions. |
| Esc / Q | Return to Codex. Esc first clears a multi-selection or search. |

## From a regular shell

```sh
codex-folders --help
codex-folders folder list --json
codex-folders folder create "Research"
codex-folders project create "Website" --cwd /path/to/website
codex-folders list --folder all --json
codex-folders move THREAD_ID --folder FOLDER_ID
codex-folders undo
codex-folders context THREAD_ID --json
codex-folders search PROJECT_ID "authentication"
codex-folders doctor
```

Replace uppercase IDs with actual returned IDs. `list --folder all` selects the All chats home; omitting `--folder` gives the inventory across folders. Folder commands organize conversations, not filesystem directories. Run `codex-folders current --json` **inside that chat's Codex shell tool** to obtain its current ID; never infer it from recency.

## Conversational tools

Ask Codex to create a project, move this chat, search a project's decisions, or save its brief. The plugin's `chat-folders` skill guides these operations through 14 MCP tools:

| Area | Tools |
| --- | --- |
| Folder organization | `folders_list`, `folders_create`, `folders_update`, `folders_delete` |
| Chat membership | `chats_list`, `chats_move`, `chats_undo_move` |
| Chat navigation | `chats_resume_command`, `chats_new_command` |
| Project context and sources | `project_context_get`, `project_search`, `project_message_read` |
| Project brief | `project_memory_update`, `project_memory_history` |

Tools returning a resume/new-chat command prepare a command; they do not switch an interactive terminal from inside a shell tool. Use the browser to navigate in the terminal.
