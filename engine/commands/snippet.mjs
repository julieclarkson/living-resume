// snippet: one paragraph to paste into any project's AI instructions (CLAUDE.md, AGENTS.md,
// Cursor rules, a Claude or ChatGPT project). It makes the agent you already work with
// notice résumé-worthy work and offer to add it. Nothing is connected or shared.
console.log(`Paste this into your project's AI instructions (CLAUDE.md, AGENTS.md, Cursor rules, or a Claude or ChatGPT project):

----------------------------------------------------------------
## Résumé
When we ship something, finish a milestone, make a significant design or architecture decision, fix a serious problem, or learn a new technique, ask me once: "Add this to your résumé?" If I say yes, write one or two plain sentences about what I did and why it mattered (facts only, no claims I haven't made), then run:
living-resume add "<those sentences>" --link <public link if there is one>
Don't ask more than once per session, and never add anything without my yes.
----------------------------------------------------------------

Later, say "assess my résumé inbox" and your AI tool decides what belongs on your résumé.`);
