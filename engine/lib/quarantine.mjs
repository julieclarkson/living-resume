// Quarantine in and out. Reuses the audited MCP-core scanners (vendored), plus
// plain-language prompt-injection patterns for job postings and web text.
//
//   IN:  anything from outside (postings, imported résumés, web pages) is scanned
//        before any agent reads it. Content is DATA, never instructions.
//   OUT: everything leaving (web content, PDF text, packet) is scanned for private
//        names, banned framing, phone numbers, stray emails, and secrets.
import fs from 'node:fs';
import path from 'node:path';
import { scanInjectionPatterns, scanSecretPatterns, scanPiiPatterns } from '../vendor/mcp-core/sanitize.js';
import { P, confined, writeJSON, today } from './util.mjs';

export const PROMPT_INJECTION = [
  /\b(ignore|disregard|forget|override)\s+(?:all\s+|any\s+)?(?:of\s+)?(?:the\s+|your\s+|my\s+|these\s+)?(?:previous\s+|prior\s+|above\s+|earlier\s+|original\s+|system\s+)*(instructions|prompts?|messages|rules|guidelines|directions)/i,
  /\b(you are now|from now on you|act as|pretend to be|new instructions?:|system prompt|developer message)\b/i,
  /\b(reveal|print|show|send|email|post|upload|exfiltrate) (me |us )?(your|the) (system prompt|instructions|api key|secrets?|credentials|files|ledger|private)/i,
  /\b(run|execute) (this|the following) (command|code|script)\b/i,
  /<\s*\/?\s*(system|assistant|tool|instructions?)\s*>/i,
  /\bBEGIN (SYSTEM|PROMPT|INSTRUCTIONS)\b/i,
  /\b(curl|wget|bash|sh|powershell)\s+(-\w+\s+)*https?:\/\//i,
];

export function scanIn(text) {
  const threats = [];
  for (const re of PROMPT_INJECTION) { const m = text.match(re); if (m) threats.push({ name: 'prompt_injection', severity: 'critical', match: m[0].slice(0, 100) }); }
  const inj = scanInjectionPatterns(text).threats.filter((t) => ['script_tag', 'javascript_uri', 'eval_call', 'function_constructor', 'shell_meta', 'path_traversal', 'css_expression'].includes(t.name));
  threats.push(...inj, ...scanSecretPatterns(text).threats.map((t) => ({ ...t, severity: 'high' })));
  if (Buffer.byteLength(text, 'utf8') > 512 * 1024) threats.push({ name: 'too_large', severity: 'high', match: '> 512 KB' });
  return { clean: threats.length === 0, threats };
}

// Admit every file waiting in quarantine/in/<kind>/ → approved/ or rejected/ with a verdict.
export function admitInbound(kind = 'postings') {
  const inDir = confined(P('quarantine', 'in', kind));
  fs.mkdirSync(inDir, { recursive: true });
  const results = [];
  for (const name of fs.readdirSync(inDir)) {
    const src = path.join(inDir, name);
    if (!fs.statSync(src).isFile() || name.startsWith('.')) continue;
    const text = fs.readFileSync(src, 'utf8');
    const verdict = scanIn(text);
    const dest = confined(P('quarantine', verdict.clean ? 'approved' : 'rejected', kind, name));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(src, dest);
    writeJSON(`${dest}.verdict.json`, { file: name, kind, scannedAt: new Date().toISOString(), ...verdict });
    results.push({ name, ...verdict });
  }
  return results;
}

export function scanOut(text, rules) {
  const v = [];
  const allow = rules.denylist_allow || [];
  // Normalize first so a name split by a line break, extra spaces, "-" or "_" is still caught.
  const flat = text.replace(/\s+/g, ' ');
  let masked = flat; for (const a of allow) masked = masked.split(a).join(' ');
  // "Open Brain" also catches OpenBrain / open_brain / Open<newline>Brain; "PRODUCT-TEMPLATE" also catches
  // PRODUCT_TEMPLATE / PRODUCTTEMPLATE (but not the plain phrase "product template").
  const termRe = (term) => new RegExp(term.split(/([\s_-]+)/).map((x, i) => (i % 2 ? (/\s/.test(x) ? '[\\s_-]*' : '[_-]?') : x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join(''), 'i');
  for (const term of rules.disclosure_denylist || []) if (termRe(term).test(masked)) v.push({ rule: 'disclosure', detail: `private term "${term}"` });
  for (const b of rules.framing?.banned_phrases || []) if (new RegExp(b.pattern, b.flags || '').test(flat)) v.push({ rule: 'framing', detail: `${b.pattern} (${b.why})` });
  if (rules.privacy?.phone_pattern && new RegExp(rules.privacy.phone_pattern).test(text)) v.push({ rule: 'privacy', detail: 'phone number' });
  for (const t of scanPiiPatterns(text).threats) if (t.name !== 'phone_us') v.push({ rule: 'privacy', detail: t.name });
  for (const m of text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}\b/gi) || []) if (!(rules.privacy?.email_allowed || []).includes(m.toLowerCase())) v.push({ rule: 'privacy', detail: `unapproved email ${m}` });
  for (const t of scanSecretPatterns(text).threats) v.push({ rule: 'secret', detail: t.name });
  return v;
}

// Write an outgoing file through quarantine/out: scan first, then release to dist/.
export function releaseOut(relPath, content, rules, scanText = null) {
  const outPath = confined(P('quarantine', 'out', relPath));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, content);
  const text = scanText ?? (Buffer.isBuffer(content) ? '' : String(content));
  const violations = scanOut(text, rules);
  if (violations.length) return { released: false, violations, held: path.relative(P(), outPath) };
  const dest = confined(P('dist', relPath));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(outPath, dest);
  return { released: true, violations: [], path: dest };
}

export const stamp = today;
