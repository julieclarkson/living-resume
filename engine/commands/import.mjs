// import <file|folder>
//   LinkedIn data export (.zip, or the unzipped folder), résumé .pdf / .docx / .txt / .md.
// 1. A copy goes into quarantine/in/imports/ and its text is scanned before anything reads it.
// 2. The text becomes a private draft (imports/<stamp>.draft.json) plus role outlines in the ledger
//    (hidden until one of their lines is approved) and one proposal per line in proposals/.
// 3. Nothing is public until you approve it:  living-resume review
import fs from 'node:fs';
import path from 'node:path';
import { P, writeJSON, loadLedger, ledgerPath, confined, requireWorkspace, today } from '../lib/util.mjs';
import { scanIn } from '../lib/quarantine.mjs';
import { extract, fromLinkedInFiles, fromText, toProposals } from '../lib/importer.mjs';

requireWorkspace();
const src = process.argv[2];
if (!src) { console.error('Usage: living-resume import <LinkedIn export .zip or folder | résumé .pdf/.docx/.txt/.md>'); process.exit(1); }
const abs = path.resolve(src);
if (!fs.existsSync(abs)) { console.error(`Not found: ${src}`); process.exit(1); }
if (fs.lstatSync(abs).isSymbolicLink()) { console.error('Refusing to import through a symlink. Point at the file itself.'); process.exit(1); }

let got;
try { got = extract(abs); } catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }

// Quarantine: keep a copy of the original (files only) with the verdict, before any parsing.
const stamp = `${today()}-${Date.now().toString(36)}`;
const base = path.basename(abs).replace(/[^\w.-]+/g, '_').slice(0, 80);
// Scan each file on its own (a big export is several small files), and keep the worst verdict.
const threats = []; for (const part of got.parts) for (const t of scanIn(part.text).threats) threats.push({ ...t, file: part.name });
const verdict = { clean: threats.length === 0, threats };
const qdir = confined(P('quarantine', verdict.clean ? 'approved' : 'rejected', 'imports'));
fs.mkdirSync(qdir, { recursive: true });
if (fs.statSync(abs).isFile()) fs.copyFileSync(abs, confined(path.join(qdir, `${stamp}-${base}`)));
writeJSON(confined(path.join(qdir, `${stamp}-${base}.verdict.json`)), { file: base, scannedAt: new Date().toISOString(), ...verdict });
if (!verdict.clean) {
  console.error(`✗ Import stopped. The file contains text that looks like instructions to an AI or code (${[...new Set(verdict.threats.map((t) => t.name))].join(', ')}).`);
  console.error('  Nothing was read into your résumé. If this is your own file, remove that text and import again.');
  process.exit(1);
}

const draft = got.kind === 'linkedin' ? fromLinkedInFiles(got.files) : fromText(got.parts[0].text, path.extname(abs).toLowerCase() === '.pdf' ? 'résumé PDF' : 'résumé');
const L = loadLedger();
const evidence = `imported from ${base} on ${today()}`;
const prefix = `import-${today()}-${Date.now().toString(36).slice(-4)}`;
const { proposals, roles } = toProposals(draft, { ledger: L, prefix, evidence });

// Contact basics are a proposal like every other line (never imported: phone, street address, birth date).
L.experience = [...(L.experience || []), ...roles];
writeJSON(ledgerPath(), L);

for (const pr of proposals) writeJSON(confined(P('proposals', `${pr.id}.json`)), pr);
writeJSON(confined(P('imports', `${stamp}.draft.json`)), { ...draft, evidence, proposals: proposals.map((x) => x.id), roles: roles.map((r) => r.id) });

console.log(`✓ Imported your ${draft.source} (${got.kind === 'linkedin' ? 'structured' : 'read from text'}).`);
const basics = proposals.find((x) => x.kind === 'basics'); if (basics) console.log(`  Contact details to confirm: ${basics.text}`);
console.log(`  Roles outlined: ${roles.length} (hidden until one of their lines is approved)`);
console.log(`  Lines waiting for your review: ${proposals.length}`);
if (draft.unplaced?.length) console.log(`  ${draft.unplaced.length} line(s) couldn't be placed; see imports/${stamp}.draft.json`);
console.log(`\nNothing is public yet. Next: living-resume review   (or ask your AI tool: "review my résumé updates")`);
