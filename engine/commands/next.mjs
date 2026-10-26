// next [--json]   the one next step, from where you are: why it matters and exactly what to say.
// Read-only. Order: get the résumé right, get it out (web page, LinkedIn), then keep it working for you
// (job matches, reaching people, follow-ups, staying current). "Also waiting" lists up to three more.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { P, readJSON, loadLedger, loadRules, requireWorkspace, today } from '../lib/util.mjs';
import { lastArchive } from '../lib/history.mjs';
import { coach } from '../lib/coach.mjs';
import { pageInfo } from '../lib/coach-pages.mjs';
import { linkedinChanges } from '../lib/linkedin-sync.mjs';

requireWorkspace();
const via = process.env.LIVING_RESUME_VIA === 'mcp';
const L = loadLedger(); const R = loadRules();
const exists = (...a) => fs.existsSync(P(...a));
const list = (...a) => (exists(...a) ? fs.readdirSync(P(...a)) : []);
const json = (...a) => readJSON(P(...a), null);
const days = (d) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / 864e5) : Infinity);
const hash = (f) => { try { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); } catch { return ''; } };

const steps = [];
const add = (when, title, why, say) => { if (when) steps.push({ title, why, say }); };

// 1. The résumé itself
const people = (L.experience || []).length + (L.skills || []).length;
const waiting = list('proposals').filter((f) => f.endsWith('.json')).map((f) => json('proposals', f)).filter((p) => p && ['proposed', 'later'].includes(p.status));
add(!people && !waiting.length, 'Bring in your LinkedIn or your current résumé', 'Everything starts from what you already have. Only your profile data is read.', 'Make my résumé from my LinkedIn (or: import my résumé)');
add(waiting.length > 0, `Review ${waiting.length} suggested line${waiting.length === 1 ? '' : 's'}`, 'Nothing reaches your résumé until you approve it.', 'Review my résumé updates');
const stamp = json('dist', '.build.json');
const built = stamp && stamp.ledger === hash(P('resume', 'ledger.json')) && stamp.rules === hash(P('resume', 'rules.json'));
add(people && !built, 'Build your résumé files', 'Your approved lines have changed since the PDF and web page were made.', 'Build my résumé');
const pi = await pageInfo();
const rubric = json('resume', 'rubric.json') || {}; const target = rubric.target || '';
const c = people ? coach(L, { target, counts: rubric.coach?.counts !== false, ...pi }) : null;
add(c && pi.pages > (pi.limit || 2), `Fit your PDF on ${pi.limit || 2} pages (it's ${pi.pages})`, 'Screeners expect two pages at most.', 'Make my résumé stronger');

const pub = (i) => !!i && i.visibility === 'public' && i.status === 'verified';
add(people && !pub(L.person?.headline), 'Add a headline under your name', 'It is the first thing a reader sees, and LinkedIn needs it before anything else.', 'Help me write my headline');

// 2. Getting it out
const last = lastArchive();
add(people && built && !last, 'Put your résumé online', 'A link you can share, and the version LinkedIn and job matches build on.', 'Put my résumé online');
const li = linkedinChanges();
const liChanged = !!li && li.changed.length > 0;
add(people && built && liChanged, li?.before ? 'Update the LinkedIn fields that changed' : 'Update your LinkedIn to match', 'Recruiters check LinkedIn first. You paste only what changed.', 'Update my LinkedIn');

// 3. Keep it working for you
const inbox = list('inbox').filter((f) => f.endsWith('.json')).map((f) => json('inbox', f)).filter((x) => x && x.status === 'new');
add(inbox.length > 0, `Assess ${inbox.length} new item${inbox.length === 1 ? '' : 's'} in your résumé inbox`, 'Work you finished may belong on your résumé. The rubric decides honestly.', 'Assess my résumé inbox');
add(c && !c.target, 'Set the job you want next', 'Your headline, summary, order, and job matches all aim at it.', 'My target is <the work you want next>');
const crit = json('resume', 'job-search.json');
const searchSet = crit && (crit.looking_for || crit.titles?.length || crit.companies?.length);
add(people && !searchSet, 'Set up your job search', 'A short list of jobs that fit, on the days you choose, scored against your approved résumé.', 'Set up my job search');
const t = json('jobs', 'today.json');
const st = { shown: {}, dismissed: {}, applied: {}, ...(json('jobs', 'state.json') || {}) };
add(searchSet && (!t || days(t.date) > 7), t ? 'Run this week\'s job search' : 'Run your first job search', t ? `Your last matches are from ${t.date}.` : 'Your criteria are saved; see what fits.', 'Find me jobs');
const open = t ? (t.matches || []).filter((m) => !st.dismissed[m.id] && !st.applied[m.id]) : [];
const notes = new Set(list('jobs', 'next').map((f) => f.replace(/\.md$/, '')));
const pick = open.find((m) => !notes.has(m.id));
add(pick, `Look at your top match: ${pick?.title} at ${pick?.company}`, `${pick?.fit}% fit (${({ high: 'strong', medium: 'good', low: 'some' })[pick?.confidence] || 'some'} overlap). Pick one, and get the posting, the person, and a note to send.`, `Help me reach someone at ${pick?.company}`);
const apps = json('applications', 'applications.json') || [];
const stale = [...apps].reverse().find((a) => a.status === 'applied' && days(a.date) >= 7 && days(a.date) <= 30 && !a.followedUp);
add(stale, `Follow up on ${stale?.company}`, `You applied ${days(stale?.date)} days ago. A short, friendly note keeps you in mind.`, `Draft a follow-up for ${stale?.company}`);
const approved = [...(L.experience || []).flatMap((r) => (r.groups || []).flatMap((g) => g.items || [])), ...(L.skills || [])].some(pub);
add(approved && c && c.score < 70 && c.lifts.length, `Make your résumé stronger (${c?.score}/100)`, `Biggest lift: ${c?.lifts[0]?.title}`, 'Make my résumé stronger');

const out = steps.slice(0, 4);
if (process.argv.includes('--json')) { console.log(JSON.stringify({ next: out[0] || null, also: out.slice(1) }, null, 2)); process.exit(0); }
if (!out.length) {
  console.log(`You're current.\nNext: when you finish something worth showing, say "add this to my résumé". Your job matches run on the days you chose.`);
  process.exit(0);
}
const [n, ...also] = out;
console.log(`NEXT: ${n.title}\n  Why: ${n.why}\n  Say: "${n.say}"`);
if (also.length) console.log(`\nAlso waiting:\n${also.map((s) => `  · ${s.title}  ("${s.say}")`).join('\n')}`);
if (!via) console.log(`\n(${today()})`);
