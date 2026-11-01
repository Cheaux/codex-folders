---
title: Organize Codex CLI chats into folders
description: Organize Codex CLI chats into folders, resume conversations and start project chats with shared instructions and local memory.
permalink: /
---
{% include nav.html %}

# Organize Codex CLI chats into folders

Organize Codex CLI conversations into folders and work with shared project context in the same terminal.

<img src="{{ '/assets/folders-demo.png' | relative_url }}" width="1240" height="760" alt="Synthetic Codex Folders browser with Website and Research projects.">

Create folders with **N**, move chats with **M**, and start a new chat inside the selected folder with **C**. **All chats** shows conversations outside folders. Filed chats stay in their folders; Codex-archived chats remain hidden.

[Install Codex Folders]({{ '/install/' | relative_url }}) · [GitHub repository](https://github.com/Cheaux/codex-folders) · [v0.1.1 release](https://github.com/Cheaux/codex-folders/releases/tag/v0.1.1)

## Commands in your Codex terminal

| Command | Purpose |
| --- | --- |
| `/folders` | Browse folders and chats. |
| `/resume` | Browse folders instead of the original picker. |
| `/resumedbg` | Open the original Codex chat picker. |
| Ctrl+X, then F | Open folders while preserving your draft. |
| Ctrl+X, then B | Switch retained terminal views. |

These commands come from the separate [Codex Command Extensions](https://github.com/Cheaux/codex-command-extensions) host and the Folders provider. The plugin's standalone browser, CLI, and MCP tools also work without that host.

## Projects that remember decisions

Choose a plain folder for organization or a project folder for shared instructions, a revisioned brief, and search across that project's chats. Subfolders inherit the project context. Ask Codex to recall a decision or save next steps; trusted hooks load the brief automatically. [Understand shared context]({{ '/context/' | relative_url }}).

## Requirements and status

Version **{{ site.project_version }}**, MIT license. Requires Node.js 24+, Codex CLI with plugins and App Server support, and Python 3 for the host. Linux verified with Codex 0.163.0. The host supports a Linux/macOS PTY backend; macOS untested, Windows terminal integration unavailable. This release covers Codex only.

Community software by [Cheaux](https://github.com/Cheaux), not affiliated with or endorsed by OpenAI. Demo content is fictional.

## Which Codex plugin do I need?

| Project | Use it for |
| --- | --- |
| [Codex Folders](https://cheaux.github.io/codex-folders/) | Organize chats into folders and share project instructions and local briefs. |
| [Codex Remote](https://cheaux.github.io/codex-remote/) | Pair the ChatGPT phone app with native Codex and manage remote devices. |
| [Codex Command Extensions](https://cheaux.github.io/codex-command-extensions/) | Add slash-command autocomplete and terminal views for independently installed providers. |

Folders and Remote are independent features. Install the shared host for their terminal shortcuts; their CLI/MCP tools can work without it. Linux is the verified host platform. Each project's compatibility guide describes its untested cases.

[Plain-text documentation index]({{ '/llms.txt' | relative_url }})
