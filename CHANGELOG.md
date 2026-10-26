# Changelog

## 1.3.0 · 2026-10-26 (unreleased)
- **Daily job matches (Pro).** Say what you're looking for in your own words; your AI saves it as `resume/job-search.json` (titles, contract or full-time, remote, locations, must-haves, words and companies to avoid, companies to check). `jobs find` reads those companies' public Greenhouse, Lever, and Ashby listings, screens them, scores each against every version of your approved résumé, and writes `jobs/today.html`: fit, confidence, the gaps, which version to send, and an Apply button. Listings from alert emails or the web come in with `jobs add`. Setup asks nine questions before any search. `jobs schedule` gives a no-AI timer line (no tokens) or scheduled-task text with Claude's review, on the days you choose (Wednesday suggested). Never reads email. `jobs prep <id>` makes the best-fit version; `note`, `dismiss`, and `applied` keep the list honest. Never applies for you, never changes your résumé.
- **Pre-launch:** until `product.config.json` has a Polar store, Pro features are unlocked, with a reminder on every Pro use, in `license status`, and in `check`. Configure the store before release.
- `jobs boards` checks every company board after setup.
- Fit scoring is shared by `apply` and `jobs`, ignores job-posting boilerplate, and matches word forms ("systems" and "system"). `apply` now works without a role profile (it uses your main résumé).
- Fix: the safety scan flagged the ordinary phrase "JavaScript:" (as in a skills line) as an attack. Only real `javascript:` links are flagged now.

## 1.2.0 · 2026-10-25 (unreleased)
- Works without Chrome: PDF fallback (Python reportlab) for Claude Cowork and ChatGPT workspaces, same content and two-page check.
- `dist/site/`: a ready-to-upload folder (web page, PDF, machine-readable file). `publish` explains Netlify Drop, site builders, and site folders; `publish --mark` records a version you uploaded yourself.
- `linkedin`: only the LinkedIn fields that changed since you last updated it, with the text to paste (`linkedin --done` records that you did).
- New workspaces no longer default to "Remote" as a location.
- Skill: plain-language first run for non-coders, résumé score card, "where should your résumé live" onboarding, guided LinkedIn, optional "What I shipped" post draft. Discovery-friendly plugin description.

## 1.1.0 · 2026-10-25 (unreleased)
- Résumé inbox: `add` work in one sentence; your AI tool scores it against `resume/rubric.json` and proposes a line only when it clears the bar. `snippet` lets the agents in your other projects nominate wins.
- Role profiles: one ledger, a version per kind of role (`roles`), built to `dist/roles/<slug>/`. Alternate wordings are approved like any line (`variant` proposals). Free includes one role.
- `apply` (Pro) replaces `tailor`: best-fit role for a posting, coverage report, private PDF/DOCX, application log.

## 1.0.0 · 2026-10-22 (unreleased)
First product build, extracted from the personal Living Résumé instance: workspace init, LinkedIn/résumé import with review, every format, checks, publish to a site folder, Polar Free/Pro licensing, MCP server, Claude Code plugin, Codex and Cursor surfaces, marketing page.
