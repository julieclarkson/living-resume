// target                 show the rubric's target (the work the user wants next)
// target "<their words>" save it in resume/rubric.json. Nothing else in the rubric changes.
import { readJSON, writeJSON, P, requireWorkspace } from '../lib/util.mjs';

requireWorkspace();
const file = P('resume', 'rubric.json');
const R = readJSON(file);
const text = process.argv.slice(2).join(' ').trim();
if (!text) { console.log(`Target: ${R.target || '(not set)'}`); process.exit(0); }
if (text.length > 500 || /[\0-\x1f\x7f]/.test(text)) { console.error('✗ The target must be one line up to 500 characters. Nothing changed.'); process.exit(1); }
R.target = text;
writeJSON(file, R);
console.log(`✓ Target saved: ${text}`);
