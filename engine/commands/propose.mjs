// propose '<json>'   write one proposal to proposals/<id>.json with status "proposed".
// For AI tools that can't write files (the MCP resume_propose tool runs this). The proposal still
// waits for the user's Approve · Edit · Reject · Later in review; nothing in the ledger changes here.
//   { "id"?, "kind": "add|edit|remove|variant|basics", "section"?, "target"?, "role"?, "newId"?,
//     "text", "reason", "evidence", "fields"?, "surfaces"? }
import fs from 'node:fs';
import { P, writeJSON, loadLedger, findItem, confined, requireWorkspace, safeId, today } from '../lib/util.mjs';

requireWorkspace();
const die = (m) => { console.error(`✗ ${m} Nothing was written.`); process.exit(1); };
let p; try { p = JSON.parse(process.argv[2] || ''); } catch { die('Give the proposal as JSON.'); }
if (!p || typeof p !== 'object' || Array.isArray(p)) die('Give the proposal as a JSON object.');
const KEYS = ['id', 'kind', 'section', 'target', 'role', 'newId', 'text', 'reason', 'evidence', 'fields', 'surfaces'];
const extra = Object.keys(p).filter((k) => !KEYS.includes(k)); if (extra.length) die(`Unknown key(s): ${extra.join(', ')}.`);
const str = (v, what, max, need = true) => {
  if (v === undefined || v === null || v === '') { if (need) die(`${what} is required.`); return undefined; }
  if (typeof v !== 'string' || v.length > max || /[\0-\x08\x0b-\x1f\x7f]/.test(v)) die(`${what} must be text up to ${max} characters.`);
  return v.trim();
};
const id = (v, what) => { try { return safeId(v, what); } catch (e) { die(e.message); } };

const KINDS = ['add', 'edit', 'remove', 'variant', 'basics'];
if (!KINDS.includes(p.kind)) die(`kind must be one of ${KINDS.join(', ')}.`);
const L = loadLedger();
const out = { id: p.id ? id(p.id, 'proposal id') : `p-${today()}-${Date.now().toString(36)}`, kind: p.kind };
// Every proposal says why and where it came from (never invent).
out.reason = str(p.reason, 'reason', 500);
out.evidence = str(p.evidence, 'evidence', 1000);
if (p.kind !== 'remove') out.text = str(p.text, 'text', 2000);

if (['edit', 'remove', 'variant'].includes(p.kind)) {
  out.target = id(p.target, 'target');
  if (!findItem(L, out.target)) die(`No ledger item "${out.target}".`);
}
if (p.kind === 'variant') { if (p.role !== undefined) out.role = id(p.role, 'role'); if (p.newId !== undefined) out.newId = id(p.newId, 'newId'); }
if (p.kind === 'add') {
  const sec = str(p.section, 'section', 120);
  const [s, r, ...g] = sec.split('.');
  const simple = ['summary', 'skills', 'education', 'certifications', 'volunteer', 'snippets', 'howIWork', 'application_only', 'interests', 'skillsIntro'];
  if (s === 'experience') {
    if (!(L.experience || []).some((x) => x.id === r)) die(`No role "${r}" in the ledger (section experience.<role id>).`);
    if (g.length && !/^[\w -]{1,60}$/.test(g.join('.'))) die('The group label after the role id must be plain words.');
  } else if (s === 'person') { if (g.length || !['headline', 'subline', 'linkedinHeadline', 'availability'].includes(r)) die('person sections: person.headline, person.subline, person.linkedinHeadline, person.availability.'); }
  else if (!simple.includes(s) || r !== undefined) die(`Unknown section "${sec}".`);
  out.section = sec;
  if (p.newId !== undefined) out.newId = id(p.newId, 'newId');
}
if (p.fields !== undefined) {
  if (!p.fields || typeof p.fields !== 'object' || Array.isArray(p.fields)) die('fields must be an object.');
  const allowed = p.kind === 'basics' ? ['name', 'email', 'url', 'linkedin', 'city', 'region'] : ['name', 'institution', 'studyType', 'area', 'note', 'issuer', 'role', 'org', 'start', 'end', 'label', 'title', 'chip'];
  out.fields = {};
  for (const [k, v] of Object.entries(p.fields)) { if (!allowed.includes(k)) die(`fields.${k} is not allowed here.`); out.fields[k] = str(v, `fields.${k}`, 200, false) ?? ''; }
} else if (p.kind === 'basics') die('basics needs fields (name, email, url, linkedin, city, region).');
if (p.surfaces !== undefined) {
  const SURF = ['web', 'pdf', 'linkedin', 'json'];
  if (!Array.isArray(p.surfaces) || !p.surfaces.length || p.surfaces.some((x) => !SURF.includes(x))) die(`surfaces must be a list of ${SURF.join(', ')}.`);
  out.surfaces = [...new Set(p.surfaces)];
}
out.status = 'proposed';
out.created = today();

const file = confined(P('proposals', `${out.id}.json`));
if (fs.existsSync(file)) die(`A proposal "${out.id}" already exists. Use a new id.`);
writeJSON(file, out);
console.log(`✓ Proposal ${out.id} is waiting for the user's review (Approve · Edit · Reject · Later). Nothing on the résumé changed.`);
