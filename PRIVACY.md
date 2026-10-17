# Codex Folders: data handling

Updated October 17, 2026.

The plugin reads saved Codex chat metadata and, for requested project search/context, local conversation content. It stores folder assignments, project instructions, revisioned memory, source indexes, and move history in its local SQLite data directory. Tool results can include chat titles, working directories, messages, and project memory in your Codex conversation. The publisher operates no hosted database or analytics service. Native Codex and your configured model provider govern conversation/model data. Folder deletion does not delete native chats; deleting a project can remove its settings and memory. The directory ZIP contains no lifecycle hooks.

Do not post private chats, credentials, pairing codes, or account identifiers in public issues. For support, use [GitHub issues](https://github.com/Cheaux/codex-folders/issues) with synthetic or redacted examples. This document describes this community project; it does not replace the policies of Codex, ChatGPT, your model provider, or other feature packages.
