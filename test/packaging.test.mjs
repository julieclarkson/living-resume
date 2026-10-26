// Plugin packaging for Claude (Cowork, Code) and OpenAI (ChatGPT desktop, Codex): every manifest
// parses, versions match package.json, and the MCP entry starts the real server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT } from './helpers.mjs';

const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const PKG = read('package.json');

test('every manifest parses and carries the package version', () => {
  const claude = read('.claude-plugin/plugin.json'); const claudeMkt = read('.claude-plugin/marketplace.json');
  const openai = read('plugin.json'); const openaiMkt = read('.agents/plugins/marketplace.json'); const server = read('server.json');
  for (const [name, v] of [['.claude-plugin/plugin.json', claude.version], ['.claude-plugin/marketplace.json metadata', claudeMkt.metadata.version], ['.claude-plugin/marketplace.json plugin', claudeMkt.plugins[0].version],
    ['plugin.json', openai.version], ['.agents/plugins/marketplace.json metadata', openaiMkt.metadata.version], ['.agents/plugins/marketplace.json plugin', openaiMkt.plugins[0].version], ['server.json', server.version], ['server.json package', server.packages[0].version]]) assert.equal(v, PKG.version, name);
  assert.equal(server.packages[0].identifier, PKG.name);
});

test('OpenAI plugin.json has the portable fields and a stable kebab-case name', () => {
  const p = read('plugin.json');
  assert.equal(p.name, 'living-resume'); assert.match(p.name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  for (const k of ['description', 'homepage', 'repository', 'license']) assert.ok(typeof p[k] === 'string' && p[k].length, k);
  assert.ok(p.author?.name); assert.ok(Array.isArray(p.keywords) && p.keywords.length);
  assert.deepEqual(Object.keys(p.extensions || {}), ['com.openai']);
  assert.ok(fs.existsSync(path.join(ROOT, 'skills', 'living-resume', 'SKILL.md')));
});

test('both marketplaces list the same plugin; the OpenAI one says to verify in the app', () => {
  const c = read('.claude-plugin/marketplace.json'); const o = read('.agents/plugins/marketplace.json');
  assert.equal(o.plugins[0].name, c.plugins[0].name); assert.equal(o.plugins[0].source, c.plugins[0].source);
  assert.match(o.about, /verify in the ChatGPT desktop app/);
});

test('npm package ships every manifest', () => {
  for (const f of ['plugin.json', 'mcp.json', '.agents/', '.claude-plugin/', '.mcp.json', 'skills/']) assert.ok(PKG.files.includes(f), f);
});

// Start the server exactly as a host would from a manifest, with the plugin root substituted.
function start(entry, rootVar) {
  const sub = (s) => s.replaceAll(`\${${rootVar}}`, ROOT);
  const p = spawn(entry.command === 'node' ? process.execPath : entry.command, entry.args.map(sub), { cwd: entry.cwd ? sub(entry.cwd) : ROOT, env: { ...process.env, LIVING_RESUME_DIR: path.join(ROOT, 'no-such-workspace') } });
  return new Promise((resolve, reject) => {
    let buf = ''; const t = setTimeout(() => { p.kill(); reject(new Error('no reply')); }, 10_000);
    p.stdout.on('data', (d) => { buf += d; const i = buf.indexOf('\n'); if (i >= 0) { clearTimeout(t); p.kill(); resolve(JSON.parse(buf.slice(0, i))); } });
    p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } }) + '\n');
  });
}

test('OpenAI mcp.json: a local stdio entry that starts the server', async () => {
  const e = read('mcp.json').mcpServers['living-resume'];
  assert.deepEqual(e, { type: 'stdio', command: 'node', args: ['${PLUGIN_ROOT}/mcp/server.mjs'], cwd: '${PLUGIN_ROOT}' });
  const r = await start(e, 'PLUGIN_ROOT');
  assert.equal(r.result.serverInfo.name, 'living-resume'); assert.equal(r.result.serverInfo.version, PKG.version);
});

test('Claude .mcp.json starts the same server', async () => {
  const r = await start(read('.mcp.json').mcpServers['living-resume'], 'CLAUDE_PLUGIN_ROOT');
  assert.equal(r.result.serverInfo.version, PKG.version);
});
