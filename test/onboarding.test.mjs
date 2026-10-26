// Works without Chrome (Cowork, ChatGPT), ready-to-upload site folder, publish --mark, LinkedIn changes only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { cli, workspace, ROOT } from './helpers.mjs';

const SAMPLE = path.join(ROOT, 'examples', 'sample-resume.txt');
let hasReportlab = true; try { execFileSync('python3', ['-c', 'import reportlab']); } catch { hasReportlab = false; }
const ready = () => {
  const dir = workspace('onb'); cli(['import', SAMPLE], { dir });
  cli(['review', 'approve-all', fs.readdirSync(path.join(dir, 'proposals'))[0].replace(/-\d{3}\.json$/, '')], { dir });
  return dir;
};
const noChrome = { LIVING_RESUME_NO_CHROME: '1' };

test('without Chrome: the PDF is made by the fallback, readable, and passes every check', { skip: !hasReportlab && 'reportlab not installed' }, () => {
  const dir = ready();
  const b = cli(['build'], { dir, env: noChrome }); assert.equal(b.code, 0, b.out); assert.match(b.out, /made without Chrome/);
  const pdf = path.join(dir, 'dist', 'Sam_Rivera_Resume.pdf'); assert.ok(fs.existsSync(pdf));
  const c = cli(['check'], { dir, env: noChrome }); assert.equal(c.code, 0, c.out);
  assert.match(c.out, /✓ PDF: ≤ 2 pages/);
});

test('build makes dist/site/ ready to upload; publish with no target explains the three ways', { skip: !hasReportlab && 'reportlab not installed' }, () => {
  const dir = ready();
  assert.equal(cli(['build'], { dir, env: noChrome }).code, 0);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'dist', 'site')).sort(), ['Sam_Rivera_Resume.pdf', 'index.html', 'resume.json']);
  const p = cli(['publish'], { dir, env: noChrome }); assert.equal(p.code, 0, p.out);
  assert.match(p.out, /app\.netlify\.com\/drop/); assert.match(p.out, /publish --mark/);
});

test('publish --mark archives; linkedin shows only what changed since linkedin --done', { skip: !hasReportlab && 'reportlab not installed' }, () => {
  const dir = ready();
  cli(['build'], { dir, env: noChrome });
  assert.match(cli(['linkedin'], { dir }).out, /First time/);
  const m = cli(['publish', '--mark'], { dir, env: noChrome }); assert.equal(m.code, 0, m.out);
  assert.equal(fs.readdirSync(path.join(dir, 'archive')).length, 1);
  assert.match(cli(['linkedin'], { dir }).out, /First time/);
  assert.equal(cli(['linkedin', '--done'], { dir }).code, 0);
  const same = cli(['linkedin'], { dir }).out;
  assert.match(same, /Nothing on LinkedIn needs to change/); assert.doesNotMatch(same, /linkedin --done/);
  const lp = path.join(dir, 'resume', 'ledger.json'); const L = JSON.parse(fs.readFileSync(lp, 'utf8'));
  L.person.headline.text = 'Senior Product Designer and Front-End Developer'; fs.writeFileSync(lp, JSON.stringify(L));
  cli(['build'], { dir, env: noChrome });
  const out = cli(['linkedin'], { dir }).out;
  assert.match(out, /1 LinkedIn field\(s\) changed/); assert.match(out, /Headline/); assert.match(out, /Senior Product Designer and Front-End Developer/);
  assert.match(out, /linkedin --done/);
});

test('publish --mark refuses when checks fail', () => {
  const dir = workspace('mark-fail');
  assert.notEqual(cli(['publish', '--mark'], { dir }).code, 0);
  assert.ok(!fs.existsSync(path.join(dir, 'archive')) || fs.readdirSync(path.join(dir, 'archive')).length === 0);
});

test('without pandoc: build says how to get the Word file instead of a bare skip', { skip: !hasReportlab && 'reportlab not installed' }, () => {
  const dir = ready(); const bin = path.join(dir, '..', 'bin'); fs.mkdirSync(bin);
  fs.symlinkSync(execFileSync('sh', ['-c', 'command -v python3'], { encoding: 'utf8' }).trim(), path.join(bin, 'python3'));
  const b = cli(['build'], { dir, env: { ...noChrome, PATH: bin } }); assert.equal(b.code, 0, b.out);
  assert.match(b.out, /Word file \(DOCX\) not made here: it needs pandoc/); assert.match(b.out, /dist\/resume-print\.html/);
  assert.ok(fs.existsSync(path.join(dir, 'dist', 'resume-print.html')));
});

test('no PDF engine at all: build says how to print the PDF and never offers to send one', () => {
  const dir = ready(); const bin = path.join(dir, '..', 'emptybin'); fs.mkdirSync(bin);
  const b = cli(['build'], { dir, env: { ...noChrome, PATH: bin } });
  assert.match(b.out, /PDF not made here\. Open dist\/resume-print\.html in a browser and choose Print, then Save as PDF\./);
  assert.doesNotMatch(b.out, /send the PDF/);
  assert.ok(fs.existsSync(path.join(dir, 'dist', 'resume-print.html')));
});

test('a PDF that cannot be read here: import asks the AI to read it and import the text', () => {
  const dir = ready(); const bin = path.join(dir, '..', 'emptybin2'); fs.mkdirSync(bin);
  const f = path.join(dir, '..', 'cv.pdf'); fs.writeFileSync(f, '%PDF-1.4\n');
  const r = cli(['import', f], { dir, env: { PATH: bin } });
  assert.notEqual(r.code, 0); assert.match(r.out, /I can't read PDFs on this computer\. Ask your AI to read the PDF and import its text\./);
  assert.doesNotMatch(r.out, /brew|poppler/);
});
