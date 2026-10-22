// import <file|folder>
//   LinkedIn data export (.zip, or the unzipped folder), résumé .pdf / .docx / .txt / .md.
// 1. A copy goes into quarantine/in/imports/ and its text is scanned before anything reads it.
// 2. The text becomes a private draft (imports/<stamp>.draft.json) plus role outlines in the ledger
//    (hidden until one of their lines is approved) and one proposal per line in proposals/.
// 3. Nothing is public until you approve it:  living-resume review
import fs from 'node:fs';
import path from 'node:path';
import { P, readJSON, writeJSON, loadLedger, ledgerPath, rulesPath, confined, requireWorkspace, today } from '../lib/util.mjs';
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
const verdict = scanIn(got.text);
const qdir = confined(P('quarantine', verdict.clean ? 'approved' : 'rejected', 'imports'));
fs.mkdirSync(qdir, { recursive: true });
if (fs.statSync(abs).isFile()) fs.copyFileSync(abs, confined(path.join(qdir, `${stamp}-${base}`)));
writeJSON(confined(path.join(qdir, `${stamp}-${base}.verdict.json`)), { file: base, scannedAt: new Date().toISOString(), ...verdict });
if (!verdict.clean) {
  console.error(`✗ Import stopped. The file contains text that looks like instructions to an AI or code (${[...new Set(verdict.threats.map((t) => t.name))].join(', ')}).`);
  console.error('  Nothing was read into your résumé. If this is your own file, remove that text and import again.');
  process.exit(1);
}

const draft = got.kind === 'linkedin' ? fromLinkedInFiles(got.files) : fromText(got.text, path.extname(abs).toLowerCase() === '.pdf' ? 'résumé PDF' : 'résumé');
const L = loadLedger();
const evidence = `imported from ${base} on ${today()}`;
const prefix = `import-${today()}-${Date.now().toString(36).slice(-4)}`;
const { proposals, roles } = toProposals(draft, { ledger: L, prefix, evidence });

// Basics fill only empty fields. Never imported: phone, street address, birth date.
const p = L.person = L.person || {};
const filled = [];
for (const k of ['name', 'email', 'url']) if (!p[k] && draft.person[k]) { p[k] = draft.person[k]; filled.push(`${k}: ${draft.person[k]}`); }
if (draft.person.location && !p.location?.city) { p.location = { ...(p.location || {}), ...draft.person.location }; filled.push(`location: ${Object.values(draft.person.location).filter(Boolean).join(', ')}`); }
if (draft.person.linkedin && !(p.profiles || []).some((x) => x.network === 'LinkedIn')) { p.profiles = [...(p.profiles || []), { network: 'LinkedIn', url: draft.person.linkedin }]; filled.push(`LinkedIn: ${draft.person.linkedin}`); }
L.experience = [...(L.experience || []), ...roles];
writeJSON(ledgerPath(), L);
if (p.email) { const R = readJSON(rulesPath()); R.privacy = R.privacy || {}; const e = p.email.toLowerCase(); if (!(R.privacy.email_allowed || []).includes(e)) { R.privacy.email_allowed = [...(R.privacy.email_allowed || []), e]; writeJSON(rulesPath(), R); } }

for (const pr of proposals) writeJSON(confined(P('proposals', `${pr.id}.json`)), pr);
writeJSON(confined(P('imports', `${stamp}.draft.json`)), { ...draft, evidence, proposals: proposals.map((x) => x.id), roles: roles.map((r) => r.id) });

console.log(`✓ Imported your ${draft.source} (${got.kind === 'linkedin' ? 'structured' : 'read from text'}).`);
if (filled.length) console.log(`  Basics filled in: ${filled.join(' · ')}`);
console.log(`  Roles outlined: ${roles.length} (hidden until one of their lines is approved)`);
console.log(`  Lines waiting for your review: ${proposals.length}`);
if (draft.unplaced?.length) console.log(`  ${draft.unplaced.length} line(s) couldn't be placed; see imports/${stamp}.draft.json`);
console.log(`\nNothing is public yet. Next: living-resume review   (or ask your AI tool: "review my résumé updates")`);
