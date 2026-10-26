// Public job boards: the open listing feeds that Greenhouse, Lever, Ashby, Workable, and
// SmartRecruiters publish for each company's careers page. No accounts, no scraping, no login.
// Only those five API hosts are ever contacted, over https, with a size cap and a timeout.
// Everything fetched is untrusted text.
//
// A board is "<provider>:<company-slug>", e.g. "greenhouse:vercel", "lever:metr", "ashby:linear",
// "workable:huggingface", "smartrecruiters:Canva". The slug is the last part of the company's
// careers URL: boards.greenhouse.io/<slug>, jobs.lever.co/<slug>, jobs.ashbyhq.com/<slug>,
// apply.workable.com/<slug>, jobs.smartrecruiters.com/<slug>.

import crypto from 'node:crypto';

// Short, safe, collision-resistant ids: readable prefix plus a hash of the full key.
export const listingId = (prefix, slug, key) => `${prefix}-${String(slug).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}-${crypto.createHash('sha256').update(String(key)).digest('hex').slice(0, 12)}`;

export const PROVIDERS = {
  greenhouse: { host: 'https://boards-api.greenhouse.io', path: (s) => `/v1/boards/${s}/jobs?content=true` },
  lever: { host: 'https://api.lever.co', path: (s, skip = 0) => `/v0/postings/${s}?mode=json&limit=100&skip=${skip}` },
  ashby: { host: 'https://api.ashbyhq.com', path: (s) => `/posting-api/job-board/${s}?includeCompensation=true` },
  workable: { host: 'https://www.workable.com', path: (s) => `/api/accounts/${s}?details=true` },
  smartrecruiters: { host: 'https://api.smartrecruiters.com', path: (s, offset = 0) => `/v1/companies/${s}/postings?limit=100&offset=${offset}`, detail: (s, id) => `/v1/companies/${s}/postings/${id}` },
};
const DETAILS = 60; // SmartRecruiters lists titles only; full text is fetched for at most this many title matches
const SLUG = /^[a-z0-9][a-z0-9._-]{0,79}$/i;
const MAX_BYTES = 12 * 1024 * 1024;
const MAX_TEXT = 20_000; // characters of listing text kept (enough to score; keeps storage small)
const PER_BOARD = 500;   // listings kept per board

// Tests (and only tests) may point every provider at a local server.
function origin(provider) {
  const o = process.env.LIVING_RESUME_BOARDS_ORIGIN;
  if (o) {
    const u = new URL(o);
    if (u.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(u.hostname)) throw new Error('LIVING_RESUME_BOARDS_ORIGIN must be a local http address');
    return `${o}/${provider}`;
  }
  return PROVIDERS[provider].host;
}

export function parseBoard(board) {
  const m = String(board || '').trim().match(/^(greenhouse|lever|ashby|workable|smartrecruiters):(.+)$/i);
  if (!m || !SLUG.test(m[2])) throw new Error(`"${board}" isn't a board. Use greenhouse:, lever:, ashby:, workable:, or smartrecruiters: followed by the company's slug.`);
  return { provider: m[1].toLowerCase(), slug: m[2] };
}

async function getJSON(url) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20_000);
  try {
    const res = await fetch(url, { signal: ctl.signal, redirect: 'error', headers: { Accept: 'application/json', 'User-Agent': 'living-resume' } });
    if (res.status === 404) throw new Error('board not found (check the company slug)');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader(); const chunks = []; let n = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; n += value.length; if (n > MAX_BYTES) { ctl.abort(); throw new Error('response too large'); } chunks.push(value); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'timed out' : e.cause?.code ? `couldn't connect (${e.cause.code})` : e.message);
  } finally { clearTimeout(t); }
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const codePoint = (e) => { const hex = /^#x/i.test(e); const n = parseInt(e.slice(hex ? 2 : 1), hex ? 16 : 10); return Number.isInteger(n) && n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : ' '; };
// Linear-time: the input is capped first, and every pattern is bounded (a hostile listing can't stall a run).
export const htmlToText = (h = '') => {
  let s = String(h ?? '').slice(0, 200_000);
  for (let i = 0; i < 2; i++) s = s.replace(/&(#x[0-9a-f]{1,10}|#[0-9]{1,12}|[a-z]{2,8});/gi, (m, e) => (e[0] === '#' ? codePoint(e) : ENT[e.toLowerCase()] ?? m));
  return s.replace(/<\/(?:p|div|li|h\d|br)\s*>|<br\s*\/?>/gi, '\n').replace(/<[^<>]*>/g, ' ')
    .replace(/[ \t\f\v]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
};
const iso = (v) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };
// true = remote, false = on-site or hybrid, null = not stated (the location is checked instead)
const workplace = (v) => { const t = String(v || '').toLowerCase(); return t === 'remote' ? true : ['onsite', 'on-site', 'hybrid'].includes(t) ? false : null; };
const https = (u) => (/^https:\/\//i.test(String(u || '')) ? String(u) : '');
const cap = (s, n) => String(s || '').slice(0, n);

// One normalized posting: { id, board, company, title, location, remote, type, pay, url, applyUrl, posted, text }
function norm(provider, slug, company, j) {
  if (provider === 'greenhouse') return {
    id: `gh-${slug}-${j.id}`, title: j.title, location: j.location?.name, remote: null,
    type: null, pay: null, url: https(j.absolute_url), applyUrl: https(j.absolute_url), posted: j.first_published || j.updated_at, text: htmlToText(j.content),
  };
  if (provider === 'lever') return {
    id: `lv-${slug}-${j.id}`, title: j.text, location: j.categories?.location, remote: workplace(j.workplaceType),
    type: j.categories?.commitment || null, pay: j.salaryRange ? `${j.salaryRange.currency || ''} ${j.salaryRange.min}–${j.salaryRange.max} ${j.salaryRange.interval || ''}`.trim() : null,
    url: https(j.hostedUrl), applyUrl: https(j.applyUrl || j.hostedUrl), posted: j.createdAt ? iso(j.createdAt) : null,
    text: [j.descriptionPlain || htmlToText(j.description), ...(Array.isArray(j.lists) ? j.lists : []).map((l) => `${l?.text || ''}\n${htmlToText(l?.content)}`), j.additionalPlain || ''].join('\n'),
  };
  if (provider === 'workable') {
    const loc = j.location || {}; const where = [j.city || loc.city, j.state || loc.region, j.country || loc.country].filter(Boolean).join(', ');
    const url = https(j.url || j.shortlink || (j.shortcode ? `https://apply.workable.com/${slug}/j/${j.shortcode}/` : ''));
    return {
      id: `wk-${slug}-${j.shortcode || j.id || j.code}`, title: j.title, location: where, remote: (j.telecommuting ?? loc.telecommuting) === true ? true : workplace(j.workplace_type || j.workplace),
      type: j.employment_type || null, pay: null, url, applyUrl: https(j.application_url) || url, posted: j.published_on || j.created_at || null, text: htmlToText([j.description, j.requirements, j.benefits].filter(Boolean).join('\n')),
    };
  }
  if (provider === 'smartrecruiters') {
    const loc = j.location || {}; const s = j.jobAd?.sections || {};
    const url = https(j.postingUrl || `https://jobs.smartrecruiters.com/${slug}/${j.id}`);
    return {
      id: `sr-${slug}-${j.id}`, title: j.name, location: loc.fullLocation || [loc.city, loc.region, loc.country].filter(Boolean).join(', '), remote: loc.remote === true || loc.fullyRemote === true ? true : loc.hybrid === true ? false : null,
      type: j.typeOfEmployment?.label || null, pay: null, url, applyUrl: https(j.applyUrl) || url, posted: j.releasedDate || null,
      text: htmlToText([s.jobDescription?.text, s.qualifications?.text, s.additionalInformation?.text].filter(Boolean).join('\n')),
    };
  }
  return { // ashby
    id: `ab-${slug}-${j.id}`, title: j.title, location: j.location || j.address?.postalAddress?.addressLocality, remote: j.isRemote === true ? true : workplace(j.workplaceType),
    type: j.employmentType || null, pay: j.compensation?.compensationTierSummary || j.compensation?.scrapeableCompensationSalarySummary || null,
    url: https(j.jobUrl), applyUrl: https(j.applyUrl || j.jobUrl), posted: j.publishedAt || null, text: j.descriptionPlain || htmlToText(j.descriptionHtml),
  };
}

// want(title): which listings are worth full text (SmartRecruiters only). details: false for a quick count.
export async function fetchBoard(board, company, { want = () => true, details = true } = {}) {
  const { provider, slug } = parseBoard(board);
  const base = origin(provider); const P = PROVIDERS[provider];
  let raw = [];
  if (provider === 'lever') {
    for (let skip = 0; skip < 1000; skip += 100) { const page = await getJSON(base + P.path(slug, skip)); if (!Array.isArray(page)) throw new Error('unexpected response'); raw.push(...page); if (page.length < 100) break; }
  } else if (provider === 'smartrecruiters') {
    for (let off = 0; off < 1000; off += 100) { const page = await getJSON(base + P.path(slug, off)); if (!Array.isArray(page?.content)) throw new Error('unexpected response'); raw.push(...page.content); if (page.content.length < 100) break; }
    if (details) {
      let n = 0;
      raw = await Promise.all(raw.map(async (j) => {
        if (!j || typeof j.name !== 'string' || !want(j.name) || n >= DETAILS || !/^[\w-]{1,64}$/.test(String(j.id))) return j;
        n++; try { return { ...j, ...(await getJSON(base + P.detail(slug, j.id))) }; } catch { return j; }
      }));
    }
  } else {
    const j = await getJSON(base + P.path(slug));
    raw = j?.jobs;
    if (!Array.isArray(raw)) throw new Error('unexpected response');
    if (provider === 'ashby') raw = raw.filter((x) => x.isListed !== false);
  }
  const out = [];
  for (const j of raw.slice(0, 2000)) {
    if (out.length >= PER_BOARD) break;
    let p; try { p = norm(provider, slug, company, j || {}); } catch { continue; } // one malformed listing never sinks the board
    if (typeof p.title !== 'string' || !p.title.trim() || !(p.url || p.applyUrl)) continue;
    out.push({ ...p, id: listingId(p.id.slice(0, 2), slug, p.id), board, company: cap(company || slug, 80), title: cap(p.title, 200), location: typeof p.location === 'string' ? cap(p.location, 160) : '', type: typeof p.type === 'string' ? cap(p.type, 60) : null, pay: typeof p.pay === 'string' ? cap(p.pay, 120) : null, text: cap(typeof p.text === 'string' ? p.text : '', MAX_TEXT) });
  }
  return out;
}
