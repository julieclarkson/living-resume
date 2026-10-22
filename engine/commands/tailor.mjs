// tailor (Pro) <posting-file> <slug>   (e.g. postings/acme.txt acme-ai-contract)
// Makes an UNPUBLISHED version for one posting: the posting is quarantined first,
// then verified ledger lines are reordered by relevance. No new claims, ever.
// Application-only lines are allowed here (never on public surfaces).
// The AI tool may then rephrase within applications/<slug>/ledger.json (verified
// claims only) and re-run:  living-resume tailor --render <slug>
import fs from 'node:fs';
import path from 'node:path';
import { P, readJSON, writeJSON, writeText, loadLedger, loadRules, confined, mdPlain, today, safeId, requireWorkspace } from '../lib/util.mjs';
import { requirePro } from '../lib/license.mjs';
import { scanIn, scanOut } from '../lib/quarantine.mjs';
import { printHtml } from '../lib/render.mjs';
import { htmlToPdf, htmlToDocx } from '../lib/print.mjs';

requireWorkspace();
{ const g = await requirePro('tailor'); if (!g.ok) { console.error(g.message); process.exit(3); } }
const args = process.argv.slice(2);
const R = loadRules();
const render = (slug) => {
  const dir = confined(P('applications', safeId(slug, 'slug')));
  const L = readJSON(path.join(dir, 'ledger.json'));
  // Tailored versions may include application-only lines: expose them on the 'pdf' surface for this render only.
  // Only verified lines are ever exposed, and only into the most recent role.
  const first = L.experience?.[0];
  for (const it of (L.application_only || []).filter((x) => x.status === 'verified')) {
    if (!first) break;
    it.visibility = 'public'; it.surfaces = ['pdf'];
    if (!first.groups?.length) first.groups = [{ label: null, items: [] }];
    first.groups[0].items.push(it);
  }
  L.application_only = [];
  const html = printHtml(L, { title: `${L.person.name} - Résumé` });
  const ov = scanOut(html.replace(/<[^>]+>/g, ' '), R);
  if (ov.length) { console.error(`✗ Tailored version held: ${ov.map((v) => v.detail).join('; ')}`); process.exit(1); }
  writeText(path.join(dir, 'resume.html'), html);
  const pdf = path.join(dir, R.pdf_filename);
  try { htmlToPdf(path.join(dir, 'resume.html'), pdf); console.log(`✓ ${path.relative(P(), pdf)}`); } catch (e) { console.log(`✗ PDF: ${e.message}`); }
  const docx = pdf.replace(/\.pdf$/, '.docx'); if (htmlToDocx(path.join(dir, 'resume.html'), docx)) console.log(`✓ ${path.relative(P(), docx)}`);
};

if (args[0] === '--render') { render(args[1]); process.exit(0); }
const [postingFile, slug] = args;
if (!postingFile || !slug) { console.error('Usage: living-resume tailor <posting-file> <slug>'); process.exit(1); }
safeId(slug, 'slug');
if (!fs.existsSync(postingFile) || !fs.statSync(postingFile).isFile()) { console.error(`No posting file at ${postingFile}`); process.exit(1); }
if (fs.statSync(postingFile).size > 512 * 1024) { console.error('That posting is larger than 512 KB; save just the job text.'); process.exit(1); }
const text = fs.readFileSync(postingFile, 'utf8');
const verdict = scanIn(text);
const dir = confined(P('applications', slug));
fs.mkdirSync(dir, { recursive: true });
writeJSON(path.join(dir, 'posting.verdict.json'), verdict);
if (!verdict.clean) { console.error(`✗ Posting rejected by quarantine: ${verdict.threats.map((t) => t.name).join(', ')}. Nothing was tailored.`); process.exit(1); }
writeText(path.join(dir, 'posting.txt'), text);

const words = new Set(text.toLowerCase().match(/[a-z][a-z+.#-]{2,}/g) || []);
const score = (s) => (mdPlain(s).toLowerCase().match(/[a-z][a-z+.#-]{2,}/g) || []).filter((w) => words.has(w)).length;
const L = loadLedger();
for (const role of L.experience || []) for (const g of role.groups || []) (g.items || []).sort((a, b) => score(b.text) - score(a.text));
(L.skills || []).sort((a, b) => score(b.text) - score(a.text));
writeJSON(path.join(dir, 'ledger.json'), L);
render(slug);

const log = readJSON(P('applications', 'applications.json'), []);
log.push({ slug, date: today(), posting: path.basename(postingFile), status: 'drafted', files: fs.readdirSync(dir) });
writeJSON(P('applications', 'applications.json'), log);
console.log(`\nLogged in applications/applications.json. Ask your AI tool to "write a cover note for ${slug}" (it uses only verified ledger lines).`);
