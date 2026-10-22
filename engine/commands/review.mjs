// review: Approve · Edit · Reject · Later.
//   living-resume review                      list everything waiting
//   living-resume review approve <id>
//   living-resume review edit <id> "new wording"
//   living-resume review reject <id> [reason]
//   living-resume review later <id>
//   living-resume review approve-all <prefix>  approve every waiting proposal whose id starts with <prefix>
// Approved/edited proposals are applied to the ledger (old wording kept in history).
// A proposal is a JSON file in proposals/ (written by the scout skill, by import, or by hand):
//   { id, kind: "add"|"edit"|"remove", target, section, text, surfaces, reason, evidence, fields, status: "proposed" }
import fs from 'node:fs';
import path from 'node:path';
import { P, readJSON, writeJSON, loadLedger, ledgerPath, findItem, today, mdPlain, confined, requireWorkspace, safeId } from '../lib/util.mjs';

requireWorkspace();
const dir = confined(P('proposals'));
fs.mkdirSync(dir, { recursive: true });
const load = () => fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => ({ ...readJSON(path.join(dir, f), {}), file: path.join(dir, f) }));
const save = (p) => { const { file, ...rest } = p; writeJSON(confined(file), rest); };

function apply(L, p, text) {
  const now = today();
  if (p.kind === 'edit' || p.kind === 'remove') {
    const f = findItem(L, p.target);
    if (!f) throw new Error(`No ledger item "${p.target}"`);
    if (p.kind === 'remove') { f.list ? f.list.splice(f.list.indexOf(f.item), 1) : f.set({ ...f.item, visibility: 'private' }); return; }
    f.item.history = [...(f.item.history || []), { text: f.item.text, until: now }];
    f.item.text = text; f.item.updated = now; f.item.status = 'verified';
    if (p.evidence) f.item.evidence = [f.item.evidence, p.evidence].filter(Boolean).join(' | ');
    return;
  }
  // add
  const FIELD_KEYS = ['name', 'institution', 'studyType', 'area', 'note', 'issuer', 'role', 'org', 'start', 'end', 'label', 'title', 'chip'];
  const fields = Object.fromEntries(Object.entries(p.fields || {}).filter(([k, v]) => FIELD_KEYS.includes(k) && (typeof v === 'string' || v === null)));
  const SURF = ['web', 'pdf', 'linkedin', 'json'];
  const surfaces = (Array.isArray(p.surfaces) ? p.surfaces : SURF).filter((x) => SURF.includes(x));
  const item = { ...fields, id: safeId(p.newId || p.id), text, surfaces, visibility: 'public', status: 'verified', evidence: p.evidence || '', updated: now, history: [] };
  const [sec, role, ...rest] = String(p.section || '').split('.'); const group = rest.join('.');
  if (findItem(L, item.id)) throw new Error(`Ledger already has an item "${item.id}"`);
  if (sec === 'person' && ['headline', 'subline', 'linkedinHeadline', 'availability'].includes(role)) { L.person[role] = item; return; }
  if (['summary', 'interests', 'skillsIntro'].includes(sec)) { L[sec] = item; return; }
  if (sec === 'howIWork') { L.howIWork = L.howIWork || { items: [] }; L.howIWork.items.push(item); return; }
  if (sec === 'experience') {
    const r = (L.experience || []).find((x) => x.id === role); if (!r) throw new Error(`No role "${role}"`);
    r.groups = r.groups || [];
    let g = r.groups.find((x) => (x.label || '') === (group || '')); if (!g) { g = { label: group || null, items: [] }; r.groups.push(g); }
    g.items.push(item);
  } else if (['snippets', 'skills', 'education', 'certifications', 'volunteer', 'application_only'].includes(sec)) {
    if (sec === 'application_only') item.visibility = 'application';
    (L[sec] = L[sec] || []).push(item);
  }
  else throw new Error(`Unknown section "${p.section}"`);
}

const [cmd, id, ...rest] = process.argv.slice(2);
if (cmd === 'approve-all') {
  if (!id) { console.error('Give an id prefix, e.g. approve-all import-2026-11-01'); process.exit(1); }
  const L = loadLedger(); let n = 0; const errs = [];
  for (const p of load().filter((x) => x.status === 'proposed' && x.id.startsWith(id))) {
    try { apply(L, p, p.text); p.status = 'approved'; p.final_text = p.text; p.decided = today(); save(p); n++; } catch (e) { errs.push(`${p.id}: ${e.message}`); }
  }
  writeJSON(ledgerPath(), L);
  console.log(`Approved ${n} proposal(s).${errs.length ? `\nSkipped:\n  ${errs.join('\n  ')}` : ''} Run: living-resume build && living-resume check`);
  process.exit(errs.length ? 1 : 0);
}
const all = load();
if (!cmd || cmd === 'list') {
  const groups = { proposed: [], later: [], approved: [], edited: [], rejected: [] };
  for (const p of all) (groups[p.status] || (groups[p.status] = [])).push(p);
  if (!groups.proposed.length) console.log('Nothing waiting for review.');
  for (const p of groups.proposed) {
    console.log(`\n● ${p.id}  [${p.kind}${p.target ? ' ' + p.target : ''}${p.section ? ' → ' + p.section : ''}]  surfaces: ${(p.surfaces || ['web', 'pdf', 'linkedin', 'json']).join(', ')}`);
    console.log(`  ${mdPlain(p.text || '(remove)')}`);
    console.log(`  why: ${p.reason || '-'}`);
  }
  if (groups.later.length) console.log(`\nIncubating (later): ${groups.later.map((p) => p.id).join(', ')}`);
  console.log('\nActions: approve <id> · edit <id> "wording" · reject <id> [reason] · later <id>');
  process.exit(0);
}
const p = all.find((x) => x.id === id);
if (!p) { console.error(`No proposal "${id}"`); process.exit(1); }
if (cmd === 'reject') { p.status = 'rejected'; p.reason_rejected = rest.join(' ') || ''; p.decided = today(); save(p); console.log(`Rejected ${id}. It won't be suggested again.`); }
else if (cmd === 'later') { p.status = 'later'; p.decided = today(); save(p); console.log(`Parked ${id} in incubating. The scout brings it back when related work appears.`); }
else if (cmd === 'approve' || cmd === 'edit') {
  const text = cmd === 'edit' ? rest.join(' ') : p.text;
  if (cmd === 'edit' && !text) { console.error('Give the new wording in quotes.'); process.exit(1); }
  const L = loadLedger(); apply(L, p, text); writeJSON(ledgerPath(), L);
  p.status = cmd === 'edit' ? 'edited' : 'approved'; p.final_text = text; p.decided = today(); save(p);
  console.log(`${cmd === 'edit' ? 'Edited and approved' : 'Approved'} ${id}. Ledger updated. Run: living-resume build && living-resume check`);
} else { console.error(`Unknown action "${cmd}"`); process.exit(1); }
