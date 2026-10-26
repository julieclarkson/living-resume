// Role profiles: one ledger, a saved view per kind of role (e.g. "AI Product Engineer").
// A role only CHOOSES. It never writes new text:
//   headline  ledger id of the headline to use, or a variant id of it
//   order     ledger ids to put first within their list (bullets, skills, How I work)
//   exclude   ledger ids to leave out of this role's version
//   variants  { "<ledger id>": "<variant id>" }  use an approved alternate wording
// A variant is an alternate wording stored on the ledger item ({ id, text, status }) and
// approved through review like any other line. Only verified variants can be used.
//
// resume/roles/<slug>.json
//   { "name": "AI Product Engineer", "headline": "headline", "order": [...], "exclude": [...], "variants": {...} }
import fs from 'node:fs';
import path from 'node:path';
import { P, readJSON, writeJSON, findItem, allItems, safeId, confined, rolesInOrder } from './util.mjs';

export const rolesDir = () => P('resume', 'roles');

export function listRoles() {
  const dir = rolesDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => {
    const slug = f.replace(/\.json$/, '');
    return { slug, ...readJSON(path.join(dir, f), {}) };
  }).filter((r) => { try { safeId(r.slug, 'role'); return true; } catch { return false; } });
}

export function newRole(slug, name) {
  safeId(slug, 'role name');
  const f = confined(path.join(rolesDir(), `${slug}.json`));
  if (fs.existsSync(f)) throw new Error(`A role "${slug}" already exists.`);
  const role = { name: name || slug, headline: null, order: [], exclude: [], variants: {} };
  writeJSON(f, role);
  return f;
}

// Problems that make a role unusable. Empty array = valid.
export function validateRole(L, role) {
  const errs = [];
  const ids = new Set(allItems(L).map((i) => i.id));
  // order may also list role ids (experience entries) to set the order of the roles themselves.
  for (const r of L.experience || []) if (r.id) ids.add(r.id);
  for (const k of ['order', 'exclude']) for (const id of role[k] || []) if (!ids.has(id)) errs.push(`${k}: no ledger line "${id}"`);
  const variants = { ...(role.variants || {}) };
  if (role.headline && role.headline !== L.person?.headline?.id) variants[L.person?.headline?.id] = role.headline;
  for (const [id, vid] of Object.entries(variants)) {
    const f = findItem(L, id);
    if (!f) { errs.push(`variants: no ledger line "${id}"`); continue; }
    const v = (f.item.variants || []).find((x) => x.id === vid);
    if (!v) errs.push(`variants: "${id}" has no wording "${vid}"`);
    else if (v.status !== 'verified') errs.push(`variants: wording "${vid}" for "${id}" is not approved yet`);
  }
  return errs;
}

// A copy of the ledger as this role shows it. Throws if the role is invalid.
export function applyRole(ledger, role) {
  const errs = validateRole(ledger, role);
  if (errs.length) throw new Error(`Role "${role.name || role.slug}": ${errs.join('; ')}`);
  const L = structuredClone(ledger);
  const variants = { ...(role.variants || {}) };
  if (role.headline && role.headline !== L.person?.headline?.id) variants[L.person.headline.id] = role.headline;
  for (const [id, vid] of Object.entries(variants)) {
    const f = findItem(L, id);
    f.item.text = f.item.variants.find((x) => x.id === vid).text;
  }
  const out = new Set(role.exclude || []);
  const rank = new Map((role.order || []).map((id, i) => [id, i]));
  const tidy = (list) => (list || []).filter((i) => !out.has(i.id))
    .map((i, n) => [i, rank.has(i.id) ? rank.get(i.id) : 10_000 + n]).sort((a, b) => a[1] - b[1]).map(([i]) => i);
  for (const r of L.experience || []) for (const g of r.groups || []) g.items = tidy(g.items);
  if (L.experience) L.experience = L.experience.filter((r) => !out.has(r.id));
  // Roles named in order come first, in that order; the rest follow newest first.
  if ((L.experience || []).some((r) => rank.has(r.id))) {
    const dated = rolesInOrder(L);
    L.experience = [...dated.filter((r) => rank.has(r.id)).sort((a, b) => rank.get(a.id) - rank.get(b.id)), ...dated.filter((r) => !rank.has(r.id))];
    L.experienceOrder = 'profile';
  }
  for (const k of ['skills', 'education', 'certifications', 'volunteer', 'snippets']) if (Array.isArray(L[k])) L[k] = tidy(L[k]);
  if (L.howIWork?.items) L.howIWork.items = tidy(L.howIWork.items);
  if (L.summary && out.has(L.summary.id)) L.summary = null;
  if (L.interests && out.has(L.interests.id)) L.interests = null;
  return L;
}

// Every line's words, for matching a posting against what is already verified.
export const WORDS = (s) => new Set((String(s).toLowerCase().match(/[a-z][a-z0-9+.#-]{2,}/g) || []).filter((w) => !STOP.has(w)));
const STOP = new Set('the and for with you your our are will this that from have has can who into all any per not but use using work team role able also more than they them their its was were what when where which how about over such each other new etc'.split(' '));
