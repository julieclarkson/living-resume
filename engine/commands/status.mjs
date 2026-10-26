// status: what is being recorded, what's queued, what's public, what was published, which plan.
import fs from 'node:fs';
import path from 'node:path';
import { P, ROOT, readJSON, loadLedger, loadSettings, allItems, shows, projectEventFiles, requireWorkspace } from '../lib/util.mjs';
import { lastArchive } from '../lib/history.mjs';
import { licenseState, productConfig } from '../lib/license.mjs';

requireWorkspace();
const S = loadSettings(); const L = loadLedger();
const line = (s = '') => console.log(s);
line(`WORKSPACE  ${ROOT}`);

line('\nRECORDING (what the scout may read)');
if (S.recording?.paused) line('  ⏸  Recording is PAUSED (resume/settings.json → recording.paused)');
const root = S.projectsRoot ? path.resolve(ROOT, S.projectsRoot) : null;
const excluded = new Set(S.recording?.exclude || []);
if (root && fs.existsSync(root)) {
  const all = projectEventFiles(root);
  if (!all.length) line(`  no case-study-maker projects found under ${root}`);
  for (const { project, file } of all) {
    const n = (readJSON(file, { events: [] }).events || []).length;
    line(`  ${excluded.has(project.split('/')[0]) ? '✗ excluded' : '✓ reading '}  ${project} (${n} captured events)`);
  }
} else line('  not set up (optional): set projectsRoot in resume/settings.json to the folder that holds your projects');

line('\nQUEUE');
const props = fs.existsSync(P('proposals')) ? fs.readdirSync(P('proposals')).filter((f) => f.endsWith('.json')).map((f) => readJSON(P('proposals', f), {})) : [];
const count = (s) => props.filter((p) => p.status === s).length;
line(`  waiting for review: ${count('proposed')} · incubating (later): ${count('later')} · approved: ${count('approved') + count('edited')} · rejected: ${count('rejected')}`);

const inboxDir = P('inbox');
const inbox = fs.existsSync(inboxDir) ? fs.readdirSync(inboxDir).filter((f) => f.endsWith('.json')).map((f) => readJSON(P('inbox', f), {})) : [];
line(`  inbox: ${inbox.filter((x) => x.status === 'new').length} new · ${inbox.filter((x) => x.status === 'assessed').length} assessed · ${inbox.filter((x) => x.status === 'skipped').length} skipped`);
const roleFiles = fs.existsSync(P('resume', 'roles')) ? fs.readdirSync(P('resume', 'roles')).filter((f) => f.endsWith('.json')) : [];
line(`  role profiles: ${roleFiles.length ? roleFiles.map((f) => f.replace(/\.json$/, '')).join(', ') : 'none yet'}`);

line('\nPUBLIC (how many lines on each surface; full wording in dist/public-report.md)');
const items = allItems(L);
for (const s of ['web', 'pdf', 'linkedin', 'json']) line(`  ${s.padEnd(9)} ${items.filter((i) => shows(i, s)).length} lines`);
line(`  private, application-only, or unverified: ${items.filter((i) => !(i.visibility === 'public' && i.status === 'verified')).length} lines (never published)`);

line('\nHISTORY');
const last = lastArchive();
line(last ? `  last publish: ${path.basename(last)} (archive/${path.basename(last)}/)` : '  not published yet');
if (fs.existsSync(P('CHANGELOG.md'))) line('  ' + fs.readFileSync(P('CHANGELOG.md'), 'utf8').split('\n').filter((l) => l.startsWith('- ')).slice(0, 3).join('\n  '));

const lic = licenseState(); const cfg = productConfig();
line(`\nPLAN  ${lic.tier === 'pro' ? `Pro (key ${lic.key}${lic.expiresAt ? `, until ${String(lic.expiresAt).slice(0, 10)}` : ''})` : `Free${lic.reason && lic.reason !== 'no-license' ? ` (${lic.reason})` : ''}. Pro adds more role profiles, job-by-job versions, the monthly scout, the capability statement, and removes the credit link: ${cfg.store?.checkoutUrl || cfg.homepage}`}`);
line('\nForget something everywhere: tell your AI tool "forget <item>" (it sets the item private, rebuilds, and the next publish removes it).');
