// Verify a clean distribution install with no connection to real Codex data.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, chmod, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const execute = promisify(execFile);
const directory = await mkdtemp(join(tmpdir(), 'codex-folders-package-'));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const host = process.env.CODEX_TERMINAL_BIN || 'codex-terminal';
const client = new Client({ name: 'package-smoke', version: '1' });
let connected = false;
try {
  let archive = process.env.CODEX_FOLDERS_RELEASE_ARCHIVE;
  if (!archive) {
    const packed = JSON.parse((await execute('npm', ['pack','--json','--ignore-scripts','--pack-destination',directory])).stdout);
    const pack = Array.isArray(packed) ? packed[0] : Object.values(packed)[0];
    archive = join(directory, pack.filename);
  }
  archive = resolve(archive);
  const files = (await execute('tar', ['-tzf', archive])).stdout.split('\n').map(path => path.replace(/^package\//,''));
  for (const required of ['dist/cli.js','dist/cli.js.map','dist/THIRD_PARTY_NOTICES.txt','terminal-extension.json','runtime/pty_host.py','.agents/plugins/marketplace.json','plugins/codex-folders/.codex-plugin/plugin.json','plugins/codex-folders/.mcp.json','plugins/codex-folders/hooks/hooks.json','plugins/codex-folders/skills/chat-folders/SKILL.md']) assert.ok(files.includes(required), `Missing ${required}`);
  for (const file of files) assert.ok(!/^(src|test|docs|validation|node_modules|\.github)\//.test(file), `Unexpected ${file}`);
  const prefix = join(directory,'prefix');
  await execute('npm',['install','--global','--prefix',prefix,'--ignore-scripts','--no-audit','--no-fund',archive], {timeout:180000});
  const binary = join(prefix,'bin/codex-folders');
  const installed = join(prefix,'lib/node_modules/codex-folders');
  assert.equal((await execute(binary,['--version'])).stdout.trim(),pkg.version);
  const manifest = JSON.parse(await readFile(join(installed,'plugins/codex-folders/.codex-plugin/plugin.json'),'utf8'));
  assert.equal(manifest.version,pkg.version);
  const provider = JSON.parse(await readFile(join(installed,'terminal-extension.json'),'utf8'));
  assert.equal(provider.schemaVersion,1);
  assert.deepEqual(provider.commands.map(command=>command.name),['/folders','/resume','/resumedbg']);
  assert.equal(provider.commands.find(command=>command.name==='/resume').replaceNative,true);
  const calls=join(directory,'calls.jsonl'), native=join(directory,'codex-stub');
  await writeFile(native,`#!/usr/bin/env node\nconst fs=require('node:fs');fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(process.argv.slice(2))+'\\n');console.log(JSON.stringify({installed:true}));\n`);
  await chmod(native,0o755);
  const home=join(directory,'codex-home');await mkdir(home);
  const env={...process.env,PATH:`${join(prefix,'bin')}:${process.env.PATH || ''}`,CODEX_HOME:home,CODEX_FOLDERS_DATA_DIR:join(directory,'data'),CODEX_TERMINAL_DATA_DIR:join(directory,'terminal'),CODEX_TERMINAL_BIN_DIR:join(directory,'bin'),CODEX_FOLDERS_CODEX_BIN:native,CODEX_TERMINAL_CODEX_BIN:native,CODEX_THREAD_ID:'fixture-current-thread'};
  const run=async(command,args)=>(await execute(command,args,{env})).stdout;
  assert.equal(JSON.parse(await run(binary,['install'])).installed,true);
  assert.deepEqual((await readFile(calls,'utf8')).trim().split('\n').map(line=>JSON.parse(line)),[
    ['plugin','marketplace','add',installed,'--json'],['plugin','add','codex-folders@codex-folders-local','--json']
  ]);
  await run(binary,['enable']);
  const remote=join(directory,'remote');await mkdir(remote);
  const remoteManifest=join(remote,'terminal-extension.json');
  await writeFile(remoteManifest,JSON.stringify({schemaVersion:1,id:'codex-remote',commands:[{name:'/qr',description:'Fixture remote command',action:{type:'view',executable:process.execPath,args:['--version']}}]}));
  await run(host,['register',remoteManifest]);
  let status=JSON.parse(await run(host,['status','--json']));
  assert.ok(status.enabled);assert.deepEqual(status.providers.map(p=>p.id).sort(),['codex-folders','codex-remote']);
  await run(binary,['disable']);
  status=JSON.parse(await run(host,['status','--json']));
  assert.ok(status.enabled);assert.deepEqual(status.providers.map(p=>p.id),['codex-remote']);
  await run(host,['disable']);
  // Listing tools and local folder/memory operations never invoke a model.
  await client.connect(new StdioClientTransport({command:binary,args:['serve'],env,stderr:'pipe'}));connected=true;
  const tools=(await client.listTools()).tools.map(tool=>tool.name);
  assert.equal(tools.length,14);assert.ok(tools.includes('project_memory_update') && tools.includes('project_message_read'));
  const created=await client.callTool({name:'folders_create',arguments:{name:'Fixture project',is_project:true}});
  assert.equal(created.structuredContent.result.name,'Fixture project');
  assert.equal(JSON.parse(await run(binary,['folder','list','--json'])).folders.length,1);
  const map=JSON.parse(await readFile(join(installed,'dist/cli.js.map'),'utf8'));
  for(const source of map.sources) assert.ok(!source.startsWith('/') && !/[A-Z]:\\/.test(source),`Absolute source map path: ${source}`);
  console.log(`Package smoke passed: ${pkg.name}@${pkg.version}; clean install, hidden manifests, native registration arguments, 14 MCP tools, source maps, independent unregister preserves Remote and host.`);
} finally {
  if(connected) await client.close();
  await rm(directory,{recursive:true,force:true});
}
