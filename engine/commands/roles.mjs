// roles                          list your role profiles and whether each is ready
// roles new <slug> "Role name"   start a role profile (resume/roles/<slug>.json)
// roles show <slug>              print that role's version, line by line, with ledger ids
// roles set <slug> '<json>'      change a role's choices: { name, order: [ids], exclude: [ids] } (only on the user's word)
// A role only chooses from approved lines: headline, order, exclude, and approved
// alternate wordings (variants). See engine/lib/roles.mjs. Free: one role. Pro (and pre-launch): unlimited.
import fs from 'node:fs';
import path from 'node:path';
import { loadLedger, requireWorkspace, mdPlain, roleShows, shows, rolesInOrder, writeJSON, confined } from '../lib/util.mjs';
import { listRoles, newRole, validateRole, applyRole, rolesDir } from '../lib/roles.mjs';
import { proUnlocked, productConfig } from '../lib/license.mjs';

requireWorkspace();
const [cmd, slug, ...rest] = process.argv.slice(2);
const L = loadLedger();
const MCP = process.env.LIVING_RESUME_VIA === 'mcp';

if (!cmd || cmd === 'list') {
  const roles = listRoles();
  if (!roles.length) { console.log(MCP ? 'No role versions yet. Start one with resume_role_new (for example slug "ai-product-engineer", name "AI Product Engineer").' : 'No role profiles yet. Start one:  living-resume roles new ai-product-engineer "AI Product Engineer"'); process.exit(0); }
  roles.forEach((r, i) => {
    const errs = validateRole(L, r);
    const gated = i > 0 && !proUnlocked();
    console.log(`${errs.length ? '✗' : gated ? '·' : '✓'} ${r.slug.padEnd(28)} ${r.name || ''}${gated ? '  (Pro: built on Pro only)' : ''}`);
    for (const e of errs) console.log(`    ${e}`);
  });
  process.exit(0);
}
if (cmd === 'new') {
  if (!slug) { console.error(MCP ? 'Give a short slug and a name for the role version.' : 'Usage: living-resume roles new <slug> "Role name"'); process.exit(1); }
  if (listRoles().length >= 1 && !proUnlocked()) {
    const cfg = productConfig();
    console.error(`Free includes one role profile. More roles are part of Living Résumé Pro.\n  ${cfg.store?.checkoutUrl ? `Upgrade: ${cfg.store.checkoutUrl}` : `Pro opens soon: ${cfg.homepage}`}`);
    process.exit(3);
  }
  try { const f = newRole(slug, rest.join(' ') || slug); console.log(MCP ? `✓ Created the ${rest.join(' ') || slug} version. Next: choose its order and exclusions with resume_role_set, and propose any role wording as a variant with role "${slug}".` : `✓ Created ${f}\nAsk your AI tool to "set up my ${rest.join(' ') || slug} résumé" to choose the headline, order, and wording.`); }
  catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
  process.exit(0);
}
if (cmd === 'show') {
  const r = listRoles().find((x) => x.slug === slug);
  if (!r) { console.error(MCP ? `No role version "${slug}". List them with resume_roles.` : `No role "${slug}". Run: living-resume roles`); process.exit(1); }
  let V; try { V = applyRole(L, r); } catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
  const S = 'pdf'; const line = (i) => console.log(`  ${i.id.padEnd(22)} ${mdPlain(i.text).replace(/\s+/g, ' ').slice(0, 150)}`);
  console.log(`${r.name}\n`);
  if (shows(V.person?.headline, S)) { console.log('HEADLINE'); line(V.person.headline); }
  console.log('\nEXPERIENCE');
  for (const role of rolesInOrder(V).filter((x) => roleShows(x, S))) { console.log(` ${role.title}, ${role.org}`); for (const g of role.groups || []) for (const i of (g.items || []).filter((x) => shows(x, S))) line(i); }
  if (V.howIWork?.items?.some((i) => shows(i, S))) { console.log('\nHOW I WORK'); V.howIWork.items.filter((i) => shows(i, S)).forEach(line); }
  if (V.skills?.some((i) => shows(i, S))) { console.log('\nSKILLS'); V.skills.filter((i) => shows(i, S)).forEach(line); }
  console.log(`\nExcluded: ${(r.exclude || []).join(', ') || 'none'}`);
  process.exit(0);
}
if (cmd === 'set') {
  const r = listRoles().find((x) => x.slug === slug);
  if (!r) { console.error(MCP ? `No role version "${slug}". Create it with resume_role_new.` : `No role "${slug}". Run: living-resume roles new ${slug} "Role name"`); process.exit(1); }
  let c; try { c = JSON.parse(rest.join(' ') || '{}'); } catch { console.error('The changes must be JSON: { "name", "order": [ids], "exclude": [ids] }'); process.exit(1); }
  const next = { ...r };
  if (c.name !== undefined) { if (typeof c.name !== 'string' || !c.name.trim() || c.name.length > 80) { console.error('name must be short text.'); process.exit(1); } next.name = c.name.trim(); }
  for (const k of ['order', 'exclude']) if (c[k] !== undefined) { if (!Array.isArray(c[k]) || c[k].length > 300 || !c[k].every((x) => typeof x === 'string' && /^[a-z0-9][a-z0-9._-]{0,79}$/i.test(x))) { console.error(`${k} must be a list of ledger ids.`); process.exit(1); } next[k] = c[k]; }
  const errs = validateRole(L, next);
  if (errs.length) { console.error(`✗ Not saved: ${errs.join('; ')}`); process.exit(1); }
  const { slug: _s, ...save } = next; writeJSON(confined(path.join(rolesDir(), `${r.slug}.json`)), save);
  console.log(`✓ Saved the ${next.name} version. Next: build to see it.`); process.exit(0);
}
console.error(MCP ? 'Use resume_roles, resume_role_new, resume_role_show, or resume_role_set.' : 'Usage: living-resume roles | roles new <slug> "Role name" | roles show <slug> | roles set <slug> \'<json>\'');
process.exit(2);
