// roles                          list your role profiles and whether each is ready
// roles new <slug> "Role name"   start a role profile (resume/roles/<slug>.json)
// roles show <slug>              print that role's version, line by line, with ledger ids
// A role only chooses from approved lines: headline, order, exclude, and approved
// alternate wordings (variants). See engine/lib/roles.mjs. Free: one role. Pro (and pre-launch): unlimited.
import { loadLedger, requireWorkspace, mdPlain, roleShows, shows } from '../lib/util.mjs';
import { listRoles, newRole, validateRole, applyRole } from '../lib/roles.mjs';
import { proUnlocked, productConfig } from '../lib/license.mjs';

requireWorkspace();
const [cmd, slug, ...rest] = process.argv.slice(2);
const L = loadLedger();

if (!cmd || cmd === 'list') {
  const roles = listRoles();
  if (!roles.length) { console.log('No role profiles yet. Start one:  living-resume roles new ai-product-engineer "AI Product Engineer"'); process.exit(0); }
  roles.forEach((r, i) => {
    const errs = validateRole(L, r);
    const gated = i > 0 && !proUnlocked();
    console.log(`${errs.length ? '✗' : gated ? '·' : '✓'} ${r.slug.padEnd(28)} ${r.name || ''}${gated ? '  (Pro: built on Pro only)' : ''}`);
    for (const e of errs) console.log(`    ${e}`);
  });
  process.exit(0);
}
if (cmd === 'new') {
  if (!slug) { console.error('Usage: living-resume roles new <slug> "Role name"'); process.exit(1); }
  if (listRoles().length >= 1 && !proUnlocked()) {
    const cfg = productConfig();
    console.error(`Free includes one role profile. More roles are part of Living Résumé Pro.\n  ${cfg.store?.checkoutUrl ? `Upgrade: ${cfg.store.checkoutUrl}` : `Pro opens soon: ${cfg.homepage}`}`);
    process.exit(3);
  }
  try { const f = newRole(slug, rest.join(' ') || slug); console.log(`✓ Created ${f}\nAsk your AI tool to "set up my ${rest.join(' ') || slug} résumé" to choose the headline, order, and wording.`); }
  catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
  process.exit(0);
}
if (cmd === 'show') {
  const r = listRoles().find((x) => x.slug === slug);
  if (!r) { console.error(`No role "${slug}". Run: living-resume roles`); process.exit(1); }
  let V; try { V = applyRole(L, r); } catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
  const S = 'pdf'; const line = (i) => console.log(`  ${i.id.padEnd(22)} ${mdPlain(i.text).replace(/\s+/g, ' ').slice(0, 150)}`);
  console.log(`${r.name}\n`);
  if (shows(V.person?.headline, S)) { console.log('HEADLINE'); line(V.person.headline); }
  console.log('\nEXPERIENCE');
  for (const role of (V.experience || []).filter((x) => roleShows(x, S))) { console.log(` ${role.title}, ${role.org}`); for (const g of role.groups || []) for (const i of (g.items || []).filter((x) => shows(x, S))) line(i); }
  if (V.howIWork?.items?.some((i) => shows(i, S))) { console.log('\nHOW I WORK'); V.howIWork.items.filter((i) => shows(i, S)).forEach(line); }
  if (V.skills?.some((i) => shows(i, S))) { console.log('\nSKILLS'); V.skills.filter((i) => shows(i, S)).forEach(line); }
  console.log(`\nExcluded: ${(r.exclude || []).join(', ') || 'none'}`);
  process.exit(0);
}
console.error('Usage: living-resume roles | roles new <slug> "Role name" | roles show <slug>');
process.exit(2);
