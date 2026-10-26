// linkedin          which LinkedIn fields changed since you last updated LinkedIn, with the new text to paste.
// linkedin --done   you've pasted them: remember this version as what LinkedIn now shows.
// LinkedIn doesn't allow apps to edit profiles, so this is a short guided copy-and-paste.
import fs from 'node:fs';
import path from 'node:path';
import { requireWorkspace } from '../lib/util.mjs';
import { linkedinChanges, packetPath, syncedPath } from '../lib/linkedin-sync.mjs';

requireWorkspace();
const cur = packetPath();
if (!fs.existsSync(cur)) { console.error('Build first: living-resume build'); process.exit(1); }
const prevFile = syncedPath();
if (process.argv.includes('--done')) {
  fs.mkdirSync(path.dirname(prevFile), { recursive: true }); fs.copyFileSync(cur, prevFile);
  console.log('✓ Noted: LinkedIn matches this version. Next time, only new changes will show.'); process.exit(0);
}
const { before, changed } = linkedinChanges();

if (!changed.length) console.log('Nothing on LinkedIn needs to change since you last updated it.');
else {
  console.log(before ? `${changed.length} LinkedIn field(s) changed since you last updated it:\n` : 'First time: here is every field.\n');
  const where = (k) => { const m = k.match(/^Experience: (.+) (title|description)$/); return m ? `the ${m[2]} of "${m[1]}"` : `"${k}"`; };
  changed.forEach(([k, v], i) => console.log(`${i + 1}. ${k}\n   Open your profile, edit ${where(k)}, replace it with:\n\n${v.split('\n').map((l) => `   ${l}`).join('\n')}\n`));
  console.log(process.env.LIVING_RESUME_VIA === 'mcp' ? 'Tell me when you\'ve pasted them, and I\'ll note that LinkedIn is up to date.' : 'When you have pasted them, run: living-resume linkedin --done');
}
console.log('Also, once: add your résumé web page link and the PDF to the Featured section of your profile.');
console.log('Full packet (headline, About, every role, skills, Open to Work): dist/linkedin-packet.md');
