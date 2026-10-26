// Coach (read-only advice), proof links, publications and talks, volunteer order, month dates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { bulletIssues, coach, coachText } from '../engine/lib/coach.mjs';
import { printHtml, printModel, webPage, jsonResume, linkedinPacket } from '../engine/lib/render.mjs';
import { httpsUrl } from '../engine/lib/util.mjs';
import { cli, workspace, ROOT, tmp, hasChrome } from './helpers.mjs';

const item = (id, text, extra = {}) => ({ id, text, surfaces: ['web', 'pdf', 'linkedin', 'json'], visibility: 'public', status: 'verified', evidence: 'private note', ...extra });
const role = (id, title, org, start, end, bullets) => ({ id, title, org, start, end, visibility: 'auto', groups: [{ label: null, items: bullets.map((b, i) => item(`${id}-${i + 1}`, b)) }] });
const kinds = (t) => bulletIssues(t).map((x) => x.kind);

test('coach: duty phrasing, no result, size without outcome, vague words, long bullets', () => {
  for (const t of ['Responsible for the weekly schedule', 'Duties included payroll', 'Worked on the website', 'Helped with the gala', 'Assisted the director with grants']) assert.equal(kinds(t)[0], 'duty', t);
  assert.deepEqual(kinds('Wrote press releases and managed the events calendar'), ['result']);
  assert.deepEqual(kinds('Ran trade show presence (3 shows a year)'), ['outcome']);
  assert.deepEqual(kinds('Managed 14 clinics in the Upstate region'), ['outcome']);
  assert.ok(kinds('Handled various vendor projects, etc.').includes('vague'));
  assert.ok(kinds(`Led the rollout across 14 clinics ${'and more detail '.repeat(14)}`).includes('long'));
  for (const t of ['Set up a shared spreadsheet for intake counts that the board now uses for grant reports', 'Cut days in A/R from 52 to 38', 'Grew a newsletter list from 1,200 to 4,800 subscribers', 'Opened 22 new sites in 30 months, all within 5% of budget']) assert.deepEqual(kinds(t), [], t);
});

const ledger = () => ({
  person: { name: 'Sam Rivera', headline: item('hl', 'Project Manager | PMP | Healthcare') },
  summary: item('sum', "I'm a project manager and I love my work."),
  experience: [
    role('vol', 'Volunteer Coordinator', 'Food Pantry (volunteer)', '2023-01', null, ['Coordinated a weekly schedule of 25 volunteers']),
    role('pm', 'Senior Project Manager', 'Triangle Health', '2016-03', '2020-02', ['Led the rollout of a scheduling system across 14 clinics, on time and under budget', 'Responsible for status meetings']),
    role('pc', 'Project Coordinator', 'Triangle Health', '2012', '2016', ['Kept project schedules and risk logs']),
  ],
});

test('coach: summary, headline, target, thin roles, volunteer order, year-only dates; 3 lifts; questions, never wording', () => {
  const r = coach(ledger(), { target: 'Roles where hiring teams want proof of results. Change this to the work you want next, in your own words.' });
  const by = (k) => r.suggestions.filter((s) => s.kinds.includes(k));
  for (const k of ['target', 'first-person', 'shorthand', 'thin', 'order', 'dates', 'duty', 'result']) assert.ok(by(k).length, k);
  assert.equal(by('order')[0].id, 'vol'); assert.equal(by('dates')[0].id, 'pc');
  assert.ok(r.lifts.length <= 3 && r.lifts.length > 0);
  assert.ok(r.score >= 0 && r.score <= 100);
  const known = new Set(['target', 'headline', 'summary', 'hl', 'sum', 'vol', 'pm', 'pc', 'vol-1', 'pm-1', 'pm-2', 'pc-1']);
  for (const s of r.suggestions) {
    assert.ok(known.has(s.id), s.id); assert.ok(s.why); assert.ok(s.questions.length >= 1 && s.questions.length <= 3, s.id);
    // Only an excerpt of the line as it is now; the coach never proposes new wording.
    assert.deepEqual(Object.keys(s).filter((k) => !['id', 'where', 'text', 'kinds', 'weight', 'why', 'questions'].includes(k)), []);
  }
  const txt = coachText(r);
  assert.match(txt, /Your 3 biggest lifts/); assert.match(txt, /Roughly how many\?/); assert.match(txt, /Rewrite only from the user's answers/);
});

test('coach: a strong résumé with a target scores higher than a weak one, and the user can mark a volunteer role', () => {
  const weak = coach(ledger(), { target: '' }).score;
  const L = ledger(); L.experience[0].volunteer = true; L.summary.text = 'Project manager with 8 years in healthcare operations.'; L.person.headline.text = 'Healthcare project manager';
  L.experience[1].groups[0].items.push(item('pm-3', 'Wrote the training plan, and 400+ staff were trained in 6 weeks'));
  L.experience[1].groups[0].items[1].text = 'Ran weekly status meetings for 12 clinical, IT and vendor leads, which kept the rollout on time';
  const strong = coach(L, { target: 'Project manager roles in healthcare operations' });
  assert.ok(strong.score > weak, `${strong.score} > ${weak}`);
  assert.ok(!strong.suggestions.some((s) => s.kinds.includes('order') || s.kinds.includes('first-person') || s.kinds.includes('aim')));
});

test('coach CLI and resume_coach are read-only; check lists suggestions without failing on them', () => {
  const dir = workspace('coach');
  cli(['import', path.join(ROOT, 'examples', 'sample-resume.txt')], { dir });
  const prefix = fs.readdirSync(path.join(dir, 'proposals'))[0].replace(/-\d{3}\.json$/, '');
  cli(['review', 'approve-all', prefix], { dir });
  const h = () => crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'resume', 'ledger.json'))).digest('hex');
  const before = h();
  const r = cli(['coach'], { dir }); assert.equal(r.code, 0, r.out); assert.match(r.out, /Résumé strength: \d+\/100/); assert.match(r.out, /Your 3 biggest lifts/);
  const j = JSON.parse(cli(['coach', '--json'], { dir }).out); assert.ok(Array.isArray(j.suggestions));
  assert.equal(h(), before);
  const c = cli(['check'], { dir });
  assert.match(c.out, /Suggestions \(not failures\)/);
  assert.doesNotMatch(c.out, /✗ .*[Ss]uggestion/);
});

test('proof links: https only on proposals; shown on the web page and JSON, not the PDF; evidence stays private', async () => {
  for (const bad of ['http://example.com/x', 'javascript:alert(1)', 'data:text/html,hi', 'https://exa mple.com', 'HTTPS://"onmouseover=x', 'file:///etc/passwd']) assert.equal(httpsUrl(bad), '', bad);
  assert.equal(httpsUrl('https://example.com/case-study'), 'https://example.com/case-study');
  const dir = workspace('links');
  cli(['import', path.join(ROOT, 'examples', 'sample-resume.txt')], { dir });
  const L = JSON.parse(fs.readFileSync(path.join(dir, 'resume', 'ledger.json'), 'utf8'));
  const sec = `experience.${L.experience[0].id}`;
  for (const bad of ['http://example.com/x', 'javascript:alert(1)']) {
    const r = cli(['propose', JSON.stringify({ kind: 'add', section: sec, text: 'Shipped the intake form', reason: 'x', evidence: 'user said', link: bad })], { dir });
    assert.notEqual(r.code, 0, bad); assert.match(r.out, /https/);
  }
  const ok = cli(['propose', JSON.stringify({ id: 'p-link', kind: 'add', section: sec, text: 'Shipped the intake form used by 3 clinics', reason: 'x', evidence: 'SECRET-EVIDENCE-NOTE', link: 'https://example.com/intake' })], { dir });
  assert.equal(ok.code, 0, ok.out);
  assert.match(cli(['review'], { dir }).out, /link \(public, web page\): https:\/\/example\.com\/intake/);
  assert.equal(cli(['review', 'approve', 'p-link'], { dir }).code, 0);
  const L2 = JSON.parse(fs.readFileSync(path.join(dir, 'resume', 'ledger.json'), 'utf8'));
  const web = webPage(L2); const json = JSON.stringify(jsonResume(L2));
  assert.match(web, /<a class="proof" href="https:\/\/example\.com\/intake" rel="nofollow noopener">example\.com<\/a>/);
  assert.match(json, /"x-highlight-links":\[\{"highlight":"Shipped the intake form used by 3 clinics","url":"https:\/\/example\.com\/intake"\}\]/);
  assert.doesNotMatch(printHtml(L2), /example\.com\/intake/); assert.doesNotMatch(JSON.stringify(printModel(L2)), /example\.com\/intake/);
  for (const s of [web, json, printHtml(L2)]) assert.doesNotMatch(s, /SECRET-EVIDENCE-NOTE/);
  // A link hand-edited into the ledger that isn't https is never rendered, and check names it.
  L2.experience[0].groups[0].items[0].link = 'javascript:alert(1)';
  assert.doesNotMatch(webPage(L2), /javascript:/);
  fs.writeFileSync(path.join(dir, 'resume', 'ledger.json'), JSON.stringify(L2));
  assert.match(cli(['check'], { dir }).out, /✗ proof links: https only/);
});

test('publications and talks: proposed, approved, rendered on every surface (links on the web only)', () => {
  const dir = workspace('pubs');
  const r = cli(['propose', JSON.stringify({ id: 'p-pub', kind: 'add', section: 'publications', text: 'Shared Services in Outpatient Care, MGMA Annual Conference, 2022', reason: 'from résumé', evidence: 'import', link: 'https://example.org/talk' })], { dir });
  assert.equal(r.code, 0, r.out); assert.equal(cli(['review', 'approve', 'p-pub'], { dir }).code, 0);
  const L = JSON.parse(fs.readFileSync(path.join(dir, 'resume', 'ledger.json'), 'utf8'));
  assert.equal(L.publications.length, 1);
  assert.match(printHtml(L), /<h2>Publications and talks<\/h2><ul class="pubs"><li>Shared Services in Outpatient Care, MGMA Annual Conference, 2022<\/li>/);
  assert.match(webPage(L), /MGMA Annual Conference, 2022 <a class="proof" href="https:\/\/example\.org\/talk"/);
  assert.deepEqual(printModel(L).sections.find((s) => s.title === 'Publications and talks').items, ['Shared Services in Outpatient Care, MGMA Annual Conference, 2022']);
  assert.deepEqual(jsonResume(L).publications, [{ name: 'Shared Services in Outpatient Care, MGMA Annual Conference, 2022', url: 'https://example.org/talk' }]);
  const R = { pdf_filename: 'x.pdf', limits: { linkedin: { headline: 220, about: 2600, position_description: 2000, position_title: 100 } } };
  assert.match(linkedinPacket(L, R).text, /## Publications and talks/);
});

test('volunteer roles: fix-role volunteer true lists them after paid roles; dates show months when every role has them', () => {
  const dir = workspace('vol');
  const L0 = JSON.parse(fs.readFileSync(path.join(dir, 'resume', 'ledger.json'), 'utf8'));
  L0.experience = [role('vol', 'Volunteer Coordinator', 'Pantry', '2023-01', null, ['Scheduled 25 volunteers a week']), role('pm', 'Project Manager', 'Acme', '2016-03', '2020-02', ['Led a rollout to 14 clinics'])];
  fs.writeFileSync(path.join(dir, 'resume', 'ledger.json'), JSON.stringify(L0));
  assert.ok(printHtml(L0).indexOf('Volunteer Coordinator') < printHtml(L0).indexOf('Project Manager'));
  assert.match(printHtml(L0), /Jan 2023 to present/); assert.match(printHtml(L0), /Mar 2016 to Feb 2020/);
  assert.notEqual(cli(['fix-role', 'vol', '{"volunteer":"yes"}'], { dir }).code, 0);
  const r = cli(['fix-role', 'vol', '{"volunteer":true}'], { dir }); assert.equal(r.code, 0, r.out); assert.match(r.out, /after paid roles/);
  const L = JSON.parse(fs.readFileSync(path.join(dir, 'resume', 'ledger.json'), 'utf8'));
  for (const s of [printHtml(L), webPage(L), JSON.stringify(printModel(L))]) assert.ok(s.indexOf('Project Manager') < s.indexOf('Volunteer Coordinator'));
  L.experience[1].start = '2016'; assert.match(printHtml(L), /2016 to 2020/); // one year-only role: years everywhere
  // false = the user chose to keep it where it is: first again, and the coach stops suggesting the move.
  assert.equal(cli(['fix-role', 'vol', '{"volunteer":false}'], { dir }).code, 0);
  const L3 = JSON.parse(fs.readFileSync(path.join(dir, 'resume', 'ledger.json'), 'utf8'));
  assert.ok(printHtml(L3).indexOf('Volunteer Coordinator') < printHtml(L3).indexOf('Project Manager'));
  assert.ok(!coach(L3).suggestions.some((x) => x.kinds.includes('order')));
});

test('MCP: resume_coach is listed, read-only, and resume_propose refuses a javascript: link', async () => {
  const { spawn } = await import('node:child_process');
  const dir = workspace('mcpcoach');
  const p = spawn(process.execPath, [path.join(ROOT, 'mcp', 'server.mjs')], { env: { ...process.env, LIVING_RESUME_DIR: dir, LIVING_RESUME_STATE_DIR: path.join(dir, '.state') } });
  let buf = ''; const waiting = new Map(); let n = 0;
  p.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); waiting.get(m.id)?.(m); } });
  const req = (method, params) => new Promise((res) => { const id = ++n; waiting.set(id, res); p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  await req('initialize', {});
  const names = (await req('tools/list', {})).result.tools.map((t) => t.name); assert.ok(names.includes('resume_coach'));
  const c = await req('tools/call', { name: 'resume_coach', arguments: {} }); assert.equal(c.result.isError, false); assert.match(c.result.content[0].text, /Résumé strength/);
  const extra = await req('tools/call', { name: 'resume_coach', arguments: { write: true } }); assert.equal(extra.result.isError, true);
  const bad = await req('tools/call', { name: 'resume_propose', arguments: { kind: 'add', section: 'publications', text: 'Talk', reason: 'x', evidence: 'y', link: 'javascript:alert(1)' } });
  assert.equal(bad.result.isError, true); assert.match(bad.result.content[0].text, /https/);
  p.kill();
});

let hasReportlab = true; try { execFileSync('python3', ['-c', 'import reportlab']); } catch { hasReportlab = false; }
test('PDF fallback: publications section, dates on the role line, readable order', { skip: !hasReportlab && 'reportlab not installed' }, () => {
  const L = { person: { name: 'Sam Rivera', headline: item('hl', 'Operations executive') }, experience: [role('a', 'Chief Operating Officer', 'Carolina Partners', '2021-01', null, ['Cut days in A/R from 52 to 38'])],
    publications: [item('p1', 'Shared Services in Outpatient Care, MGMA, 2022', { link: 'https://example.org/t' })], education: [item('e1', 'MBA, Emory University')] };
  const out = path.join(tmp('fbpub'), 'r.pdf');
  execFileSync('python3', [path.join(ROOT, 'engine', 'pdf', 'fallback.py'), out], { input: JSON.stringify(printModel(L)) });
  let t; try { t = execFileSync('pdftotext', [out, '-'], { encoding: 'utf8' }); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
  const flat = t.replace(/\s+/g, ' ');
  const pos = ['Sam Rivera', 'Operations executive', 'Experience', 'Chief Operating Officer', 'Education', 'Publications and talks', 'MGMA'].map((s) => flat.indexOf(s));
  assert.ok(pos.every((x, i) => x >= 0 && (i === 0 || x > pos[i - 1])), pos.join(','));
  // The dates sit on the role's own line (as a reader, and layout-aware screening, sees it).
  assert.match(execFileSync('pdftotext', ['-layout', out, '-'], { encoding: 'utf8' }), /Chief Operating Officer +Jan 2021 to present/);
  assert.doesNotMatch(t, /example\.org/);
});

test('coach readability: run-on sentences and stock résumé words', () => {
  assert.ok(kinds('Leveraged robust tooling to spearhead the migration of 40 services on time').includes('jargon'));
  const runOn = `Built the intake form and the dashboard that ${'the staff and the board use to plan '.repeat(3)}each shift and week`;
  assert.ok(runOn.length <= 200 && kinds(runOn).includes('dense'), runOn.length);
  assert.ok(!kinds('Received the All-Star Faculty Award').includes('result'), 'an award is a result');
  assert.deepEqual(kinds('Cut days in A/R from 52 to 38. Then trained two new billers.'), []);
});

test('coach contractor lens: clients, repeat work, scope; quiet when the bullets already show them', () => {
  const L = (bullets) => ({ person: { name: 'Sam Rivera', headline: item('hl', 'Designer') }, summary: item('sum', 'Designer who ships.'),
    experience: [role('c', 'Freelance Designer', 'Rivera Studio', '2019', null, bullets)] });
  const weak = coach(L(['Designed logos and websites, on time', 'Built 20 sites', 'Shipped a booking flow']));
  for (const k of ['clients', 'repeat', 'scope']) assert.ok(weak.suggestions.some((s) => s.kinds.includes(k)), k);
  const strong = coach(L(['Designed sites for small restaurants and clinics under written scopes', 'Clients stayed for years and several returned for redesigns', 'Shipped a booking flow used by 3 clinics']));
  for (const k of ['clients', 'repeat', 'scope']) assert.ok(!strong.suggestions.some((s) => s.kinds.includes(k)), k);
  const employee = coach({ ...L(['Designed logos']), experience: [role('e', 'Designer', 'Acme', '2019', null, ['Designed logos, on time'])] });
  assert.ok(!employee.suggestions.some((s) => ['clients', 'repeat', 'scope'].some((k) => s.kinds.includes(k))));
});

test('coach floor questions, and counts off (the person\'s choice) never asks how many', () => {
  const L = { person: { name: 'Sam Rivera', headline: item('hl', 'Designer') }, summary: item('sum', 'Designer.'), experience: [role('r', 'Designer', 'Acme', '2019', null, ['Wrote press releases'])] };
  const on = coach(L).suggestions.find((s) => s.id === 'r-1');
  assert.ok(on.questions.some((q) => /how many/i.test(q)) && on.questions.some((q) => /safe floor/i.test(q)), on.questions.join(' | '));
  const off = coach(L, { counts: false });
  assert.ok(off.suggestions.every((s) => s.questions.every((q) => !/how many|safe floor/i.test(q))));
  assert.ok(off.lifts.every((l) => !/number/.test(l.title)), off.lifts.map((l) => l.title).join(' | '));
});

test('coach page fit never suggests trimming recent leadership or community; points at older lines instead', () => {
  const y = new Date().getFullYear();
  const L = { person: { name: 'Sam Rivera', headline: item('hl', 'Designer') }, summary: item('sum', 'Designer.'),
    experience: [role('now', 'Design Lead', 'Acme', `${y - 2}`, null, ['Led a team of 4 designers through the redesign', 'Shipped the new checkout']),
      role('old', 'Designer', 'Beta', '2001', '2006', ['Designed print ads'])],
    volunteer: [item('v-coach', `Assistant Coach, JV Lacrosse, Spring ${y}`), item('v-old', 'Reading Tutor, 1998')] };
  const r = coach(L, { pages: 3, limit: 2 });
  const fit = r.suggestions.find((s) => s.id === 'pages');
  for (const id of ['v-coach', 'now-1', 'now']) assert.ok(fit.keep.includes(id), id);
  assert.ok(!fit.keep.includes('v-old')); assert.ok(fit.trim.includes('old-1')); assert.ok(!fit.trim.includes('now-1'));
  assert.doesNotMatch(fit.why, /volunteer work/); assert.match(fit.why, /Keep your recent leadership and community/);
  assert.match(coachText(r), /Never trim \(recent leadership and community\): .*v-coach/);
});
