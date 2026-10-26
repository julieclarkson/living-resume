// Renderers: the LinkedIn packet, and the education, certificates, and skills sections.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { linkedinPacket, printHtml, webPage, printModel } from '../engine/lib/render.mjs';
import { ROOT, tmp } from './helpers.mjs';

const item = (id, text, extra = {}) => ({ id, text, surfaces: ['web', 'pdf', 'linkedin', 'json'], visibility: 'public', status: 'verified', ...extra });
const RULES = { pdf_filename: 'Sam_Rivera_Resume.pdf', limits: { linkedin: { headline: 220, about: 2600, position_description: 2000, position_title: 100 } } };
const role = (id, title, org, start, bullet) => ({ id, title, org, start, end: null, visibility: 'auto', groups: [{ label: null, items: [item(`${id}-1`, bullet)] }] });

test('LinkedIn packet: a promotion at one company and a blank org each get their own fields', () => {
  const L = { person: { name: 'Sam Rivera' }, experience: [
    role('acme-2021', 'Senior Analyst', 'Acme', '2021-03', 'Led the pricing review'),
    role('acme-2018', 'Analyst', 'Acme', '2018-06', 'Built the weekly sales report'),
    role('free-2016', 'Freelance Designer', '', '2016', 'Designed menus for local cafes'),
  ] };
  const { text } = linkedinPacket(L, RULES);
  const keys = [...text.matchAll(/^## (Experience: .+?)(?: \(\d+\/\d+\))?$/gm)].map((m) => m[1]);
  assert.equal(new Set(keys).size, keys.length, keys.join('\n'));
  assert.ok(keys.includes('Experience: Senior Analyst at Acme (2021) description'));
  assert.ok(keys.includes('Experience: Analyst at Acme (2018) description'));
  assert.ok(keys.includes('Experience: Freelance Designer at — (2016) title'));
  assert.match(text, /Built the weekly sales report/); assert.match(text, /Led the pricing review/);
});

const base = () => ({ person: { name: 'Sam Rivera' }, experience: [] });

test('education: the school is not repeated when the line already names it', () => {
  const L = { ...base(), education: [item('e1', 'BS Computer Science, UT Austin', { institution: 'UT Austin' }), item('e2', 'MBA', { institution: 'Rice University' })] };
  for (const html of [printHtml(L), webPage(L)]) {
    assert.ok(!html.includes('UT Austin</b>, UT Austin'), 'repeated school');
    assert.match(html, /<b>MBA<\/b>, Rice University/);
  }
  const edu = printModel(L).sections.find((x) => x.kind === 'edu');
  assert.equal(edu.rows[0].rest, ''); assert.equal(edu.rows[1].rest, ', Rice University');
});

test('certificates are a clean list, not "Certificates in …"', () => {
  const L = { ...base(), certifications: [item('c1', 'Google Project Management Certificate'), item('c2', 'CPR and First Aid')] };
  for (const html of [printHtml(L), webPage(L)]) {
    assert.doesNotMatch(html, /Certificates in/);
    assert.match(html, /<li>Google Project Management Certificate<\/li>/); assert.match(html, /<li>CPR and First Aid<\/li>/);
  }
  const edu = printModel(L).sections.find((x) => x.kind === 'edu');
  assert.deepEqual(edu.certList, ['Google Project Management Certificate', 'CPR and First Aid']);
});

test('a skills group named like the section has no repeated label', () => {
  const L = { ...base(), skills: [item('s1', 'Excel, scheduling, customer service', { name: 'Skills' }), item('s2', 'Figma, Webflow', { name: 'Design' })] };
  for (const html of [printHtml(L), webPage(L)]) {
    assert.doesNotMatch(html, /<dt>Skills<\/dt>/); assert.match(html, /<dt>Design<\/dt>/);
    assert.match(html, /Excel, scheduling, customer service/);
  }
  const sk = printModel(L).sections.find((x) => x.kind === 'dl');
  assert.equal(sk.rows[0].term, ''); assert.equal(sk.rows[1].term, 'Design');
});

let hasReportlab = true; try { execFileSync('python3', ['-c', 'import reportlab']); } catch { hasReportlab = false; }

test('PDF fallback draws unlabelled skills and the certificate list', { skip: !hasReportlab && 'reportlab not installed' }, () => {
  const L = { ...base(), education: [item('e1', 'BA English', { institution: 'Smith College' })], certifications: [item('c1', 'CPR and First Aid')],
    skills: [item('s1', 'Excel, scheduling', { name: 'Skills' }), item('s2', 'Figma', { name: 'Design' })] };
  const out = path.join(tmp('fb'), 'r.pdf');
  execFileSync('python3', [path.join(ROOT, 'engine', 'pdf', 'fallback.py'), out], { input: JSON.stringify(printModel(L)) });
  assert.ok(fs.statSync(out).size > 1000);
  try { const t = execFileSync('pdftotext', [out, '-'], { encoding: 'utf8' }); assert.match(t, /CPR and First Aid/); assert.match(t, /Certificates/); assert.doesNotMatch(t, /Certificates in/); } catch (e) { if (e.code !== 'ENOENT') throw e; }
});

test('experience renders newest first in every format, whatever order the ledger holds', async () => {
  const { jsonResume } = await import('../engine/lib/render.mjs');
  const L = { person: { name: 'Sam Rivera' }, experience: [
    { ...role('r2021', 'Director', 'Delta', '2021', 'Led the region'), end: null },
    { ...role('r2017', 'Manager', 'Gamma', '2017', 'Ran the clinic'), end: '2020-12' },
    { ...role('r2001', 'Coordinator', 'Alpha', '2001', 'Kept the schedule'), end: '2004' },
    { ...role('r2013', 'Lead', 'Beta', '2013', 'Grew the team'), end: '2017' },
  ] };
  const order = (s) => ['Director', 'Manager', 'Lead', 'Coordinator'].map((t) => s.indexOf(t));
  const sorted = (a) => a.every((x, i) => x >= 0 && (i === 0 || x > a[i - 1]));
  assert.ok(sorted(order(printHtml(L))), 'print');
  assert.ok(sorted(order(webPage(L))), 'web');
  assert.ok(sorted(order(JSON.stringify(printModel(L)))), 'pdf fallback');
  assert.ok(sorted(order(linkedinPacket(L, RULES).text)), 'linkedin');
  assert.deepEqual(jsonResume(L).work.map((w) => w.position), ['Director', 'Manager', 'Lead', 'Coordinator']);
  const { applyRole } = await import('../engine/lib/roles.mjs');
  const V = applyRole(L, { name: 'x', order: ['r2001'] }); // a role profile may put a role first
  assert.ok(printHtml(V).indexOf('Coordinator') < printHtml(V).indexOf('Director'));
});

test('per-person date style: "years" always shows years, default shows months when every role has them', () => {
  const r = (id, start, end) => ({ ...role(id, 'Lead', 'Acme', start, 'Ran it'), end });
  const L = { ...base(), experience: [r('a', '2019-08', null), r('b', '2012-07', '2019-06')] };
  assert.match(printHtml(L), /Aug 2019 to present/);
  assert.match(printHtml({ ...L, dateStyle: 'years' }), /2019 to present/); assert.doesNotMatch(printHtml({ ...L, dateStyle: 'years' }), /Aug 2019/);
  const mixed = { ...L, experience: [r('a', '2019-08', null), r('b', '2012', '2019')], dateStyle: 'months' };
  assert.match(printHtml(mixed), /Aug 2019 to present/); assert.match(printHtml(mixed), /2012 to 2019/);
  assert.equal(printModel({ ...L, dateStyle: 'years' }).sections[0].jobs[0].when, '2019 to present');
});

test('interests follow their own surfaces: on the PDF when approved for it, and split by sentence in JSON Resume', async () => {
  const { jsonResume, interestList } = await import('../engine/lib/render.mjs');
  const text = 'Ran a marathon and several half marathons. Golf, tennis, and walking dogs.';
  const L = { ...base(), interests: item('interests', text) };
  assert.match(printHtml(L), /Outside of work/); assert.match(printHtml(L), /Ran a marathon/);
  assert.ok(printModel(L).sections.some((s) => s.kind === 'para' && s.text === text));
  const webOnly = { ...base(), interests: item('interests', text, { surfaces: ['web', 'json'] }) };
  assert.doesNotMatch(printHtml(webOnly), /Outside of work/);
  assert.match(printHtml({ ...L, headings: { interests: 'Off the clock' } }), /Off the clock/);
  assert.deepEqual(interestList(text), ['Ran a marathon and several half marathons', 'Golf', 'tennis', 'walking dogs']);
  assert.deepEqual(jsonResume(L).interests[0].keywords, interestList(text));
});

test('certStyle "line" writes one or two certificates as one line; three stay a list', () => {
  const L = { ...base(), certStyle: 'line', education: [item('e1', 'BA English', { institution: 'Smith College' })], certifications: [item('c1', 'Google UX Design'), item('c2', 'CPR and First Aid')] };
  assert.match(printHtml(L), /Certificates in Google UX Design and CPR and First Aid/);
  assert.equal(printModel(L).sections.find((s) => s.kind === 'edu').certLine, 'Certificates in Google UX Design and CPR and First Aid');
  const three = { ...L, certifications: [...L.certifications, item('c3', 'Forklift')] };
  assert.doesNotMatch(printHtml(three), /Certificates in/);
});

test('loop 4: no-Chrome PDF draws Vietnamese and Polish letters, strips invisible characters, reports what it cannot draw', { skip: !hasReportlab && 'reportlab not installed' }, () => {
  const L = { person: { name: 'Zoë Ångström-Nguyễn' }, experience: [role('r', 'Engineer', 'Łódź Café', '2020', 'Shipped of​fline mode ﬁrst, used in 日本')] };
  const out = path.join(tmp('uni'), 'r.pdf');
  const so = execFileSync('python3', [path.join(ROOT, 'engine', 'pdf', 'fallback.py'), out], { input: JSON.stringify(printModel(L)), encoding: 'utf8' });
  assert.match(so, /MISSING_GLYPHS:.*日/); assert.doesNotMatch(so, /MISSING_GLYPHS:.*[ễŁź]/);
  try { const t = execFileSync('pdftotext', [out, '-'], { encoding: 'utf8' }); assert.match(t, /Nguyễn/); assert.match(t, /Łódź/); assert.match(t, /offline mode first/); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const plain = path.join(tmp('uni2'), 'r.pdf');
  const so2 = execFileSync('python3', [path.join(ROOT, 'engine', 'pdf', 'fallback.py'), plain], { input: JSON.stringify(printModel({ person: { name: 'Sam Rivera' }, experience: [] })), encoding: 'utf8' });
  assert.equal(so2, '');
});

test('loop 4: certificate line falls back to a list when a name already says Certified or Certificate', () => {
  const L = { ...base(), certStyle: 'line', education: [item('e1', 'BA English', { institution: 'Smith College' })], certifications: [item('c1', 'Certified Payroll Professional')] };
  assert.doesNotMatch(printHtml(L), /Certificates in Certified/);
});
