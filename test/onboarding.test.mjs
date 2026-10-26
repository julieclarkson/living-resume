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

test('publish --mark records the version; linkedin then shows only what changed', { skip: !hasReportlab && 'reportlab not installed' }, () => {
  const dir = ready();
  cli(['build'], { dir, env: noChrome });
  assert.match(cli(['linkedin'], { dir }).out, /First time/);
  const m = cli(['publish', '--mark'], { dir, env: noChrome }); assert.equal(m.code, 0, m.out);
  assert.equal(fs.readdirSync(path.join(dir, 'archive')).length, 1);
  assert.match(cli(['linkedin'], { dir }).out, /Nothing on LinkedIn needs to change/);
  const lp = path.join(dir, 'resume', 'ledger.json'); const L = JSON.parse(fs.readFileSync(lp, 'utf8'));
  L.person.headline.text = 'Senior Product Designer and Front-End Developer'; fs.writeFileSync(lp, JSON.stringify(L));
  cli(['build'], { dir, env: noChrome });
  const out = cli(['linkedin'], { dir }).out;
  assert.match(out, /1 LinkedIn field\(s\) changed/); assert.match(out, /Headline/); assert.match(out, /Senior Product Designer and Front-End Developer/);
});

test('publish --mark refuses when checks fail', () => {
  const dir = workspace('mark-fail');
  assert.notEqual(cli(['publish', '--mark'], { dir }).code, 0);
  assert.ok(!fs.existsSync(path.join(dir, 'archive')) || fs.readdirSync(path.join(dir, 'archive')).length === 0);
});
