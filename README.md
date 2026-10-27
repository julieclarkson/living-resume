# Living Résumé

**Never update your résumé again.** Living Résumé works on top of Claude and ChatGPT: your AI does the talking and searching, Living Résumé does the remembering, checking, and building. One evidence-backed ledger builds your PDF, Word file, web page, JSON Resume, and LinkedIn packet, and you approve every line. Works in Claude Cowork and the ChatGPT desktop app with no coding, and in Codex, Cursor, VS Code, and Claude Code (skill + MCP server), or from the command line. Zero dependencies. No account, no server.

## Quick start
```bash
npx living-resume init                                   # creates ~/Living-Resume
npx living-resume import ~/Downloads/linkedin-export.zip # or a résumé .pdf / .docx / .txt
npx living-resume review                                 # Approve · Edit · Reject · Later
npx living-resume build && npx living-resume check       # every format → ~/Living-Resume/dist
```
In an AI tool, just say "start my résumé", "add this to my résumé", "assess my résumé inbox", "set up my design engineer résumé", "I'm applying to this job", or "publish my résumé".

## Install in your AI tool
Living Résumé isn't in any plugin store yet. Download it from this repo, then add it to your app.

**Download:** [living-resume-main.zip](https://github.com/julieclarkson/living-resume/archive/refs/heads/main.zip) (or **Code → Download ZIP** at the top of this page). It's always the latest version on `main`. To update later, download it again and repeat the same steps.

- **Claude desktop app (no coding):** don't unzip it. Open **Customize → Plugins**, select **+ → Upload plugin**, and choose `living-resume-main.zip`. Pick a folder for your résumé when asked, put your LinkedIn .zip (or old résumé) in it, then say "make my résumé from my LinkedIn". Claude runs everything and hands you the files. PDFs work without Chrome (a built-in fallback).
- **ChatGPT desktop app (no coding):** unzip it, add the unzipped `living-resume-main` folder as a marketplace, install Living Résumé from the Plugins Directory, pick a folder and put your LinkedIn .zip (or old résumé) in it, then in a local thread mention Living Résumé and say "make my résumé from my LinkedIn". Packaged as an OpenAI plugin: root `plugin.json`, `mcp.json`, `skills/`, and `.agents/plugins/marketplace.json`. Not yet checked in the app: see the launch checklist below.
- **Claude Code:** unzip it, then `/plugin marketplace add ~/Downloads/living-resume-main` and `/plugin install living-resume@living-resume-marketplace` (skill, slash commands, and MCP server).
- **Codex:** unzip it, then `codex plugin marketplace add ~/Downloads/living-resume-main`, install it from the plugins list, and mention it with `$`. Or add only the MCP server: `codex mcp add living-resume -- node ~/Downloads/living-resume-main/mcp/server.mjs`, with `AGENTS.md` or `.codex/prompts/` for guidance.
- **Cursor / any MCP client:** unzip it and point the client at the server with the full path: `{"mcpServers":{"living-resume":{"command":"node","args":["/Users/you/Downloads/living-resume-main/mcp/server.mjs"]}}}`. VS Code (`.vscode/mcp.json`) uses a `servers` key: `{"servers":{"living-resume":{"type":"stdio","command":"node","args":["/Users/you/Downloads/living-resume-main/mcp/server.mjs"]}}}`. Needs Node.js 18 or newer.

For Claude Code, Codex, and MCP clients, keep the unzipped folder where it is: your app runs Living Résumé from it. If you move it, add it again from the new place.

All of these drive the same engine (CLI + MCP server); only install and wording differ. In hosts that don't load the skill (Cursor, VS Code, plain MCP clients), the `resume_guide` tool returns it.

### Leave a review
Living Résumé is new, and your review decides what gets fixed and built next. After your first résumé, [email julie@julieclarkson.com](mailto:julie@julieclarkson.com?subject=Living%20R%C3%A9sum%C3%A9%20review) with what worked, what didn't, and whether I can quote you.

### Launch checklist: verify in the ChatGPT desktop app
The ChatGPT card follows OpenAI's plugin docs (2026-10-26) and has only been checked statically. Before launch, install it in the app and fix the card (`marketing/index.html`, `marketing/guide.html`, this README) from what you see:
1. Is Node.js needed? `mcp.json` runs `node`. If the app doesn't bring its own, add step 0 "Install Node.js from nodejs.org" to the ChatGPT card (and to the Cowork card only if Cowork needs it too).
2. Adding the unzipped folder as a marketplace: does the app accept a local folder, and does the `.agents/plugins/marketplace.json` `"./"` source install the plugin? If not, change the card.
3. The name to mention: does "@Living Résumé" work? `plugin.json` has no display-name field yet because the field the app reads isn't verified; until then the card says "mention Living Résumé" without the @.
4. Does the app ask for a folder, and does a file attached in the chat reach that folder? (The card tells people to put the file in the folder.)
The HTML pages carry the same list as comments; remove them once checked.

## Commands
| Command | What it does |
|---|---|
| `init [folder] [--name] [--email] [--url]` | Start a workspace (default `~/Living-Resume`). Never overwrites. |
| `import <file or folder>` | LinkedIn export (.zip or folder), résumé .pdf / .docx / .txt / .md. Scanned first; every line becomes a proposal. |
| `review [approve\|edit\|reject\|later <id>]` | Decide each proposal. `approve-all <prefix>` only when you ask for it. |
| `propose '<json>'` | Write one proposal for review (for AI tools that can't write files; MCP `resume_propose`). |
| `fix-role <role-id> '<json>'` | Fix an imported role's title, org, location, start, end (MCP `resume_fix_role`). |
| `target ["the work you want next"]` | Show or save the rubric target (MCP `resume_set_target`). |
| `build` | PDF, DOCX, `index.html`, `resume.json`, LinkedIn packet, public report. |
| `check` | Privacy, private names, framing, plain voice, PDF pages and text, stale-build guard, quarantine. |
| `publish [--write \| --mark]` | Dry run (and how to put `dist/site/` online), copy into your site folder, or record a version you uploaded yourself. Never commits or pushes. |
| `linkedin [--done]` | Which LinkedIn fields changed since you last updated LinkedIn, with the text to paste. `--done` once you've pasted them. |
| `status` | Recording, queue, public lines, history, plan. |
| `add "what you did" [--link …]` | Put new work in your résumé inbox. Nothing changes until your AI tool assesses it and you approve. |
| `inbox [all \| assessed <id> … \| skip <id> "why"]` | What's waiting, and each verdict. |
| `snippet` | A paragraph to paste into your projects so the agents you work with nominate wins. |
| `roles [new <slug> "Name" \| show <slug>]` | A version of your résumé per kind of role, built from approved lines only (Free: one). |
| `apply <posting> [--role …] [--company …]` (Pro) | Best-fit role version for one job, coverage report, private PDF/DOCX, logged. |
| `jobs [criteria \| find \| add \| today \| read \| note \| dismiss \| applied \| prep \| schedule]` (Pro) | Daily job matches: what you're looking for (`resume/job-search.json`), the public boards (Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Workday) of companies you choose plus listings your AI adds, scored against your approved résumé. Writes `jobs/today.html` with Apply buttons. Never applies for you. |
| `scout` (Pro) | New résumé-worthy moments from case-study-maker logs. |
| `license status\|activate <key>\|validate\|deactivate` | Free or Pro (Polar). |

Use `--dir <folder>` or `LIVING_RESUME_DIR` to point at a workspace elsewhere.

## Free and Pro
Free: import, the résumé inbox and rubric, review, every format, one role profile, checks, publish, LinkedIn packet; a small credit link on the web page (never on the PDF). Pro (yearly, via Polar): unlimited role profiles, job-by-job versions (`apply`), the scout, capability statement and vendor kit, no credit link. The license is checked against Polar's public license-key endpoint, cached locally, and works offline for 30 days between checks. Each check sends only your license key, Polar's organization id, and a label with your computer's name; nothing about your résumé. Job matches send only company board names and your job titles to those companies' public job boards. Full list in [PRIVACY.md](PRIVACY.md).

## Requirements
Node 18.17+. PDF: Google Chrome, Chromium, Edge, or Brave (or `CHROME_PATH`), else Python with reportlab. DOCX: macOS `textutil` or `pandoc` (without them, your AI makes the Word file from `dist/resume-print.html`). Optional: poppler (`pdftotext`) for PDF import and the PDF text check.

## Development
`npm test` runs the suite (node:test, no dependencies). See `docs/ARCHITECTURE.md`.
