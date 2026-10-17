# Contributing

Use Node.js 24+ and Python 3. Install the released Codex Command Extensions v0.1.2 package on PATH for integration checks; the CI workflow demonstrates checksum-verified setup.

```sh
npm ci
npm run check
npm run build
npm test
npm run test:pty
npm run test:package
```

Tests use synthetic native-protocol fixtures and temporary stores. Never run fixture cleanup against your real CODEX_HOME or publish actual conversation captures, IDs, databases, credentials, or private local paths. Do not restart a live Codex daemon for a display test.

## Architecture

- `src/store.ts`: SQLite folder membership, moves/undo, project briefs, source-scoped local search.
- `src/codex.ts` and `src/service.ts`: local Codex App Server access and feature behavior.
- `src/browser.ts` and `src/browser-view.ts`: keyboard interaction and terminal layout.
- `src/mcp.ts`, `src/hooks.ts`: MCP tools and trusted-hook context loading.
- `terminal-extension.json` and thin launcher adapters: schemaVersion 1 provider for the separate terminal host. The host owns input/completion/PTys/title/modes; do not copy feature routes back into it.
- `runtime/pty_host.py`: compatibility handoff for already-loaded legacy wrappers; retain while those wrappers may be running.

Disabling Folders must unregister only Folders. The package check registers a synthetic Remote provider and verifies it and the shared launcher survive removal. Changes to terminal input must be tested in the host repository as well as Folders' integration checks.

## Documentation

Edit `docs/` and the README together. The Pages workflow builds Jekyll Minimal and runs `scripts/check-docs.py` against rendered HTML, checking six pages, metadata, links, anchors, assets, and sitemap. Use `npm run demo` to regenerate the fictional terminal SVG, then `rsvg-convert docs/assets/folders-demo.svg -o docs/assets/folders-demo.png` to render it. No personal chat data belongs in screenshots.

Write factual feature descriptions, explicit platform limits, and usable installation instructions. Keep the `llms.txt` index in sync. Search engines and assistants decide discovery and recommendations independently.

## Release

1. Update package, lockfile, plugin manifest, CLI version/help, docs, and changelog together.
2. Confirm the pinned shared-host release and checksum remain valid.
3. Run all checks, inspect `npm pack --dry-run`, and audit staged files for private data.
4. Merge to main and wait for CI and documentation checks.
5. Tag the exact reviewed commit `vX.Y.Z` and push the tag. Release automation rejects a tag that differs from the package version, reruns checks, and uploads the built TGZ and SHA256SUMS.
6. Download the public assets, verify checksums, and install the local TGZ into an isolated prefix/CODEX_HOME. Check native plugin registration without granting hook trust. Keep published artifacts immutable; release a new version for changes.

GitHub Releases is the distribution channel for this first version; do not assume npm registry availability.
