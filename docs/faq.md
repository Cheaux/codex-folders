---
title: Codex chat folders FAQ
description: Answers about Codex CLI chat folders, shared project memory, resume behavior, the terminal host, tested platforms and safe removal.
permalink: /faq/
---
{% include nav.html %}

# Frequently asked questions

## Can I create folders inside Codex CLI?

With Codex Folders and the shared terminal host enabled, type `/folders`, press **N**, and name a folder. Press **C** in that folder to start a new chat there. These are folders for conversations, not filesystem directories.

## Why is there a separate terminal host?

Codex Command Extensions provides one launcher for command interception, suggestions, and retained terminal views. Folders registers its feature; another plugin can register its own commands independently. This prevents each feature from installing a competing wrapper. Folders' standalone browser and MCP tools work without the host.

## Does this replace the official Codex executable?

The host installs a user-local launcher that invokes the original CLI. It does not patch the official binary. `codex-folders disable` unregisters this feature; `codex-terminal disable` removes the host's owned launcher. Both preserve unrelated executables and other project data.

## What does All chats mean?

The default home contains conversations outside folders. Filed chats appear in their folders. Moving a chat back to All chats restores it to the home. Codex-archived and unavailable conversations are excluded.

## Can I still use normal resume?

Yes. `/resumedbg` opens the original Codex chat picker, and `/resume ID` stays native. Bare `/resume` opens the folder browser while the provider is enabled.

## Do I need to close running Codex sessions to install?

No. Open a new Codex terminal to load the updated host and plugin. Existing sessions keep their loaded version and can continue working. Retained views stay alive until you exit them, so they still consume memory.

## Is shared memory automatic?

Trusted hooks automatically load the project's saved instructions and brief. The skill guides Codex to maintain that brief after substantive work, using revision checks. It is a maintained summary, not a transcript mirror or guaranteed recall. Search retrieves details from chats currently assigned to that project.

## Is an extra API key or subscription needed?

Folders itself requires no extra API key, paid service, or background model. You use your existing Codex setup. Starting a chat and asking Codex to organize or summarize uses normal Codex usage.

## Does it work with Codex Remote?

Yes. [Codex Remote](https://github.com/Cheaux/codex-remote) can register `/qr` independently with the same host. Folders does not require Remote, and removing Folders does not unregister Remote.

## Which operating systems are verified?

Linux with Node.js 24+ and Codex CLI 0.163.0. The host has a Linux/macOS Python PTY backend; macOS is untested. Windows terminal integration is unavailable. Standalone CLI/MCP use on Windows is unverified. This release is Codex only; Claude support is deferred.

## What happens when I delete a folder or uninstall?

Deleting a folder returns its conversations to All chats and removes its settings and project brief. Original Codex chats remain. Uninstalling preserves folder data unless you explicitly use `--purge`. See [removal instructions]({{ '/install/#disable-or-remove' | relative_url }}).

## Is this an official OpenAI plugin?

No. Codex Folders is an independent MIT-licensed community project by Cheaux. There is no OpenAI endorsement or guarantee of compatibility with future Codex versions.
