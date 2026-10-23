// Living Résumé: shared helpers. Zero dependencies (Node 18+ built-ins only).
//
// Two roots:
//   PRODUCT  = where this code is installed (plugin folder, npm package, or a clone)
//   ROOT     = the user's résumé workspace (holds resume/ledger.json and every output)
// The workspace is resolved once per process:
//   LIVING_RESUME_DIR env  →  nearest folder above the current one with resume/ledger.json
//   →  ~/Living-Resume (the default `init` location)  →  the current folder.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PRODUCT = path.resolve(ENGINE, '..');
export const DEFAULT_HOME = path.join(os.homedir(), 'Living-Resume');

export function resolveWorkspace(env = process.env, cwd = process.cwd()) {
  if (env.LIVING_RESUME_DIR) return path.resolve(env.LIVING_RESUME_DIR);
  let dir = path.resolve(cwd);
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'resume', 'ledger.json'))) return dir;
    const up = path.dirname(dir); if (up === dir) break; dir = up;
  }
  if (fs.existsSync(path.join(DEFAULT_HOME, 'resume', 'ledger.json'))) return DEFAULT_HOME;
  return path.resolve(cwd);
}
export const ROOT = resolveWorkspace();
export const P = (...a) => path.join(ROOT, ...a);
export const isWorkspace = (dir = ROOT) => fs.existsSync(path.join(dir, 'resume', 'ledger.json'));
export function requireWorkspace() {
  if (!isWorkspace()) {
    console.error(`✗ No résumé workspace found (looked for resume/ledger.json from ${process.cwd()}).\n  Start one:  living-resume init   (or set LIVING_RESUME_DIR)`);
    process.exit(2);
  }
}

export function readJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { if (fallback !== undefined) return fallback; throw new Error(`Cannot read ${path.relative(ROOT, p) || p}: ${e.message}`); }
}
export function writeJSON(p, data) {
  confined(p);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = confined(`${p}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, p);
}
export function writeText(p, text) {
  confined(p);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
}

export const ledgerPath = () => P('resume', 'ledger.json');
export const rulesPath = () => P('resume', 'rules.json');
export const settingsPath = () => P('resume', 'settings.json');
export const loadLedger = () => readJSON(ledgerPath());
export const loadSettings = () => readJSON(settingsPath(), {});
export function loadRules() {
  const R = readJSON(rulesPath());
  R.limits = { pdf_max_pages: 2, ...(R.limits || {}), linkedin: { headline: 220, about: 2600, position_description: 2000, position_title: 100, ...(R.limits?.linkedin || {}) } };
  R.disclosure_denylist = R.disclosure_denylist || [];
  // The PDF name becomes a file name in dist/ and on the site: only a plain "Name_Resume.pdf" shape is accepted.
  if (typeof R.pdf_filename !== 'string' || !/^[A-Za-z0-9][\w.-]{0,100}\.pdf$/.test(R.pdf_filename) || R.pdf_filename.includes('..')) R.pdf_filename = pdfFilename(readJSON(ledgerPath(), {}).person?.name);
  return R;
}
export const pdfFilename = (name = 'Resume') => `${String(name).normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') || 'My'}_Resume.pdf`;

// Confinement: every path the engine writes must stay inside the workspace,
// and no part of the path inside the workspace may be a symlink.
export function confined(p, root = ROOT) {
  const abs = path.resolve(p);
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error(`Refusing to touch a path outside the workspace: ${p}`);
  let cur = root;
  for (const part of path.relative(root, abs).split(path.sep).filter(Boolean)) {
    cur = path.join(cur, part);
    if (fs.existsSync(cur) && fs.lstatSync(cur).isSymbolicLink()) throw new Error(`Refusing to follow a symlink: ${path.relative(root, cur)}`);
  }
  return abs;
}
// Slugs and ids that become file names or are passed between tools.
export const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,79}$/i;
export function safeId(id, what = 'id') {
  if (typeof id !== 'string' || !SAFE_ID.test(id) || id.includes('..')) throw new Error(`Invalid ${what} "${id}". Use letters, numbers, dots, dashes, underscores.`);
  return id;
}

export const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Ledger text may use **bold** for lead-ins. Nothing else is interpreted.
export const mdHtml = (s = '') => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
export const mdPlain = (s = '') => String(s).replace(/\*\*(.+?)\*\*/g, '$1');
// Only http(s) and mailto links are ever written into HTML.
export const safeUrl = (u = '') => (/^(https?:\/\/|mailto:)/i.test(String(u).trim()) ? String(u).trim() : '');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtMonth(ym) {
  if (!ym) return 'Present';
  const [y, m] = String(ym).split('-');
  return m ? `${MONTHS[Number(m) - 1]} ${y}` : y;
}
export const fmtRange = (a, b) => `${fmtMonth(a)} – ${fmtMonth(b)}`;
// Plain-voice years for the résumé surfaces: "2008 to present".
export const fmtYears = (a, b) => `${String(a || '').slice(0, 4)} to ${b ? String(b).slice(0, 4) : 'present'}`;
export const today = () => new Date().toISOString().slice(0, 10);
export const monthYear = (d = new Date()) => d.toLocaleString('en-US', { month: 'long', year: 'numeric' });

// Public = visible and allowed on this surface.
export const shows = (item, surface) => !!item && item.visibility === 'public' && item.status === 'verified' && (item.surfaces || []).includes(surface);
// A role shows unless it is private. Imported roles start as "auto": shown once one of its lines is public.
export const roleShows = (role, surface) => role.visibility === 'private' ? false
  : role.visibility === 'auto' ? (role.groups || []).some((g) => (g.items || []).some((i) => shows(i, surface)))
  : true;

export const SECTIONS = ['snippets', 'skills', 'education', 'certifications', 'volunteer', 'application_only'];

// Every text item in the ledger, flattened (for scans, status, review).
export function allItems(ledger) {
  const out = [];
  const push = (x, where) => { if (x && typeof x === 'object' && 'id' in x && 'text' in x) out.push({ ...x, where }); };
  const p = ledger.person || {};
  push(p.headline, 'person.headline'); push(p.subline, 'person.subline'); push(p.linkedinHeadline, 'person.linkedinHeadline'); push(p.availability, 'person.availability');
  push(ledger.summary, 'summary');
  for (const role of ledger.experience || []) for (const g of role.groups || []) for (const it of g.items || []) push(it, `experience.${role.id}${g.label ? '.' + g.label : ''}`);
  for (const k of SECTIONS) for (const it of ledger[k] || []) push(it, k);
  for (const it of ledger.howIWork?.items || []) push(it, 'howIWork');
  push(ledger.skillsIntro, 'skillsIntro'); push(ledger.interests, 'interests');
  return out;
}

export function findItem(ledger, id) {
  const p = ledger.person || {};
  for (const k of ['headline', 'subline', 'linkedinHeadline', 'availability']) if (p[k]?.id === id) return { item: p[k], set: (v) => (p[k] = v) };
  if (ledger.summary?.id === id) return { item: ledger.summary, set: (v) => (ledger.summary = v) };
  for (const k of ['skillsIntro', 'interests']) if (ledger[k]?.id === id) return { item: ledger[k], set: (v) => (ledger[k] = v) };
  for (const role of ledger.experience || []) for (const g of role.groups || []) {
    const i = (g.items || []).findIndex((x) => x.id === id);
    if (i >= 0) return { item: g.items[i], set: (v) => (g.items[i] = v), list: g.items };
  }
  { const arr = ledger.howIWork?.items || []; const i = arr.findIndex((x) => x.id === id); if (i >= 0) return { item: arr[i], set: (v) => (arr[i] = v), list: arr }; }
  for (const k of SECTIONS) {
    const arr = ledger[k] || []; const i = arr.findIndex((x) => x.id === id);
    if (i >= 0) return { item: arr[i], set: (v) => (arr[i] = v), list: arr };
  }
  return null;
}

// Defaults derived from the person block (all overridable in the ledger).
export function links(L) {
  const p = L.person || {};
  const base = String(p.url || '').replace(/\/+$/, '');
  return {
    site: safeUrl(p.url),
    portfolio: safeUrl(p.portfolioUrl ?? (base ? `${base}/#work` : '')),
    resumePage: safeUrl(p.resumeUrl ?? (base ? `${base}/resume` : '')),
    resumeJson: safeUrl(p.jsonUrl ?? (base ? `${base}/resume.json` : '')),
  };
}
export const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, ''); } catch { return ''; } };

// case-study-maker event logs under projectsRoot: <project>/.case-study/events.json,
// one or two folders deep (for grouped folders). Excluded names are skipped;
// dot folders, node_modules, and symlinks are never followed.
export function projectEventFiles(root, exclude = new Set()) {
  const out = [];
  const skip = (name) => name.startsWith('.') || name === 'node_modules' || exclude.has(name);
  const dirs = (d) => { try { return fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.isSymbolicLink() && !skip(e.name)).map((e) => e.name); } catch { return []; } };
  const events = (d) => { const f = path.join(d, '.case-study', 'events.json'); try { return fs.lstatSync(f).isFile() ? f : null; } catch { return null; } };
  for (const a of dirs(root)) {
    const f = events(path.join(root, a));
    if (f) { out.push({ project: a, file: f }); continue; }
    for (const b of dirs(path.join(root, a))) { const g = events(path.join(root, a, b)); if (g) out.push({ project: `${a}/${b}`, file: g }); }
  }
  return out.sort((x, y) => x.project.localeCompare(y.project));
}

// One writer at a time per workspace (CLI runs, MCP tool calls, two terminals).
// A lock older than 10 minutes is treated as left behind by a crash.
export function lockWorkspace(root = ROOT, waitMs = 60_000) {
  const lock = path.join(root, '.living-resume.lock');
  const until = Date.now() + waitMs;
  for (;;) {
    try { const fd = fs.openSync(lock, 'wx'); fs.writeSync(fd, String(process.pid)); fs.closeSync(fd); break; }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 600_000) { fs.rmSync(lock, { force: true }); continue; } } catch { continue; }
      if (Date.now() > until) throw new Error('Another Living Résumé command is still running in this workspace. Try again in a moment.');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150);
    }
  }
  const release = () => { try { if (fs.readFileSync(lock, 'utf8') === String(process.pid)) fs.rmSync(lock, { force: true }); } catch {} };
  process.on('exit', release);
  return release;
}
