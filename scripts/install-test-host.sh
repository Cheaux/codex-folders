#!/bin/sh
set -eu
# Pin the tested public artifact, not an unreviewed host checkout.
test_host_dir="${RUNNER_TEMP:-/tmp}/codex-folders-test-host"
mkdir -p "$test_host_dir"
curl -fsSL https://github.com/Cheaux/codex-command-extensions/releases/download/v0.1.2/codex-terminal-extensions-0.1.2.tgz -o "$test_host_dir/codex-terminal-extensions-0.1.2.tgz"
(cd "$test_host_dir" && echo '898bb2ea0244773d784f4d7cea11f7b1fdff13233f3fb423e265c402f1301954  codex-terminal-extensions-0.1.2.tgz' | sha256sum -c -)
npm install --global --prefix "$test_host_dir/prefix" --ignore-scripts --no-audit --no-fund "$test_host_dir/codex-terminal-extensions-0.1.2.tgz"
if [ -n "${GITHUB_PATH:-}" ]; then
  echo "$test_host_dir/prefix/bin" >> "$GITHUB_PATH"
fi
