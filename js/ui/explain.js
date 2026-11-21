// "Read in detail" (V1.10): a rich overlay explaining one question in depth, like a good chat answer.
// V1.19: explanations are pre-written and shipped with the app (www/explain/*.json), so they open
// instantly and work offline. Questions without one show a structured version of the model answer.
// An AI engine is only used when the user asks for it ("Ask AI"), and its answer is cached on this device.

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

// Pre-written explanations: one standalone HTML file per question (explain/<id>.html), listed in
// explain/index.json. The app shows the file's <article>, minus its own title.
const EXPLAIN_BASE = new URL('../../explain/', import.meta.url);
let indexPromise = null;
function loadIndex() {
  if (!indexPromise) {
    indexPromise = fetch(new URL('index.json', EXPLAIN_BASE)).then(r => (r.ok ? r.json() : null))
      .then(ix => (ix && Array.isArray(ix.ids) ? new Set(ix.ids) : null)).catch(() => null)
      .then(ids => { if (!ids) indexPromise = null; return ids; });
  }
  return indexPromise;
}
/** Returns the explanation body HTML for a question (from its own HTML file), or null. Never throws. */
export async function staticExplanation(id) {
  const ids = await loadIndex();
  if (!ids || !ids.has(id)) return null;
  try {
    const r = await fetch(new URL(`${encodeURIComponent(id)}.html`, EXPLAIN_BASE));
    if (!r.ok) return null;
    return articleBody(await r.text());
  } catch { return null; }
}
/** Extracts and cleans the <article> of an explanation file for display inside the app. */
export function articleBody(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const art = doc.querySelector('article');
  if (!art) return null;
  art.querySelectorAll('script, style, link, iframe, object, embed, h1, .ex-meta').forEach(n => n.remove());
  art.querySelectorAll('*').forEach(n => { for (const a of [...n.attributes]) if (/^on/i.test(a.name) || /^\s*javascript:/i.test(a.value)) n.removeAttribute(a.name); });
  art.querySelectorAll('h2').forEach(h => { const h3 = doc.createElement('h3'); h3.innerHTML = h.innerHTML; h.replaceWith(h3); });
  art.querySelectorAll('table').forEach(t => { if (!t.parentElement.classList.contains('ex-table')) { const w = doc.createElement('div'); w.className = 'ex-table'; t.replaceWith(w); w.appendChild(t); } });
  art.querySelectorAll('pre').forEach(pre => {
    const lang = ((pre.querySelector('code')?.className || '').match(/language-([\w+-]+)/) || [])[1] || 'code';
    const box = doc.createElement('div'); box.className = 'ex-code';
    box.innerHTML = `<div class="ex-code-h"><span>${esc(lang)}</span><button type="button" class="ex-copy">Copy</button></div>`;
    pre.replaceWith(box); box.appendChild(pre);
  });
  return art.innerHTML.trim();
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
          <button type="button" class="btn btn-sm" id="exBuiltIn" hidden>📘 Built-in</button>
          <button type="button" class="btn btn-sm" id="exRegen" hidden>✨ Ask AI</button>
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
  const show = (md, note, html = null) => {
    currentMd = md;
    body.innerHTML = `<article class="ex-md">${html ?? renderMarkdown(md)}</article>`;
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
  const aiBtn = ov.querySelector('#exRegen'), builtInBtn = ov.querySelector('#exBuiltIn');
  const aiReady = () => !!(ai && ai.active);
  let builtIn = null;
  const showBuiltIn = () => {
    builtInBtn.hidden = true;
    aiBtn.hidden = !aiReady(); aiBtn.textContent = '✨ Ask AI';
    if (builtIn) show('', 'Detailed explanation · built into InterviewPro, works offline.', builtIn);
    else show(offlineMarkdown(q, related), aiReady() ? 'Summary from the model answer. Tap “Ask AI” for a longer AI-written explanation.' : 'Summary from the model answer · works offline.');
  };
  // Instant: pre-written explanation (or the built-in summary). Never waits on an AI engine.
  const showDefault = async () => {
    builtIn = await staticExplanation(q.id);
    if (!ov.isConnected) return;
    showBuiltIn();
  };
  // Only on request: AI explanation, cached on this device.
  const askAi = async (force = false) => {
    const cached = !force && cacheGet(q.id);
    builtInBtn.hidden = false;
    if (cached) { show(cached.md, `Written by AI (${cached.provider}) · saved on this device.`); aiBtn.textContent = '↻ Regenerate'; return; }
    if (!aiReady()) return;
    aiBtn.disabled = true;
    body.innerHTML = `<div class="ex-loading"><div class="ex-skel"></div><div class="ex-skel w80"></div><div class="ex-skel w60"></div><p class="muted">Asking the AI for a detailed explanation…</p></div>`;
    const text = await ai.complete({ system: 'You are an expert software engineering interview coach. Answer in clean Markdown.', messages: [{ role: 'user', content: aiPrompt(q, roleLabel) }], maxTokens: 2000, timeoutMs: ai.provider === 'chrome' ? 90000 : 60000 });
    aiBtn.disabled = false;
    if (!ov.isConnected) return;
    if (text && text.length > 200) {
      cachePut(q.id, text, ai.provider);
      show(text, 'Written by AI · saved on this device.');
      aiBtn.textContent = '↻ Regenerate';
    } else {
      showBuiltIn();
      foot.textContent = `The AI explanation could not be generated${ai.lastError ? ` (${ai.lastError})` : ''}, so the built-in one is shown.`;
    }
  };
  aiBtn.addEventListener('click', () => askAi(aiBtn.textContent.includes('Regenerate')));
  builtInBtn.addEventListener('click', showBuiltIn);
  ov.querySelector('#exListen').addEventListener('click', async (e) => {
    if (!speech) return;
    const b = e.currentTarget;
    if (speaking) { speaking = false; speech.stopSpeaking(); b.textContent = '▶ Listen'; return; }
    speaking = true; b.textContent = '■ Stop';
    const plain = body.innerText.replace(/\bCopy\b/g, '').replace(/\s+/g, ' ').slice(0, 4000);
    await speech.speak(plain, { gender: 'female' });
    speaking = false; if (b.isConnected) b.textContent = '▶ Listen';
  });
  await showDefault();
  return { close, markdown: () => currentMd };
}
