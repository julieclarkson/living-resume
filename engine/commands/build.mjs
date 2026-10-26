// build: ledger → every format, each released through quarantine/out.
//   dist/<Name>_Resume.pdf · .docx · index.html · resume.json · linkedin-packet.md
//   dist/public-report.md (private review copy) · dist/capability-statement.pdf (Pro)
import fs from 'node:fs';
import crypto from 'node:crypto';
import { P, loadLedger, loadRules, loadSettings, readJSON, writeText, confined, requireWorkspace } from '../lib/util.mjs';
import { printHtml, printModel, jsonResume, webPage, linkedinPacket, publicReport, capabilityHtml } from '../lib/render.mjs';
import { releaseOut } from '../lib/quarantine.mjs';
import { htmlToPdf, htmlToDocx, pdfText, pdfPageCount, renderPdf, findChrome } from '../lib/print.mjs';
import { changesSinceLastPublish } from '../lib/history.mjs';
import { licenseState, productConfig } from '../lib/license.mjs';
import { listRoles, applyRole } from '../lib/roles.mjs';

requireWorkspace();
const L = loadLedger(); const R = loadRules(); const S = loadSettings();
// Start clean: an output that fails to build must never leave last time's copy behind.
const docxName0 = R.pdf_filename.replace(/\.pdf$/, '.docx');
for (const f of [R.pdf_filename, docxName0, 'resume-print.html', 'resume.json', 'index.html', 'linkedin-packet.md', 'public-report.md', 'capability-statement.pdf', '.build.json']) fs.rmSync(confined(P('dist', f)), { force: true });
const pro = licenseState().tier === 'pro'; const cfg = productConfig();
const work = confined(P('quarantine', 'out', '.work'));
fs.mkdirSync(work, { recursive: true });
const report = [];
const held = [];
const release = (rel, content, scanText) => {
  const r = releaseOut(rel, content, R, scanText);
  if (r.released) report.push(`✓ ${rel}`); else { held.push({ rel, ...r }); report.push(`✗ ${rel} HELD in ${r.held}: ${r.violations.map((v) => `${v.rule}: ${v.detail}`).join('; ')}`); }
  return r;
};
const stripTags = (h) => h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');

// 1. Print HTML → PDF (scanned as extracted text when pdftotext exists, else as HTML text)
const html = printHtml(L);
const htmlPath = `${work}/resume-print.html`; writeText(htmlPath, html);
const pdfTmp = `${work}/${R.pdf_filename}`;
let pdfOk = false;
try { const how = renderPdf(printModel(L), htmlPath, pdfTmp); pdfOk = true; if (how === 'fallback') report.push('· PDF made without Chrome (simplified styling, same content)'); } catch (e) { report.push(`✗ PDF: ${e.message}`); }
if (pdfOk) {
  const pages = pdfPageCount(pdfTmp);
  if (pages > R.limits.pdf_max_pages) report.push(`! PDF is ${pages} pages (limit ${R.limits.pdf_max_pages})`);
  release(R.pdf_filename, fs.readFileSync(pdfTmp), pdfText(pdfTmp) ?? stripTags(html));
}
release('resume-print.html', html, stripTags(html));

// 2. DOCX
const docxName = R.pdf_filename.replace(/\.pdf$/, '.docx');
const docxTmp = `${work}/${docxName}`;
if (htmlToDocx(htmlPath, docxTmp)) release(docxName, fs.readFileSync(docxTmp), stripTags(html));
else report.push('! DOCX skipped (needs macOS textutil or pandoc)');

// 3. JSON Resume for websites + machine readers
release('resume.json', JSON.stringify(jsonResume(L), null, 2) + '\n');

// 4. Hostable web page (Free shows one small credit link; Pro removes it), LinkedIn packet, public report
const credit = pro ? null : cfg.credit;
const page = webPage(L, { credit, pdfHref: pdfOk ? R.pdf_filename : '' });
release('index.html', page, page.replace(/<style[\s\S]*?<\/style>/g, ' '));
const packet = linkedinPacket(L, R, changesSinceLastPublish(L), S);
for (const w of packet.warnings) report.push(`! LinkedIn: ${w}`);
release('linkedin-packet.md', packet.text);
writeText(P('dist', 'public-report.md'), publicReport(L)); report.push('✓ public-report.md (private review copy)');

// 5. Capability statement (Pro vendor kit)
const vendor = readJSON(P('vendor-kit', 'profile.json'), null);
if (vendor?.company && pro && !findChrome()) report.push('· capability statement needs Google Chrome; skipped');
else if (vendor?.company && pro) {
  const ch = capabilityHtml(L, vendor); const chPath = `${work}/capability-statement.html`; writeText(chPath, ch);
  try { const out = `${work}/capability-statement.pdf`; htmlToPdf(chPath, out); release('capability-statement.pdf', fs.readFileSync(out), pdfText(out) ?? stripTags(ch)); }
  catch (e) { report.push(`✗ capability statement: ${e.message}`); }
} else if (vendor?.company) report.push('· capability statement skipped (Pro)');

// 6. Role versions: dist/roles/<slug>/<Name>_Resume.pdf + .docx (Free builds the first role only)
fs.rmSync(confined(P('dist', 'roles')), { recursive: true, force: true });
listRoles().forEach((r, i) => {
  if (i > 0 && !pro) { report.push(`· role ${r.slug} skipped (more than one role is Pro)`); return; }
  let V; try { V = applyRole(L, r); } catch (e) { held.push({ rel: `roles/${r.slug}` }); report.push(`✗ role ${r.slug}: ${e.message}`); return; }
  const rh = printHtml(V, { title: `${L.person.name} - Résumé` }); const hp = `${work}/role-${r.slug}.html`; writeText(hp, rh);
  try {
    const pdf = `${work}/role-${r.slug}.pdf`; renderPdf(printModel(V), hp, pdf);
    const pages = pdfPageCount(pdf); if (pages > R.limits.pdf_max_pages) report.push(`! role ${r.slug} is ${pages} pages (limit ${R.limits.pdf_max_pages}); exclude a line in its profile`);
    release(`roles/${r.slug}/${R.pdf_filename}`, fs.readFileSync(pdf), pdfText(pdf) ?? stripTags(rh));
    const dx = `${work}/role-${r.slug}.docx`; if (htmlToDocx(hp, dx)) release(`roles/${r.slug}/${docxName}`, fs.readFileSync(dx), stripTags(rh));
  } catch (e) { report.push(`✗ role ${r.slug} PDF: ${e.message}`); }
});

// 7. Ready-to-upload site folder: dist/site/ = the web page, the PDF, and the machine-readable file.
//    Drag it onto Netlify Drop (no account needed to start), or upload it to any host.
fs.rmSync(confined(P('dist', 'site')), { recursive: true, force: true });
if (pdfOk && !held.length) {
  fs.mkdirSync(confined(P('dist', 'site')), { recursive: true });
  for (const f of ['index.html', 'resume.json', R.pdf_filename]) if (fs.existsSync(P('dist', f))) fs.copyFileSync(P('dist', f), confined(P('dist', 'site', f)));
  report.push('✓ site/ (ready to upload: index.html, resume.json, PDF)');
}

fs.rmSync(work, { recursive: true, force: true });
// Stamp: check refuses a dist/ that was built from a different ledger or rules.
const hash = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
if (!held.length && pdfOk) writeText(P('dist', '.build.json'), JSON.stringify({ ledger: hash(P('resume', 'ledger.json')), rules: hash(P('resume', 'rules.json')), builtAt: new Date().toISOString() }) + '\n');
console.log(report.join('\n'));
if (!pdfOk) { console.error('\n✗ The PDF could not be built, so nothing in dist/ is ready to publish.'); process.exit(1); }
if (held.length) { console.error(`\n${held.length} file(s) held in quarantine/out. Fix the ledger and rebuild.`); process.exit(1); }
console.log(`\nBuild complete → ${P('dist')}`);
