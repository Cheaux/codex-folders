#!/usr/bin/env python3
"""Build a public-directory draft ZIP from explicit plugin files; never include hooks or local data."""
from pathlib import Path, PurePosixPath
import json, stat, zipfile
import xml.etree.ElementTree as ET
root = Path(__file__).resolve().parents[1]
pkg = json.loads((root / 'package.json').read_text())
plugin = root / 'plugins' / pkg['name']
manifest = json.loads((plugin / '.codex-plugin/plugin.json').read_text())
manifest.pop('hooks', None)
manifest['requires_local_executor'] = True
review = root / 'submission/review-cases.json'
if review.exists():
    cases = json.loads(review.read_text())
    assert len(cases['positive']) == 5 and len(cases['negative']) == 3
    manifest.setdefault('extensions', {}).setdefault('com.openai', {})['review'] = {'test_cases': cases, 'commerce': False}
interface = manifest['interface']
for field, maximum in [('displayName',30), ('shortDescription',30), ('longDescription',4000), ('developerName',80)]:
    value = interface[field]
    assert isinstance(value,str) and value.strip() and len(value) <= maximum, field
for field in ['websiteURL','supportURL','privacyPolicyURL','termsOfServiceURL']:
    assert interface[field].startswith('https://'), field
files = {}
for path in sorted(plugin.rglob('*')):
    if not path.is_file(): continue
    assert not path.is_symlink(), path
    rel = path.relative_to(plugin).as_posix()
    if rel.startswith('hooks/') or rel == '.codex-plugin/plugin.json': continue
    if path.suffix not in ('.json','.md','.svg','.png','.jpg','.webp','.yaml','.yml'): raise ValueError(f'Unexpected plugin file: {rel}')
    data = path.read_bytes()
    if pkg['name'] == 'codex-folders' and rel.endswith('SKILL.md'):
        text = data.decode()
        text = text.replace('the hook supplies session context.', 'resolve the actual thread ID explicitly with the shell command below.')
        text = text.replace('Automatic context injection requires trusted Codex Folders hooks in `/hooks`; explicit context tools work without them.', 'This directory build contains no lifecycle hooks. Load and save project context explicitly with the tools.')
        text = text.replace('---\n\nUse the folders MCP tools', '---\n\nThis directory build has no lifecycle hooks. Use `codex-folders current --json` for thread identity and explicit project context tools; do not claim automatic hook injection.\n\nUse the folders MCP tools', 1)
        data = text.encode()
    files[rel] = data
files['.codex-plugin/plugin.json'] = (json.dumps(manifest,indent=2)+'\n').encode()
files['INSTALL.md'] = (root / 'submission/INSTALL.md').read_bytes()
files['LICENSE'] = (root / 'LICENSE').read_bytes()
assert not any(PurePosixPath(name).is_absolute() or '..' in PurePosixPath(name).parts for name in files)
for field in ('logo','composerIcon'):
    rel=interface[field].removeprefix('./')
    assert rel in files, field
    if rel.endswith('.svg'):
        element=ET.fromstring(files[rel]); view=[float(v) for v in element.attrib['viewBox'].split()]
        assert view[2] == view[3] and view[2] >= 48
if 'mcpServers' in manifest:
    servers=json.loads(files[manifest['mcpServers'].removeprefix('./')])['mcpServers']
    assert len(servers)==1
    for server in servers.values():
        assert server['command'] == pkg['name'] and server['args'] == ['serve']
assert not any(name.startswith('hooks/') or name.endswith('.db') for name in files)
out = root / 'artifacts'; out.mkdir(exist_ok=True)
public_id = pkg['repository']['url'].rsplit('/',1)[-1].removesuffix('.git')
filename = f"{public_id}-{pkg['version']}-directory.zip"
with zipfile.ZipFile(out / filename,'w',zipfile.ZIP_DEFLATED) as archive:
    for name,data in sorted(files.items()):
        info=zipfile.ZipInfo(name,(2026,1,1,0,0,0)); info.compress_type=zipfile.ZIP_DEFLATED
        info.external_attr=(stat.S_IFREG | 0o644) << 16
        archive.writestr(info,data)
with zipfile.ZipFile(out / filename) as archive:
    assert archive.testzip() is None
    assert json.loads(archive.read('.codex-plugin/plugin.json')) == manifest
print(f'Validated directory draft: {filename}; {len(files)} files; no hooks or local data. Portal review is still required.')
