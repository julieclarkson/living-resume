# Architecture

```
bin/living-resume.mjs      one entry point (CLI, skills, MCP all call it)
engine/commands/*.mjs      init · import · add · inbox · snippet · review · roles · build · check · publish · apply · status · scout · license
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

## Extracted from the personal instance
`julie-clarkson-resume` is the first workspace. On its ledger, the product's renderers produce byte-identical print HTML, JSON Resume, LinkedIn packet, and capability statement to the personal engine (checked during the build). Workspace-specific strings (portfolio link, canonical URLs, Open to Work, one-time LinkedIn fixes) moved into the ledger and `resume/settings.json`.
