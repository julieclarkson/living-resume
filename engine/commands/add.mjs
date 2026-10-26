// add "what you did" [--link https://…] [--date YYYY-MM-DD]
// add --file <path>
// Puts one piece of work in your résumé inbox. Nothing is public and nothing is
// changed on the résumé: your AI tool assesses the inbox against resume/rubric.json
// and proposes a line only when the work clears the bar (see the living-resume skill).
// The text is scanned first, like everything else from outside. Links are saved, never fetched.
import fs from 'node:fs';
import path from 'node:path';
import { P, writeJSON, confined, requireWorkspace, today } from '../lib/util.mjs';
import { scanIn } from '../lib/quarantine.mjs';

requireWorkspace();
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(`--${k}`); if (i < 0) return undefined; const v = args[i + 1]; args.splice(i, 2); return v; };
const link = opt('link'); const date = opt('date') || today(); const file = opt('file');
let text = args.join(' ').trim();

if (file) {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs) || !fs.lstatSync(abs).isFile()) { console.error(`No file at ${file}`); process.exit(1); }
  if (fs.statSync(abs).size > 512 * 1024) { console.error('That file is larger than 512 KB. Paste the relevant part instead.'); process.exit(1); }
  text = [text, fs.readFileSync(abs, 'utf8')].filter(Boolean).join('\n\n').trim();
}
if (!text) { console.error('Usage: living-resume add "what you shipped, decided, or learned" [--link https://…] [--date YYYY-MM-DD]\n       living-resume add --file notes.md'); process.exit(1); }
if (text.length > 20_000 && !file) { console.error('Keep it under 20,000 characters, or use --file.'); process.exit(1); }
if (link && !/^https:\/\/[^\s]{3,500}$/.test(link)) { console.error('--link must be one https:// address.'); process.exit(1); }
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { console.error('--date must look like 2026-10-25.'); process.exit(1); }

const verdict = scanIn(`${text}\n${link || ''}`);
if (!verdict.clean) {
  console.error(`✗ Not added. The text contains something that looks like instructions to an AI or code (${[...new Set(verdict.threats.map((t) => t.name))].join(', ')}).`);
  console.error('  Describe the work in your own words and add it again.');
  process.exit(1);
}
const slug = text.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().split(/\s+/).slice(0, 6).join('-').slice(0, 40) || 'item';
let id = `${date}-${slug}`; let n = 2;
while (fs.existsSync(P('inbox', `${id}.json`))) id = `${date}-${slug}-${n++}`;
writeJSON(confined(P('inbox', `${id}.json`)), { id, date, text, ...(link ? { link } : {}), added: new Date().toISOString(), status: 'new' });
const waiting = fs.readdirSync(P('inbox')).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(P('inbox', f), 'utf8'))).filter((x) => x.status === 'new').length;
console.log(`✓ Added to your résumé inbox (${id}). ${waiting} item(s) waiting.\nNothing on your résumé changed. Next: ask your AI tool to "assess my résumé inbox".`);
