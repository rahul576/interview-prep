// "Read in detail" (V1.10): a rich overlay explaining one question in depth, like a good chat answer.
// With an AI engine connected it writes a full explanation (sections, examples, code, pitfalls,
// follow-ups) and caches it on this device. Without AI it shows a structured version of the
// question's model answer, key points, follow-up and related questions.

const CACHE_KEY = 'interviewpro.explain.v1';
const CACHE_MAX = 300;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function cacheRead() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; } }
function cacheGet(id) { const c = cacheRead()[id]; return c && c.md ? c : null; }
function cachePut(id, md, provider) {
  try {
    const c = cacheRead();
    c[id] = { md, provider, at: Date.now() };
    const keys = Object.keys(c).sort((a, b) => c[b].at - c[a].at);
    for (const k of keys.slice(CACHE_MAX)) delete c[k];
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch { /* storage full: just don't cache */ }
}

/** Small, safe Markdown renderer: headings, lists, bold/italic, inline code, code blocks, tables, quotes. */
export function renderMarkdown(md) {
  const lines = String(md || '').replace(/\r/g, '').split('\n');
  const out = [];
  let i = 0, list = null, para = [];
  const inline = (t) => esc(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^```\s*([\w+-]*)/);
    if (fence) {
      flushPara(); closeList();
      const code = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      i++;
      out.push(`<div class="ex-code"><div class="ex-code-h"><span>${esc(fence[1] || 'code')}</span><button type="button" class="ex-copy">Copy</button></div><pre><code>${esc(code.join('\n'))}</code></pre></div>`);
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) { flushPara(); closeList(); const lvl = Math.min(4, h[1].length + 1); out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`); i++; continue; }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      flushPara(); closeList();
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const head = cells(line); i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push(`<div class="ex-table"><table><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    const q = line.match(/^>\s?(.*)/);
    if (q) { flushPara(); closeList(); out.push(`<blockquote>${inline(q[1])}</blockquote>`); i++; continue; }
    const li = line.match(/^\s*([-*•]|\d+[.)])\s+(.*)/);
    if (li) {
      flushPara();
      const type = /\d/.test(li[1]) ? 'ol' : 'ul';
      if (list !== type) { closeList(); out.push(`<${type}>`); list = type; }
      out.push(`<li>${inline(li[2])}</li>`); i++; continue;
    }
    if (!line.trim()) { flushPara(); closeList(); i++; continue; }
    closeList(); para.push(line.trim()); i++;
  }
  flushPara(); closeList();
  return out.join('\n');
}

function aiPrompt(q, role) {
  return [
    `Explain this ${role} interview question in depth for a candidate preparing for interviews.`,
    `QUESTION: ${q.q}`,
    `TOPIC: ${q.topic}. LEVELS: ${q.levels.join(', ')}.`,
    `KEY POINTS A STRONG ANSWER COVERS: ${q.keyPoints.map(k => k.label).join('; ')}`,
    `SHORT MODEL ANSWER: ${q.ideal}`,
    '',
    'Write a rich, well structured answer in Markdown, like an excellent tutor. Use exactly these sections with ## headings:',
    '## In one line',
    '## Detailed explanation  (clear paragraphs; explain the why, not only the what)',
    '## How it works  (step by step, numbered)',
    '## Example  (a realistic example; include a short code or config/command block in a fenced block when it helps)',
    '## Real-world scenario  (how it shows up in production work)',
    '## Comparison  (a small Markdown table when a comparison helps, otherwise skip this section)',
    '## Common mistakes',
    '## How to answer in the interview  (a strong 60-90 second spoken answer)',
    '## Likely follow-up questions  (3-4, each with a one-line answer)',
    'Use **bold** for key terms. Be accurate and current. No preamble before the first heading.',
  ].join('\n');
}

function offlineMarkdown(q, related) {
  const parts = [
    '## In one line', q.keyPoints[0] ? `${q.keyPoints[0].label}.` : '',
    '## Model answer', q.ideal,
    '## What a strong answer covers',
    q.keyPoints.map((k, i) => `${i + 1}. **${k.label}** (terms to use: ${k.k.slice(0, 4).map(x => '`' + x.replace(/\*$/, '') + '`').join(', ')})`).join('\n'),
  ];
  if (q.followUp) parts.push('## Likely follow-up question', `> ${q.followUp}`);
  if (related.length) parts.push('## Related questions on this topic', related.map(r => `- **${r.q}** ${r.ideal.split('. ').slice(0, 2).join('. ').replace(/\.$/, '')}.`).join('\n'));
  parts.push('## How to answer in the interview', 'Start with a one-line definition, then explain how it works, give a concrete example from a project, and finish with a trade-off or common mistake. Aim for 60 to 90 seconds.');
  return parts.filter(Boolean).join('\n\n');
}

/**
 * Open the detailed explanation overlay for a question.
 * deps: { ai, bank, roleLabel, diffBadge, speech }
 */
export async function openExplain(q, { ai, bank = [], roleLabel = 'technical', diffBadge = () => '', speech = null } = {}) {
  document.querySelector('.ex-overlay')?.remove();
  const ov = document.createElement('div');
  ov.className = 'ex-overlay';
  ov.innerHTML = `
    <div class="ex-dialog" role="dialog" aria-modal="true" aria-labelledby="exTitle">
      <header class="ex-head">
        <div class="ex-meta"><span class="ex-topic">${esc(q.topic)}</span>${diffBadge(q)}</div>
        <h2 id="exTitle">${esc(q.q)}</h2>
        <div class="ex-actions">
          <button type="button" class="btn btn-sm" id="exListen">▶ Listen</button>
          <button type="button" class="btn btn-sm" id="exRegen" hidden>↻ Regenerate</button>
          <button type="button" class="ex-close" id="exClose" aria-label="Close">✕</button>
        </div>
      </header>
      <div class="ex-body" id="exBody" tabindex="0"></div>
      <footer class="ex-foot muted" id="exFoot"></footer>
    </div>`;
  document.body.appendChild(ov);
  document.body.classList.add('ex-open');
  const body = ov.querySelector('#exBody'), foot = ov.querySelector('#exFoot');
  let speaking = false;
  const close = () => { if (speaking && speech) speech.stopSpeaking(); ov.remove(); document.body.classList.remove('ex-open'); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  ov.querySelector('#exClose').addEventListener('click', close);
  ov.querySelector('#exClose').focus();

  let currentMd = '';
  const show = (md, note) => {
    currentMd = md;
    body.innerHTML = `<article class="ex-md">${renderMarkdown(md)}</article>`;
    // colour each section by its heading
    body.querySelectorAll('h3').forEach((h) => {
      const t = h.textContent.toLowerCase();
      const kind = /one line/.test(t) ? 'tldr' : /example|scenario/.test(t) ? 'example' : /mistake|pitfall/.test(t) ? 'warn' : /interview|answer in/.test(t) ? 'tip' : /follow/.test(t) ? 'follow' : /comparison/.test(t) ? 'compare' : 'info';
      h.dataset.kind = kind;
    });
    body.querySelectorAll('.ex-copy').forEach(b => b.addEventListener('click', () => {
      const code = b.closest('.ex-code').querySelector('code').textContent;
      navigator.clipboard && navigator.clipboard.writeText(code).then(() => { b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1200); });
    }));
    foot.textContent = note || '';
  };

  const related = bank.filter(r => r.id !== q.id && r.topic === q.topic && r.ideal).slice(0, 3);
  const generate = async (force = false) => {
    const cached = !force && cacheGet(q.id);
    if (cached) { show(cached.md, `Detailed explanation written by AI (${cached.provider}). Saved on this device.`); ov.querySelector('#exRegen').hidden = false; return; }
    if (!ai || !ai.active) {
      show(offlineMarkdown(q, related), 'Connect an AI engine (Setup → AI interviewer) for a full explanation with examples, code and common mistakes.');
      return;
    }
    body.innerHTML = `<div class="ex-loading"><div class="ex-skel"></div><div class="ex-skel w80"></div><div class="ex-skel w60"></div><p class="muted">Writing a detailed explanation…</p></div>`;
    const text = await ai.complete({ system: 'You are an expert software engineering interview coach. Answer in clean Markdown.', messages: [{ role: 'user', content: aiPrompt(q, roleLabel) }], maxTokens: 2000, timeoutMs: ai.provider === 'chrome' ? 90000 : 60000 });
    if (!ov.isConnected) return;
    if (text && text.length > 200) {
      cachePut(q.id, text, ai.provider);
      show(text, 'Detailed explanation written by AI. Saved on this device.');
      ov.querySelector('#exRegen').hidden = false;
    } else {
      show(offlineMarkdown(q, related), `The AI explanation could not be generated${ai.lastError ? ` (${ai.lastError})` : ''}, so the built-in answer is shown.`);
    }
  };
  ov.querySelector('#exRegen').addEventListener('click', () => generate(true));
  ov.querySelector('#exListen').addEventListener('click', async (e) => {
    if (!speech) return;
    const b = e.currentTarget;
    if (speaking) { speaking = false; speech.stopSpeaking(); b.textContent = '▶ Listen'; return; }
    speaking = true; b.textContent = '■ Stop';
    const plain = body.innerText.replace(/\bCopy\b/g, '').replace(/\s+/g, ' ').slice(0, 4000);
    await speech.speak(plain, { gender: 'female' });
    speaking = false; if (b.isConnected) b.textContent = '▶ Listen';
  });
  await generate();
  return { close, markdown: () => currentMd };
}
