---
title: Shared project instructions and memory
description: Learn how Codex Folders shares project instructions and local briefs across chats, with revision checks, scoped search and source references.
permalink: /context/
---
{% include nav.html %}

# Shared project context

## Plain folders and projects

A plain folder organizes chats. A project folder also owns shared instructions, an optional default directory for **new** chats, and a revisioned brief of decisions and next steps. Its descendant folders inherit that project. A project root cannot nest inside another project.

A chat belongs to one folder at a time. Moving it to another project changes the context available on subsequent loads. Moving an existing chat does not change its working directory. Deleting a folder removes its settings and brief if present and returns its chats to All chats, without deleting the conversations.

## Automatic loading

The installed plugin provides SessionStart and UserPromptSubmit hooks. After you review and trust them in Codex's `/hooks` screen, they read local project instructions and brief for the exact chat ID supplied by Codex. They do not start a model call or scan the newest chat to guess identity. Explicit context tools remain usable without hook trust.

When you press **C** inside a folder, the new session's first ordinary Codex turn verifies its current thread ID, assigns it to that folder, loads context, and waits for your task. This first turn uses normal Codex usage. Preparing a new-chat command alone starts no inference.

## A useful brief

Ask Codex:

> Save our database choice and next steps in the shared project brief, including the source chat.

The skill asks Codex to maintain concise, named entries after substantive project work. Updates use an expected revision to detect concurrent edits and preserve history. They are agent-driven updates, so their quality depends on what Codex saves. You can inspect or edit instructions, brief, and default directory with **E** in a project folder; your configured editor is used.

The brief does not contain every conversation and is not guaranteed recall. Use project search to find details and source messages when needed.

## Search and source references

`project_search` retrieves user and assistant messages from the local Codex App Server and indexes them locally. Search is scoped to the project's current chat membership, including subfolders. Results carry thread and turn references; `project_message_read` returns a source message in bounded chunks and rechecks membership. Synchronization errors are returned so unavailable chats are visible as a limitation.

Retrieved chat text is reference material. It is not a replacement for the current user's instructions. When moving “this chat,” the skill requires an explicit verified current ID rather than choosing the newest session.

## Storage and privacy

Folder data lives in `${CODEX_HOME:-~/.codex}/folders/folders.db`, or `CODEX_FOLDERS_DATA_DIR` if set. It includes chat metadata, folder assignments, instructions, brief revisions, move history, and the local index of retrieved project messages. Protect backups as conversation data. The original conversations remain in Codex's own storage.

There is no Folders cloud service, separate inference API key, or background summarizer. Tools and hooks return relevant context to the Codex session, where it participates in normal model processing under your Codex account and settings. The shared terminal host stores provider registration and launcher configuration separately; Folders manages project data.

For a consistent SQLite backup, close processes using this folder store and copy the data directory, or use SQLite's online backup facility. Do not copy just the main database while an active WAL has uncheckpointed writes.

Cross-device sync and cross-assistant shared memory are not part of this release.
