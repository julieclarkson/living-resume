# Privacy

Living Résumé runs on your computer. Your ledger, evidence notes, imports, applications, and builds stay in your workspace folder. Nothing is sent anywhere until you publish, and publishing only copies files into a folder you choose; you commit them yourself.

The product makes two kinds of network request. The Pro license check goes to Polar (`api.polar.sh`) and sends your license key, Polar's organization id, and a label with your computer's name. If you use job matches (Pro), `jobs find` reads the public job listing feeds of the companies you chose, from `boards-api.greenhouse.io`, `api.lever.co`, `api.ashbyhq.com`, `www.workable.com`, and `api.smartrecruiters.com`. Those requests send only the company's board name; nothing about you or your résumé is sent. Matching happens on your computer, and your criteria and matches stay in your workspace's `jobs/` folder and `resume/job-search.json`. No analytics, no telemetry.

LinkedIn imports read only Profile, Positions, Education, Skills, Certifications, Volunteering, and Email Addresses. Messages, connections, phone numbers, addresses, and birth dates are never opened or stored.
