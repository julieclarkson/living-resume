// style                                   show this person's style choices
// style dates years|months|auto           role dates as years, months where known, or months only when every role has them
// style certs list|line                   certificates as a list, or one line ("Certificates in A and B")
// style counts on|off                     off: the coach never asks for numbers (no client or student counts)
// Choices are the user's; set them only on their word.
import { P, loadLedger, ledgerPath, writeJSON, readJSON, requireWorkspace } from '../lib/util.mjs';

requireWorkspace();
const [what, value] = process.argv.slice(2);
const L = loadLedger(); const rubricPath = P('resume', 'rubric.json'); const rubric = readJSON(rubricPath, {});
const show = () => console.log(`dates   ${L.dateStyle || 'auto'}\ncerts   ${L.certStyle || 'list'}\ncounts  ${rubric.coach?.counts === false ? 'off' : 'on'}`);
const die = (m) => { console.error(`✗ ${m}`); process.exit(1); };
if (!what) { show(); process.exit(0); }
if (what === 'dates') {
  if (!['years', 'months', 'auto'].includes(value)) die('dates must be years, months, or auto.');
  if (value === 'auto') delete L.dateStyle; else L.dateStyle = value; writeJSON(ledgerPath(), L);
} else if (what === 'certs') {
  if (!['list', 'line'].includes(value)) die('certs must be list or line.');
  if (value === 'list') delete L.certStyle; else L.certStyle = value; writeJSON(ledgerPath(), L);
} else if (what === 'counts') {
  if (!['on', 'off'].includes(value)) die('counts must be on or off.');
  rubric.coach = { ...(rubric.coach || {}), counts: value === 'on' }; writeJSON(rubricPath, rubric);
} else die('Use: style dates|certs|counts <choice>');
show(); console.log(what === 'counts' ? 'Next: the coach uses this right away.' : 'Next: build to see it in every format.');
