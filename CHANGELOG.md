# Changelog

## 1.3.0 · 2026-10-26 (release build, not yet published)
- **Scores that never sound like a verdict on you.** "Low confidence" is gone: matches show strong, good, or some overlap, with a plain note that fit compares wording, not people, and that about 35% and up is worth a real look. "Not on your résumé" now reads "listing words your résumé doesn't use". A role version named for the job (Design Engineer for a Design Engineer listing) is suggested on a tie.
- The skill searches job-search connectors (Indeed, ZipRecruiter, Dice, Upwork) when the user has one, and brings listings in with `jobs add`.
- **Job matches that don't hide.** Every listing at or above your fit bar is shown, with confidence as a label (it used to filter out "low confidence" ones, so a 48% fit could vanish). An empty day says why (how many were outside your country, not remote, and so on) and shows the 3 closest listings. Remote jobs in another country ("Remote France" for someone in Charlotte, NC) and hybrid or on-site jobs elsewhere are screened out; set `country` in your criteria if your locations don't say. Fit ignores links, web addresses, city names, and filler words.
- **Every name prints right without Chrome.** The no-Chrome PDF (Claude Cowork, ChatGPT) switches to a bundled Unicode font (DejaVu Sans) when a résumé has letters like ễ, Ł, or ź, drops invisible characters, and turns "ﬁ" back into "fi". Anything it still can't draw (Japanese, emoji) is named in `build`, and `check` fails until it's reworded or built with Chrome.
- **Markdown résumés import.** `#` headings, `**bold**`, `*` bullets and links are cleaned up first, so a résumé your AI hands over as Markdown keeps every role and line.
- **LinkedIn never asks you to paste a blank or your own name.** With no approved headline or summary, the packet says "not ready yet" and `next` offers "Add a headline" first.
- **`style`** (MCP `resume_style`): dates, certificates, and coach counts, each on the person's word. `fix-role` takes `contract: true|false`.
- Coach: the contractor lens reads the org too ("Self-employed") and no longer fires on "Principal" job titles; the summary gets the readability lens. `next` doesn't offer "make it stronger" before anything is approved.
- `check` fails when nothing is approved yet, so a publish never goes ahead empty. `--help` no longer prints developer notes.
- **Role versions in that role's words:** a Design Engineer or Product Designer version (any role) reorders the same approved lines and can use an approved alternate headline or summary (`variant` proposals). Each builds to `dist/roles/<slug>/` and is checked like the main résumé.
- **Coach, sharper and kinder:** reads for readability (run-on sentences, stock words like "leveraged") and, on recent contract or freelance roles, for who the clients were, whether they came back, and how work was scoped. Any "how many?" also offers a safe floor ("10+"). Set `"coach": { "counts": false }` in the rubric and it never asks for numbers. Awards count as results. Page-fit advice never suggests trimming recent community or leadership; it lists what to keep and points at older roles and long bullets instead.
- **`next` stays quiet when nothing changed:** after you update LinkedIn, a rebuild alone (new date, renamed field labels) no longer says "Update your LinkedIn". `next` and `linkedin` use the same rule.
- **Your look, kept:** `dateStyle` ("years" or "months") and `certStyle` ("line": "Certificates in A and B") in your ledger. "Outside of work" shows on the PDF and Word file when you approved it for them, and `heading interests "…"` renames it.
- **What's next:** `next` (MCP `resume_next`) gives the one next step from where you are (review, build, put it online, LinkedIn, inbox, target, job search, top match, follow-ups, make it stronger), why it matters, and exactly what to say. The skill starts every conversation with it.
- **Headings are each person's own:** `heading <section> "Text"` (MCP `resume_heading`) renames a section in every format, stored in that person's ledger.
- **LinkedIn: profile data only.** The guide and skill say to export only profile items; import keeps only the profile files it read (never connections, messages or contacts).
- Coach: a "fit on two pages" lift when the last PDF runs long; only current or last-10-year roles count as recent.
- **Make it stronger: an honest coach, not a formatter.** `coach` (MCP `resume_coach`, read-only) scores the approved, public lines out of 100 and lists the 3 biggest lifts, then line-by-line suggestions: duty phrasing, bullets with no number or result, size without an outcome, vague words, long bullets, a first-person summary, shorthand headlines, thin recent roles, a volunteer role above paid roles, year-only dates, a missing target. Each has the ledger id, why, and 1-3 questions to ask you. It never writes wording: your AI rewrites only from your answers, as proposals you approve. `check` shows the lifts as Suggestions that never fail. The skill asks the target first, interviews 5 questions at a time, and does a hiring-manager review before handing over.
- **Proof links:** an optional public https `link` on a line (proposals and ledger) shows on the web page and in JSON Resume, never in the PDF body; evidence stays private; anything but https is refused.
- **Publications and talks:** a `publications` section in every format; import places "Publications", "Speaking", "Talks" headings there.
- A role marked `volunteer` (resume_fix_role, on the user's word) lists after paid roles. Dates show months ("Mar 2021 to present") when every role has them.
- No-Chrome PDF: clearer name and title block, a thin accent rule under section heads, dates right-aligned on the role line, steadier spacing.
- **Experience is newest first** in the PDF, web page, JSON Resume, and LinkedIn packet (end date, present first, then start date), whatever order the roles were imported in. A role profile's `order` may list role ids to put a role first; `exclude` may leave a role out.
- **Import never drops a line silently.** PDF text read in reading order (dates after the bullets) gives the dates to the role header above; any line that lands in no role is listed under "Not placed (check these lines)". Re-importing says when an earlier import still has lines waiting; `review reject-all <import-prefix>` (MCP: `resume_review_decide` with the prefix and `reject`) clears them. LinkedIn education keeps the graduation year.
- MCP replies use plain words (no CLI commands, no "Terminal", no developer notes); `resume_propose` basics can be fields only. `jobs schedule` says "with your AI's review".
- **Claude and ChatGPT, equal footing.** OpenAI plugin packaging (root `plugin.json`, `mcp.json`, `.agents/plugins/marketplace.json`) for the ChatGPT desktop app and Codex. Marketing page, guide, README, and llms.txt show Claude Cowork and ChatGPT desktop side by side.
- MCP `resume_init` keeps the workspace in the folder the user picked (`folder`), or `LIVING_RESUME_DIR`.
- Import splits one-line role headers that hold the dates ("Title, Org 2017 - 2021"). LinkedIn packet fields are unique per role (promotions, blank orgs). Certificates render as a list; the school isn't repeated; a "Skills" group under "Skills" has no label.
- Clearer messages: plain-voice failures say how to reword, deciding an already-decided proposal says so, and a missing Word converter says what to do instead. Pre-launch unlocks extra role profiles; `status` says "Pro (pre-launch)".
- Rubric for any job: "Accountability" (owning results, handling data or money carefully, fixing mistakes); first run sets the target role.
- **Positioning: never update your résumé again.** Claude does the talking and browsing; Living Résumé does the remembering, checking, and building. Every reply ends with one next step.
- **Catch up my résumé:** the host AI suggests items from what it already knows; only the ones you confirm go in.
- **Next-step card:** for a job you pick, the posting, your warm path, the likely person (public sources, linked), and one short note you send. Saved to `jobs/next/` for you or any personal agent.
- **What have I applied to:** `jobs applied` lists applications, newest first.
- Marketing page and visual guide (`marketing/guide.html`) updated.
- **Daily job matches (Pro).** Say what you're looking for in your own words; your AI saves it as `resume/job-search.json` (titles, contract or full-time, remote, locations, must-haves, words and companies to avoid, companies to check). `jobs find` reads those companies' public Greenhouse, Lever, and Ashby listings, screens them, scores each against every version of your approved résumé, and writes `jobs/today.html`: fit, confidence, the gaps, which version to send, and an Apply button. Listings from alert emails or the web come in with `jobs add`. Setup asks nine questions before any search. `jobs schedule` gives a no-AI timer line (no tokens) or scheduled-task text with Claude's review, on the days you choose (Wednesday suggested). Never reads email. `jobs prep <id>` makes the best-fit version; `note`, `dismiss`, and `applied` keep the list honest. Never applies for you, never changes your résumé.
- **Pre-launch:** until `product.config.json` has a Polar store, Pro features are unlocked, with a reminder on each Pro use (once per reply) and in `license status`. Configure the store before release.
- `jobs boards` checks every company board after setup.
- Two more job systems: Workable (`workable:<slug>`) and SmartRecruiters (`smartrecruiters:<slug>`, full text fetched only for listings whose title matches).
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
