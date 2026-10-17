import { build } from 'esbuild';
import { chmod, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
await mkdir('dist', { recursive: true });
const result = await build({ entryPoints: ['src/cli.ts'], outfile: 'dist/cli.js', bundle: true,
  platform: 'node', target: 'node24', format: 'esm', sourcemap: true, metafile: true,
  banner: { js: '#!/usr/bin/env node\nimport { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' } });
await chmod('dist/cli.js', 0o755);
const packages = new Set();
for (const input of Object.keys(result.metafile.inputs)) {
  if (!input.startsWith('node_modules/')) continue;
  let directory = dirname(input);
  while (directory !== '.' && directory !== 'node_modules') {
    try { await readFile(join(directory, 'package.json')); packages.add(directory); break; }
    catch { directory = dirname(directory); }
  }
}
const notices = ['Bundled third-party notices for Codex Folders.\nThe project itself is licensed under the root LICENSE.'];
for (const directory of [...packages].sort()) {
  const pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  const files = (await readdir(directory)).filter(name => /^(license|licence|copying|notice)(\.|$)/i.test(name));
  if (!files.length && !pkg.name) continue; // Nested package metadata inherits the package root license.
  if (!files.length) {
    // Some libraries put subpath package metadata beside their source. Find its license above it.
    let parent = dirname(directory);
    while (parent.startsWith('node_modules/')) {
      const inherited = (await readdir(parent)).filter(name => /^(license|licence|copying|notice)(\.|$)/i.test(name));
      if (inherited.length) { for (const file of inherited) notices.push(`\n${pkg.name} ${pkg.version || ''}\n${await readFile(join(parent,file),'utf8')}`); break; }
      parent = dirname(parent);
    }
    continue;
  }
  for (const file of files) notices.push(`\n${pkg.name} ${pkg.version || ''} (${pkg.license || 'see license'})\n${await readFile(join(directory,file),'utf8')}`);
}
await writeFile('dist/THIRD_PARTY_NOTICES.txt', notices.join('\n\n'));
