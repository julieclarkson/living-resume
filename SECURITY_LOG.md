# Security log

## 2026-10-22 · v1.0.0 pre-release review (independent reviewer agent, Opus 5.5)
Ten findings, all fixed with regression tests:
1. Zip overlap bomb (entries sharing one compressed block) → real inflated size counted, shared or out-of-bounds entries rejected.
2. Failed PDF render left the previous PDF in dist/ → outputs cleared before each build, PDF failure exits non-zero, `check` refuses stale dist/ (hash stamp).
3. Parallel MCP calls lost ledger writes → workspace lock, serialized tool calls, unique temp files.
4. Imported email became public without review → contact details are a proposal; email read only from the header; allowlisted only on approval.
5. MCP `resume_init` used the host's folder → defaults to ~/Living-Resume; init merges .gitignore.
6. LinkedIn packet could use a private headline → visibility checked.
7. Inbound scanner rejected ordinary text and full exports → only profile CSVs opened, per-file scan, tighter patterns.
8. resume.json kept unsafe URL schemes → filtered.
9. Unencoded file:// path broke PDFs in folders with "#" → pathToFileURL.
10. Quadratic email regex → bounded.
Hardening: postings read with lstat, temp files confined, pdf_filename sanitized.
