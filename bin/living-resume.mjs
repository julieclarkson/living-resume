#!/usr/bin/env node
// living-resume <command> [args]   (one entry point for the CLI, skills, and the MCP server)
//
//   init [folder] [--name "…"] [--email …]   start a résumé workspace (default ~/Living-Resume)
//   import <file|folder>                     LinkedIn export, résumé PDF/DOCX/TXT → proposals to review
//   status                                   recording · queue · public · history · plan
//   review [approve|edit|reject|later <id>]  Approve · Edit · Reject · Later
//   build                                    every format → dist/
//   check                                    every check (run before publishing)
//   publish [--write]                        dry run, or copy files to your site (never commits)
//   scout [--all]                 (Pro)      new résumé-worthy moments + market wording
//   tailor <posting> <slug>       (Pro)      private PDF/DOCX for one job
//   license <status|activate <key>|validate|deactivate>
//
//   --dir <folder>   use this workspace (or set LIVING_RESUME_DIR)
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const di = argv.indexOf('--dir');
if (di >= 0) { if (!argv[di + 1]) { console.error('--dir needs a folder'); process.exit(2); } process.env.LIVING_RESUME_DIR = path.resolve(argv[di + 1]); argv.splice(di, 2); }

const ALIASES = { 'gate:test': 'check', test: 'check' };
const COMMANDS = ['init', 'import', 'status', 'review', 'build', 'check', 'publish', 'scout', 'tailor', 'license'];
const cmd = ALIASES[argv[0]] || argv[0];

if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
  const fs = await import('node:fs');
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).slice(1).map((l) => l.slice(3)).join('\n'));
  process.exit(0);
}
if (cmd === '--version' || cmd === 'version') {
  const fs = await import('node:fs');
  console.log(JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8')).version);
  process.exit(0);
}
if (!COMMANDS.includes(cmd)) { console.error(`Unknown command "${argv[0]}". Run: living-resume help`); process.exit(2); }

// Commands that change the workspace run one at a time.
if (['import', 'review', 'build', 'publish', 'scout', 'tailor'].includes(cmd) && !(cmd === 'review' && !argv[1])) {
  const { lockWorkspace, isWorkspace } = await import('../engine/lib/util.mjs');
  if (isWorkspace()) { try { lockWorkspace(); } catch (e) { console.error(`✗ ${e.message}`); process.exit(4); } }
}
// Each command reads its own arguments from process.argv.slice(2).
process.argv = [process.argv[0], path.join(here, '..', 'engine', 'commands', `${cmd}.mjs`), ...argv.slice(1)];
await import(`../engine/commands/${cmd}.mjs`);
