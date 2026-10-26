// fix-role <role-id> '<json>'   fix an imported role header: title, org, location, start, end,
// and volunteer (true lists the role after paid roles; only on the user's word).
// Only those fields of one experience[] entry change; its lines, visibility and everything
// else in the ledger stay as they are. (The skill allows the same edit by hand after import.)
import { writeJSON, loadLedger, ledgerPath, requireWorkspace } from '../lib/util.mjs';

requireWorkspace();
const die = (m) => { console.error(`✗ ${m} Nothing changed.`); process.exit(1); };
const [roleId, json] = process.argv.slice(2);
let f; try { f = JSON.parse(json || ''); } catch { die('Give the fields as JSON, for example {"title":"Office Manager","org":"Brightway Dental"}.'); }
if (!f || typeof f !== 'object' || Array.isArray(f)) die('Give the fields as a JSON object.');
const KEYS = ['title', 'org', 'location', 'start', 'end', 'volunteer'];
const bad = Object.keys(f).filter((k) => !KEYS.includes(k)); if (bad.length) die(`Only ${KEYS.join(', ')} can change here (not ${bad.join(', ')}).`);
if (!Object.keys(f).length) die('Give at least one of title, org, location, start, end, volunteer.');
const L = loadLedger();
const role = (L.experience || []).find((r) => r.id === roleId);
if (!role) die(`No role "${roleId}". Role ids are in the review list (experience.<role id>).`);
const DATE = /^(19|20)\d{2}(-(0[1-9]|1[0-2]))?$/;
for (const k of KEYS) {
  if (!(k in f)) continue;
  const v = f[k];
  // true: list after paid roles. false: the user chose to keep it where it is (the coach stops suggesting the move).
  if (k === 'volunteer') { if (typeof v !== 'boolean') die('volunteer must be true or false.'); role.volunteer = v; continue; }
  if (k === 'end' && (v === null || v === '' || /^present$/i.test(String(v)))) { role.end = null; continue; }
  if (typeof v !== 'string' || v.length > 200 || /[\0-\x1f\x7f]/.test(v)) die(`${k} must be one line of text up to 200 characters.`);
  if ((k === 'start' || k === 'end') && !DATE.test(v.trim())) die(`${k} must look like 2019 or 2019-03.`);
  if (k === 'start' && !v.trim()) die('start is required.');
  role[k] = v.trim();
}
writeJSON(ledgerPath(), L);
console.log(`✓ Role header fixed: ${role.title || '(no title)'}${role.org ? ` at ${role.org}` : ''}${role.location ? `, ${role.location}` : ''} (${role.start || '?'} to ${role.end || 'present'})${role.volunteer ? ', listed after paid roles' : ''}.`);
