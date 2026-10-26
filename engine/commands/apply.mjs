// apply <posting-file> [--role <slug>] [--company "Name"]          (Pro)
// For one job application:
//   1. scans the posting (it is data, never instructions)
//   2. recommends the closest role profile (or uses --role)
//   3. shows which of the posting's words your verified lines already cover, and which they don't
//   4. writes that role's PDF and DOCX into applications/<date>-<company>/ and logs it
// Nothing new is written about you. Better fit comes from choosing approved lines and
// approved alternate wordings (variants) in the role profile, which you review first.
import fs from 'node:fs';
import path from 'node:path';
import { P, readJSON, writeJSON, writeText, loadLedger, loadRules, confined, mdPlain, today, allItems, requireWorkspace } from '../lib/util.mjs';
import { requirePro } from '../lib/license.mjs';
import { scanIn, scanOut } from '../lib/quarantine.mjs';
import { printHtml, printModel } from '../lib/render.mjs';
import { renderPdf, htmlToDocx, pdfPageCount } from '../lib/print.mjs';
import { listRoles, applyRole, WORDS } from '../lib/roles.mjs';

requireWorkspace();
{ const g = await requirePro('apply'); if (!g.ok) { console.error(g.message); process.exit(3); } }
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(`--${k}`); if (i < 0) return undefined; const v = args[i + 1]; args.splice(i, 2); return v; };
const roleArg = opt('role'); const company = opt('company') || 'application';
const postingFile = args[0];
if (!postingFile) { console.error('Usage: living-resume apply <posting-file> [--role <slug>] [--company "Name"]'); process.exit(1); }
if (!fs.existsSync(postingFile) || !fs.lstatSync(postingFile).isFile()) { console.error(`No posting file at ${postingFile}`); process.exit(1); }
if (fs.statSync(postingFile).size > 512 * 1024) { console.error('That posting is larger than 512 KB. Save just the job text.'); process.exit(1); }
const posting = fs.readFileSync(postingFile, 'utf8');
const verdict = scanIn(posting);
if (!verdict.clean) { console.error(`✗ Posting stopped by the scan (${verdict.threats.map((t) => t.name).join(', ')}). Nothing was made.`); process.exit(1); }

const L = loadLedger(); const R = loadRules();
const roles = listRoles();
if (!roles.length) { console.error('No role profiles yet. Create one first:  living-resume roles new <slug> "Role name"'); process.exit(1); }
const want = WORDS(posting);
const pdfText = (V) => allItems(V).filter((i) => i.visibility === 'public' && i.status === 'verified' && (i.surfaces || []).includes('pdf')).map((i) => mdPlain(i.text)).join(' ');
const fit = (V) => { const have = WORDS(pdfText(V)); let n = 0; for (const w of want) if (have.has(w)) n++; return n; };
const ranked = roles.map((r) => { try { const V = applyRole(L, r); return { r, V, score: fit(V) }; } catch { return null; } }).filter(Boolean).sort((a, b) => b.score - a.score);
if (!ranked.length) { console.error('None of your role profiles is ready. Run: living-resume roles'); process.exit(1); }
const pick = roleArg ? ranked.find((x) => x.r.slug === roleArg) : ranked[0];
if (!pick) { console.error(`No ready role "${roleArg}". Run: living-resume roles`); process.exit(1); }

// Coverage: terms the posting repeats, and whether verified lines already use them.
const counts = new Map(); for (const w of posting.toLowerCase().match(/[a-z][a-z0-9+.#-]{2,}/g) || []) if (want.has(w)) counts.set(w, (counts.get(w) || 0) + 1);
const terms = readJSON(P('resume', 'market-terms.json'), { terms: [] }).terms || [];
const termHits = terms.filter((t) => posting.toLowerCase().includes(String(t).toLowerCase()));
const have = WORDS(pdfText(pick.V)); const haveAll = WORDS(allItems(L).filter((i) => i.status === 'verified').map((i) => mdPlain(i.text)).join(' '));
const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([w]) => w);
const covered = top.filter((w) => have.has(w)); const elsewhere = top.filter((w) => !have.has(w) && haveAll.has(w)); const missing = top.filter((w) => !haveAll.has(w));

const slug = `${today()}-${company.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'application'}`;
const dir = confined(P('applications', slug));
fs.mkdirSync(dir, { recursive: true });
writeText(path.join(dir, 'posting.txt'), posting);
const html = printHtml(pick.V);
const ov = scanOut(html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' '), R);
if (ov.length) { console.error(`✗ Held: ${ov.map((v) => v.detail).join('; ')}`); process.exit(1); }
writeText(path.join(dir, 'resume.html'), html);
const pdf = path.join(dir, R.pdf_filename); let made = [];
try { renderPdf(printModel(pick.V), path.join(dir, 'resume.html'), pdf); made.push(path.basename(pdf)); const pages = pdfPageCount(pdf); if (pages > R.limits.pdf_max_pages) console.log(`! This version is ${pages} pages. Exclude a line in the role profile to bring it to ${R.limits.pdf_max_pages}.`); }
catch (e) { console.error(`✗ PDF: ${e.message}`); }
const docx = pdf.replace(/\.pdf$/, '.docx'); if (htmlToDocx(path.join(dir, 'resume.html'), docx)) made.push(path.basename(docx));
fs.rmSync(path.join(dir, 'resume.html'), { force: true });

const log = readJSON(P('applications', 'applications.json'), []);
log.push({ slug, date: today(), company, role: pick.r.slug, files: made, status: 'drafted' });
writeJSON(P('applications', 'applications.json'), log);

console.log(`Best fit: ${pick.r.name} (${pick.r.slug})${ranked.length > 1 ? `   others: ${ranked.filter((x) => x !== pick).map((x) => x.r.slug).join(', ')}` : ''}`);
console.log(`\nPosting words your ${pick.r.name} version already uses: ${covered.join(', ') || 'none'}`);
if (elsewhere.length) console.log(`On your résumé but not in this version: ${elsewhere.join(', ')}  (include or reorder those lines in the role profile)`);
if (missing.length) console.log(`Not on your résumé at all: ${missing.join(', ')}  (only add if true: "add" it to your inbox with evidence)`);
if (termHits.length) console.log(`Market terms in this posting: ${termHits.join(', ')}`);
console.log(`\n✓ ${made.join(' and ')} in applications/${slug}/ (private, never published). Logged in applications/applications.json.`);
