// Free and Pro, sold through Polar (merchant of record). No backend of ours.
//
// The key is checked against Polar's public customer-portal license-key endpoints
// (no API token needed, safe on a user's machine). The result is cached in
// ~/.living-resume/license.json (owner-only permissions) so Pro keeps working offline:
//   • a Pro command re-checks online when the last check is over a day old
//   • offline, the cached Pro status is honored for 30 days after the last good check
//   • a revoked, disabled or expired key drops back to Free (nothing is deleted)
// Free never breaks: every Free feature works with no key and no network.
// The only network calls in the whole product live in this file.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { PRODUCT, readJSON, stateDir } from './util.mjs';

export const REVALIDATE_AFTER_MS = 24 * 3600 * 1000;
export const OFFLINE_GRACE_MS = 30 * 24 * 3600 * 1000;
const TIMEOUT_MS = 8000;

// LIVING_RESUME_PRODUCT_CONFIG is for development and tests (for example a Polar sandbox store).
export const productConfig = () => readJSON(process.env.LIVING_RESUME_PRODUCT_CONFIG || path.join(PRODUCT, 'product.config.json'));
export const licenseFile = () => path.join(stateDir(), 'license.json');
export const mask = (k) => (typeof k === 'string' && k.length > 8 ? `${k.slice(0, 4)}…${k.slice(-4)}` : '(set)');
const KEY_RE = /^[A-Za-z0-9_-]{8,200}$/;

// Polar API base. Only https, except a local test server.
export function apiBase(cfg = productConfig()) {
  const b = (process.env.LIVING_RESUME_POLAR_API || cfg.store?.apiBase || 'https://api.polar.sh').replace(/\/+$/, '');
  const u = new URL(b);
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) throw new Error(`Refusing a non-https license server: ${b}`);
  return b;
}

// Tamper evidence: the cache carries an HMAC keyed to this machine and user, so a hand-edited
// file (or one copied from another machine) reads as Free. Same approach as the shared core.
const macKey = () => { let u = ''; try { u = os.userInfo().username; } catch {} return crypto.createHash('sha256').update(`living-resume-license-v1|${os.hostname()}|${u}`).digest(); };
const FIELDS = ['key', 'activationId', 'status', 'expiresAt', 'benefitId', 'validatedAt', 'organizationId'];
const macOf = (lic) => crypto.createHmac('sha256', macKey()).update(FIELDS.map((f) => `${f}=${lic[f] ?? ''}`).join('|')).digest('hex');
function save(lic) {
  fs.mkdirSync(stateDir(), { recursive: true, mode: 0o700 });
  const body = { ...lic, mac: macOf(lic) };
  const tmp = `${licenseFile()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(body, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, licenseFile());
}
function load() {
  const lic = readJSON(licenseFile(), null);
  if (!lic) return null;
  try { if (typeof lic.mac !== 'string' || !crypto.timingSafeEqual(Buffer.from(lic.mac, 'hex'), Buffer.from(macOf(lic), 'hex'))) return { ...lic, tampered: true }; }
  catch { return { ...lic, tampered: true }; }
  return lic;
}

// Offline decision. Never touches the network.
export function licenseState(now = Date.now()) {
  const cfg = productConfig();
  const lic = load();
  if (!lic) return { tier: 'free', reason: 'no-license' };
  const info = { key: mask(lic.key), status: lic.status, expiresAt: lic.expiresAt || null, validatedAt: lic.validatedAt || null };
  if (lic.tampered) return { tier: 'free', reason: 'license-file-changed', ...info };
  if (cfg.store?.organizationId && lic.organizationId !== cfg.store.organizationId) return { tier: 'free', reason: 'different-store', ...info };
  if (lic.status !== 'granted') return { tier: 'free', reason: `key-${lic.status || 'inactive'}`, ...info };
  if (lic.expiresAt && Date.parse(lic.expiresAt) < now) return { tier: 'free', reason: 'key-expired', ...info };
  const age = now - Date.parse(lic.validatedAt || 0);
  if (!(age >= 0) || age > OFFLINE_GRACE_MS) return { tier: 'free', reason: 'needs-online-check', ...info };
  return { tier: 'pro', reason: 'ok', stale: age > REVALIDATE_AFTER_MS, ...info };
}
export const isPro = () => licenseState().tier === 'pro';

async function call(endpoint, body) {
  const res = await fetch(`${apiBase()}/v1/customer-portal/license-keys/${endpoint}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error',
  });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

const upgradeLine = (cfg) => cfg.store?.checkoutUrl ? `Upgrade: ${cfg.store.checkoutUrl}` : `Pro opens soon: ${cfg.homepage}`;

function fromValidated(j, key, cfg, activationId = null) {
  return { tier: 'pro', key, activationId, organizationId: cfg.store.organizationId, status: j?.status || 'inactive', expiresAt: j?.expires_at || null, benefitId: j?.benefit_id || null, validatedAt: new Date().toISOString() };
}
function checkBenefit(lic, cfg) {
  return !cfg.store.benefitId || !lic.benefitId || lic.benefitId === cfg.store.benefitId;
}

export async function activate(key) {
  const cfg = productConfig();
  if (!cfg.store?.organizationId) return { ok: false, message: `Pro isn't on sale yet, so there's nothing to activate. ${upgradeLine(cfg)}` };
  key = String(key || '').trim();
  if (!KEY_RE.test(key)) return { ok: false, message: 'That does not look like a license key. Copy it from your Polar receipt or customer portal.' };
  const label = `living-resume on ${os.hostname()}`.slice(0, 100);
  let r;
  try { r = await call('activate', { key, organization_id: cfg.store.organizationId, label, meta: { app: cfg.store.metadata?.app || cfg.productId } }); }
  catch (e) { return { ok: false, message: `Could not reach Polar (${e.message}). Check your connection and try again.` }; }
  let lic;
  if (r.status === 200 && r.json?.license_key) lic = fromValidated(r.json.license_key, key, cfg, r.json.id || null);
  else if (r.status === 403) {
    // The key has no activation limit (or the limit is reached): validate it directly.
    let v; try { v = await call('validate', { key, organization_id: cfg.store.organizationId }); } catch (e) { return { ok: false, message: `Could not reach Polar (${e.message}).` }; }
    if (v.status !== 200) return { ok: false, message: r.json?.detail || 'Activation limit reached. Free a device in your Polar customer portal, then try again.' };
    lic = fromValidated(v.json, key, cfg);
  } else if (r.status === 404) return { ok: false, message: 'Polar does not recognize that key. Check it against your receipt.' };
  else return { ok: false, message: `Polar declined the activation (HTTP ${r.status}).` };
  if (!checkBenefit(lic, cfg)) return { ok: false, message: 'That key is for a different product.' };
  if (lic.status !== 'granted') return { ok: false, message: `That key is ${lic.status}. Check your subscription in the Polar customer portal.` };
  save(lic);
  return { ok: true, message: `Pro is on for this computer. Key ${mask(key)}${lic.expiresAt ? `, renews or ends ${lic.expiresAt.slice(0, 10)}` : ''}.` };
}

// Online re-check. Offline → keep the cached state (grace period applies).
export async function validate() {
  const cfg = productConfig();
  const lic = load();
  if (!lic || !lic.key) return { ok: false, message: 'No license on this computer. Free features work without one.' };
  if (lic.tampered) return { ok: false, message: 'The license file was changed by hand, so it is ignored. Run: living-resume license activate <key>' };
  let r;
  try { r = await call('validate', { key: lic.key, organization_id: cfg.store.organizationId, ...(lic.activationId ? { activation_id: lic.activationId } : {}) }); }
  catch (e) { const s = licenseState(); return { ok: s.tier === 'pro', offline: true, message: s.tier === 'pro' ? `Offline. Keeping your Pro status from the last check (${String(lic.validatedAt).slice(0, 10)}).` : `Offline, and the last good check is older than 30 days (${e.message}).` }; }
  if (r.status === 200) {
    const next = { ...fromValidated(r.json, lic.key, cfg, lic.activationId), activationId: lic.activationId };
    if (!checkBenefit(next, cfg)) next.status = 'wrong-product';
    save(next);
    return next.status === 'granted' ? { ok: true, message: `Pro is active${next.expiresAt ? ` until ${next.expiresAt.slice(0, 10)}` : ''}.` } : { ok: false, message: `The key is ${next.status}. Back to Free until it's renewed.` };
  }
  if (r.status === 404) { save({ ...lic, status: 'not-found', validatedAt: new Date().toISOString() }); return { ok: false, message: 'Polar no longer recognizes this key. Back to Free.' }; }
  return { ok: licenseState().tier === 'pro', message: `Polar answered HTTP ${r.status}; keeping the cached status for now.` };
}

export async function deactivate() {
  const cfg = productConfig();
  const lic = load();
  if (!lic || !lic.key) return { ok: true, message: 'Nothing to deactivate.' };
  if (lic.activationId) {
    try { await call('deactivate', { key: lic.key, organization_id: cfg.store.organizationId, activation_id: lic.activationId }); }
    catch (e) { return { ok: false, message: `Could not reach Polar (${e.message}). Nothing changed.` }; }
  }
  fs.rmSync(licenseFile(), { force: true });
  return { ok: true, message: 'This computer is deactivated and the seat is free. Free features keep working.' };
}

// Gate for a Pro feature. Re-checks online when the cache is over a day old.
// Before launch (no Polar store in product.config.json) Pro features are unlocked, with a reminder
// on every use. Filling store.organizationId turns licensing on; `check` warns until then.
export const preLaunch = (cfg = productConfig()) => !cfg.store?.organizationId;
// Pro features are available: a valid Pro license, or pre-launch (no store configured yet).
export const proUnlocked = () => preLaunch() || isPro();
export async function requirePro(feature) {
  const cfg = productConfig();
  if (preLaunch(cfg)) { console.error('· Pro feature, free before launch.'); return { ok: true }; }
  let s = licenseState();
  if (s.tier === 'pro' && s.stale) { await validate(); s = licenseState(); }
  if (s.tier === 'pro') return { ok: true };
  const what = cfg.proFeatures?.[feature] || feature;
  return { ok: false, message: `${what} is part of Living Résumé Pro.\n  ${upgradeLine(cfg)}\n  Already bought it? living-resume license activate <your-key>` };
}
