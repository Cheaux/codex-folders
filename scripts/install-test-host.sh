#!/bin/sh
set -eu
# Pin the tested public artifact, not an unreviewed host checkout.
test_host_dir="${RUNNER_TEMP:-/tmp}/codex-folders-test-host"
mkdir -p "$test_host_dir"
curl -fsSL https://github.com/Cheaux/codex-command-extensions/releases/download/v0.1.0/codex-terminal-extensions-0.1.0.tgz -o "$test_host_dir/codex-terminal-extensions-0.1.0.tgz"
(cd "$test_host_dir" && echo 'f1443cb50d6d5e49edd5c86661a12d10011a0fec94178ea65a8274c075923626  codex-terminal-extensions-0.1.0.tgz' | sha256sum -c -)
npm install --global --prefix "$test_host_dir/prefix" --ignore-scripts --no-audit --no-fund "$test_host_dir/codex-terminal-extensions-0.1.0.tgz"
if [ -n "${GITHUB_PATH:-}" ]; then
  echo "$test_host_dir/prefix/bin" >> "$GITHUB_PATH"
fi
