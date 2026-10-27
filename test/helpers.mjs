// Test helpers: temp workspaces, a CLI runner, a tiny zip writer, and a fake Polar server.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CLI = path.join(ROOT, 'cli', 'living-resume.mjs');
export const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `lr-${name}-`));

export function cli(args, { dir, env = {}, input } = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: dir || os.tmpdir(), input, encoding: 'utf8', timeout: 180_000,
    env: { ...process.env, LIVING_RESUME_STATE_DIR: env.LIVING_RESUME_STATE_DIR || path.join(dir || os.tmpdir(), '.state'), ...(dir ? { LIVING_RESUME_DIR: dir } : {}), ...env } });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

export function workspace(name = 'ws') {
  const dir = path.join(tmp(name), 'resume-home');
  const r = cli(['init', dir, '--name', 'Sam Rivera', '--email', 'sam.rivera@example.com', '--url', 'https://samrivera.example.com'], { dir: path.dirname(dir), env: { LIVING_RESUME_DIR: '' } });
  if (r.code !== 0) throw new Error(r.out);
  return dir;
}

export function zip(entries) {
  const locals = []; const centrals = []; let off = 0;
  for (const [name, content] of Object.entries(entries)) {
    const data = Buffer.from(content); const comp = zlib.deflateRawSync(data); const n = Buffer.from(name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, n, comp); centrals.push(ch, n); off += 30 + n.length + comp.length;
  }
  const cd = Buffer.concat(centrals); const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(centrals.length / 2, 8); end.writeUInt16LE(centrals.length / 2, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}

// Fake Polar customer-portal license-key API. `keys` maps key → { status, expires_at, benefit_id, limit }.
export async function fakePolar(keys) {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => (body += c));
    req.on('end', () => {
      const j = JSON.parse(body || '{}'); const ep = req.url.split('/').pop(); calls.push({ ep, body: j });
      const k = keys[j.key];
      const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
      if (!k || j.organization_id !== 'org_test') return send(404, { detail: 'License key not found.' });
      const lk = { id: 'lk_1', status: k.status, expires_at: k.expires_at ?? null, benefit_id: k.benefit_id ?? 'ben_test', key: j.key };
      if (ep === 'activate') return k.limit === false ? send(403, { detail: 'License key activation not supported' }) : send(200, { id: 'act_1', license_key_id: 'lk_1', label: j.label, license_key: lk });
      if (ep === 'validate') return send(200, lk);
      if (ep === 'deactivate') { res.writeHead(204); return res.end(); }
      send(404, {});
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, calls, close: () => new Promise((r) => server.close(r)) };
}

export function storeConfig(dir, extra = {}) {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'product.config.json'), 'utf8'));
  cfg.store = { ...cfg.store, organizationId: 'org_test', benefitId: 'ben_test', checkoutUrl: 'https://buy.example.test/pro', ...extra };
  const p = path.join(dir, 'product.config.test.json'); fs.writeFileSync(p, JSON.stringify(cfg)); return p;
}
export const hasChrome = async () => !!(await import('../engine/lib/print.mjs')).findChrome();

// Async runner (needed when the test process itself serves the fake Polar API).
import { spawn } from 'node:child_process';
export function cliAsync(args, { dir, env = {} } = {}) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CLI, ...args], { cwd: dir || os.tmpdir(),
      env: { ...process.env, LIVING_RESUME_STATE_DIR: env.LIVING_RESUME_STATE_DIR || path.join(dir || os.tmpdir(), '.state'), ...(dir ? { LIVING_RESUME_DIR: dir } : {}), ...env } });
    let out = ''; p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => resolve({ code, out }));
  });
}
