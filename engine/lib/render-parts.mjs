// Small shared pieces for the renderers: role dates, public proof links, publications and talks.
import { esc, mdPlain, shows, roleShows, fmtMonth, fmtYears, httpsUrl, hostOf, allItems } from './util.mjs';

const month = (d) => /^\d{4}-\d{2}$/.test(String(d || ''));
/** Dates for a role list: "Mar 2021 to present" when every shown role has months, else "2021 to present".
 *  A person can choose with ledger "dateStyle": "years" (always years) or "months" (months wherever known). */
export function dateFormat(L, S) {
  const shown = (L.experience || []).filter((r) => roleShows(r, S));
  const all = L.dateStyle === 'years' ? false : shown.length && shown.every((r) => month(r.start) && (!r.end || month(r.end)));
  if (L.dateStyle === 'months') return (r) => `${month(r.start) ? fmtMonth(r.start) : String(r.start || '').slice(0, 4)} to ${r.end ? (month(r.end) ? fmtMonth(r.end) : String(r.end).slice(0, 4)) : 'present'}`;
  return (r) => (all ? `${fmtMonth(r.start)} to ${r.end ? fmtMonth(r.end) : 'present'}` : fmtYears(r.start, r.end));
}
/** A line's public proof link on the web page: " · <a>host</a>" (https only; never in the PDF body). */
export const proofHtml = (i) => { const u = httpsUrl(i?.link); return u ? ` <a class="proof" href="${esc(u)}" rel="nofollow noopener">${esc(hostOf(u) || 'link')}</a>` : ''; };
/** Public publications and talks on a surface: [{ text, link }]. */
export const publications = (L, S) => (L.publications || []).filter((i) => shows(i, S)).map((i) => ({ text: mdPlain(i.text), link: httpsUrl(i.link) }));
export const pubHeading = (L) => (L.headings && L.headings.publications) || 'Publications and talks';
/** The section as HTML (links only on the web; wrap in <section> for the print page). */
export function pubSectionHtml(L, S, { links = false, wrap = false } = {}) {
  const list = (L.publications || []).filter((i) => shows(i, S));
  if (!list.length) return '';
  const html = `<h2>${esc(pubHeading(L))}</h2><ul class="pubs">${list.map((i) => `<li>${esc(mdPlain(i.text))}${links ? proofHtml(i) : ''}</li>`).join('')}</ul>`;
  return wrap ? `<section>${html}</section>` : html;
}

// ── "What's public now" report ───────────────────────────────────────────
export function publicReport(L) {
  const items = allItems(L);
  const surfaces = ['web', 'pdf', 'linkedin', 'json'];
  const lines = [`# What's public now · ${new Date().toISOString().slice(0, 10)}\n`, `Every line below is live (or will be at the next publish) on the listed surfaces. Private evidence notes are never exported.\n`];
  for (const s of surfaces) {
    const list = items.filter((i) => shows(i, s));
    lines.push(`## ${s.toUpperCase()} (${list.length} lines)\n`);
    for (const i of list) lines.push(`- \`${i.id}\` ${mdPlain(i.text).slice(0, 160)}${i.text.length > 160 ? '…' : ''}`);
    lines.push('');
  }
  const priv = items.filter((i) => i.visibility !== 'public' || i.status !== 'verified');
  lines.push(`## Not public (${priv.length})\n`);
  for (const i of priv) lines.push(`- \`${i.id}\` [${i.visibility}/${i.status}] ${mdPlain(i.text).slice(0, 120)}…`);
  return lines.join('\n') + '\n';
}
