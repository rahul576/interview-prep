# InterviewPro – project rules

## Every question needs a formatted "Read in detail" answer
- New questions in `www/js/data/**` must ship together with `www/explain/<question-id>.html`.
- Each answer file is a standalone HTML page with `<article class="ex-md" data-id="<id>">` and these `<h2>` sections, in order:
  In one line · Detailed explanation · How it works · Example · (optional: Real-world scenario, Comparison) · Common mistakes · How to answer in the interview · Likely follow-up questions.
- At least 220 words. Use a `<pre><code class="language-…">` block in Example when code, config or commands help. No scripts.
- Quick way: write Markdown drafts with `@@ <id>` headers and `## Section` headings, then run
  `node scripts/md-to-explain.mjs drafts.md && node scripts/build-explain.mjs`.
- `node scripts/build-explain.mjs` validates the files and refreshes `www/explain/index.json` and `scripts/explain-backlog.json`.
- `scripts/explain-backlog.json` lists only older questions still waiting for an answer. It may only shrink. Never add new ids to it.
- `npm test` fails if a question has no answer file and is not in the backlog.

## Other question-bank rules
- Validate new question files with the quality checker before wiring them into `www/js/data/questions.js`.
- New data files must be added to the asset list in `www/sw.js`, and the version bumped in `www/js/main.js`, `package.json` and `www/sw.js`.

## Releases
- Commit every new version to the repo; commits credit only the repository owner (no AI co-author or attribution lines).
- Deploy each release to the `interviewpro` folder in the owner's Documents folder as well.
