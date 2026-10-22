// scout (Pro): the deterministic half of "check my résumé" (no AI, no tokens).
//   1. Reads case-study-maker events added since the last scout, across projects
//      (respects settings.json recording.paused / recording.exclude).
//   2. Keeps résumé-worthy ones (resumeSignal from case-study-maker, milestones,
//      decisions with launch/pivot/new-technique words).
//   3. Admits any job postings dropped in quarantine/in/postings/ (scan first).
//   4. Counts current market terms in approved postings.
// Output: scout/inbox.md + scout/inbox.json + scout/market-terms.json.
// The AI tool then reads ONLY these files + the ledger and writes proposals/*.json
// (see the living-resume skill). Postings are data, never instructions.
import fs from 'node:fs';
import path from 'node:path';
import { P, ROOT, readJSON, writeJSON, writeText, loadSettings, loadLedger, allItems, mdPlain, projectEventFiles, requireWorkspace } from '../lib/util.mjs';
import { admitInbound } from '../lib/quarantine.mjs';
import { requirePro } from '../lib/license.mjs';

requireWorkspace();
{ const g = await requirePro('scout'); if (!g.ok) { console.error(g.message); process.exit(3); } }
const S = loadSettings();
const state = readJSON(P('scout', 'state.json'), { lastRun: '' });
const since = process.argv.includes('--all') ? '' : state.lastRun;
const BASE_WORDS = ['launch', 'launched', 'live', 'ship', 'shipped', 'release', 'released', 'pivot', 'pivoted', 'first', 'new feature', 'new technique', 'new approach', 'mvp', 'evaluat', 'agent', 'workflow', 'security', 'audit', 'accessib'];
const reEsc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const WORDS = new RegExp(`\\b(${[...BASE_WORDS, ...(S.scout?.signalWords || [])].map(reEsc).join('|')}|v\\d+\\.0)`, 'i');

const inbox = [];
if (S.recording?.paused) console.log('Recording is paused; skipping project events.');
else {
  const root = S.projectsRoot ? path.resolve(ROOT, S.projectsRoot) : null;
  if (!root || !fs.existsSync(root)) console.log('No projectsRoot set in resume/settings.json; reading postings only.');
  const exclude = new Set(S.recording?.exclude || []);
  for (const { project: d, file: evPath } of root && fs.existsSync(root) ? projectEventFiles(root, exclude) : []) {
    for (const e of readJSON(evPath, { events: [] }).events || []) {
      if ((e.timestamp || '') <= since) continue;
      const p = e.payload || {};
      const text = [p.title, p.decision, p.rationale, p.message, p.answer].filter(Boolean).join(' — ');
      const signal = p.resumeSignal || e.type === 'milestone' || (['decision', 'reflection'].includes(e.type) && WORDS.test(text));
      if (signal && text) inbox.push({ project: d, date: (e.timestamp || '').slice(0, 10), type: e.type, text: text.slice(0, 600) });
    }
  }
}

const admitted = admitInbound('postings');
const appr = P('quarantine', 'approved', 'postings');
const terms = readJSON(P('resume', 'market-terms.json'), { terms: [] }).terms;
const counts = Object.fromEntries(terms.map((t) => [t, 0]));
let postings = 0;
if (fs.existsSync(appr)) for (const f of fs.readdirSync(appr).filter((f) => !f.endsWith('.verdict.json'))) {
  postings++; const t = fs.readFileSync(path.join(appr, f), 'utf8').toLowerCase();
  for (const term of terms) if (t.includes(term.toLowerCase())) counts[term]++;
}
const L = loadLedger(); const ledgerText = allItems(L).map((i) => mdPlain(i.text).toLowerCase()).join(' ');
const market = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([term, n]) => ({ term, postings: n, inLedger: ledgerText.includes(term.toLowerCase()) }));

writeJSON(P('scout', 'inbox.json'), inbox);
writeJSON(P('scout', 'market-terms.json'), { postings, terms: market });
const md = [`# Scout inbox · ${new Date().toISOString().slice(0, 10)}`, '', `Résumé-worthy moments since ${since || 'the beginning'}: ${inbox.length}`, '',
  ...inbox.map((i) => `- [${i.date}] **${i.project}** (${i.type}): ${i.text.replace(/\n/g, ' ')}`), '',
  `## Market language (${postings} approved postings)`, '',
  ...market.filter((m) => m.postings > 0).map((m) => `- ${m.term}: ${m.postings} posting(s)${m.inLedger ? '' : ' · not yet in your wording'}`), '',
  admitted.length ? `## Quarantine: ${admitted.filter((a) => a.clean).length} posting(s) admitted, ${admitted.filter((a) => !a.clean).length} rejected` : ''].join('\n');
writeText(P('scout', 'inbox.md'), md);
writeJSON(P('scout', 'state.json'), { lastRun: new Date().toISOString() });
console.log(md);
console.log('\nNext: ask your AI tool to "check my résumé". It reads scout/inbox.md and writes proposals for you to approve, edit, reject, or save for later.');
