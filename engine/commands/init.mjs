// init [folder] [--name "Full Name"] [--email you@example.com] [--url https://…]
// Creates a résumé workspace (default ~/Living-Resume). Never overwrites an existing ledger.
import fs from 'node:fs';
import path from 'node:path';
import { PRODUCT, DEFAULT_HOME, pdfFilename } from '../lib/util.mjs';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(`--${k}`); if (i < 0) return undefined; const v = args[i + 1]; args.splice(i, 2); return v; };
const name = opt('name'); const email = opt('email'); const url = opt('url');
const target = path.resolve(args[0] || process.env.LIVING_RESUME_DIR || DEFAULT_HOME);

if (fs.existsSync(path.join(target, 'resume', 'ledger.json'))) {
  console.log(`A résumé workspace already exists at ${target}. Nothing was changed.`);
  process.exit(0);
}
if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { console.error(`"${email}" doesn't look like an email address.`); process.exit(1); }
if (url && !/^https?:\/\//.test(url)) { console.error('--url must start with https://'); process.exit(1); }

const tpl = path.join(PRODUCT, 'templates', 'workspace');
const copy = (from, to) => {
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, e.name); const d = path.join(to, e.name === 'gitignore.txt' ? '.gitignore' : e.name);
    if (e.isDirectory()) { fs.mkdirSync(d, { recursive: true }); copy(s, d); }
    else if (e.name === 'gitignore.txt' && fs.existsSync(d)) {
      // Keep private working folders out of git even when the folder already has a .gitignore.
      const have = new Set(fs.readFileSync(d, 'utf8').split('\n').map((l) => l.trim()));
      const add = fs.readFileSync(s, 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#') && !have.has(l.trim()));
      if (add.length) fs.appendFileSync(d, `\n# Living Résumé private working files\n${add.join('\n')}\n`);
    } else if (!fs.existsSync(d)) fs.copyFileSync(s, d);
  }
};
fs.mkdirSync(target, { recursive: true });
copy(tpl, target);
for (const d of ['dist', 'proposals', 'inbox', 'resume/roles', 'jobs', 'archive', 'quarantine/in/postings', 'quarantine/in/imports', 'quarantine/out']) fs.mkdirSync(path.join(target, d), { recursive: true });

const lp = path.join(target, 'resume', 'ledger.json');
const L = JSON.parse(fs.readFileSync(lp, 'utf8'));
if (name) L.person.name = name;
if (email) L.person.email = email;
if (url) L.person.url = url;
fs.writeFileSync(lp, JSON.stringify(L, null, 2) + '\n');
const rp = path.join(target, 'resume', 'rules.json');
const R = JSON.parse(fs.readFileSync(rp, 'utf8'));
if (email) R.privacy.email_allowed = [email.toLowerCase()];
if (name) R.pdf_filename = pdfFilename(name);
fs.writeFileSync(rp, JSON.stringify(R, null, 2) + '\n');

console.log(`✓ Résumé workspace ready at ${target}

Next:
  1. Bring in what you have:  living-resume import <LinkedIn export .zip or folder, or résumé .pdf/.docx/.txt>
     (or ask your AI tool: "import my résumé")
  2. Review each line:        living-resume review
  3. Build every format:      living-resume build && living-resume check
Everything stays on this computer until you publish.`);
if (process.env.LIVING_RESUME_VIA !== 'mcp' && process.env.LIVING_RESUME_DIR !== target && target !== DEFAULT_HOME) console.log(`\nTip: commands find this workspace when you run them inside it, or set LIVING_RESUME_DIR=${target}`);
