// linkedin          which LinkedIn fields changed since you last updated LinkedIn, with the new text to paste.
// linkedin --done   you've pasted them: remember this version as what LinkedIn now shows.
// LinkedIn doesn't allow apps to edit profiles, so this is a short guided copy-and-paste.
import fs from 'node:fs';
import path from 'node:path';
import { P, confined, requireWorkspace } from '../lib/util.mjs';

requireWorkspace();
const cur = P('dist', 'linkedin-packet.md');
if (!fs.existsSync(cur)) { console.error('Build first: living-resume build'); process.exit(1); }
const fields = (md) => {
  const out = new Map();
  for (const m of md.matchAll(/^## (.+?)(?: \(\d+\/\d+\))?\n\n```\n([\s\S]*?)\n```/gm)) out.set(m[1].trim(), m[2]);
  return out;
};
const now = fields(fs.readFileSync(cur, 'utf8'));
const prevFile = confined(P('archive', 'linkedin-synced.md'));
if (process.argv.includes('--done')) {
  fs.mkdirSync(path.dirname(prevFile), { recursive: true }); fs.copyFileSync(cur, prevFile);
  console.log('✓ Noted: LinkedIn matches this version. Next time, only new changes will show.'); process.exit(0);
}
const before = fs.existsSync(prevFile) ? fields(fs.readFileSync(prevFile, 'utf8')) : null;
const changed = [...now].filter(([k, v]) => !before || before.get(k) !== v);

if (!changed.length) console.log('Nothing on LinkedIn needs to change since you last updated it.');
else {
  console.log(before ? `${changed.length} LinkedIn field(s) changed since you last updated it:\n` : 'First time: here is every field.\n');
  changed.forEach(([k, v], i) => console.log(`${i + 1}. ${k}\n   Open your profile, edit "${k.replace(/^Experience: /, '')}", replace it with:\n\n${v.split('\n').map((l) => `   ${l}`).join('\n')}\n`));
}
console.log('When you have pasted them, run: living-resume linkedin --done');
console.log('Also, once: add your résumé web page link and the PDF to the Featured section of your profile.');
console.log('Full packet (headline, About, every role, skills, Open to Work): dist/linkedin-packet.md');
