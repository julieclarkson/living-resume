// heading                      show this résumé's section headings
// heading <section> "Text"     rename a section for this person only (stored in their own ledger)
// heading <section> --reset    back to the default
// Sections: experience · howIWork · skills · education · community · publications
import { loadLedger, ledgerPath, writeJSON, requireWorkspace } from '../lib/util.mjs';

requireWorkspace();
const DEFAULTS = { experience: 'Experience', howIWork: 'How I work', skills: 'Skills', education: 'Education', community: 'Community and volunteer', publications: 'Publications and talks' };
const [section, ...rest] = process.argv.slice(2);
const L = loadLedger(); L.headings = L.headings || {};
if (!section) { for (const [k, d] of Object.entries(DEFAULTS)) console.log(`${k.padEnd(13)} ${L.headings[k] || d}${L.headings[k] ? '' : '  (default)'}`); process.exit(0); }
if (!(section in DEFAULTS)) { console.error(`✗ No section "${section}". Use one of: ${Object.keys(DEFAULTS).join(', ')}`); process.exit(1); }
if (rest[0] === '--reset') delete L.headings[section];
else {
  const text = rest.join(' ').trim();
  if (!text || text.length > 40 || /[<>{}]|[:;→]/.test(text)) { console.error('✗ Give a short heading (40 characters at most, no : ; → or markup).'); process.exit(1); }
  L.headings[section] = text;
}
writeJSON(ledgerPath(), L);
console.log(`✓ ${section}: ${L.headings[section] || DEFAULTS[section]}. Next: build to see it in every format.`);
