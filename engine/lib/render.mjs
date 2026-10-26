import fs from 'node:fs';
// Renderers: ledger → print HTML, web preview HTML, JSON Resume, LinkedIn packet,
// "What's public now" report, capability statement. One source, every format.
import { rolesInOrder, esc, mdHtml, mdPlain, fmtRange, fmtMonth, fmtYears, shows, roleShows, monthYear, allItems, links, hostOf, safeUrl } from './util.mjs';

// The site's font, embedded so the PDF looks the same on any machine (no network needed).
// Instrument Sans, SIL Open Font License 1.1.
const FONT_FILE = new URL('../assets/instrument-sans.woff2', import.meta.url);
const FONT = fs.existsSync(FONT_FILE)
  ? `<style>@font-face{font-family:'Instrument Sans';src:url(data:font/woff2;base64,${fs.readFileSync(FONT_FILE).toString('base64')}) format('woff2');font-weight:400 700;font-style:normal}</style>`
  : '<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;600;700&display=swap" rel="stylesheet">';

// ── Print / PDF (same order and plain voice as the web page) ─────────────
// A trailing mention of the portfolio's site ("…on example.com.") becomes a link to the portfolio.
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const linkify = (text, url) => {
  const u = safeUrl(url); const host = hostOf(u);
  return u && host ? esc(text).replace(new RegExp(`${reEsc(esc(host))}(?=\\.?$)`), `<a href="${esc(u)}">${esc(host)}</a>`) : esc(text);
};
const H = (L, k, d) => esc((L.headings && L.headings[k]) || d);
const place = (p) => [p.location?.city, p.location?.region].filter(Boolean).join(', ');
// The school only when the education line doesn't already name it ("BS Biology, UT Austin" + "UT Austin").
const school = (e) => (e.institution && !String(e.text || '').toLowerCase().includes(String(e.institution).toLowerCase()) ? e.institution : '');
// A skills group labelled like the section itself ("Skills" under "Skills") shows no label.
const skillLabel = (L, s) => { const n = String(s.name || '').trim().toLowerCase(); return n && n !== 'skills' && n !== String(L.headings?.skills || 'Skills').trim().toLowerCase() ? s.name : ''; };
export function printHtml(L, { surface = 'pdf', title } = {}) {
  const p = L.person; const S = surface;
  const work = links(L).portfolio;
  const roles = rolesInOrder(L).filter((r) => roleShows(r, S)).map((r) => {
    const items = (r.groups || []).flatMap((g) => (g.items || []).filter((i) => shows(i, S)));
    return `<div class="job"><h3 class="role"><span>${esc(r.title)}</span><span class="when">${fmtYears(r.start, r.end)}</span></h3><p class="org">${esc([r.org, r.location].filter(Boolean).join(', '))}</p><ul>${items.map((i) => `<li>${linkify(mdPlain(i.text), work)}</li>`).join('')}</ul></div>`;
  }).join('\n');
  const how = (L.howIWork?.items || []).filter((i) => shows(i, S)).map((i) => `<li>${esc(i.text)}</li>`).join('');
  const skills = (L.skills || []).filter((i) => shows(i, S)).map((s) => (skillLabel(L, s) ? `<dt>${esc(s.name)}</dt><dd>${esc(s.text)}</dd>` : `<dd class="wide">${esc(s.text)}</dd>`)).join('');
  const edu = (L.education || []).filter((i) => shows(i, S)).map((e) => `<p><b>${esc(e.text)}</b>${school(e) ? `, ${esc(school(e))}` : ''}${e.note ? `<br><span class="note">${esc(e.note)}</span>` : ''}</p>`).join('');
  const certs = (L.certifications || []).filter((i) => shows(i, S)).map((c) => `<li>${esc(c.text)}</li>`);
  const vol = (L.volunteer || []).filter((i) => shows(i, S)).map((v) => `<li>${esc(v.text)}</li>`).join('');
  const where = place(p); const remote = p.location?.remote !== false;
  const contact = [where ? esc(`${where}${remote ? ' and remote' : ''}`) : (remote ? 'Remote' : ''), p.email ? `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : '', safeUrl(p.url) ? `<a href="${esc(p.url)}">${esc(p.url.replace(/^https?:\/\//, ''))}</a>` : '',
    ...(p.profiles || []).filter((x) => ['LinkedIn', 'GitHub'].includes(x.network) && safeUrl(x.url)).map((x) => `<a href="${esc(x.url)}">${esc(x.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a>`)].filter(Boolean).map((x) => `<span>${x}</span>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title || `${p.name} - Résumé`)}</title>${FONT}
<style>
@page{size:Letter;margin:.55in .65in}*{box-sizing:border-box}
body{font-family:'Instrument Sans',Arial,sans-serif;color:#3A3733;font-size:10pt;line-height:1.42;margin:0}
a{color:inherit;text-decoration:none}b,h1,h3{color:#1A1917}
h1{font-size:22pt;font-weight:600;letter-spacing:-.01em;margin:0 0 6px}
.title{font-size:12pt;font-weight:500;color:#1A1917;margin:0}.sub{color:#635E56;margin:3px 0 0}
.avail{color:#1A1917;font-weight:500;margin:12px 0 8px}
.contact{display:flex;flex-wrap:wrap;gap:2px 16px;font-size:9.4pt;color:#635E56;margin:0}
.summary{margin:16px 0 0}.summary+.summary{margin-top:9px}
h2{break-after:avoid;font-size:10.5pt;font-weight:600;color:#1A1917;border-top:1px solid #D6D1C8;padding-top:8px;margin:18px 0 7px}
.job{margin:0 0 8px}.role{display:flex;justify-content:space-between;gap:12px;margin:0;font-size:10.5pt;font-weight:600;break-after:avoid}
.when{white-space:nowrap;font-weight:400;color:#635E56;font-size:9.6pt}.org{margin:0 0 2px;color:#635E56;font-size:9.6pt}
ul{margin:2px 0 0;padding-left:15px}li{margin:0 0 4px}p{margin:0}
dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 14px;margin:0}dt{font-weight:600;color:#1A1917}dd{margin:0}dd.wide{grid-column:1/-1}
.edu p{margin:0 0 4px}.edu .certs{margin:0 0 4px}.note{color:#635E56}.vol{columns:2;column-gap:24px}.vol li{margin-bottom:2px;break-inside:avoid}
section{break-inside:avoid}
</style></head><body>
<h1>${esc(p.name)}</h1>
${shows(p.headline, S) ? `<p class="title">${esc(p.headline.text)}</p>` : ''}
${shows(p.subline, S) ? `<p class="sub">${esc(p.subline.text)}</p>` : ''}
${shows(p.availability, S) ? `<p class="avail">${esc(p.availability.text)}</p>` : ''}
<p class="contact">${contact}</p>
${shows(L.summary, S) ? L.summary.text.split(/\n\n/).map((t) => `<p class="summary">${esc(t)}</p>`).join('') : ''}
<h2>${H(L, 'experience', 'Experience')}</h2>
${roles}
${how ? `<section><h2>${H(L, 'howIWork', 'How I work')}</h2><ul>${how}</ul>${L.howIWork.note ? `<p class="note" style="margin-top:4px">${linkify(L.howIWork.note, L.howIWork.noteLink)}</p>` : ''}</section>` : ''}
${skills ? `<section><h2>${H(L, 'skills', 'Skills')}</h2><dl>${skills}</dl></section>` : ''}
${edu || certs.length ? `<section class="edu"><h2>${H(L, 'education', 'Education')}</h2>${edu}${certs.length ? `${edu ? '<p><b>Certificates</b></p>' : ''}<ul class="certs">${certs.join('')}</ul>` : ''}</section>` : ''}
${vol ? `<section><h2>${H(L, 'community', 'Community and volunteer')}</h2><ul class="vol">${vol}</ul></section>` : ''}
${S === 'web' && shows(L.interests, S) ? `<section><h2>${H(L, 'interests', 'Outside of work')}</h2><p>${esc(L.interests.text)}</p></section>` : ''}
</body></html>`;
}

// ── Print model: the same content and order as printHtml, as plain data ──
// Used by the PDF fallback when no Chrome is available (Claude Cowork, ChatGPT workspaces).
export function printModel(L, { surface = 'pdf' } = {}) {
  const p = L.person || {}; const S = surface;
  const where = place(p); const remote = p.location?.remote !== false;
  const sections = [];
  const jobs = rolesInOrder(L).filter((r) => roleShows(r, S)).map((r) => ({
    title: r.title || '', when: fmtYears(r.start, r.end), org: [r.org, r.location].filter(Boolean).join(', '),
    bullets: (r.groups || []).flatMap((g) => (g.items || []).filter((i) => shows(i, S))).map((i) => mdPlain(i.text)),
  }));
  sections.push({ title: (L.headings?.experience) || 'Experience', kind: 'jobs', jobs });
  const how = (L.howIWork?.items || []).filter((i) => shows(i, S)).map((i) => mdPlain(i.text));
  if (how.length) sections.push({ title: L.headings?.howIWork || 'How I work', kind: 'list', items: how, note: L.howIWork?.note || '' });
  const skills = (L.skills || []).filter((i) => shows(i, S)).map((x) => ({ term: skillLabel(L, x), text: mdPlain(x.text) }));
  if (skills.length) sections.push({ title: L.headings?.skills || 'Skills', kind: 'dl', rows: skills });
  const edu = (L.education || []).filter((i) => shows(i, S)).map((e) => ({ strong: mdPlain(e.text), rest: school(e) ? `, ${school(e)}` : '', note: e.note || '' }));
  const certs = (L.certifications || []).filter((i) => shows(i, S)).map((c) => mdPlain(c.text));
  if (edu.length || certs.length) sections.push({ title: L.headings?.education || 'Education', kind: 'edu', rows: edu, certList: certs, certsLabel: edu.length && certs.length ? 'Certificates' : '' });
  const vol = (L.volunteer || []).filter((i) => shows(i, S)).map((v) => mdPlain(v.text));
  if (vol.length) sections.push({ title: L.headings?.community || 'Community and volunteer', kind: 'cols', items: vol });
  return {
    name: p.name || '', title: `${p.name || ''} - Résumé`,
    headline: shows(p.headline, S) ? p.headline.text : '', subline: shows(p.subline, S) ? p.subline.text : '',
    availability: shows(p.availability, S) ? p.availability.text : '',
    contact: [where ? `${where}${remote ? ' and remote' : ''}` : (remote ? 'Remote' : ''), p.email || '', safeUrl(p.url) ? p.url.replace(/^https?:\/\//, '') : '',
      ...(p.profiles || []).filter((x) => ['LinkedIn', 'GitHub'].includes(x.network) && safeUrl(x.url)).map((x) => x.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))].filter(Boolean),
    summary: shows(L.summary, S) ? L.summary.text.split(/\n\n/) : [],
    sections,
  };
}

// ── JSON Resume (what the website's content/resume.json reads) ───────────
export function jsonResume(L, { site } = {}) {
  const p = L.person; const S = 'json';
  const pub = (arr) => (arr || []).filter((i) => shows(i, S));
  return {
    $schema: 'https://raw.githubusercontent.com/jsonresume/resume-schema/v1.0.0/schema.json',
    'x-about-this-file': ['Generated by Living Résumé. Do not edit by hand.'],
    basics: {
      name: p.name,
      label: shows(p.headline, S) ? p.headline.text : undefined,
      email: p.email, url: safeUrl(p.url) || undefined,
      summary: shows(L.summary, S) ? L.summary.text : undefined,
      location: { city: p.location?.city, region: p.location?.regionName || p.location?.region, countryCode: p.location?.countryCode },
      profiles: (p.profiles || []).filter((x) => safeUrl(x.url)),
      'x-headline': shows(p.headline, S) ? p.headline.text : undefined,
      'x-subline': shows(p.subline, S) ? p.subline.text : undefined,
      'x-availability': shows(p.availability, S) ? p.availability.text : undefined,
    },
    work: rolesInOrder(L).filter((r) => roleShows(r, S)).map((r) => {
      const highlights = (r.groups || []).flatMap((g) => pub(g.items)).map((i) => mdPlain(i.text));
      return { name: r.org, position: r.title, location: r.location, startDate: r.start, ...(r.end ? { endDate: r.end } : {}), highlights };
    }),
    volunteer: pub(L.volunteer).map((v) => ({ organization: v.org, position: v.role, ...(v.start ? { startDate: v.start } : {}), ...(v.end ? { endDate: v.end } : {}) })),
    education: pub(L.education).map((e) => ({ institution: e.institution, studyType: e.studyType, area: e.area, ...(e.note ? { 'x-note': e.note } : {}) })),
    certificates: pub(L.certifications).map((c) => ({ name: c.text })),
    skills: pub(L.skills).map((s) => ({ name: s.name, keywords: s.text.replace(/,? and more$/, '').split(/,\s*(?![^()]*\))/) })),
    interests: shows(L.interests, S) ? [{ name: 'Outside of work', keywords: L.interests.text.replace(/\.$/, '').replace(', and ', ', ').split(', ') }] : [],
    'x-interests-text': shows(L.interests, S) ? L.interests.text : undefined,
    'x-skills-text': pub(L.skills).map((s) => ({ name: s.name, text: s.text })),
    'x-how-i-work': { items: pub(L.howIWork?.items).map((i) => i.text), note: L.howIWork?.note, noteLink: safeUrl(L.howIWork?.noteLink) || undefined },
    meta: { ...(links(L).resumeJson ? { canonical: links(L).resumeJson } : {}), version: '3.0.0', lastModified: new Date().toISOString().slice(0, 10) },
  };
}

// ── Web preview (content check only; the website renders the real page) ──
export function previewHtml(L) {
  return printHtml(L, { surface: 'web', title: `${L.person.name} - Résumé (web preview)` })
    .replace('</style>', 'body{max-width:820px;margin:32px auto;padding:0 20px}</style>');
}

// ── LinkedIn packet (paste-ready, within LinkedIn's limits) ──────────────
export function linkedinPacket(L, rules, changes = [], settings = {}) {
  const S = 'linkedin'; const lim = rules.limits.linkedin; const out = []; const warn = [];
  const sec = (title, text, limit) => {
    if (limit && text.length > limit) warn.push(`${title}: ${text.length}/${limit} characters, too long`);
    out.push(`## ${title}${limit ? ` (${text.length}/${limit})` : ''}\n\n\`\`\`\n${text}\n\`\`\`\n`);
  };
  const p = L.person;
  out.push(`# LinkedIn update packet · ${new Date().toISOString().slice(0, 10)}\n\nPaste each block into the matching LinkedIn field. LinkedIn doesn't allow automated edits, so this is copy-and-paste by design.\n`);
  if (changes.length) out.push(`## What changed since the last publish\n\n${changes.map((c) => `- ${c}`).join('\n')}\n`);
  const hl = shows(p.linkedinHeadline, S) ? p.linkedinHeadline.text : shows(p.headline, S) ? p.headline.text : p.name;
  sec('Headline', hl, lim.headline);
  const how = (L.howIWork?.items || []).filter((i) => shows(i, S)).map((i) => `• ${i.text}`).join('\n');
  const about = [shows(L.summary, S) ? L.summary.text : '', how ? `How I work\n${how}` : '', shows(p.availability, S) ? p.availability.text + '.' : ''].filter(Boolean).join('\n\n');
  sec('About', about, lim.about);
  for (const r of rolesInOrder(L).filter((x) => roleShows(x, S))) {
    // One key per role (title, org, start year), so a promotion at the same company or a blank org never collides.
    const role = `Experience: ${r.title || '—'} at ${r.org || '—'} (${String(r.start || '').slice(0, 4) || '—'})`;
    sec(`${role} title`, r.title || '', lim.position_title);
    const desc = (r.groups || []).flatMap((g) => (g.items || []).filter((i) => shows(i, S))).map((i) => `• ${mdPlain(i.text)}`).join('\n');
    sec(`${role} description`, desc, lim.position_description);
  }
  const skills = (L.skills || []).filter((i) => shows(i, S)).flatMap((s) => s.text.replace(/,? and more$/, '').split(/,\s*(?![^()]*\))/)).slice(0, 50);
  out.push(`## Skills (add any missing; LinkedIn allows up to 100)\n\n${skills.map((s) => `- ${s}`).join('\n')}\n`);
  out.push(`## Volunteer (check each exists)\n\n${(L.volunteer || []).filter((i) => shows(i, S)).map((v) => `- ${v.text}`).join('\n')}\n`);
  const li = settings.linkedin || {};
  out.push(`## Featured\n\n${links(L).resumePage ? `- Link: ${links(L).resumePage} (always current)\n` : ''}- Media: upload dist/${rules.pdf_filename} (replace the old copy whenever this packet says the PDF changed)\n`);
  const otw = li.openToWork;
  if (otw) out.push(`## Open to Work (recruiters only)\n\n${otw.jobTypes?.length ? `- Job types: ${otw.jobTypes.join(' · ')}\n` : ''}${otw.titles?.length ? `- Titles: ${otw.titles.join(' · ')}\n` : ''}${otw.locations?.length ? `- Locations: ${otw.locations.join(' · ')}\n` : ''}`);
  if (li.oneTimeFixes?.length) out.push(`## One-time fixes on your current profile\n\n${li.oneTimeFixes.map((f) => `- ${f}`).join('\n')}\n`);
  return { text: out.join('\n'), warnings: warn };
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

// ── Capability statement (one page, for procurement / vendor lists) ──────
export function capabilityHtml(L, vendor) {
  const p = L.person;
  const comps = (L.skills || []).filter((i) => shows(i, 'pdf')).map((s) => `<li><b>${esc(s.name)}</b><br>${esc(s.text)}</li>`).join('');
  const how = (L.howIWork?.items || []).filter((i) => shows(i, 'pdf')).map((i) => `<li>${esc(i.text)}</li>`).join('');
  const facts = (vendor.entity || []).filter((f) => f.value).map((f) => `<tr><th>${esc(f.label)}</th><td>${esc(f.value)}</td></tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(vendor.company)} - Capability Statement</title>${FONT}
<style>@page{size:Letter;margin:.6in .7in}body{font-family:'Instrument Sans',Arial,sans-serif;color:#1A1917;font-size:10.2pt;line-height:1.45;margin:0}
h1{font-size:19pt;margin:0}.sub{font-weight:600;color:#3A3733;margin:2px 0 4px}.contact{color:#3A3733;font-size:9.6pt;margin:0}
h2{font-size:10pt;text-transform:uppercase;letter-spacing:.09em;color:#A34526;border-bottom:1px solid #D6D1C8;padding-bottom:3px;margin:16px 0 7px}
ul{margin:2px 0 0;padding-left:16px}li{margin:0 0 4px}p{margin:0}table{border-collapse:collapse;font-size:9.8pt}th{text-align:left;padding:2px 14px 2px 0;color:#635E56;font-weight:600;vertical-align:top}td{padding:2px 0}</style></head><body>
<h1>${esc(vendor.company)}</h1><p class="sub">Capability Statement · ${esc(vendor.tagline)} · Updated ${monthYear()}</p>
<p class="contact">${[`${esc(p.name)}, ${esc(vendor.principalTitle || 'Principal')}`, esc(p.email || ''), esc(String(p.url || '').replace(/^https?:\/\//, '')), esc(place(p))].filter(Boolean).join(' · ')}</p>
<h2>What we do</h2><p>${esc(vendor.overview)}</p>
<h2>Core competencies</h2><ul>${comps}</ul>
<h2>How work is delivered</h2><ul>${how}</ul>
<h2>Engagements</h2><p>${esc(vendor.engagements)}</p>
<h2>Company data</h2><table>${facts}</table>
</body></html>`;
}

// ── Hostable web page (dist/index.html) ──────────────────────────────────
// A complete, standalone résumé page for anyone without their own site template:
// no JavaScript, strict CSP, JSON-LD for search and AI agents, one breakpoint.
// Free tier adds one small credit link in the footer (never on the PDF).
export function webPage(L, { credit = null, pdfHref = '', jsonHref = 'resume.json' } = {}) {
  const S = 'web'; const p = L.person || {}; const lk = links(L);
  const roles = rolesInOrder(L).filter((r) => roleShows(r, S)).map((r) => {
    const items = (r.groups || []).flatMap((g) => (g.items || []).filter((i) => shows(i, S)));
    return `<article class="job"><header><h3>${esc(r.title)}</h3><span class="when">${fmtYears(r.start, r.end)}</span></header><p class="org">${esc([r.org, r.location].filter(Boolean).join(', '))}</p>${items.length ? `<ul>${items.map((i) => `<li>${linkify(mdPlain(i.text), lk.portfolio)}</li>`).join('')}</ul>` : ''}</article>`;
  }).join('\n');
  const how = (L.howIWork?.items || []).filter((i) => shows(i, S)).map((i) => `<li>${esc(i.text)}</li>`).join('');
  const skills = (L.skills || []).filter((i) => shows(i, S)).map((s) => (skillLabel(L, s) ? `<div><dt>${esc(s.name)}</dt><dd>${esc(s.text)}</dd></div>` : `<div class="wide"><dd>${esc(s.text)}</dd></div>`)).join('');
  const edu = (L.education || []).filter((i) => shows(i, S)).map((e) => `<p><b>${esc(e.text)}</b>${school(e) ? `, ${esc(school(e))}` : ''}${e.note ? `<br><span class="muted">${esc(e.note)}</span>` : ''}</p>`).join('');
  const certs = (L.certifications || []).filter((i) => shows(i, S)).map((c) => `<li>${esc(c.text)}</li>`);
  const vol = (L.volunteer || []).filter((i) => shows(i, S)).map((v) => `<li>${esc(v.text)}</li>`).join('');
  const where = place(p);
  const contact = [
    p.email && `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>`,
    lk.site && `<a href="${esc(lk.site)}">${esc(hostOf(lk.site))}</a>`,
    ...(p.profiles || []).filter((x) => safeUrl(x.url)).map((x) => `<a href="${esc(x.url)}" rel="me">${esc(x.network || hostOf(x.url))}</a>`),
  ].filter(Boolean).join('');
  const ld = {
    '@context': 'https://schema.org', '@type': 'ProfilePage', dateModified: new Date().toISOString().slice(0, 10),
    mainEntity: { '@type': 'Person', name: p.name, ...(shows(p.headline, S) ? { jobTitle: p.headline.text } : {}), ...(lk.site ? { url: lk.site } : {}), ...(p.email ? { email: `mailto:${p.email}` } : {}),
      ...(where ? { address: { '@type': 'PostalAddress', addressLocality: p.location?.city, addressRegion: p.location?.region, addressCountry: p.location?.countryCode } } : {}),
      sameAs: (p.profiles || []).map((x) => safeUrl(x.url)).filter(Boolean),
      ...(shows(L.summary, S) ? { description: L.summary.text.split(/\n\n/)[0] } : {}) },
  };
  const ldJson = JSON.stringify(ld).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:; base-uri 'none'; form-action 'none'">
<title>${esc(p.name)} - Résumé</title>
${shows(L.summary, S) ? `<meta name="description" content="${esc(L.summary.text.split(/\n\n/)[0].slice(0, 300))}">` : ''}
${lk.resumePage ? `<link rel="canonical" href="${esc(lk.resumePage)}">` : ''}
<link rel="alternate" type="application/json" href="${esc(jsonHref)}" title="JSON Resume">
<script type="application/ld+json">${ldJson}</script>${FONT}
<style>
:root{--ink:#1A1917;--body:#3A3733;--muted:#635E56;--line:#D6D1C8;--bg:#FBFAF7;--accent:#A34526;--ok:#2F7D4F}
@media (prefers-color-scheme:dark){:root{--ink:#F4F1EA;--body:#D9D4CB;--muted:#A69F94;--line:#3A3631;--bg:#171614;--accent:#E08B6B;--ok:#6CC08E}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--body);font:16px/1.6 'Instrument Sans',system-ui,-apple-system,Segoe UI,Arial,sans-serif}
main{max-width:860px;margin:0 auto;padding:64px 24px 40px}
a{color:var(--ink);text-decoration-color:var(--line);text-underline-offset:3px}a:hover{text-decoration-color:var(--accent)}
h1{font-size:clamp(2rem,5vw,2.75rem);line-height:1.1;font-weight:600;letter-spacing:-.02em;color:var(--ink);margin:0 0 10px}
.headline{font-size:1.25rem;color:var(--ink);font-weight:500;margin:0}.sub{color:var(--muted);margin:2px 0 0}
.avail{display:inline-flex;align-items:center;gap:8px;margin:18px 0 0;color:var(--ink)}.avail::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--ok)}
.summary p{margin:18px 0 0;max-width:68ch}
.actions{display:flex;flex-wrap:wrap;gap:12px 20px;align-items:center;margin:26px 0 0}
.btn{display:inline-block;padding:10px 18px;border-radius:999px;background:var(--ink);color:var(--bg);text-decoration:none;font-weight:600}
.contact{display:flex;flex-wrap:wrap;gap:6px 18px}.meta{color:var(--muted);font-size:.875rem;margin:14px 0 0}
h2{font-size:.8rem;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);font-weight:600;margin:56px 0 18px;padding-top:18px;border-top:1px solid var(--line)}
.job{margin:0 0 28px}.job header{display:flex;justify-content:space-between;gap:16px;align-items:baseline}
h3{font-size:1.1rem;color:var(--ink);font-weight:600;margin:0}.when,.org,.muted{color:var(--muted)}.when{white-space:nowrap;font-size:.95rem}.org{margin:2px 0 8px}
ul{margin:0;padding-left:20px}li{margin:0 0 8px}p{margin:0}
dl{margin:0;display:grid;gap:12px}dl div{display:grid;grid-template-columns:200px 1fr;gap:16px}dl div.wide{grid-template-columns:1fr}dt{font-weight:600;color:var(--ink)}dd{margin:0}
.edu p{margin:0 0 10px}.vol{columns:2;column-gap:32px}.vol li{break-inside:avoid}
footer{max-width:860px;margin:0 auto;padding:24px 24px 56px;color:var(--muted);font-size:.85rem;border-top:1px solid var(--line)}footer a{color:var(--muted)}
@media (max-width:880px){main{padding-top:40px}dl div{grid-template-columns:1fr;gap:2px}.vol{columns:1}.job header{flex-direction:column;gap:0}}
@media print{.actions .btn,footer{display:none}}
</style></head><body><main>
<h1>${esc(p.name)}</h1>
${shows(p.headline, S) ? `<p class="headline">${esc(p.headline.text)}</p>` : ''}
${shows(p.subline, S) ? `<p class="sub">${esc(p.subline.text)}</p>` : ''}
${shows(p.availability, S) ? `<p class="avail">${esc(p.availability.text)}</p>` : ''}
${shows(L.summary, S) ? `<div class="summary">${L.summary.text.split(/\n\n/).map((t) => `<p>${esc(t)}</p>`).join('')}</div>` : ''}
<div class="actions">${pdfHref ? `<a class="btn" href="${esc(pdfHref)}" download>Download résumé (PDF)</a>` : ''}<span class="contact">${contact}</span></div>
<p class="meta">${where ? `${esc(where)}${p.location?.remote !== false ? ' and remote' : ''} · ` : ''}Updated ${esc(monthYear())} · <a href="${esc(jsonHref)}">Machine-readable version</a></p>
${roles ? `<h2>${H(L, 'experience', 'Experience')}</h2>\n${roles}` : ''}
${how ? `<h2>${H(L, 'howIWork', 'How I work')}</h2><ul>${how}</ul>${L.howIWork.note ? `<p class="muted" style="margin-top:10px">${linkify(L.howIWork.note, L.howIWork.noteLink)}</p>` : ''}` : ''}
${skills ? `<h2>${H(L, 'skills', 'Skills')}</h2><dl>${skills}</dl>` : ''}
${edu || certs.length ? `<h2>${H(L, 'education', 'Education')}</h2><div class="edu">${edu}${certs.length ? `${edu ? '<p><b>Certificates</b></p>' : ''}<ul class="certs">${certs.join('')}</ul>` : ''}</div>` : ''}
${vol ? `<h2>${H(L, 'community', 'Community and volunteer')}</h2><ul class="vol">${vol}</ul>` : ''}
${shows(L.interests, S) ? `<h2>${H(L, 'interests', 'Outside of work')}</h2><p>${esc(L.interests.text)}</p>` : ''}
</main>
${credit ? `<footer><a href="${esc(credit.url)}">${esc(credit.text)}</a></footer>` : ''}
</body></html>`;
}
