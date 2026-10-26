// license status | activate <key> | validate | deactivate
// Pro is a yearly subscription sold through Polar. Free needs no key and never expires.
import { licenseState, activate, validate, deactivate, productConfig, preLaunch } from '../lib/license.mjs';

const [cmd = 'status', key] = process.argv.slice(2);
const cfg = productConfig();
const done = (r) => { console.log(r.message); process.exit(r.ok ? 0 : 1); };
if (cmd === 'status') {
  if (preLaunch(cfg)) console.log('Pre-launch: Pro features are unlocked until the Polar store is configured in product.config.json.\n');
  const s = licenseState();
  if (s.tier === 'pro') console.log(`Pro · key ${s.key}${s.expiresAt ? ` · until ${String(s.expiresAt).slice(0, 10)}` : ''} · last checked ${String(s.validatedAt).slice(0, 10)}`);
  else console.log(`Free${s.reason !== 'no-license' ? ` (${s.reason})` : ''}.\nPro adds:\n${Object.values(cfg.proFeatures || {}).map((f) => `  • ${f}`).join('\n')}\n${cfg.store?.checkoutUrl ? `Upgrade: ${cfg.store.checkoutUrl}` : `Pro opens soon: ${cfg.homepage}`}`);
  if (cfg.store?.portalUrl) console.log(`Manage your subscription: ${cfg.store.portalUrl}`);
} else if (cmd === 'activate') done(await activate(key));
else if (cmd === 'validate') done(await validate());
else if (cmd === 'deactivate') done(await deactivate());
else { console.error('Usage: living-resume license <status|activate <key>|validate|deactivate>'); process.exit(2); }
