// Vendored from PRODUCT-TEMPLATE/core/mcp/sanitize.js (commit f047d6b, 2026-06-10). Do not edit here; update the source and re-vendor.
/**
 * Response shaping: bounded sizes + content scan patterns used by the
 * quarantine pipeline. Module-agnostic — moves verbatim from the per-module
 * servers (the cs↔gl drift here was 4–14 cosmetic lines).
 *
 * The tool-result wrappers (`jsonToolResult`, `errResult`) live in trust.js so
 * provenance can be bound per-module; they are re-exported here so existing
 * feature imports (`from '../../sanitize.js'`) keep working unchanged.
 */

export { jsonToolResult, errResult } from './trust.js';

// ── Size limits ─────────────────────────────────────────────────────────

export const EVENT_SNIPPET_MAX = 4000;
export const REFLECTION_ANSWER_MAX = 50_000;
export const REFLECTION_QUESTION_MAX = 2000;
export const MAX_JSON_BYTES = 12 * 1024 * 1024;   // 12 MB
export const MAX_MEDIA_BYTES = 25 * 1024 * 1024;   // 25 MB
export const MAX_THEME_BYTES = 8 * 1024 * 1024;    // 8 MB
export const MAX_STRING_FIELD = 50 * 1024;          // 50 KB
export const QUARANTINE_SCAN_TIMEOUT_MS = 30_000;   // 30 seconds

// ── Truncation ──────────────────────────────────────────────────────────

/**
 * Recursively truncate string values that exceed max length.
 * @param {unknown} value
 * @param {number} max
 * @returns {unknown}
 */
export function truncateDeep(value, max) {
  if (typeof value === 'string') {
    if (value.length <= max) return value;
    return `${value.slice(0, max)}\n…[truncated ${value.length - max} chars]`;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = truncateDeep(v, max);
    }
    return out;
  }
  if (Array.isArray(value)) {
    return value.map((v) => truncateDeep(v, max));
  }
  return value;
}

// ── Quarantine scan patterns (Tier 2) ───────────────────────────────────

/** Injection patterns to detect in content */
export const INJECTION_PATTERNS = [
  // Script injection
  { name: 'script_tag', pattern: /<script[\s>]/i, severity: 'critical' },
  { name: 'javascript_uri', pattern: /javascript\s*:/i, severity: 'critical' },
  { name: 'event_handler', pattern: /\bon\w+\s*=/i, severity: 'high' },
  { name: 'eval_call', pattern: /\beval\s*\(/i, severity: 'critical' },
  { name: 'function_constructor', pattern: /\bFunction\s*\(/i, severity: 'critical' },
  { name: 'import_call', pattern: /\bimport\s*\(/i, severity: 'high' },
  // CSS attack vectors
  { name: 'css_expression', pattern: /expression\s*\(/i, severity: 'critical' },
  { name: 'css_moz_binding', pattern: /-moz-binding/i, severity: 'critical' },
  { name: 'css_behavior', pattern: /behavior\s*:/i, severity: 'critical' },
  // SQL injection
  { name: 'sql_injection', pattern: /(['";]\s*(?:OR|AND|UNION|SELECT|DROP|DELETE|INSERT|UPDATE)\s)/i, severity: 'high' },
  // Path traversal
  { name: 'path_traversal', pattern: /\.\.[/\\]/g, severity: 'critical' },
  // Shell metacharacters in content that shouldn't have them
  { name: 'shell_meta', pattern: /[`$]\(|;\s*(?:rm|curl|wget|sh|bash)\b/i, severity: 'high' },
];

/** Secret patterns to detect */
export const SECRET_PATTERNS = [
  { name: 'aws_secret', pattern: /(?:AWS|aws)[\w_]*(?:SECRET|KEY|TOKEN)[\w_]*\s*[=:]\s*['"]?[A-Za-z0-9/+=]{20,}/i },
  { name: 'stripe_key', pattern: /sk[-_](?:live|test)[-_][a-zA-Z0-9]{20,}/i },
  { name: 'openai_key', pattern: /sk-[a-zA-Z0-9]{20,}/i },
  { name: 'github_token', pattern: /ghp_[a-zA-Z0-9]{36}/i },
  { name: 'bearer_token', pattern: /Bearer\s+[a-zA-Z0-9._\-]{20,}/i },
  { name: 'anthropic_key', pattern: /sk-ant-[a-zA-Z0-9]{20,}/i },
  { name: 'generic_api_key', pattern: /(?:api[_-]?key|apikey|api[_-]?secret)\s*[=:]\s*['"]?[a-zA-Z0-9]{16,}/i },
];

/** PII patterns to detect */
export const PII_PATTERNS = [
  { name: 'ssn', pattern: /\b\d{3}-\d{2}-\d{4}\b/ },
  { name: 'credit_card', pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b/ },
  { name: 'phone_us', pattern: /\b(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/ },
];

/** CSS-specific blocked properties for theme scanning */
export const CSS_BLOCKED_PROPERTIES = [
  'expression',
  '-moz-binding',
  'behavior',
];

/** File extensions that are NEVER allowed in theme packages */
export const BLOCKED_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.sh', '.bash', '.zsh', '.fish',
  '.exe', '.bat', '.cmd', '.ps1', '.vbs',
  '.py', '.rb', '.pl', '.php',
  '.dll', '.so', '.dylib',
  '.wasm',
]);

/** File extensions allowed in theme packages */
export const THEME_ALLOWED_EXTENSIONS = new Set([
  '.css', '.json', '.png', '.jpg', '.jpeg', '.webp', '.mp4', '.md',
]);

/**
 * Calculate Shannon entropy of a string (for high-entropy secret detection).
 * @param {string} str
 * @returns {number}
 */
export function shannonEntropy(str) {
  if (!str || str.length === 0) return 0;
  const freq = {};
  for (const ch of str) {
    freq[ch] = (freq[ch] || 0) + 1;
  }
  let entropy = 0;
  const len = str.length;
  for (const count of Object.values(freq)) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * Scan a string for injection patterns.
 * @param {string} content
 * @returns {{ clean: boolean, threats: Array<{ name: string, severity: string, match: string }> }}
 */
export function scanInjectionPatterns(content) {
  const threats = [];
  for (const { name, pattern, severity } of INJECTION_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      threats.push({ name, severity, match: match[0].slice(0, 100) });
    }
  }
  return { clean: threats.length === 0, threats };
}

/**
 * Scan a string for leaked secrets.
 * @param {string} content
 * @returns {{ clean: boolean, threats: Array<{ name: string, match: string }> }}
 */
export function scanSecretPatterns(content) {
  const threats = [];
  for (const { name, pattern } of SECRET_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      // Don't include the actual secret in the threat report
      threats.push({ name, match: `[REDACTED — ${match[0].length} chars]` });
    }
  }
  return { clean: threats.length === 0, threats };
}

/**
 * Scan a string for PII patterns.
 * @param {string} content
 * @returns {{ clean: boolean, threats: Array<{ name: string }> }}
 */
export function scanPiiPatterns(content) {
  const threats = [];
  for (const { name, pattern } of PII_PATTERNS) {
    if (pattern.test(content)) {
      threats.push({ name });
    }
  }
  return { clean: threats.length === 0, threats };
}

/**
 * Validate a CSS string contains no blocked properties or dangerous url() refs.
 * @param {string} css
 * @returns {{ clean: boolean, threats: Array<{ name: string, detail: string }> }}
 */
export function scanCssContent(css) {
  const threats = [];

  // Check blocked properties
  for (const prop of CSS_BLOCKED_PROPERTIES) {
    if (css.toLowerCase().includes(prop)) {
      threats.push({ name: 'blocked_css_property', detail: prop });
    }
  }

  // Check url() references — only allow data:image/ under 50KB and same-package refs
  const urlRefs = css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi);
  for (const m of urlRefs) {
    const ref = m[1].trim();
    if (ref.startsWith('data:image/')) {
      // Check base64 size (rough: base64 is ~4/3 of original)
      const b64 = ref.split(',')[1] || '';
      if (b64.length > 68_000) { // ~50KB in base64
        threats.push({ name: 'oversized_data_uri', detail: `${b64.length} chars` });
      }
    } else if (ref.startsWith('data:')) {
      // Non-image data URIs are blocked
      threats.push({ name: 'non_image_data_uri', detail: ref.slice(0, 50) });
    } else if (ref.startsWith('http://') || ref.startsWith('https://') || ref.startsWith('//')) {
      // External URLs in CSS — flag for review
      threats.push({ name: 'external_url_in_css', detail: ref.slice(0, 100) });
    }
    // Relative paths within the theme package are OK
  }

  // Check @import for external URLs
  const imports = css.matchAll(/@import\s+(?:url\(\s*['"]?)?([^'");\s]+)/gi);
  for (const m of imports) {
    const ref = m[1].trim();
    if (ref.startsWith('http://') || ref.startsWith('https://') || ref.startsWith('//')) {
      threats.push({ name: 'external_import', detail: ref.slice(0, 100) });
    }
  }

  return { clean: threats.length === 0, threats };
}
