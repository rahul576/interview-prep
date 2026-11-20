// Prints question data (as context for writing answers) for the given ids or a chunk file of ids.
// Usage: node scripts/explain-todo.mjs <id...> | --file ids.txt
import { readFileSync } from 'node:fs';
const { QUESTIONS } = await import('../www/js/data/questions.js');
const args = process.argv.slice(2);
const ids = args[0] === '--file' ? readFileSync(args[1], 'utf8').split(/\s+/).filter(Boolean) : args;
const byId = new Map(QUESTIONS.map(q => [q.id, q]));
for (const id of ids) {
  const q = byId.get(id);
  if (!q) { console.log(`### ${id}: UNKNOWN`); continue; }
  console.log(`### ${q.id} | topic: ${q.topic} | type: ${q.type} | levels: ${q.levels.join(',')} | role: ${q.cat}${q.roles ? ' ' + q.roles.join('/') : ''}`);
  console.log(`Q: ${q.q}`);
  console.log(`Key points: ${q.keyPoints.map(k => k.label).join('; ')}`);
  console.log(`Model answer: ${q.ideal}`);
  if (q.followUp) console.log(`Follow-up: ${q.followUp}`);
  console.log('');
}
