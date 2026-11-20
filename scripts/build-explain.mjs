// Offline "Read in detail" explanations: one standalone HTML file per question, www/explain/<id>.html.
// Each file can be opened directly in a browser for review; the app loads its <article>.
// This script validates the files and writes www/explain/index.json (the list of ids that have one).
// Usage: node scripts/build-explain.mjs [--check]   (--check fails if index.json is stale)
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DIR = join(ROOT, 'www', 'explain');
export const REQUIRED = ['In one line', 'Detailed explanation', 'How it works', 'Example', 'Common mistakes', 'How to answer in the interview', 'Likely follow-up questions'];
export const MIN_WORDS = 220;

const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');

export function validate(id, html, knownIds) {
  const errs = [];
  if (knownIds && !knownIds.has(id)) errs.push('unknown question id');
  const art = html.match(/<article\b[^>]*data-id="([^"]+)"[^>]*>([\s\S]*)<\/article>/);
  if (!art) return [...errs, 'missing <article data-id>'];
  if (art[1] !== id) errs.push(`data-id "${art[1]}" does not match file name`);
  const heads = [...art[2].matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map(m => text(m[1]).trim().toLowerCase());
  for (const h of REQUIRED) if (!heads.some(x => x.startsWith(h.toLowerCase()))) errs.push(`missing section "${h}"`);
  const words = text(art[2].replace(/<pre[\s\S]*?<\/pre>/g, ' ')).split(/\s+/).filter(Boolean).length;
  if (words < MIN_WORDS) errs.push(`only ${words} words`);
  if (/<script\b|\son\w+=/i.test(art[2])) errs.push('scripts or inline event handlers are not allowed');
  return errs;
}

export function scan(knownIds) {
  const ids = [], problems = [];
  if (!existsSync(DIR)) return { ids, problems };
  for (const f of readdirSync(DIR).filter(f => f.endsWith('.html')).sort()) {
    const id = f.replace(/\.html$/, '');
    for (const e of validate(id, readFileSync(join(DIR, f), 'utf8'), knownIds)) problems.push(`${f}: ${e}`);
    ids.push(id);
  }
  return { ids, problems };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const { QUESTIONS } = await import('../www/js/data/questions.js');
  const known = new Set(QUESTIONS.map(q => q.id));
  const { ids, problems } = scan(known);
  if (process.argv.includes('--validate-only')) {
    const only = process.argv.slice(2).filter(a => !a.startsWith('--'));
    const shown = only.length ? problems.filter(p => only.some(id => p.startsWith(`${id}.html:`))) : problems;
    console.log(shown.length ? shown.join('\n') : `OK (${only.length || ids.length} checked)`);
    process.exit(shown.length ? 1 : 0);
  }
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
  const data = JSON.stringify({ version: 2, ids }) + '\n';
  // Backlog: older questions still waiting for a written answer. New questions must never be added here;
  // they must ship with www/explain/<id>.html (enforced by tests/unit/explain-pack.test.mjs).
  const blPath = join(ROOT, 'scripts', 'explain-backlog.json');
  const has = new Set(ids);
  const prevBacklog = existsSync(blPath) ? JSON.parse(readFileSync(blPath, 'utf8')) : null;
  const backlog = (prevBacklog || [...known]).filter(id => known.has(id) && !has.has(id)).sort();
  const blData = JSON.stringify(backlog, null, 0).replace(/","/g, '",\n"') + '\n';
  const blSame = existsSync(blPath) && readFileSync(blPath, 'utf8') === blData;
  const p = join(DIR, 'index.json');
  const same = existsSync(p) && readFileSync(p, 'utf8') === data;
  if (process.argv.includes('--check')) {
    if (!same) { console.error('stale: www/explain/index.json (run node scripts/build-explain.mjs)'); process.exit(1); }
    if (!blSame) { console.error('stale: scripts/explain-backlog.json (run node scripts/build-explain.mjs)'); process.exit(1); }
  } else {
    if (!same) writeFileSync(p, data);
    if (!blSame) writeFileSync(blPath, blData);
  }
  console.log(`${ids.length} explanations (${known.size - ids.length} questions still use the built-in summary)`);
}
