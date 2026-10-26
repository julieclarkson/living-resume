# Architecture

```
bin/living-resume.mjs      one entry point (CLI, skills, MCP all call it)
engine/commands/*.mjs      init · import · add · inbox · snippet · review · roles · build · check · coach · publish · apply · status · scout · license
engine/lib/util.mjs        workspace resolution, confinement, lock, ledger helpers
engine/lib/render.mjs      ledger → print HTML, web page, JSON Resume, LinkedIn packet, report, capability statement
engine/lib/quarantine.mjs  inbound scan (postings, imports) and outbound scan (every released file)
engine/lib/importer.mjs    zip/csv/docx/pdf text → draft → role outlines + proposals
engine/lib/license.mjs     Polar license keys (the only network code)
engine/lib/roles.mjs       role profiles: choose, order, exclude, approved variants; never new text
engine/lib/print.mjs       Chrome headless → PDF; textutil/pandoc → DOCX
engine/vendor/mcp-core/    vendored scanners from the shared core
mcp/server.mjs             stdio MCP server, zero deps, tools call the CLI with validated args
skills/ commands/ .claude-plugin/ .mcp.json .cursor/ .codex/ AGENTS.md   AI-tool surfaces
templates/workspace/       what `init` copies
marketing/                 landing page + llms.txt (for the marketing branch)
server.json                MCP Registry entry
```

## Two roots
The product code (`PRODUCT`) and the user's résumé workspace (`ROOT`) are separate. Every write goes through `confined()` (inside the workspace, no symlinks). Personal data never lives in the product repo.

## Trust boundaries
- Imported files and postings are scanned before anything reads them, and are data, never instructions.
- Every built file is scanned on the way out (private-names list, framing rules, phone, unapproved emails, secrets) and held in `quarantine/out/` if it fails.
- New lines, including contact details from imports, are proposals until the user approves them.
- `check` refuses a `dist/` that wasn't built from the current ledger and rules.
- Publishing copies files only; the user commits.
- The MCP server has no tool that writes outside the workspace or publishes.

## Extracted from a working instance
The engine was extracted from a résumé workspace already in daily use. On that ledger, the product's renderers produce byte-identical print HTML, JSON Resume, LinkedIn packet, and capability statement to the personal engine (checked during the build). Workspace-specific strings (portfolio link, canonical URLs, Open to Work, one-time LinkedIn fixes) moved into the ledger and `resume/settings.json`.

## 1.2: working without Chrome, and getting the résumé online
- `render.printModel()` turns the ledger into plain sections; `print.renderPdf()` uses Chrome when present, otherwise `engine/pdf/fallback.py` (Python reportlab) reads that model on stdin. Same content, same two-page check. Cowork workspaces have Python and reportlab but no Chrome.
- `build` writes `dist/site/` (index.html, PDF, resume.json) as a ready-to-upload folder.
- `publish` with no `publish.repo` explains the three ways online; `publish --mark` archives a version the user uploaded themselves, so `linkedin` can diff against it.
- `linkedin` compares the current LinkedIn packet with the last archived one and prints only changed fields.

## 1.3: daily job matches
- `engine/lib/boards.mjs` reads public listing feeds only (Greenhouse, Lever, Ashby), https to those three hosts, 20 s timeout, 12 MB cap, no redirects, validated board slugs. `LIVING_RESUME_BOARDS_ORIGIN` (local http only) points them at a test server.
- `engine/lib/fit.mjs` scores a posting against the main résumé and every role profile: the posting's 25 most repeated key terms (boilerplate removed, light stemming), split into covered (in that version's PDF lines), elsewhere (on the résumé, not in this version), and missing. Shared by `apply` and `jobs`.
- `engine/commands/jobs.mjs`: criteria (validated), screening (titles, work type, remote and locations, must-haves, avoid words and companies), storage in `jobs/postings.json` (only listings that pass the screen, every one scanned; held ones are never ranked), state in `jobs/state.json`, and the page `jobs/today.html` (strict CSP, everything escaped, https links only). Confidence is high at 55%+ fit with at most 30% of key terms missing and nothing unconfirmed; medium at the user's `min_fit` with at most half missing and one unknown.
