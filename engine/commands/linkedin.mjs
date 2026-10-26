// linkedin   which LinkedIn fields changed since your last publish, with the new text to paste.
// LinkedIn doesn't allow apps to edit profiles, so this is a short guided copy-and-paste.
import fs from 'node:fs';
import path from 'node:path';
import { P, requireWorkspace } from '../lib/util.mjs';
import { lastArchive } from '../lib/history.mjs';

requireWorkspace();
const cur = P('dist', 'linkedin-packet.md');
if (!fs.existsSync(cur)) { console.error('Build first: living-resume build'); process.exit(1); }
const fields = (md) => {
  const out = new Map();
  for (const m of md.matchAll(/^## (.+?)(?: \(\d+\/\d+\))?\n\n```\n([\s\S]*?)\n```/gm)) out.set(m[1].trim(), m[2]);
  return out;
};
const now = fields(fs.readFileSync(cur, 'utf8'));
const last = lastArchive();
const prevFile = last && path.join(last, 'linkedin-packet.md');
const before = prevFile && fs.existsSync(prevFile) ? fields(fs.readFileSync(prevFile, 'utf8')) : null;
const changed = [...now].filter(([k, v]) => !before || before.get(k) !== v);

if (!changed.length) console.log('Nothing on LinkedIn needs to change since your last publish.');
else {
  console.log(before ? `${changed.length} LinkedIn field(s) changed since your last publish:\n` : 'First time: here is every field.\n');
  changed.forEach(([k, v], i) => console.log(`${i + 1}. ${k}\n   Open your profile, edit "${k.replace(/^Experience: /, '')}", replace it with:\n\n${v.split('\n').map((l) => `   ${l}`).join('\n')}\n`));
}
console.log('Also, once: add your résumé web page link and the PDF to the Featured section of your profile.');
console.log('Full packet (headline, About, every role, skills, Open to Work): dist/linkedin-packet.md');
