import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { QUESTIONS } from '../../www/js/data/questions.js';
import { scan, validate } from '../../scripts/build-explain.mjs';
import { mdToHtml, page } from '../../scripts/md-to-explain.mjs';

test('every explanation file is valid and belongs to a real question', () => {
  const { ids, problems } = scan(new Set(QUESTIONS.map(q => q.id)));
  assert.deepEqual(problems, []);
  assert.ok(ids.length > 0);
});

test('explain/index.json lists exactly the explanation files', () => {
  execFileSync(process.execPath, ['scripts/build-explain.mjs', '--check'], { stdio: 'pipe' });
  const ix = JSON.parse(readFileSync('www/explain/index.json', 'utf8'));
  assert.equal(new Set(ix.ids).size, ix.ids.length);
});

test('authoring helper produces a valid standalone page', () => {
  const q = QUESTIONS.find(x => x.id === 'sd-001');
  const md = '## In one line\nx\n## Detailed explanation\n' + 'word '.repeat(240) + '\n## How it works\n1. a\n## Example\n```bash\nls\n```\n## Common mistakes\n- a\n## How to answer in the interview\nb\n## Likely follow-up questions\n- c';
  const html = page(q, mdToHtml(md));
  assert.match(html, /<article class="ex-md" data-id="sd-001"/);
  assert.match(html, /<pre><code class="language-bash">ls<\/code><\/pre>/);
  assert.deepEqual(validate('sd-001', html, new Set(['sd-001'])), []);
  assert.ok(validate('sd-001', html.replace('<h2>Example</h2>', ''), null).some(e => e.includes('Example')));
  assert.ok(validate('sd-002', html, null).some(e => e.includes('data-id')));
});
