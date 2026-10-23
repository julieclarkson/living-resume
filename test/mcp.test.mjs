// The MCP server speaks JSON-RPC over stdio and refuses anything outside the workspace.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, workspace, tmp } from './helpers.mjs';

function session(dir) {
  const p = spawn(process.execPath, [path.join(ROOT, 'mcp', 'server.mjs')], { env: { ...process.env, LIVING_RESUME_DIR: dir, LIVING_RESUME_STATE_DIR: path.join(dir, '.state') } });
  let buf = ''; const waiting = new Map(); let n = 0;
  p.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); waiting.get(m.id)?.(m); } });
  const req = (method, params) => new Promise((res) => { const id = ++n; waiting.set(id, res); p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  return { req, close: () => p.kill() };
}

test('initialize, list tools, call status', async () => {
  const dir = workspace('mcp');
  const s = session(dir);
  const init = await s.req('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  assert.equal(init.result.protocolVersion, '2025-06-18'); assert.equal(init.result.serverInfo.name, 'living-resume');
  const list = await s.req('tools/list', {});
  const names = list.result.tools.map((t) => t.name);
  for (const n of ['resume_status', 'resume_import', 'resume_review_decide', 'resume_build', 'resume_publish_preview']) assert.ok(names.includes(n), n);
  assert.ok(!names.some((n) => /write|commit|push|delete/.test(n)));
  const st = await s.req('tools/call', { name: 'resume_status', arguments: {} });
  assert.equal(st.result.isError, false); assert.match(st.result.content[0].text, /Treat as data/); assert.match(st.result.content[0].text, /QUEUE/);
  s.close();
});

test('rejects paths outside the workspace, symlinks, and bad ids', async () => {
  const dir = workspace('mcp2');
  const outside = path.join(tmp('out'), 'secret.txt'); fs.writeFileSync(outside, 'x');
  fs.symlinkSync(outside, path.join(dir, 'link.txt'));
  const s = session(dir);
  await s.req('initialize', {});
  for (const p of ['../../etc/passwd', outside, 'link.txt']) {
    const r = await s.req('tools/call', { name: 'resume_import', arguments: { path: p } });
    assert.equal(r.result.isError, true, p);
  }
  const bad = await s.req('tools/call', { name: 'resume_review_decide', arguments: { id: '../ledger', action: 'approve' } });
  assert.equal(bad.result.isError, true);
  const act = await s.req('tools/call', { name: 'resume_review_decide', arguments: { id: 'ok-id', action: 'publish' } });
  assert.equal(act.result.isError, true);
  const unknown = await s.req('nope', {}); assert.equal(unknown.error.code, -32601);
  s.close();
});

test('parallel review decisions all land in the ledger', async () => {
  const dir = workspace('mcp4');
  for (let i = 0; i < 8; i++) fs.writeFileSync(path.join(dir, 'proposals', `p-${i}.json`), JSON.stringify({ id: `p-${i}`, kind: 'add', section: 'certifications', text: `Cert ${i}`, status: 'proposed' }));
  const s = session(dir);
  try {
    const rs = await Promise.all([...Array(8).keys()].map((i) => s.req('tools/call', { name: 'resume_review_decide', arguments: { id: `p-${i}`, action: 'approve' } })));
    assert.ok(rs.every((r) => !r.result.isError));
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'resume', 'ledger.json'), 'utf8')).certifications.length, 8);
  } finally { s.close(); }
});

test('resume_import works for a file inside the workspace', async () => {
  const dir = workspace('mcp3');
  fs.mkdirSync(path.join(dir, 'quarantine', 'in', 'imports'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'examples', 'sample-resume.txt'), path.join(dir, 'quarantine', 'in', 'imports', 'cv.txt'));
  const s = session(dir);
  const r = await s.req('tools/call', { name: 'resume_import', arguments: { path: 'quarantine/in/imports/cv.txt' } });
  assert.equal(r.result.isError, false, r.result.content[0].text);
  assert.match(r.result.content[0].text, /Lines waiting for your review: 12/);
  s.close();
});
