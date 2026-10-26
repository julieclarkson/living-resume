#!/usr/bin/env node
// living-resume <command> [args]   (one entry point for the CLI, skills, and the MCP server)
//
//   init [folder] [--name "…"] [--email …]   start a résumé workspace (default ~/Living-Resume)
//   import <file|folder>                     LinkedIn export, résumé PDF/DOCX/TXT → proposals to review
//   add "what you did" [--link …]            put new work in your résumé inbox (assessed by your AI tool)
//   inbox [all | assessed <id> … | skip <id> "why"]   what's waiting, and the verdicts
//   snippet                                  text to paste into your projects so agents nominate wins
//   status                                   recording · queue · public · history · plan
//   review [approve|edit|reject|later <id>]  Approve · Edit · Reject · Later
//   propose '<json>'                         write one proposal for review (for AI tools without file access)
//   fix-role <role-id> '<json>'              fix an imported role's title, org, location, start, end
//   target ["the work you want next"]        show or save the rubric target
//   build                                    every format → dist/
//   check                                    every check (run before publishing)
//   publish [--write]                        dry run, or copy files to your site (never commits)
//   linkedin                                 which LinkedIn fields changed, with the text to paste
//   roles [new <slug> "Name" | show <slug>]  a version of your résumé per kind of role (Free: one)
//   apply <posting> [--role …] [--company …] (Pro)  best-fit role version for one job, logged privately
//   jobs [criteria | find | add | today | note | dismiss | applied | prep | schedule]
//                                 (Pro)      daily job matches against your approved résumé, with Apply links
//   scout [--all]                 (Pro)      new résumé-worthy moments from case-study-maker logs
//   license <status|activate <key>|validate|deactivate>
//
//   --dir <folder>   use this workspace (or set LIVING_RESUME_DIR)
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const di = argv.indexOf('--dir');
if (di >= 0) { if (!argv[di + 1]) { console.error('--dir needs a folder'); process.exit(2); } process.env.LIVING_RESUME_DIR = path.resolve(argv[di + 1]); argv.splice(di, 2); }

const ALIASES = { 'gate:test': 'check', test: 'check', tailor: 'apply' };
const COMMANDS = ['init', 'import', 'add', 'inbox', 'snippet', 'status', 'review', 'propose', 'fix-role', 'target', 'roles', 'build', 'check', 'publish', 'linkedin', 'apply', 'jobs', 'scout', 'license'];
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
if (['import', 'add', 'inbox', 'review', 'propose', 'fix-role', 'target', 'roles', 'build', 'publish', 'apply', 'jobs', 'scout'].includes(cmd) && !((cmd === 'target' && !argv[1]) || ['review', 'inbox', 'roles', 'jobs'].includes(cmd) && (!argv[1] || ['all', 'list', 'show', 'schedule', 'read', 'boards'].concat(cmd === 'jobs' && argv[1] === 'applied' && !argv[2] ? ['applied'] : []).includes(argv[1]) || (cmd === 'jobs' && argv[1] === 'criteria' && !argv.includes('--set'))))) {
  const { lockWorkspace, isWorkspace } = await import('../engine/lib/util.mjs');
  if (isWorkspace()) { try { lockWorkspace(); } catch (e) { console.error(`✗ ${e.message}`); process.exit(4); } }
}
// Each command reads its own arguments from process.argv.slice(2).
process.argv = [process.argv[0], path.join(here, '..', 'engine', 'commands', `${cmd}.mjs`), ...argv.slice(1)];
await import(`../engine/commands/${cmd}.mjs`);
