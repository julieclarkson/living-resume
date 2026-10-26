// Page count of the last built PDF, for the coach's "fit on two pages" lift.
import fs from 'node:fs';
import { P, loadRules } from './util.mjs';
import { pdfPageCount } from './print.mjs';
export async function pageInfo() {
  try { const R = loadRules(); const f = P('dist', R.pdf_filename); return fs.existsSync(f) ? { pages: pdfPageCount(f) || 0, limit: R.limits?.pdf_max_pages || 2 } : {}; } catch { return {}; }
}
