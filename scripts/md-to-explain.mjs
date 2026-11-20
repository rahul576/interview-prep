// Authoring helper: turns Markdown drafts into per-question HTML files in www/explain/.
// Draft format: blocks starting with "@@ <question-id>", then Markdown with "## Section" headings.
// Usage: node scripts/md-to-explain.mjs drafts.md [--force]   (existing files are kept unless --force)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'www', 'explain');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const inline = (t) => esc(t)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');

export function mdToHtml(md) {
  const lines = md.replace(/\r/g, '').split('\n');
  const out = []; let i = 0, list = null, para = [];
  const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^```\s*([\w+-]*)/);
    if (fence) {
      flush(); close(); const code = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      i++; out.push(`<pre><code class="language-${esc(fence[1] || 'text')}">${esc(code.join('\n'))}</code></pre>`); continue;
    }
    const h = line.match(/^(#{2,4})\s+(.*)/);
    if (h) { flush(); close(); out.push(`\n<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
      flush(); close();
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const head = cells(line); i += 2; const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push(`<table>\n<thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead>\n<tbody>\n${rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('\n')}\n</tbody>\n</table>`);
      continue;
    }
    const q = line.match(/^>\s?(.*)/);
    if (q) { flush(); close(); out.push(`<blockquote>${inline(q[1])}</blockquote>`); i++; continue; }
    const li = line.match(/^\s*([-*•]|\d+[.)])\s+(.*)/);
    if (li) { flush(); const t = /\d/.test(li[1]) ? 'ol' : 'ul'; if (list !== t) { close(); out.push(`<${t}>`); list = t; } out.push(`  <li>${inline(li[2])}</li>`); i++; continue; }
    if (!line.trim()) { flush(); close(); i++; continue; }
    close(); para.push(line.trim()); i++;
  }
  flush(); close();
  return out.join('\n').trim();
}

export function page(q, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(q.id)} · ${esc(q.q)}</title>
<link rel="stylesheet" href="explain.css">
</head>
<body>
<!-- InterviewPro "Read in detail" answer. Edit freely: keep the <article data-id> and the h2 section names. -->
<article class="ex-md" data-id="${esc(q.id)}" data-topic="${esc(q.topic)}">
<h1>${esc(q.q)}</h1>
<p class="ex-meta">${esc(q.topic)} · ${esc(q.type)} · levels ${esc(q.levels.join(', '))}</p>

${bodyHtml}
</article>
</body>
</html>
`;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const { QUESTIONS } = await import('../www/js/data/questions.js');
  const byId = new Map(QUESTIONS.map(q => [q.id, q]));
  const force = process.argv.includes('--force');
  let written = 0, skipped = 0;
  for (const file of process.argv.slice(2).filter(a => !a.startsWith('--'))) {
    for (const part of readFileSync(file, 'utf8').replace(/\r/g, '').split(/^@@\s+/m).slice(1)) {
      const nl = part.indexOf('\n'); const id = part.slice(0, nl).trim();
      const q = byId.get(id); if (!q) { console.error(`unknown id ${id}`); process.exitCode = 1; continue; }
      const p = join(DIR, `${id}.html`);
      if (existsSync(p) && !force) { skipped++; continue; }
      writeFileSync(p, page(q, mdToHtml(part.slice(nl + 1).trim()))); written++;
    }
  }
  console.log(`wrote ${written}, kept ${skipped} existing`);
}
