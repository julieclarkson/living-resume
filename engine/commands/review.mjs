// review: Approve · Edit · Reject · Later.
//   living-resume review                      list everything waiting
//   living-resume review approve <id>
//   living-resume review edit <id> "new wording"
//   living-resume review reject <id> [reason]
//   living-resume review later <id>
//   living-resume review approve-all <prefix>  approve every waiting proposal whose id starts with <prefix>
//   living-resume review reject-all <prefix>   reject every waiting proposal whose id starts with <prefix>
//                                              (an earlier import that a new one replaces)
// Approved/edited proposals are applied to the ledger (old wording kept in history).
// A proposal is a JSON file in proposals/ (written by the scout skill, by import, or by hand):
//   { id, kind: "add"|"edit"|"remove", target, section, text, surfaces, reason, evidence, fields, status: "proposed" }
import fs from 'node:fs';
import path from 'node:path';
import { P, readJSON, writeJSON, loadLedger, ledgerPath, rulesPath, findItem, today, mdPlain, confined, requireWorkspace, safeId, httpsUrl } from '../lib/util.mjs';

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
    if (httpsUrl(p.link)) f.item.link = httpsUrl(p.link);
    if (p.evidence) f.item.evidence = [f.item.evidence, p.evidence].filter(Boolean).join(' | ');
    return;
  }
  if (p.kind === 'variant') {
    // An approved alternate wording of an existing line, used only by role profiles.
    const f = findItem(L, p.target);
    if (!f) throw new Error(`No ledger item "${p.target}"`);
    const vid = safeId(p.newId || `${p.target}-${p.role || 'alt'}`, 'variant id');
    f.item.variants = (f.item.variants || []).filter((v) => v.id !== vid);
    f.item.variants.push({ id: vid, text, status: 'verified', approved: now, ...(p.role ? { role: p.role } : {}) });
    if (p.role && /^[a-z0-9][a-z0-9._-]{0,79}$/i.test(p.role)) {
      // Point the role profile at the new wording, so approving is the only step.
      const rf = confined(P('resume', 'roles', `${p.role}.json`));
      if (fs.existsSync(rf)) { const r = readJSON(rf); if (p.target === L.person?.headline?.id) r.headline = vid; else r.variants = { ...(r.variants || {}), [p.target]: vid }; writeJSON(rf, r); }
    }
    return;
  }
  if (p.kind === 'basics') {
    // Contact details: fill only empty fields; approving an email also allows it in public files.
    const f = p.fields || {}; const P = L.person = L.person || {};
    const str = (v) => (typeof v === 'string' ? v.trim().slice(0, 200) : '');
    for (const k of ['name', 'email', 'url']) if (str(f[k]) && !P[k]) P[k] = str(f[k]);
    if (P.url && !/^https?:\/\//.test(P.url)) delete P.url;
    if ((str(f.city) || str(f.region)) && !P.location?.city) P.location = { ...(P.location || {}), city: str(f.city), region: str(f.region) };
    if (/^https:\/\/(www\.)?linkedin\.com\/in\//.test(str(f.linkedin)) && !(P.profiles || []).some((x) => x.network === 'LinkedIn')) P.profiles = [...(P.profiles || []), { network: 'LinkedIn', url: str(f.linkedin) }];
    if (P.email) { const R = readJSON(rulesPath()); R.privacy = R.privacy || {}; const e = P.email.toLowerCase(); if (!(R.privacy.email_allowed || []).includes(e)) { R.privacy.email_allowed = [...(R.privacy.email_allowed || []), e]; writeJSON(rulesPath(), R); } }
    return;
  }
  // add
  const FIELD_KEYS = ['name', 'institution', 'studyType', 'area', 'note', 'issuer', 'role', 'org', 'start', 'end', 'label', 'title', 'chip'];
  const fields = Object.fromEntries(Object.entries(p.fields || {}).filter(([k, v]) => FIELD_KEYS.includes(k) && (typeof v === 'string' || v === null)));
  const SURF = ['web', 'pdf', 'linkedin', 'json'];
  const surfaces = (Array.isArray(p.surfaces) ? p.surfaces : SURF).filter((x) => SURF.includes(x));
  const item = { ...fields, id: safeId(p.newId || p.id), text, surfaces, visibility: 'public', status: 'verified', evidence: p.evidence || '', updated: now, history: [], ...(httpsUrl(p.link) ? { link: httpsUrl(p.link) } : {}) };
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
  } else if (['snippets', 'skills', 'education', 'certifications', 'publications', 'volunteer', 'application_only'].includes(sec)) {
    if (sec === 'application_only') item.visibility = 'application';
    (L[sec] = L[sec] || []).push(item);
  }
  else throw new Error(`Unknown section "${p.section}"`);
}

const [cmd, id, ...rest] = process.argv.slice(2);
const MCP = process.env.LIVING_RESUME_VIA === 'mcp';
const NEXT = MCP ? 'Next: build and check.' : 'Run: living-resume build && living-resume check';
if (cmd === 'reject-all') {
  if (!id || !/^[a-z0-9][a-z0-9._-]{5,79}$/i.test(id)) { console.error('Give the id prefix of one import, e.g. reject-all import-2026-11-01-ab12'); process.exit(1); }
  let n = 0;
  for (const p of load().filter((x) => x.status === 'proposed' && x.id.startsWith(id))) { p.status = 'rejected'; p.reason_rejected = rest.join(' ') || 'replaced by a later import'; p.decided = today(); save(p); n++; }
  console.log(n ? `Rejected ${n} waiting line${n === 1 ? '' : 's'} from ${id}. They won't be suggested again.` : `Nothing waiting starts with ${id}. Nothing changed.`);
  process.exit(0);
}
if (cmd === 'approve-all') {
  if (!id) { console.error('Give an id prefix, e.g. approve-all import-2026-11-01'); process.exit(1); }
  const L = loadLedger(); let n = 0; const errs = [];
  for (const p of load().filter((x) => x.status === 'proposed' && x.id.startsWith(id))) {
    try { apply(L, p, p.text); p.status = 'approved'; p.final_text = p.text; p.decided = today(); save(p); n++; } catch (e) { errs.push(`${p.id}: ${e.message}`); }
  }
  writeJSON(ledgerPath(), L);
  console.log(`Approved ${n} proposal(s).${errs.length ? `\nSkipped:\n  ${errs.join('\n  ')}` : ''} ${NEXT}`);
  process.exit(errs.length ? 1 : 0);
}
const all = load();
if (!cmd || cmd === 'list') {
  const groups = { proposed: [], later: [], approved: [], edited: [], rejected: [] };
  for (const p of all) (groups[p.status] || (groups[p.status] = [])).push(p);
  if (!groups.proposed.length) console.log('Nothing waiting for review.');
  for (const p of groups.proposed) {
    console.log(`\n● ${p.id}  [${p.kind}${p.target ? ' ' + p.target : ''}${p.section ? ' → ' + p.section : ''}]  surfaces: ${(p.surfaces || ['web', 'pdf', 'linkedin', 'json']).join(', ')}`);
    // Contact basics show their fields, like an import's basics line ("city: Charlotte · region: NC").
    const fieldsLine = p.kind === 'basics' && p.fields && typeof p.fields === 'object' ? Object.entries(p.fields).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ') : '';
    console.log(`  ${mdPlain(fieldsLine || p.text || '(remove)')}${p.link ? `\n  link (public, web page): ${p.link}` : ''}`);
    console.log(`  why: ${p.reason || '-'}`);
  }
  if (groups.later.length) console.log(`\nIncubating (later): ${groups.later.map((p) => p.id).join(', ')}`);
  console.log('\nActions: approve <id> · edit <id> "wording" · reject <id> [reason] · later <id>');
  process.exit(0);
}
const p = all.find((x) => x.id === id);
if (!p) { console.error(`No proposal "${id}"`); process.exit(1); }
// Already decided (approved, edited, or rejected): say so plainly and change nothing. "Later" items can still be decided.
if (['approved', 'edited', 'rejected'].includes(p.status) && ['approve', 'edit', 'reject', 'later'].includes(cmd)) {
  console.error(`${id} was already ${p.status === 'edited' ? 'edited and approved' : p.status}${p.decided ? ` on ${p.decided}` : ''}. Nothing changed.${p.status === 'rejected' ? '' : ' To change that line now, write a new edit proposal for it.'}`);
  process.exit(1);
}
if (cmd === 'reject') { p.status = 'rejected'; p.reason_rejected = rest.join(' ') || ''; p.decided = today(); save(p); console.log(`Rejected ${id}. It won't be suggested again.`); }
else if (cmd === 'later') { p.status = 'later'; p.decided = today(); save(p); console.log(`Parked ${id} in incubating. The scout brings it back when related work appears.`); }
else if (cmd === 'approve' || cmd === 'edit') {
  const text = cmd === 'edit' ? rest.join(' ') : p.text;
  if (cmd === 'edit' && !text) { console.error('Give the new wording in quotes.'); process.exit(1); }
  const L = loadLedger();
  try { apply(L, p, text); } catch (e) { console.error(`Couldn't apply ${id}: ${e.message}. Nothing changed.`); process.exit(1); }
  writeJSON(ledgerPath(), L);
  p.status = cmd === 'edit' ? 'edited' : 'approved'; p.final_text = text; p.decided = today(); save(p);
  console.log(`${cmd === 'edit' ? 'Edited and approved' : 'Approved'} ${id}. Ledger updated. ${NEXT}`);
} else { console.error(`Unknown action "${cmd}"`); process.exit(1); }
