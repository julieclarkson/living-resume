// Polar license flow against a local fake of the customer-portal API.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { cliAsync as cli, workspace, tmp, fakePolar, storeConfig } from './helpers.mjs';

const polar = await fakePolar({
  LRPRO_GOOD_KEY_1234: { status: 'granted', expires_at: '2099-01-01T00:00:00Z' },
  LRPRO_REVOKED_1234: { status: 'revoked' },
  LRPRO_NOLIMIT_1234: { status: 'granted', limit: false },
  LRPRO_OTHERPROD_12: { status: 'granted', benefit_id: 'ben_other' },
});
after(() => polar.close());
const base = tmp('lic');
const env = (extra = {}) => ({ LIVING_RESUME_POLAR_API: polar.url, LIVING_RESUME_PRODUCT_CONFIG: storeConfig(base), LIVING_RESUME_STATE_DIR: path.join(base, `state-${extra.s || 'a'}`), ...extra.env });
const licFile = (s) => path.join(base, `state-${s}`, 'license.json');

test('activate a good key → Pro; status masks the key; file is owner-only', async () => {
  const e = env({ s: 'good' });
  const r = await cli(['license', 'activate', 'LRPRO_GOOD_KEY_1234'], { env: e }); assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Pro is on/);
  const s = await cli(['license', 'status'], { env: e }); assert.match(s.out, /^Pro · key LRPR…1234/); assert.doesNotMatch(s.out, /GOOD_KEY/);
  assert.equal(fs.statSync(licFile('good')).mode & 0o077, 0);
  const call = polar.calls.find((c) => c.ep === 'activate' && c.body.key === 'LRPRO_GOOD_KEY_1234');
  assert.equal(call.body.organization_id, 'org_test');
});

test('a hand-edited license file reads as Free', async () => {
  const e = env({ s: 'tamper' });
  await cli(['license', 'activate', 'LRPRO_GOOD_KEY_1234'], { env: e });
  const f = licFile('tamper'); const j = JSON.parse(fs.readFileSync(f, 'utf8')); j.expiresAt = '2199-01-01T00:00:00Z'; fs.writeFileSync(f, JSON.stringify(j));
  assert.match((await cli(['license', 'status'], { env: e })).out, /^Free \(license-file-changed\)/);
});

test('revoked, unknown, and other-product keys are refused', async () => {
  assert.notEqual((await cli(['license', 'activate', 'LRPRO_REVOKED_1234'], { env: env({ s: 'rev' }) })).code, 0);
  const u = await cli(['license', 'activate', 'LRPRO_UNKNOWN_1234'], { env: env({ s: 'unk' }) }); assert.notEqual(u.code, 0); assert.match(u.out, /does not recognize/);
  const o = await cli(['license', 'activate', 'LRPRO_OTHERPROD_12'], { env: env({ s: 'oth' }) }); assert.notEqual(o.code, 0); assert.match(o.out, /different product/);
  assert.notEqual((await cli(['license', 'activate', 'bad key!'], { env: env({ s: 'bad' }) })).code, 0);
});

test('keys without activations fall back to validate', async () => {
  const r = await cli(['license', 'activate', 'LRPRO_NOLIMIT_1234'], { env: env({ s: 'nolim' }) }); assert.equal(r.code, 0, r.out);
});

test('offline: cached Pro holds within 30 days, then needs an online check', async () => {
  const e = env({ s: 'off' });
  await cli(['license', 'activate', 'LRPRO_GOOD_KEY_1234'], { env: e });
  const offline = { ...e, LIVING_RESUME_POLAR_API: 'http://127.0.0.1:9' };
  const v = await cli(['license', 'validate'], { env: offline }); assert.equal(v.code, 0); assert.match(v.out, /Offline/);
  // Age the last good check past the grace period by re-signing with an old date via the module itself.
  const code = `const m = await import(${JSON.stringify(path.resolve('engine/lib/license.mjs'))}); const s = m.licenseState(Date.now() + 31*24*3600*1000); console.log(s.tier, s.reason);`;
  const r = require_spawn(code, offline); assert.match(r, /free needs-online-check/);
});

test('a key revoked after activation drops to Free on the next check', async () => {
  const e = env({ s: 'later' });
  await cli(['license', 'activate', 'LRPRO_GOOD_KEY_1234'], { env: e });
  const p2 = await fakePolar({ LRPRO_GOOD_KEY_1234: { status: 'revoked' } });
  const v = await cli(['license', 'validate'], { env: { ...e, LIVING_RESUME_POLAR_API: p2.url } }); await p2.close();
  assert.notEqual(v.code, 0); assert.match(v.out, /revoked/);
  assert.match((await cli(['license', 'status'], { env: e })).out, /^Free \(key-revoked\)/);
});

test('Pro unlocks the scout and removes the credit link; deactivate returns to Free', async () => {
  const e = env({ s: 'pro' });
  const dir = workspace('pro');
  await cli(['license', 'activate', 'LRPRO_GOOD_KEY_1234'], { env: e });
  const s = await cli(['scout'], { dir, env: e }); assert.equal(s.code, 0, s.out);
  assert.ok(fs.existsSync(path.join(dir, 'scout', 'inbox.md')));
  const vk = path.join(dir, 'vendor-kit', 'profile.json'); const V = JSON.parse(fs.readFileSync(vk, 'utf8')); V.company = 'Rivera Design LLC'; V.overview = 'Product design.'; fs.writeFileSync(vk, JSON.stringify(V));
  const b = await cli(['build'], { dir, env: e });
  assert.doesNotMatch(fs.readFileSync(path.join(dir, 'dist', 'index.html'), 'utf8'), /Kept current with Living Résumé/);
  if (/✓ Sam_Rivera_Resume\.pdf/.test(b.out)) assert.ok(fs.existsSync(path.join(dir, 'dist', 'capability-statement.pdf')), b.out);
  const d = await cli(['license', 'deactivate'], { env: e }); assert.equal(d.code, 0);
  assert.ok(polar.calls.some((c) => c.ep === 'deactivate' && c.body.activation_id === 'act_1'));
  assert.equal((await cli(['scout'], { dir, env: e })).code, 3);
});

test('refuses a plain-http license server that is not local', async () => {
  const r = await cli(['license', 'activate', 'LRPRO_GOOD_KEY_1234'], { env: { ...env({ s: 'http' }), LIVING_RESUME_POLAR_API: 'http://evil.example.com' } });
  assert.notEqual(r.code, 0); assert.match(r.out, /non-https/);
});

test('with no Polar store configured, activation explains Pro is not on sale yet', async () => {
  const r = await cli(['license', 'activate', 'LRPRO_GOOD_KEY_1234'], { env: { LIVING_RESUME_STATE_DIR: path.join(base, 'state-none'), LIVING_RESUME_PRODUCT_CONFIG: '' } });
  assert.notEqual(r.code, 0); assert.match(r.out, /isn't on sale yet/);
});

import { spawnSync } from 'node:child_process';
function require_spawn(code, envx) {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', env: { ...process.env, ...envx } });
  return r.stdout + r.stderr;
}
