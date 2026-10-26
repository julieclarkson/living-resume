// How well one posting fits each version of your résumé. Used by `apply` (one job) and `jobs` (many).
// Only approved, public lines count. Nothing here writes anything about you.
//
//   fit         share of the posting's key terms your version's PDF lines already use (0–100)
//   elsewhere   key terms on your résumé, but not in this version (reorder or include lines)
//   missing     key terms on none of your approved lines (only add if true, with evidence)
import { allItems, mdPlain } from './util.mjs';
import { applyRole } from './roles.mjs';

const STOP = new Set(`the and for with you your our are will this that from have has can who into all any per not but use using work team role able also more than they them their its was were what when where which how about over such each other new etc
we us a an or of to in on at by as is be it if so do does did may must should would could within across including include includes plus via based like well help helping make makes
experience experiences years year strong excellent great good ability skills skill knowledge understanding working works job jobs position candidate candidates ideal looking seeking join company companies
opportunity opportunities employer equal benefits benefit salary pay range compensation bonus equity insurance dental vision medical health 401k pto paid time off holidays leave parental
apply application applicants applicant hiring hire hired status gender race religion color national origin age disability veteran sexual orientation identity protected law laws accommodation accommodations
please email resume cover letter location locations based office offices hybrid onsite remote full-time part-time contract contractor day days week weeks month months hour hours
responsibilities requirements qualifications preferred required bonus nice what's who you'll we're you're it's that's don't team's company's day-to-day
about role responsibilities you'll will be the best people world mission culture values customers customer product products
grow run ship drive own create deliver partner collaborate collaboration support ensure provide build building built develop developing interfaces interface
expertise proficiency proficient familiarity familiar fully hands-on passionate passion fast-paced environment world-class cross-functional stakeholders deep solid proven track record
senior junior mid-level staff principal production high quality impact impactful scale scalable modern complex end-to-end closely variety wide range various ideally preferably`.split(/\s+/));

// Light stemming so "systems" matches "system" and "designing" matches "design".
const stem = (w) => w.length > 5 && w.endsWith('ing') ? w.slice(0, -3) : w.length > 4 && w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.length > 4 && w.endsWith('ed') && !w.endsWith('eed') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') && !/(ss|us|is)$/.test(w) ? w.slice(0, -1) : w;

// Words in a text, minus stopwords and posting boilerplate.
const words = (s) => (String(s).toLowerCase().match(/[a-z][a-z0-9+.#-]{2,}/g) || []).map((w) => w.replace(/[.-]+$/, '')).filter((w) => w.length > 2 && !STOP.has(w) && !STOP.has(stem(w)));
export const terms = (s) => words(s).map(stem);
export const termSet = (s) => new Set(terms(s));

// The verified, public text of a ledger (or one role's version of it) on one surface.
export const verifiedText = (L, surface = 'pdf') => allItems(L)
  .filter((i) => i.visibility === 'public' && i.status === 'verified' && (!surface || (i.surfaces || []).includes(surface)))
  .map((i) => mdPlain(i.text)).concat(surface ? [] : [L.person?.headline?.text || '']).join(' ');

// The posting's key terms: the words it repeats most (ties keep first appearance).
// Returned in the posting's own wording ("systems", not the stem "system").
export function keyTerms(posting, n = 25, skip = []) {
  const skipSet = new Set(skip.flatMap((s) => terms(s)));
  const counts = new Map(); const shown = new Map();
  for (const w of words(posting)) { const k = stem(w); if (skipSet.has(k)) continue; counts.set(k, (counts.get(k) || 0) + 1); if (!shown.has(k)) shown.set(k, w); }
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => ({ k, w: shown.get(k) }));
}

// Every version (the main résumé plus each valid role profile), best fit first.
export function rankVersions(L, roles, posting, { skip = [] } = {}) {
  const top = keyTerms(posting, 25, skip);
  const all = termSet(verifiedText(L, null));
  const versions = [{ slug: '', name: 'Main résumé', V: L }];
  for (const r of roles) { try { versions.push({ slug: r.slug, name: r.name || r.slug, V: applyRole(L, r) }); } catch { /* invalid roles are reported by check */ } }
  return versions.map((v) => {
    const have = termSet(`${verifiedText(v.V, 'pdf')} ${v.V.person?.headline?.text || ''}`);
    const pick = (f) => top.filter(f).map((t) => t.w);
    const covered = pick((t) => have.has(t.k));
    const elsewhere = pick((t) => !have.has(t.k) && all.has(t.k));
    const missing = pick((t) => !all.has(t.k));
    return { ...v, top: top.map((t) => t.w), covered, elsewhere, missing, fit: top.length ? Math.round((100 * covered.length) / top.length) : 0 };
  }).sort((a, b) => b.fit - a.fit || (a.slug ? 1 : 0) - (b.slug ? 1 : 0));
}
