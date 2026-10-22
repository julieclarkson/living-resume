// publish            dry run: runs every check, then shows exactly what would change on your site
// publish --write    copies the built files into your site folder, archives this version,
//                    and updates CHANGELOG.md. It NEVER commits or pushes: going live is your
//                    own commit (signed, if you use commit signing), and your host deploys it.
//
// resume/settings.json → "publish":
//   { "repo": "../my-site",                                   // your website or GitHub Pages folder
//     "files": [ { "from": "index.html", "to": "resume/index.html" }, … ],   // optional; defaults below
//     "siteJson": { "path": "content/site.json", "key": "resume", "value": "/media/resume/<pdf>" } }  // optional
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { P, ROOT, ENGINE, loadLedger, loadRules, loadSettings, requireWorkspace } from '../lib/util.mjs';
import { archive, changesSinceLastPublish } from '../lib/history.mjs';

requireWorkspace();
const write = process.argv.includes('--write');
const R = loadRules(); const S = loadSettings(); const L = loadLedger();
const PDF = R.pdf_filename;
const fill = (s) => String(s).replaceAll('<pdf>', PDF);

try { execFileSync(process.execPath, [path.join(ENGINE, 'commands', 'check.mjs')], { stdio: 'inherit', env: { ...process.env, LIVING_RESUME_DIR: ROOT } }); }
catch { console.error('\n✗ Checks failed. Nothing was published.'); process.exit(1); }

// Older workspaces used "websiteRepo" with a content/ + public/ site layout; keep that working.
const legacy = !S.publish && S.websiteRepo;
const pub = S.publish || (legacy ? {
  repo: S.websiteRepo,
  files: [{ from: 'resume.json', to: 'content/resume.json' }, { from: '<pdf>', to: 'public/media/resume/<pdf>' }],
  siteJson: { path: 'content/site.json', key: 'resume', value: '/media/resume/<pdf>' },
} : null);
if (!pub?.repo) { console.error('✗ No publish target. Set "publish": { "repo": "<your site folder>" } in resume/settings.json.'); process.exit(1); }
const site = path.resolve(ROOT, pub.repo);
if (!fs.existsSync(site) || !fs.statSync(site).isDirectory()) { console.error(`✗ Publish folder not found: ${site}`); process.exit(1); }
const files = pub.files || [{ from: 'index.html', to: 'resume/index.html' }, { from: 'resume.json', to: 'resume/resume.json' }, { from: '<pdf>', to: 'resume/<pdf>' }];

// Every target must stay inside the site folder, with no symlinks on the way.
const inside = (rel) => {
  const abs = path.resolve(site, fill(rel));
  if (!abs.startsWith(site + path.sep)) throw new Error(`Publish target leaves the site folder: ${rel}`);
  let cur = site;
  for (const part of path.relative(site, abs).split(path.sep)) { cur = path.join(cur, part); if (fs.existsSync(cur) && fs.lstatSync(cur).isSymbolicLink()) throw new Error(`Publish target goes through a symlink: ${rel}`); }
  return abs;
};
const ALLOWED = new Set(['index.html', 'resume.json', PDF, PDF.replace(/\.pdf$/, '.docx')]);
let targets;
try {
  targets = files.map((f) => {
    const from = fill(f.from);
    if (!ALLOWED.has(from)) throw new Error(`Only public build files can be published (not "${from}")`);
    return { from: P('dist', from), to: inside(f.to) };
  });
} catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
for (const t of targets) if (!fs.existsSync(t.from)) { console.error(`✗ Missing ${path.relative(ROOT, t.from)}. Run: living-resume build`); process.exit(1); }

const changes = changesSinceLastPublish(L);
console.log('\nWhat changes in this publish:\n' + changes.map((c) => `  • ${c}`).join('\n'));
console.log(`\nFiles (into ${site}):`); for (const t of targets) console.log(`  dist/${path.basename(t.from)} → ${path.relative(site, t.to)}`);
if (!write) { console.log('\nDry run only. Nothing was copied. Re-run with --write to copy the files.'); process.exit(0); }

for (const t of targets) { fs.mkdirSync(path.dirname(t.to), { recursive: true }); fs.copyFileSync(t.from, t.to); }
const touched = targets.map((t) => path.relative(site, t.to));
if (pub.siteJson?.path) {
  try {
    const sjPath = inside(pub.siteJson.path);
    if (fs.existsSync(sjPath)) {
      const sj = JSON.parse(fs.readFileSync(sjPath, 'utf8'));
      const want = fill(pub.siteJson.value);
      if (sj[pub.siteJson.key] !== want) { sj[pub.siteJson.key] = want; fs.writeFileSync(sjPath, JSON.stringify(sj, null, 2) + '\n'); console.log(`✓ ${pub.siteJson.path}: ${pub.siteJson.key} → ${want}`); touched.push(path.relative(site, sjPath)); }
    }
  } catch (e) { console.error(`! site settings not updated: ${e.message}`); }
}
const { dir } = archive(L, 'published');
console.log(`\n✓ Copied to your site folder and archived (${path.relative(ROOT, dir)}).`);
const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
console.log(`\nTo go live, review and commit it yourself (sign it if you use commit signing):\n  cd ${q(site)} && git add ${touched.map(q).join(' ')} && git commit -m "Update résumé" && git push`);
console.log('Then paste dist/linkedin-packet.md into LinkedIn.');
