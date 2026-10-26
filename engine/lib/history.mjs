// Archive + changelog: every publish keeps the PDF, the ledger snapshot, and a
// line in CHANGELOG.md, so the user can see exactly what was public on any date.
import fs from 'node:fs';
import path from 'node:path';
import { P, readJSON, writeJSON, allItems, today, confined, mdPlain } from './util.mjs';

export function lastArchive() {
  const dir = P('archive');
  if (!fs.existsSync(dir)) return null;
  const versions = fs.readdirSync(dir).filter((d) => /^\d{4}-\d{2}-\d{2}/.test(d) && fs.existsSync(path.join(dir, d, 'ledger.json'))).sort();
  return versions.length ? path.join(dir, versions.at(-1)) : null;
}

export function diffLedgers(prev, next) {
  const a = new Map(allItems(prev).map((i) => [i.id, i]));
  const b = new Map(allItems(next).map((i) => [i.id, i]));
  const out = [];
  for (const [id, i] of b) {
    const old = a.get(id);
    if (!old) out.push(`added \`${id}\`: ${mdPlain(i.text).slice(0, 100)}`);
    else if (old.text !== i.text) {
      const A = mdPlain(old.text), B = mdPlain(i.text); let k = 0; while (k < A.length && A[k] === B[k]) k++;
      const from = Math.max(0, k - 25); const cut = (x) => (from ? '…' : '') + x.slice(from, from + 90) + (x.length > from + 90 ? '…' : '');
      out.push(`reworded \`${id}\`: "${cut(A)}" → "${cut(B)}"`);
    }
    else if (old.visibility !== i.visibility || old.surfaces.join() !== i.surfaces.join()) out.push(`visibility/surfaces changed \`${id}\``);
  }
  for (const id of a.keys()) if (!b.has(id)) out.push(`removed \`${id}\``);
  return out;
}

export function changesSinceLastPublish(ledger) {
  const last = lastArchive();
  if (!last) return ['first publish: everything is new'];
  return diffLedgers(readJSON(path.join(last, 'ledger.json')), ledger);
}

export function archive(ledger, note) {
  const changes = changesSinceLastPublish(ledger);
  let name = today(); let n = 2;
  while (fs.existsSync(P('archive', name))) name = `${today()}-${n++}`;
  const dir = confined(P('archive', name));
  fs.mkdirSync(dir, { recursive: true });
  writeJSON(path.join(dir, 'ledger.json'), ledger);
  for (const f of fs.existsSync(P('dist')) ? fs.readdirSync(P('dist')) : []) if (/\.(pdf|docx|json|md|html)$/.test(f) && f !== 'resume-print.html') fs.copyFileSync(P('dist', f), path.join(dir, f));
  const line = `- ${name} · ${note || 'published'} · ${changes.length} change(s)${changes.length ? ': ' + changes.slice(0, 5).join('; ') : ''}`;
  const cl = P('CHANGELOG.md');
  const head = '# Résumé changelog\n\nEvery publish, newest first. Full copies live in archive/<date>/.\n\n';
  const prev = fs.existsSync(cl) ? fs.readFileSync(cl, 'utf8').replace(head, '') : '';
  fs.writeFileSync(cl, head + line + '\n' + prev);
  return { dir, changes };
}
