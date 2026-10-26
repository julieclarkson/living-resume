// Which LinkedIn fields changed since the person last pasted them (archive/linkedin-synced.md).
// Shared by `linkedin` and `next`, so both give the same answer. Compares the paste-able field text only:
// the packet's date and its "what changed since the last publish" notes never count as a change, and a
// field whose label changed (for example a role key gaining " at <org> (<year>)") counts only if its text did.
import fs from 'node:fs';
import { P, confined } from './util.mjs';

export const packetPath = () => P('dist', 'linkedin-packet.md');
export const syncedPath = () => confined(P('archive', 'linkedin-synced.md'));

export function packetFields(md) {
  const out = new Map();
  for (const m of String(md).matchAll(/^## (.+?)(?: \(\d+\/\d+\))?\n\n```\n([\s\S]*?)\n```/gm)) out.set(m[1].trim(), m[2]);
  return out;
}

/** { now, before, changed: [[key, text]] } or null when there is no built packet. before is null on the first run. */
export function linkedinChanges() {
  if (!fs.existsSync(packetPath())) return null;
  const now = packetFields(fs.readFileSync(packetPath(), 'utf8'));
  const before = fs.existsSync(syncedPath()) ? packetFields(fs.readFileSync(syncedPath(), 'utf8')) : null;
  const old = new Set(before ? before.values() : []);
  const changed = [...now].filter(([k, v]) => !before || (before.has(k) ? before.get(k) !== v : !old.has(v)));
  return { now, before, changed };
}
