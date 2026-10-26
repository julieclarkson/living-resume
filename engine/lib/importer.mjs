// Onboarding import: LinkedIn data export (.zip or folder of CSVs), a résumé PDF, DOCX, or
// plain text → a draft the user reviews line by line. Deterministic, no AI, no network.
// The AI tool may then improve the draft's wording (skill), but every line still goes
// through Approve · Edit · Reject · Later before it can be public.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';

export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
const MAX_ENTRY_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 40 * 1024 * 1024;

// ── Minimal ZIP reader (central directory; stored + deflate). In memory only, never extracted. ──
export function readZip(buf, want = () => true) {
  const out = new Map();
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Not a zip file');
  const count = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16);
  if (count > 5000) throw new Error('Zip has too many entries');
  let total = 0; const seen = new Set();
  const need = (end) => { if (end > buf.length) throw new Error('Damaged zip'); };
  for (let n = 0; n < count; n++) {
    need(p + 46); if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Damaged zip');
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), lho = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    p += 46 + nlen + xlen + clen;
    if (name.endsWith('/') || !want(name)) continue;
    if (usize > MAX_ENTRY_BYTES) throw new Error(`Zip entry too large: ${name}`);
    // Each entry must own its data (no two entries sharing one block) and stay inside the file.
    if (seen.has(lho)) throw new Error('Damaged zip (entries share data)'); seen.add(lho);
    need(lho + 30); const lnl = buf.readUInt16LE(lho + 26), lxl = buf.readUInt16LE(lho + 28);
    const start = lho + 30 + lnl + lxl; need(start + csize);
    const data = buf.subarray(start, start + csize);
    let body;
    if (method === 0) body = Buffer.from(data);
    else if (method === 8) { try { body = zlib.inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES }); } catch { throw new Error(`Zip entry too large or damaged: ${name}`); } }
    else throw new Error(`Unsupported zip compression in ${name}`);
    if ((total += body.length) > MAX_TOTAL_BYTES) throw new Error('Zip contents too large');
    out.set(name, body);
  }
  return out;
}

// ── CSV (RFC 4180: quotes, doubled quotes, newlines inside quotes) ──
export function parseCsv(text) {
  const rows = []; let row = []; let f = ''; let q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}
// Rows as objects, finding the header row by a column it must contain (LinkedIn adds notes above some headers).
export function csvObjects(text, mustHave) {
  const rows = parseCsv(text);
  const h = rows.findIndex((r) => r.map((x) => x.trim()).includes(mustHave));
  if (h < 0) return [];
  const head = rows[h].map((x) => x.trim());
  return rows.slice(h + 1).map((r) => Object.fromEntries(head.map((k, i) => [k, (r[i] || '').trim()])));
}

// ── Dates: "Jan 2020", "January 2020", "2020-01", "01/2020", "2020", "Present" → "YYYY-MM" | "YYYY" | null ──
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
export function parseDate(s) {
  s = String(s || '').trim().toLowerCase();
  if (!s || /present|current|now|today/.test(s)) return null;
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})/))) return `${m[1]}-${m[2].padStart(2, '0')}`;
  if ((m = s.match(/^(\d{1,2})\/(\d{4})$/))) return `${m[2]}-${m[1].padStart(2, '0')}`;
  if ((m = s.match(/([a-z]{3,9})\.?\s+(\d{4})/)) && MON[m[1].slice(0, m[1] === 'sept' ? 4 : 3)]) return `${m[2]}-${String(MON[m[1].slice(0, 3)]).padStart(2, '0')}`;
  if ((m = s.match(/\b(19|20)\d{2}\b/))) return m[0];
  return null;
}
const DATE_TOKEN = '(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?\\s+\\d{4}|\\d{1,2}/\\d{4}|\\d{4}-\\d{2}|(?:19|20)\\d{2})';
const RANGE_RE = new RegExp(`(${DATE_TOKEN})\\s*(?:-|–|—|to|until)\\s*(${DATE_TOKEN}|present|current|now)`, 'i');

const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 40) || 'item';
const bullets = (desc) => String(desc || '').split(/\r?\n|(?:^|\s)[•▪●◦]\s+/).map((x) => x.replace(/^\s*[-*•▪●◦]\s*/, '').trim()).filter((x) => x.length > 2);

// ── LinkedIn data export (Settings → Data privacy → Get a copy of your data) ──
// Never imported: phone numbers, addresses, birth date, connections, messages.
export function fromLinkedInFiles(files) {
  const get = (n) => { for (const [k, v] of files) if (path.basename(k).toLowerCase() === n.toLowerCase()) return v.toString('utf8'); return null; };
  const draft = { source: 'LinkedIn export', person: {}, roles: [], education: [], skills: [], certifications: [], volunteer: [] };
  const prof = csvObjects(get('Profile.csv') || '', 'First Name')[0];
  if (prof) {
    draft.person.name = [prof['First Name'], prof['Last Name']].filter(Boolean).join(' ');
    if (prof.Headline) draft.headline = prof.Headline;
    if (prof.Summary) draft.summary = prof.Summary;
    if (prof['Geo Location']) { const [city, region] = prof['Geo Location'].split(',').map((x) => x.trim()); draft.person.location = { city, region }; }
    const site = (prof.Websites || '').match(/https?:\/\/[^\s,\]]+/); if (site) draft.person.url = site[0];
  }
  const em = csvObjects(get('Email Addresses.csv') || '', 'Email Address');
  const primary = em.find((e) => /yes/i.test(e.Primary)) || em[0]; if (primary) draft.person.email = primary['Email Address'];
  for (const r of csvObjects(get('Positions.csv') || '', 'Company Name')) draft.roles.push({ org: r['Company Name'], title: r.Title, location: r.Location, start: parseDate(r['Started On']), end: parseDate(r['Finished On']), bullets: bullets(r.Description) });
  for (const r of csvObjects(get('Education.csv') || '', 'School Name')) draft.education.push({ institution: r['School Name'], degree: r['Degree Name'], start: parseDate(r['Start Date']), end: parseDate(r['End Date']), note: r.Notes });
  for (const r of csvObjects(get('Skills.csv') || '', 'Name')) if (r.Name) draft.skills.push(r.Name);
  // "Name, Issuer, Year": "Project Management Professional (PMP), Project Management Institute, 2016".
  for (const r of csvObjects(get('Certifications.csv') || '', 'Name')) if (r.Name) draft.certifications.push({ name: r.Name, issuer: r.Authority, year: String(parseDate(r['Started On']) || '').slice(0, 4) });
  for (const r of csvObjects(get('Volunteering.csv') || '', 'Company Name')) draft.volunteer.push({ org: r['Company Name'], role: r.Role, start: parseDate(r['Started On']), end: parseDate(r['Finished On']) });
  return draft;
}

// ── Plain text (from PDF, DOCX, or .txt) ──
const HEAD = [
  ['summary', /^(summary|professional summary|executive summary|career summary|profile summary|summary of qualifications|professional profile|about|about me|profile|overview)$/],
  ['experience', /^(experience|work experience|professional experience|employment|employment history|work history|career history)$/],
  ['education', /^(education|education and training|academic background)$/],
  ['skills', /^(skills|top skills|core skills|technical skills|skills and tools|competencies|core competencies)$/],
  ['certifications', /^(certifications|licenses (?:&|and) certifications|certificates|licenses)$/],
  ['volunteer', /^(volunteer|volunteering|volunteer experience|community|community involvement|boards?|board service|board (?:&|and) community|community (?:&|and) board service)$/],
  ['contact', /^(contact|contact information|contact info)$/],
  ['publications', /^(publications|speaking|talks|presentations|speaking engagements|publications (?:&|and) (?:speaking|talks|presentations)|(?:speaking|talks|presentations) (?:&|and) publications|publications,? talks(?:,? and presentations)?)$/],
  ['other', /^(projects|languages|honors|honors (?:&|and) awards|awards|awards (?:&|and) honors|patents|interests|references)$/],
];
// Locations: "Austin, TX", "Raleigh, North Carolina", "Remote", "Hybrid", "Austin, TX / Remote".
const REGIONS = 'Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|Ontario|Quebec|British Columbia|Alberta|Canada|USA|United States|United Kingdom|England|Scotland|Ireland|Germany|France|India|Australia|Mexico';
const CITY_RE = new RegExp(`^[A-Z][A-Za-z.'-]*(?: [A-Z][A-Za-z.'-]*){0,3},\\s*(?:[A-Z]{2}|${REGIONS})$`);
const WORK_RE = /^(remote|hybrid|on-?site)\b/i;
export function isLocation(s) {
  const t = String(s || '').trim();
  if (!t || t.length > 60) return false;
  if (WORK_RE.test(t)) return true;
  return CITY_RE.test(t.replace(/\s*(?:[/·|(–—-]\s*)?(?:remote|hybrid|on-?site)\)?$/i, ''));
}
// One-line role headers. Strong separators first ("Title at Org", "Title — Org", "Title | Org", "Title · Org");
// a comma splits title and org only when there is no strong separator ("Title, Org").
const STRONG = /\s+at\s+|\s+[—–|·]\s+/;
const CUT = /,\s+|\s+at\s+|\s+[—–|·]\s+/g;
// Split "…, Austin, TX" / "… — Remote" off the end. Returns [rest, location].
function cutLocation(s) {
  s = String(s || '').trim();
  if (isLocation(s)) return ['', s];
  for (const m of s.matchAll(CUT)) {
    const head = s.slice(0, m.index).trim(); const tail = s.slice(m.index + m[0].length).trim();
    if (head && isLocation(tail)) return [head, tail];
  }
  return [s, ''];
}
export function splitHeader(s) {
  const [rest, location] = cutLocation(String(s || '').replace(/^(?:earlier|previously|prior)\s*:\s*/i, ''));
  let parts = rest.split(STRONG).map((x) => x.trim()).filter(Boolean);
  if (parts.length < 2 && rest.includes(',')) { const i = rest.indexOf(','); parts = [rest.slice(0, i).trim(), rest.slice(i + 1).trim()].filter(Boolean); }
  return { parts, location };
}
const MARK = /^(?:[•▪●◦]|[-*](?=\s))\s*/;
// A role header with no dates of its own: "Title — Org, City, ST" (a strong separator or a location),
// not a bullet, not a sentence. Returns the index of the last such line that is followed by a bullet.
const looksLikeHeader = (l) => !!l && !MARK.test(l) && /^[A-Z]/.test(l) && !/[.;:]$/.test(l) && l.length <= 120 && (STRONG.test(l) || !!cutLocation(l)[1]);
const looksLikeTitle = (l, before) => !!l && !MARK.test(l) && /^[A-Z]/.test(l) && !/[.;:]$/.test(l) && l.length <= 80 && (before === undefined || MARK.test(before) || /[.!?]$/.test(before));
function headerAbove(pending) {
  // Looks back at most 60 lines (one role's worth), so a huge file can't make this slow.
  for (let i = pending.length - 2; i >= Math.max(0, pending.length - 60); i--) if (MARK.test(pending[i + 1]) && looksLikeHeader(pending[i])) return i;
  return -1;
}
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
export function fromText(text, source = 'résumé') {
  const lines = String(text).replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => !/^\s*page \d+ of \d+\s*$/i.test(l));
  const linkedinPdf = /linkedin\.com\/in\//i.test(text) && /\bTop Skills\b/.test(text);
  const draft = { source, person: {}, roles: [], education: [], skills: [], certifications: [], volunteer: [], publications: [], unplaced: [], unplacedHeadings: [], unplacedLines: [] };
  const sections = { top: [] }; let cur = 'top';
  // An ALL-CAPS line that matches no known heading starts an "other" section (not placed, reported),
  // unless a date range follows right below it (then it is an employer name).
  const datesSoon = (i) => lines.slice(i + 1).filter((x) => x.trim()).slice(0, 2).some((x) => RANGE_RE.test(x));
  lines.forEach((l, i) => {
    const raw = l.trim();
    const t = raw.toLowerCase().replace(/[:\s]+$/, '');
    let hit = HEAD.find(([, re]) => re.test(t))?.[0];
    if (hit && raw.length >= 50) hit = undefined;
    if (!hit && cur !== 'top' && raw.length < 40 && /^[A-Z][A-Z&/' -]{2,}:?$/.test(raw) && !datesSoon(i)) hit = 'other';
    if (hit) {
      cur = hit; sections[cur] = sections[cur] || [];
      if (hit === 'other') { draft.unplacedHeadings.push(raw.replace(/:$/, '')); sections.other.push(`${raw.replace(/:$/, '')}:`); }
      return;
    }
    (sections[cur] = sections[cur] || []).push(l);
  });
  // Contact details only from the header block (above the first section), never from the body.
  const header = [...(sections.top || []), ...(sections.contact || [])].join('\n');
  const email = header.match(/[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63}){0,8}\.[a-z]{2,24}\b/i); if (email) draft.person.email = email[0];
  const li = header.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w-]+/i); if (li) draft.person.linkedin = li[0].startsWith('http') ? li[0] : `https://${li[0]}`;
  const top = (sections.top || []).map((l) => l.trim()).filter(Boolean).filter((l) => !/@|linkedin\.com|^\(?\+?\d[\d\s().-]{7,}$/.test(l));
  if (top[0] && top[0].split(/\s+/).length <= 5) draft.person.name = top[0] === top[0].toUpperCase() && /\p{Lu}/u.test(top[0]) ? titleCase(top[0]) : top[0];
  if (top[1] && top[1].length <= 140) draft.headline = top[1];
  if (sections.summary?.length) draft.summary = sections.summary.map((l) => l.trim()).join('\n').replace(/([^\n])\n(?!\n)/g, '$1 ').trim();
  // Experience: an entry starts at a line with a date range; title/org come from the lines just above it.
  const ex = sections.experience || [];
  let role = null; let pending = [];
  for (const raw of ex) {
    const l = raw.trim(); if (!l) continue;
    const m = l.match(RANGE_RE);
    if (m) {
      // What's left on the date line once the dates and any duration "(2 yrs 3 mos)" are removed.
      // "(self-employed)" or "(Contract)" stays: it's part of the org. A location ("Austin, TX",
      // "Remote") is split off first.
      const rest = l.replace(RANGE_RE, '').replace(/\([^)\d]*\d[^)]*\)|\(\s*\)/g, '').replace(/^[\s,|·–—-]+|[\s,|·–—-]+$/g, '');
      const { parts, location } = /[a-z]{2}/i.test(rest) ? splitHeader(rest) : { parts: [], location: '' };
      // The role header is the run of non-bullet lines just above the dates: at most two, one when
      // the date line also holds a name ("Org (self-employed)  Mar 2021 - Present"), none when it
      // holds both title and org ("Title, Org 2017 - 2021").
      const maxHead = parts.length >= 2 ? 0 : parts.length === 1 ? 1 : 2;
      let k = pending.length; while (k > 0 && pending.length - k < maxHead && !MARK.test(pending[k - 1])) k--;
      let head = pending.slice(k); let after = [];
      // Dates after the bullets (PDF text in reading order): "Title — Org, City, ST", its bullets, then
      // "2013 – 2017". The dates belong to the header line above those bullets, which has none.
      if (!parts.length && (!head.length || /^[a-z(]/.test(head[0]))) {
        const h = headerAbove(pending);
        if (h >= 0) { const two = h > 0 && looksLikeTitle(pending[h - 1], pending[h - 2]); k = two ? h - 1 : h; head = pending.slice(k, h + 1); after = pending.slice(h + 1); if (role) role.bullets.push(...pending.slice(0, k)); else draft.unplacedLines.push(...pending.slice(0, k)); }
        else if (role && !role.start) { role.start = parseDate(m[1]); role.end = parseDate(m[2]); continue; }
        else { draft.unplacedLines.push(l); continue; }
      } else if (role) role.bullets.push(...pending.slice(0, k));
      else draft.unplacedLines.push(...pending.slice(0, k));
      let title = '', org = '', loc = location;
      if (parts.length >= 2) [title, org] = [parts[0], parts.slice(1).join(', ')];
      else if (parts.length === 1) { title = head[0] || parts[0]; org = head[0] ? parts[0] : ''; }
      else if (head.length === 2) {
        let [a, b] = linkedinPdf ? [head[1], head[0]] : head;
        const [ob, lb] = cutLocation(b); if (ob && lb && !loc) { b = ob; loc = lb; }
        [title, org] = [a, b];
      } else if (head.length === 1) { const h = splitHeader(head[0]); [title, org] = [h.parts[0] || head[0], h.parts.slice(1).join(', ')]; loc = loc || h.location; }
      role = { title, org, location: loc, start: parseDate(m[1]), end: parseDate(m[2]), bullets: after };
      draft.roles.push(role); pending = [];
      continue;
    }
    pending.push(l);
  }
  if (role) role.bullets.push(...pending);
  for (const r of draft.roles) {
    // A short line right after the dates is usually the location (LinkedIn PDFs, many templates).
    if (!r.location && r.bullets[0] && !MARK.test(r.bullets[0]) && r.bullets[0].length < 40 && /,|remote|area/i.test(r.bullets[0])) r.location = r.bullets.shift();
    // Join wrapped lines: a line that doesn't end a sentence continues into the next,
    // unless it starts with a bullet marker (then it is always a new bullet).
    const joined = [];
    for (const raw of r.bullets) {
      const b = raw.replace(MARK, '');
      if (!MARK.test(raw) && joined.length && !/[.!?:;]$/.test(joined.at(-1)) && /^[a-z(]/.test(b)) joined[joined.length - 1] += ` ${b}`; else joined.push(b);
    }
    r.bullets = joined.filter((b) => b.length > 2);
  }
  // Nothing is dropped silently: a role with neither title nor company can't be proposed, so its lines
  // are listed as not placed (with its dates), like any line that landed in no role.
  for (const r of draft.roles.filter((x) => !x.title && !x.org)) draft.unplacedLines.push([r.start, r.end || 'Present'].filter(Boolean).join(' – '), ...r.bullets);
  draft.roles = draft.roles.filter((x) => x.title || x.org);
  if (!draft.roles.length && ex.length) draft.unplacedLines = ex.map((l) => l.trim()).filter(Boolean);
  draft.unplaced.push(...draft.unplacedLines);
  draft.unplaced.push(...(sections.other || []).map((l) => l.trim()).filter(Boolean));
  for (const l of (sections.education || []).map((x) => x.trim()).filter(Boolean)) draft.education.push({ text: l });
  for (const l of (sections.skills || []).map((x) => x.trim()).filter(Boolean)) for (const s of l.split(/\s*[,;•·|]\s*/)) if (s.length > 1 && s.length < 60) draft.skills.push(s.replace(/^[-*]\s*/, ''));
  for (const l of (sections.certifications || []).map((x) => x.trim()).filter(Boolean)) draft.certifications.push({ name: l.replace(/^[-*•]\s*/, '') });
  for (const l of (sections.volunteer || []).map((x) => x.trim()).filter(Boolean)) draft.volunteer.push({ text: l.replace(/^[-*•]\s*/, '') });
  for (const l of (sections.publications || []).map((x) => x.trim()).filter(Boolean)) draft.publications.push(l.replace(/^[-*•]\s*/, ''));
  return draft;
}

// ── Extract text from a document file. Returns { text, files? } ──
// The only LinkedIn export files ever read. Messages, connections, phone numbers, addresses, etc. are never opened.
export const LINKEDIN_FILES = ['profile.csv', 'positions.csv', 'education.csv', 'skills.csv', 'certifications.csv', 'volunteering.csv', 'email addresses.csv'];
const wanted = (n) => LINKEDIN_FILES.includes(path.basename(n).toLowerCase());
export function extract(file) {
  const ext = path.extname(file).toLowerCase();
  const stat = fs.statSync(file);
  if (stat.isDirectory()) {
    const files = new Map();
    for (const n of fs.readdirSync(file)) if (wanted(n)) { const p = path.join(file, n); if (fs.lstatSync(p).isFile() && fs.statSync(p).size < MAX_ENTRY_BYTES) files.set(n, fs.readFileSync(p)); }
    if (!files.size) throw new Error('That folder has no LinkedIn profile files (expected a LinkedIn data export).');
    return { kind: 'linkedin', files, parts: [...files].map(([n, b]) => ({ name: n, text: b.toString('utf8') })) };
  }
  if (stat.size > MAX_IMPORT_BYTES) throw new Error('File is larger than 20 MB.');
  const buf = fs.readFileSync(file);
  if (ext === '.zip') {
    const files = readZip(buf, wanted);
    if (!files.size) throw new Error('That zip has no LinkedIn profile files (expected a LinkedIn data export).');
    return { kind: 'linkedin', files, parts: [...files].map(([n, b]) => ({ name: n, text: b.toString('utf8') })) };
  }
  if (ext === '.docx') {
    const xml = readZip(buf, (n) => n === 'word/document.xml').get('word/document.xml');
    if (!xml) throw new Error('No document text found in that .docx.');
    const text = xml.toString('utf8').replace(/<w:tab\/>/g, '\t').replace(/<\/w:p>/g, '\n').replace(/<w:br\/>/g, '\n').replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    return { kind: 'text', parts: [{ name: path.basename(file), text }] };
  }
  if (ext === '.pdf') {
    try { return { kind: 'text', parts: [{ name: path.basename(file), text: execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', file, '-'], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000, maxBuffer: 20 * 1024 * 1024 }).toString('utf8').replace(/ {3,}/g, '\n') }] }; }
    catch { throw new Error("I can't read PDFs on this computer. Ask your AI to read the PDF and import its text."); }
  }
  if (['.txt', '.md', '.text'].includes(ext)) return { kind: 'text', parts: [{ name: path.basename(file), text: buf.toString('utf8') }] };
  throw new Error(`Can't import ${ext || 'that file'}. Use a LinkedIn export (.zip or folder), .pdf, .docx, .txt, or .md.`);
}

// ── Draft → ledger role skeletons + proposals (every line waits for the user's review) ──
export function toProposals(draft, { ledger, prefix, evidence }) {
  const proposals = []; const roles = [];
  let n = 0; const pid = () => `${prefix}-${String(++n).padStart(3, '0')}`;
  const add = (section, text, fields = {}, reason = `From your ${draft.source}`) => { if (text && String(text).trim()) proposals.push({ id: pid(), kind: 'add', section, text: String(text).trim(), fields, surfaces: ['web', 'pdf', 'linkedin', 'json'], reason, evidence, status: 'proposed' }); };
  const P = ledger.person || {};
  // Contact basics are a proposal too: nothing about the person changes until the user approves.
  const basics = {};
  for (const k of ['name', 'email', 'url', 'linkedin']) if (draft.person[k] && !(k === 'linkedin' ? (P.profiles || []).some((x) => x.network === 'LinkedIn') : P[k])) basics[k] = draft.person[k];
  if (draft.person.location && !P.location?.city) { basics.city = draft.person.location.city || ''; basics.region = draft.person.location.region || ''; }
  if (Object.keys(basics).length) proposals.push({ id: pid(), kind: 'basics', text: Object.entries(basics).map(([k, v]) => `${k}: ${v}`).join(' · '), fields: basics, reason: `Contact details found in your ${draft.source}. Approve only what you want shown.`, evidence, status: 'proposed' });
  if (draft.headline && !P.headline) add('person.headline', draft.headline);
  if (draft.summary && !ledger.summary) add('summary', draft.summary);
  const used = new Set((ledger.experience || []).map((r) => r.id));
  for (const r of draft.roles) {
    if (!r.title && !r.org) continue;
    const existing = (ledger.experience || []).find((x) => slug(x.org) === slug(r.org) && slug(x.title) === slug(r.title));
    let id = existing?.id;
    if (!id) {
      id = slug(`${r.org || r.title}-${String(r.start || '').slice(0, 4)}`); let k = 2; while (used.has(id)) id = `${id}-${k++}`; used.add(id);
      roles.push({ id, title: r.title || '', org: r.org || '', location: r.location || '', start: r.start || '', end: r.end || null, visibility: 'auto', groups: [{ label: null, items: [] }], imported: evidence });
    }
    for (const b of r.bullets) add(`experience.${id}`, b, {}, `From your ${draft.source}: ${r.title}${r.org ? ` at ${r.org}` : ''}`);
  }
  for (const e of draft.education) add('education', e.text || [e.degree, e.institution, String(e.end || '').slice(0, 4)].filter(Boolean).join(', '), { institution: e.institution || '', area: e.area || '', note: e.note || '' });
  if (draft.skills.length) add('skills', [...new Set(draft.skills)].join(', '), { name: 'Skills' }, `From your ${draft.source}. Split into groups as you like.`);
  for (const c of draft.certifications) add('certifications', [c.name, c.issuer, c.year].filter(Boolean).join(', '), { issuer: c.issuer || '' });
  for (const t of draft.publications || []) add('publications', t);
  for (const v of draft.volunteer) add('volunteer', v.text || [v.role, v.org].filter(Boolean).join(', '), { role: v.role || '', org: v.org || '', start: v.start || '', end: v.end || '' });
  return { proposals, roles };
}
