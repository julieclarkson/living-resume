// coach [--json]   read-only advice on the approved, public lines: a strength score out of 100,
import { pageInfo } from '../lib/coach-pages.mjs';
// the 3 biggest lifts, then line-by-line suggestions with interview questions for the user.
// It never writes or suggests wording: the AI tool rewrites only from the user's answers,
// as edit proposals the user approves in review.
import { P, readJSON, loadLedger, requireWorkspace } from '../lib/util.mjs';
import { coach, coachText } from '../lib/coach.mjs';

requireWorkspace();
const report = coach(loadLedger(), { target: readJSON(P('resume', 'rubric.json'), {}).target || '', ...(await pageInfo()) });
console.log(process.argv.includes('--json') ? JSON.stringify(report, null, 2) : coachText(report));
