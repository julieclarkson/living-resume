// Coach: read-only, deterministic advice on the approved, public résumé lines.
// It never writes wording. It says what is weak, why, and which questions to ask the user,
// so the host rewrites ONLY from the user's own answers (honest approximations are fine).
import { rolesInOrder, roleShows, shows, mdPlain } from './util.mjs';

const DUTY = /^(responsible for|duties included|duties were|in charge of|worked on|worked with|helped with|helped|assisted( with)?|supported|participated in|tasked with)\b/i;
const BARE = /^(ran|run|managed|manage|handled|handle|oversaw|oversee|coordinated|coordinate|kept|maintained|did|performed|was)\b/i;
const OUTCOME = /\b(increas\w*|grew|grow|cut|cuts|reduc\w*|rais\w*|sav\w*|improv\w*|launch\w*|shipped|deliver\w*|won|became|adopted|went (up|down)|from .{1,40} to|on time|under budget|within|doubl\w*|tripl\w*|now use\w*|still use\w*|used by|turned around|opened|built|created|introduced|consolidated|stood up|led the|so that|which|resulting|record|first)\b|%/i;
const NUMBER = /\d|\b(one|two|three|four|five|six|seven|eight|nine|ten|dozen|hundred|thousand)\b/i;
const VAGUE = /\b(various|etc\.?|many|misc\.?|miscellaneous|numerous|several|stuff|things|and more)(?=$|[\s.,;:)])/i;
const FIRST = /\b(I|I'm|I’m|I've|I’ve|I'd)(?=$|[\s.,;:!?])|\b(my|me)\b/i;
const SHORTHAND = /\s[|+/]\s|\s\|/;
const LONG = 200; // about two lines at PDF width
const DEFAULT_TARGET = /Change this to the work you want next/i;
const STOP = new Set(['and', 'or', 'the', 'a', 'an', 'of', 'for', 'in', 'at', 'to', 'with', 'on', 'roles', 'role', 'jobs', 'job', 'work', 'small', 'focused', 'multi', 'site']);

const Q = {
  duty: ['What changed because you did this?', 'Roughly how many (people, projects, dollars, sites)?', 'What would have happened without you?'],
  result: ['Roughly how many?', 'What changed afterward?', 'Who used it?'],
  outcome: ['What changed afterward?', 'What would have happened without you?'],
  vague: ['Which ones, specifically? Name two or three.', 'Roughly how many?'],
  long: ['Which part of this matters most for the work you want next?'],
};
const WHY = {
  duty: 'Starts with a duty or helper phrase ("responsible for", "helped", "worked on"), so your own part and its result are unclear.',
  result: 'No number, scale, or result, so a reader can\'t tell how big it was or how well it went.',
  outcome: 'Shows what you handled, but not what changed because of you.',
  vague: 'A vague word ("various", "etc", "many") where a specific would be stronger.',
  long: 'Over two lines. Readers skim; one idea per bullet reads faster.',
};

/** Issues in one experience bullet: [{ kind, weight }], most serious first. */
export function bulletIssues(text) {
  const t = mdPlain(text).trim(); const out = [];
  if (DUTY.test(t)) out.push({ kind: 'duty', weight: 3 });
  else if (!NUMBER.test(t) && !OUTCOME.test(t)) out.push({ kind: 'result', weight: 3 });
  else if (BARE.test(t) && !OUTCOME.test(t)) out.push({ kind: 'outcome', weight: 1 });
  if (VAGUE.test(t)) out.push({ kind: 'vague', weight: 2 });
  if (t.length > LONG) out.push({ kind: 'long', weight: 1 });
  return out;
}

const pub = (i) => !!i && i.visibility === 'public' && i.status === 'verified';
const words = (s) => new Set(String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
const clip = (s, n = 90) => { const t = mdPlain(s).replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const hasMonth = (d) => /^\d{4}-\d{2}$/.test(String(d || ''));
const isVolunteerRole = (r) => /\bvolunteer/i.test(`${r.title || ''} ${r.org || ''}`);

function lineSuggestions(roles) {
  const out = []; let n = 0; let good = 0;
  for (const r of roles) for (const it of r.items) {
    n++; const issues = bulletIssues(it.text);
    if (!issues.length) { good++; continue; }
    if (issues.every((x) => x.weight <= 1)) good += 0.5;
    out.push({ id: it.id, where: `${r.title}${r.org ? `, ${r.org}` : ''}`, text: clip(it.text), kinds: issues.map((x) => x.kind), weight: issues.reduce((a, x) => a + x.weight, 0),
      why: issues.map((x) => WHY[x.kind]).join(' '), questions: [...new Set(issues.flatMap((x) => Q[x.kind]))].slice(0, 3) });
  }
  return { out, n, good };
}

function topSuggestions(L, target) {
  const out = []; const p = L.person || {};
  const hl = pub(p.headline) ? mdPlain(p.headline.text) : '';
  if (!target) out.push({ id: 'target', where: 'Target', kinds: ['target'], weight: 4, why: 'No target yet, so nothing on the page is aimed at the job you want.', questions: ['What work do you want next, in your own words?', 'Which job titles would you search for?'] });
  if (!hl) out.push({ id: 'headline', where: 'Headline', kinds: ['headline'], weight: 3, why: 'No headline under your name. It is the first thing a reader sees.', questions: ['Which job title should a reader see first?'] });
  else {
    if (SHORTHAND.test(` ${hl} `)) out.push({ id: p.headline.id, where: 'Headline', text: clip(hl), kinds: ['shorthand'], weight: 2, why: 'Shorthand symbols (| + /) read like notes. A plain phrase reads better.', questions: ['Which job title should a reader see first?', 'What one strength should follow it?'] });
    const tw = words(target); if (target && tw.size && ![...words(hl)].some((w) => tw.has(w))) out.push({ id: p.headline.id, where: 'Headline', text: clip(hl), kinds: ['aim'], weight: 3, why: `Your headline doesn't name the work you want next ("${clip(target, 70)}").`, questions: ['Which title from your target fits you truthfully?'] });
  }
  const sum = pub(L.summary) ? mdPlain(L.summary.text) : '';
  if (!sum) out.push({ id: 'summary', where: 'Summary', kinds: ['summary'], weight: 2, why: 'No summary. Two or three plain sentences aimed at your target help a reader place you.', questions: ['What do you want a hiring manager to know first?', 'What are you best at, with one example?'] });
  else if (FIRST.test(sum)) out.push({ id: L.summary.id, where: 'Summary', text: clip(sum), kinds: ['first-person'], weight: 3, why: 'Written in the first person ("I", "my"). Résumés read better without it, with the same facts.', questions: ['Is it okay to write it without "I" or "my", same facts?'] });
  if (sum && VAGUE.test(sum)) out.push({ id: L.summary.id, where: 'Summary', text: clip(sum), kinds: ['vague'], weight: 1, why: WHY.vague, questions: Q.vague });
  return out;
}

function shapeSuggestions(roles) {
  const out = []; const paid = roles.filter((r) => !isVolunteerRole(r) && r.volunteer !== true);
  for (const r of paid.slice(0, 2)) if (r.items.length < 3) out.push({ id: r.id, where: `${r.title}${r.org ? `, ${r.org}` : ''}`, kinds: ['thin'], weight: r.items.length <= 1 ? 4 : 3,
    why: `Only ${r.items.length} bullet${r.items.length === 1 ? '' : 's'} on a recent role. Recent roles carry the most weight; 3 to 5 bullets is typical.`, questions: ['What else did you own in this role?', 'What are you proudest of from this job?', 'Roughly how many people, sites, or dollars did it touch?'] });
  const firstPaid = roles.findIndex((r) => paid.includes(r));
  roles.forEach((r, i) => { if (firstPaid >= 0 && i < firstPaid && isVolunteerRole(r) && r.volunteer === undefined) out.push({ id: r.id, where: `${r.title}${r.org ? `, ${r.org}` : ''}`, kinds: ['order'], weight: 3,
    why: 'A volunteer role is listed above your paid roles, so your strongest work is pushed down.', questions: ['Do you want this listed after your paid roles? (Your call; it can stay first if it is the work you want next.)'] }); });
  if (roles.some((r) => hasMonth(r.start))) for (const r of roles.filter((x) => !hasMonth(x.start) || (x.end && !hasMonth(x.end)))) out.push({ id: r.id, where: `${r.title}${r.org ? `, ${r.org}` : ''}`, kinds: ['dates'], weight: 1,
    why: 'Year-only dates here while other roles have months. With months on every role, dates show as "Mar 2021 to present".', questions: ['Do you remember the start and end months for this role? If not, it stays as years.'] });
  return out;
}

const LIFT = {
  target: (s) => `Set your target, so the headline, summary, and order aim at the job you want.`,
  aim: () => 'Aim your headline at your target.',
  headline: () => 'Add a headline under your name.',
  shorthand: () => 'Turn the headline into a plain phrase (no | + /).',
  summary: () => 'Add a short summary aimed at your target.',
  'first-person': () => 'Rewrite the summary without "I", same facts.',
  thin: (s) => `Add depth to ${s.length === 1 ? s[0].where : `${s.length} recent roles`} (3 to 5 bullets each).`,
  order: () => 'List the volunteer role after your paid roles.',
  result: (s) => `Show a number or result in ${s.length} bullet${s.length === 1 ? '' : 's'}.`,
  duty: (s) => `Turn ${s.length} duty bullet${s.length === 1 ? '' : 's'} into what you did and what changed.`,
  outcome: (s) => `Say what changed in ${s.length} bullet${s.length === 1 ? '' : 's'} that only show size.`,
  vague: (s) => `Replace vague words in ${s.length} line${s.length === 1 ? '' : 's'}.`,
  long: (s) => `Trim ${s.length} long bullet${s.length === 1 ? '' : 's'} to two lines.`,
  dates: (s) => `Add months to ${s.length} role${s.length === 1 ? '' : 's'}, if you know them.`,
};

/** The three biggest lifts: suggestions grouped by kind, ranked by total weight. */
function lifts(all) {
  const by = new Map();
  for (const s of all) { const k = s.kinds[0]; if (!by.has(k)) by.set(k, []); by.get(k).push(s); }
  return [...by].map(([k, list]) => ({ kind: k, title: LIFT[k] ? LIFT[k](list) : k, ids: [...new Set(list.map((x) => x.id))], impact: Math.min(['dates', 'long'].includes(k) ? 2 : 99, list.reduce((a, x) => a + x.weight, 0)) + (['target', 'thin', 'order', 'aim'].includes(k) ? 3 : 0) }))
    .sort((a, b) => b.impact - a.impact).slice(0, 3);
}

/** 40 points for the page's shape: target, headline, summary, depth of recent roles, order, dates. */
function structureScore(roles, tgt, has) {
  const part = (missing, issue) => (has(missing) ? 0 : issue.some(has) ? 3 : 6);
  const recent = roles.filter((r) => !isVolunteerRole(r) && r.volunteer !== true).slice(0, 2);
  const depth = recent.length ? recent.reduce((a, r) => a + Math.min(r.items.length, 3) / 3, 0) * (10 / recent.length) : 0;
  return (tgt ? 6 : 0) + part('headline', ['shorthand', 'aim']) + part('summary', ['first-person']) + depth + (has('order') ? 0 : 6) + (has('dates') ? 3 : 6);
}

/** Read-only coach report for a ledger. target = the rubric target (or ''). */
export function coach(L, { target = '' } = {}) {
  const tgt = DEFAULT_TARGET.test(target || '') ? '' : String(target || '').trim();
  const roles = rolesInOrder(L).filter((r) => roleShows(r, 'pdf')).map((r) => ({ ...r, items: (r.groups || []).flatMap((g) => (g.items || []).filter((i) => shows(i, 'pdf'))) }));
  const lines = lineSuggestions(roles);
  const top = topSuggestions(L, tgt); const shape = shapeSuggestions(roles);
  const has = (k) => [...top, ...shape].some((s) => s.kinds.includes(k));
  const score = Math.max(0, Math.min(100, Math.round((lines.n ? (60 * lines.good) / lines.n : 0) + structureScore(roles, tgt, has))));
  const suggestions = [...top, ...shape, ...lines.out.sort((a, b) => b.weight - a.weight)];
  return { score, target: tgt, bullets: lines.n, lifts: lifts([...top, ...shape, ...lines.out]), suggestions };
}

/** Plain-words report (CLI and MCP). */
export function coachText(r) {
  const out = [`Résumé strength: ${r.score}/100. Read-only: nothing on your résumé changed.`, r.target ? `Aimed at: ${r.target}` : 'No target set yet.', '', 'Your 3 biggest lifts'];
  if (!r.lifts.length) out.push('  Nothing big left. Every approved line shows what you did and what changed.');
  r.lifts.forEach((l, i) => out.push(`  ${i + 1}. ${l.title}  (${l.ids.slice(0, 6).join(', ')}${l.ids.length > 6 ? ', …' : ''})`));
  if (r.suggestions.length) out.push('', `Line by line (${r.suggestions.length})`);
  for (const s of r.suggestions) {
    out.push(`● ${s.id}  [${s.where}]${s.text ? `  "${s.text}"` : ''}`, `  Why: ${s.why}`, `  Ask: ${s.questions.join(' · ')}`);
  }
  out.push('', 'Rewrite only from the user\'s answers (honest approximations like "about 40" or "15+" are fine). If they don\'t know, leave the line as it is.');
  return out.join('\n');
}
