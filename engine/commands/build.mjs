// build: ledger → every format, each released through quarantine/out.
//   dist/<Name>_Resume.pdf · .docx · index.html · resume.json · linkedin-packet.md
//   dist/public-report.md (private review copy) · dist/capability-statement.pdf (Pro)
import fs from 'node:fs';
import { P, loadLedger, loadRules, loadSettings, readJSON, writeText, confined, requireWorkspace } from '../lib/util.mjs';
import { printHtml, jsonResume, webPage, linkedinPacket, publicReport, capabilityHtml } from '../lib/render.mjs';
import { releaseOut } from '../lib/quarantine.mjs';
import { htmlToPdf, htmlToDocx, pdfText, pdfPageCount } from '../lib/print.mjs';
import { changesSinceLastPublish } from '../lib/history.mjs';
import { licenseState, productConfig } from '../lib/license.mjs';

requireWorkspace();
const L = loadLedger(); const R = loadRules(); const S = loadSettings();
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
try { htmlToPdf(htmlPath, pdfTmp); pdfOk = true; } catch (e) { report.push(`✗ PDF: ${e.message}`); }
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
if (vendor?.company && pro) {
  const ch = capabilityHtml(L, vendor); const chPath = `${work}/capability-statement.html`; writeText(chPath, ch);
  try { const out = `${work}/capability-statement.pdf`; htmlToPdf(chPath, out); release('capability-statement.pdf', fs.readFileSync(out), pdfText(out) ?? stripTags(ch)); }
  catch (e) { report.push(`✗ capability statement: ${e.message}`); }
} else if (vendor?.company) report.push('· capability statement skipped (Pro)');

fs.rmSync(work, { recursive: true, force: true });
console.log(report.join('\n'));
if (held.length) { console.error(`\n${held.length} file(s) held in quarantine/out. Fix the ledger and rebuild.`); process.exit(1); }
console.log(`\nBuild complete → ${P('dist')}`);
