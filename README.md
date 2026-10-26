# Living Résumé

Keep your résumé current from your real work. One evidence-backed ledger builds your PDF, Word file, web page, JSON Resume, and LinkedIn packet, and you approve every line. It runs inside Claude Code, Codex, and Cursor (skill + MCP server) or from the command line. Zero dependencies. No account, no server.

## Quick start
```bash
npx living-resume init                                   # creates ~/Living-Resume
npx living-resume import ~/Downloads/linkedin-export.zip # or a résumé .pdf / .docx / .txt
npx living-resume review                                 # Approve · Edit · Reject · Later
npx living-resume build && npx living-resume check       # every format → ~/Living-Resume/dist
```
In an AI tool, just say "start my résumé", "add this to my résumé", "assess my résumé inbox", "set up my design engineer résumé", "I'm applying to this job", or "publish my résumé".

## Install in your AI tool
- **Claude Cowork (no coding):** install the plugin, pick a folder for your résumé, and say "make my résumé from my LinkedIn". Claude runs everything and hands you the files. PDFs work without Chrome (a built-in fallback).
- **Claude Code:** `/plugin marketplace add julieclarkson/living-resume` then `/plugin install living-resume` (skill, slash commands, and MCP server).
- **Codex:** `codex mcp add living-resume -- npx -y -p living-resume living-resume-mcp`, and copy `AGENTS.md` guidance or the `.codex/prompts/`.
- **Cursor / any MCP client:** add `{"mcpServers":{"living-resume":{"command":"npx","args":["-y","-p","living-resume","living-resume-mcp"]}}}`.

## Commands
| Command | What it does |
|---|---|
| `init [folder] [--name] [--email] [--url]` | Start a workspace (default `~/Living-Resume`). Never overwrites. |
| `import <file or folder>` | LinkedIn export (.zip or folder), résumé .pdf / .docx / .txt / .md. Scanned first; every line becomes a proposal. |
| `review [approve\|edit\|reject\|later <id>]` | Decide each proposal. `approve-all <prefix>` only when you ask for it. |
| `build` | PDF, DOCX, `index.html`, `resume.json`, LinkedIn packet, public report. |
| `check` | Privacy, private names, framing, plain voice, PDF pages and text, stale-build guard, quarantine. |
| `publish [--write \| --mark]` | Dry run (and how to put `dist/site/` online), copy into your site folder, or record a version you uploaded yourself. Never commits or pushes. |
| `linkedin` | Which LinkedIn fields changed since your last publish, with the text to paste. |
| `status` | Recording, queue, public lines, history, plan. |
| `add "what you did" [--link …]` | Put new work in your résumé inbox. Nothing changes until your AI tool assesses it and you approve. |
| `inbox [all \| assessed <id> … \| skip <id> "why"]` | What's waiting, and each verdict. |
| `snippet` | A paragraph to paste into your projects so the agents you work with nominate wins. |
| `roles [new <slug> "Name" \| show <slug>]` | A version of your résumé per kind of role, built from approved lines only (Free: one). |
| `apply <posting> [--role …] [--company …]` (Pro) | Best-fit role version for one job, coverage report, private PDF/DOCX, logged. |
| `scout` (Pro) | New résumé-worthy moments from case-study-maker logs. |
| `license status\|activate <key>\|validate\|deactivate` | Free or Pro (Polar). |

Use `--dir <folder>` or `LIVING_RESUME_DIR` to point at a workspace elsewhere.

## Free and Pro
Free: import, the résumé inbox and rubric, review, every format, one role profile, checks, publish, LinkedIn packet; a small credit link on the web page (never on the PDF). Pro (yearly, via Polar): unlimited role profiles, job-by-job versions (`apply`), the scout, capability statement and vendor kit, no credit link. The license is checked against Polar's public license-key endpoint, cached locally, and works offline for 30 days between checks.

## Requirements
Node 18.17+. PDF: Google Chrome, Chromium, Edge, or Brave (or `CHROME_PATH`). DOCX: macOS `textutil` or `pandoc`. Optional: poppler (`pdftotext`) for PDF import and the PDF text check.

## Development
`npm test` runs the suite (node:test, no dependencies). See `docs/ARCHITECTURE.md`.
