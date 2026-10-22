// End to end: init → import → review → build → check, Free vs Pro surfaces.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { cli, workspace, ROOT, hasChrome } from './helpers.mjs';

const SAMPLE = path.join(ROOT, 'examples', 'sample-resume.txt');
const chrome = await hasChrome();

test('init never overwrites an existing ledger', () => {
  const dir = workspace('init');
  const before = fs.readFileSync(path.join(dir, 'resume', 'ledger.json'), 'utf8');
  const r = cli(['init', dir, '--name', 'Someone Else'], { dir });
  assert.equal(r.code, 0); assert.match(r.out, /already exists/);
  assert.equal(fs.readFileSync(path.join(dir, 'resume', 'ledger.json'), 'utf8'), before);
  assert.ok(fs.existsSync(path.join(dir, '.gitignore')));
});

test('import makes proposals only; nothing is public until approved', () => {
  const dir = workspace('import');
  const r = cli(['import', SAMPLE], { dir }); assert.equal(r.code, 0, r.out);
  const L = JSON.parse(fs.readFileSync(path.join(dir, 'resume', 'ledger.json'), 'utf8'));
  assert.equal(L.experience.length, 2);
  assert.deepEqual(L.experience.map((x) => [x.title, x.org]), [['Senior Product Designer', 'Northwind Studio'], ['Front-End Developer', 'Bluebird Media']]);
  assert.ok(L.experience.every((x) => x.visibility === 'auto' && x.groups[0].items.length === 0));
  const props = fs.readdirSync(path.join(dir, 'proposals'));
  assert.equal(props.length, 11);
  const one = JSON.parse(fs.readFileSync(path.join(dir, 'proposals', props.find((f) => f.endsWith('-003.json'))), 'utf8'));
  assert.equal(one.status, 'proposed'); assert.match(one.text, /scheduling app used by 40 clinics/);
  const s = cli(['status'], { dir }); assert.match(s.out, /waiting for review: 11/); assert.match(s.out, /web {7}0 lines/);
});

test('review: approve, edit, reject, later', () => {
  const dir = workspace('review');
  cli(['import', SAMPLE], { dir });
  const ids = fs.readdirSync(path.join(dir, 'proposals')).map((f) => f.replace('.json', '')).sort();
  assert.equal(cli(['review', 'approve', ids[2]], { dir }).code, 0);
  assert.equal(cli(['review', 'edit', ids[3], 'Built a React component library that halved new-screen build time'], { dir }).code, 0);
  assert.equal(cli(['review', 'reject', ids[4], 'too old'], { dir }).code, 0);
  assert.equal(cli(['review', 'later', ids[5]], { dir }).code, 0);
  const L = JSON.parse(fs.readFileSync(path.join(dir, 'resume', 'ledger.json'), 'utf8'));
  const items = L.experience.flatMap((r) => r.groups.flatMap((g) => g.items));
  assert.equal(items.length, 2);
  assert.ok(items.every((i) => i.visibility === 'public' && i.status === 'verified'));
  assert.ok(items.some((i) => /halved/.test(i.text)));
  const st = (id) => JSON.parse(fs.readFileSync(path.join(dir, 'proposals', `${id}.json`), 'utf8')).status;
  assert.deepEqual([st(ids[2]), st(ids[3]), st(ids[4]), st(ids[5])], ['approved', 'edited', 'rejected', 'later']);
  assert.notEqual(cli(['review', 'approve', 'no-such-id'], { dir }).code, 0);
});

test('a proposal cannot smuggle visibility or private fields through "fields"', () => {
  const dir = workspace('smuggle');
  fs.writeFileSync(path.join(dir, 'proposals', 'p-x.json'), JSON.stringify({ id: 'p-x', kind: 'add', section: 'certifications', text: 'Cert A', fields: { visibility: 'private', evidence: 'x', issuer: 'Org', surfaces: 'bad' }, status: 'proposed' }));
  assert.equal(cli(['review', 'approve', 'p-x'], { dir }).code, 0);
  const c = JSON.parse(fs.readFileSync(path.join(dir, 'resume', 'ledger.json'), 'utf8')).certifications[0];
  assert.equal(c.visibility, 'public'); assert.equal(c.issuer, 'Org'); assert.deepEqual(c.surfaces, ['web', 'pdf', 'linkedin', 'json']);
});

test('build + check pass on a fresh import (Free: credit link on the web page only)', { skip: !chrome && 'no Chrome/Chromium' }, () => {
  const dir = workspace('build');
  cli(['import', SAMPLE], { dir });
  const prefix = fs.readdirSync(path.join(dir, 'proposals'))[0].replace(/-\d{3}\.json$/, '');
  assert.equal(cli(['review', 'approve-all', prefix], { dir }).code, 0);
  const b = cli(['build'], { dir }); assert.equal(b.code, 0, b.out);
  for (const f of ['Sam_Rivera_Resume.pdf', 'resume.json', 'index.html', 'linkedin-packet.md', 'public-report.md']) assert.ok(fs.existsSync(path.join(dir, 'dist', f)), f);
  assert.ok(!fs.existsSync(path.join(dir, 'dist', 'capability-statement.pdf')));
  const html = fs.readFileSync(path.join(dir, 'dist', 'index.html'), 'utf8');
  assert.match(html, /Kept current with Living Résumé/);
  assert.match(html, /Content-Security-Policy/);
  assert.doesNotMatch(fs.readFileSync(path.join(dir, 'dist', 'resume-print.html'), 'utf8'), /Living Résumé/);
  const c = cli(['check'], { dir }); assert.equal(c.code, 0, c.out);
});

test('check fails when a private name reaches a public line', () => {
  const dir = workspace('deny');
  const rp = path.join(dir, 'resume', 'rules.json'); const R = JSON.parse(fs.readFileSync(rp, 'utf8'));
  R.disclosure_denylist = ['Project Falcon']; fs.writeFileSync(rp, JSON.stringify(R));
  fs.writeFileSync(path.join(dir, 'proposals', 'p-leak.json'), JSON.stringify({ id: 'p-leak', kind: 'add', section: 'certifications', text: 'Led project-falcon migration', status: 'proposed' }));
  cli(['review', 'approve', 'p-leak'], { dir });
  const c = cli(['check'], { dir }); assert.notEqual(c.code, 0); assert.match(c.out, /private term "Project Falcon"/);
});

test('Pro features say so on Free and change nothing', () => {
  const dir = workspace('gate');
  fs.writeFileSync(path.join(dir, 'posting.txt'), 'We are hiring a product designer.');
  const s = cli(['scout'], { dir }); assert.equal(s.code, 3); assert.match(s.out, /part of Living Résumé Pro/);
  const t = cli(['tailor', path.join(dir, 'posting.txt'), 'acme'], { dir }); assert.equal(t.code, 3);
  assert.ok(!fs.existsSync(path.join(dir, 'applications')));
  assert.ok(!fs.existsSync(path.join(dir, 'scout', 'state.json')));
});

test('commands outside a workspace explain how to start', () => {
  const r = cli(['status'], { env: { LIVING_RESUME_DIR: path.join(ROOT, 'no-such-dir'), HOME: path.join(ROOT, 'no-such-home') } });
  assert.equal(r.code, 2); assert.match(r.out, /living-resume init/);
});
