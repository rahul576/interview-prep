// AI interviewer (V1.5): context-aware reactions to what the candidate actually said.
// Providers, in order of preference:
//   1. Claude through the local server proxy (key stays on the Mac)          -> 'claude-proxy'
//   2. Claude directly from the browser with a key saved in this browser     -> 'claude-browser'
//   3. Chrome built-in AI (Gemini Nano, on-device, free)                     -> 'chrome'
//   4. none: the offline rule-based interviewer is used                      -> 'offline'
// Every call has a timeout and returns null on any failure, so the interview never stalls.

const PREFS_KEY = 'interviewpro.ai.v1';
export const CLAUDE_MODEL = 'claude-haiku-5-5';

const store = {
  get() { try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); } catch { return {}; } },
  set(v) { try { localStorage.setItem(PREFS_KEY, JSON.stringify({ ...store.get(), ...v })); } catch { /* ignore */ } },
};

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

/** Extract the first JSON object from model text (models sometimes wrap it in prose or fences). */
export function parseJson(text) {
  if (!text) return null;
  const s = String(text);
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) { try { return JSON.parse(s.slice(start, i + 1)); } catch { return null; } }
  }
  return null;
}

const clean = (t, max = 600) => String(t || '').replace(/[*_#`>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

// ------------------------------------------------------------------ prompts
function interviewerSystem({ persona, position, level, mode }) {
  return [
    `You are ${persona.name}, ${persona.title}, interviewing a candidate for the role "${position}" (target level: ${level}).`,
    mode === 'prep'
      ? 'This is a PREPARATION session: you are a supportive coach. Be honest and specific.'
      : 'This is a realistic INTERVIEW: be warm but professional, like a real panel interviewer. Never reveal the model answer, scores or key points.',
    'Everything you write is spoken aloud by a text-to-speech voice: plain conversational sentences only, no lists, markdown, emojis or code.',
    'React to what the candidate actually said. Never repeat the same stock phrase; vary your wording naturally.',
    'The candidate answer comes from speech recognition, so ignore small transcription errors and filler words.',
  ].join('\n');
}

function reactPrompt(ctx) {
  const { question, answer, history, result, followUpsLeft, allowFollowUps, isLast, turn } = ctx;
  return [
    `QUESTION: ${question.q}`,
    `KEY POINTS A STRONG ANSWER COVERS: ${question.keyPoints.map(k => k.label).join('; ')}`,
    `REFERENCE ANSWER (for your judgement only): ${question.ideal}`,
    history.length ? `EARLIER IN THIS QUESTION:\n${history.map(h => `${h.role === 'interviewer' ? 'Interviewer' : 'Candidate'}: ${h.text}`).join('\n')}` : '',
    `CANDIDATE'S LATEST ANSWER: "${answer || '(silence / nothing said)'}"`,
    `AUTOMATIC CHECK: covered ${result.matched.length} of ${question.keyPoints.length} key points; missing: ${result.missed.map(m => m.label).join('; ') || 'none'}.`,
    `This is extra turn ${turn} for this question (max 2). Deeper follow-up questions left in this interview: ${allowFollowUps ? followUpsLeft : 0}.${isLast ? ' This is the last question of the interview.' : ''}`,
    '',
    'Decide how a good interviewer responds now. Choose ONE action:',
    '- "next": move on. Use when the answer is good enough, the candidate said they do not know, they are clearly stuck, or the turn limit is reached. "say" = a short natural reaction to THEIR answer (1-2 sentences). If they did not know, be kind and, in one sentence, give a pointer to what the answer involves. Do NOT ask a question and do NOT read the next question.',
    '- "nudge": the answer is partial or vague; ask ONE short, specific question about something important they missed or said wrongly (do not give the answer away). Only if turn < 2.',
    '- "followup": the answer is strong; ask ONE deeper, realistic follow-up based on what they said. Only if follow-ups left > 0 and turn < 2.',
    '- "clarify": the candidate asked you a question or asked you to clarify; answer it briefly without giving away the solution, then invite them to answer.',
    '- "repeat": the candidate asked you to repeat the question; "say" = a short lead-in such as "Sure." (the app repeats the question).',
    '',
    'Reply with JSON only: {"intent":"answered|partial|dont_know|clarification|repeat|off_topic|silent","action":"next|nudge|followup|clarify|repeat","say":"..."}',
  ].filter(Boolean).join('\n');
}

function coachPrompt({ question, answer, result }) {
  return [
    `QUESTION: ${question.q}`,
    `KEY POINTS: ${question.keyPoints.map(k => k.label).join('; ')}`,
    `REFERENCE ANSWER: ${question.ideal}`,
    `CANDIDATE ANSWER: "${answer || '(nothing said)'}"`,
    `AUTOMATIC SCORE: ${result.overall}/100 (technical ${result.technical}, communication ${result.communication}). Covered: ${result.matched.map(m => m.label).join('; ') || 'nothing'}. Missing: ${result.missed.map(m => m.label).join('; ') || 'nothing'}.`,
    '',
    'Coach the candidate in 4 to 6 short spoken sentences, at a brisk pace:',
    '1) say the score and one honest verdict; 2) name what they actually did well, referring to their words;',
    '3) explain each important missing or wrong point in plain words with the correct idea, briefly;',
    '4) end with one concrete tip for the retry. If they said they do not know, teach the core idea simply.',
    'Reply with JSON only: {"say":"..."}',
  ].join('\n');
}

function summaryPrompt({ items, position }) {
  const lines = items.map((it, i) => `Q${i + 1} (${it.question.topic}, score ${it.result.overall}): ${it.question.q}\nAnswer: "${clean(it.answer, 700) || '(skipped)'}"`).join('\n\n');
  return [
    `Interview for "${position}". Questions, the candidate's answers and automatic scores:`,
    lines,
    '',
    'Write personalised feedback based on what they actually said. Reply with JSON only:',
    '{"summary":"2-3 sentence overall assessment","strengths":["..."],"improvements":["specific, actionable"],"studyTopics":["..."]}',
    'At most 4 items per list, each one short sentence.',
  ].join('\n');
}

// ------------------------------------------------------------------ providers
export class AIInterviewer {
  constructor({ fetchImpl } = {}) {
    this.fetch = fetchImpl || ((...a) => fetch(...a));
    this.provider = 'offline';
    this.proxy = false;
    this.chrome = 'unavailable';
    this.lastError = null;
  }

  prefs() { return { enabled: true, ...store.get() }; }
  setPrefs(v) { store.set(v); }
  get enabled() { return this.prefs().enabled !== false; }
  get active() { return this.enabled && this.provider !== 'offline'; }

  /** Detect which providers are available. Safe to call repeatedly. */
  async init() {
    this.proxy = false;
    try {
      if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
        const r = await withTimeout(this.fetch('/api/ai/status', { headers: { 'x-interviewpro': '1' } }), 3000);
        if (r.ok) { const s = await r.json(); this.proxy = !!s.claude; this.proxyAvailable = true; this.proxySource = s.source; }
      }
    } catch { /* static hosting: no proxy */ }
    this.chrome = 'unavailable';
    try {
      if (typeof LanguageModel !== 'undefined' && !navigator.webdriver) {
        this.chrome = await withTimeout(LanguageModel.availability({ expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] }), 3000);
      }
    } catch { this.chrome = 'unavailable'; }
    this.provider = this.proxy ? 'claude-proxy' : this.prefs().apiKey ? 'claude-browser' : this.chrome === 'available' ? 'chrome' : 'offline';
    return this.status();
  }

  status() {
    const labels = { 'claude-proxy': 'Claude (key stored on this Mac)', 'claude-browser': 'Claude (key stored in this browser)', chrome: 'Chrome built-in AI (on-device)', offline: 'Offline rules (no AI)' };
    return { provider: this.provider, label: labels[this.provider], enabled: this.enabled, proxyAvailable: !!this.proxyAvailable, proxyHasKey: this.proxy, browserKey: !!this.prefs().apiKey, chrome: this.chrome };
  }

  /** Save a Claude key: on the local server (preferred) or in this browser. */
  async saveKey(key) {
    key = String(key || '').trim();
    if (this.proxyAvailable) {
      const r = await this.fetch('/api/ai/key', { method: 'POST', headers: { 'content-type': 'application/json', 'x-interviewpro': '1' }, body: JSON.stringify({ key }) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || 'Could not save the key.');
    } else {
      if (!/^sk-ant-/.test(key)) throw new Error('That does not look like an Anthropic API key (it starts with sk-ant-).');
      store.set({ apiKey: key });
    }
    await this.init();
    const test = await this.complete({ system: 'Reply with the single word OK.', messages: [{ role: 'user', content: 'ping' }], maxTokens: 5, timeoutMs: 15000 });
    if (!test) throw new Error(this.lastError || 'The key was saved but the test call failed.');
    return this.status();
  }

  async removeKey() {
    if (this.proxyAvailable) { try { await this.fetch('/api/ai/key', { method: 'DELETE', headers: { 'x-interviewpro': '1' } }); } catch { /* ignore */ } }
    store.set({ apiKey: null });
    return this.init();
  }

  /** Download Chrome's on-device model (needs a click). */
  async downloadChromeModel(onProgress) {
    if (typeof LanguageModel === 'undefined') throw new Error('Chrome built-in AI is not available in this browser.');
    const s = await LanguageModel.create({ monitor(m) { m.addEventListener('downloadprogress', (e) => onProgress && onProgress(e.loaded)); } });
    s.destroy && s.destroy();
    return this.init();
  }

  /** One completion. Returns the text, or null on failure (reason in lastError). */
  async complete({ system, messages, maxTokens = 400, timeoutMs = 12000, schema }) {
    this.lastError = null;
    try {
      if (this.provider === 'claude-proxy' || this.provider === 'claude-browser') {
        const body = { model: CLAUDE_MODEL, max_tokens: maxTokens, system, messages, temperature: 0.7 };
        const proxy = this.provider === 'claude-proxy';
        const r = await withTimeout(this.fetch(proxy ? '/api/ai/messages' : 'https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: proxy
            ? { 'content-type': 'application/json', 'x-interviewpro': '1' }
            : { 'content-type': 'application/json', 'x-api-key': this.prefs().apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify(body),
        }), timeoutMs);
        const b = await r.json().catch(() => ({}));
        if (!r.ok) { this.lastError = (b.error && (b.error.message || b.error)) || `HTTP ${r.status}`; return null; }
        return (b.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
      }
      if (this.provider === 'chrome') {
        const session = await withTimeout(LanguageModel.create({ initialPrompts: [{ role: 'system', content: system }] }), timeoutMs);
        try {
          const prompt = messages.map(m => m.content).join('\n\n');
          return await withTimeout(session.prompt(prompt, schema ? { responseConstraint: schema } : undefined), timeoutMs);
        } finally { session.destroy && session.destroy(); }
      }
    } catch (e) { this.lastError = e.message || String(e); }
    return null;
  }

  /**
   * React to a candidate answer. Returns {action, say, intent} or null (caller falls back to rules).
   * ctx: { persona, position, level, mode, question, answer, history, result, followUpsLeft, allowFollowUps, isLast, turn }
   */
  async react(ctx) {
    if (!this.active) return null;
    const schema = { type: 'object', properties: { intent: { type: 'string' }, action: { type: 'string', enum: ['next', 'nudge', 'followup', 'clarify', 'repeat'] }, say: { type: 'string' } }, required: ['action', 'say'] };
    const text = await this.complete({ system: interviewerSystem(ctx), messages: [{ role: 'user', content: reactPrompt(ctx) }], maxTokens: 300, timeoutMs: this.provider === 'chrome' ? 20000 : 12000, schema });
    const j = parseJson(text);
    if (!j || !['next', 'nudge', 'followup', 'clarify', 'repeat'].includes(j.action) || !j.say) return null;
    let action = j.action;
    // enforce the conversation limits regardless of what the model chose
    if ((action === 'nudge' || action === 'followup' || action === 'clarify') && ctx.turn >= 2) action = 'next';
    if (action === 'followup' && (!ctx.allowFollowUps || ctx.followUpsLeft <= 0)) action = 'next';
    if (action === 'nudge' && !ctx.allowFollowUps && j.intent !== 'clarification') action = 'next';
    let say = clean(j.say);
    if (action === 'next' && j.action !== 'next') say = ''; // the model asked a question we will not let it ask
    return { action, say, intent: j.intent || '' };
  }

  /** Spoken coaching for preparation mode. Returns text or null. */
  async coach(ctx) {
    if (!this.active) return null;
    const text = await this.complete({ system: interviewerSystem({ ...ctx, mode: 'prep' }), messages: [{ role: 'user', content: coachPrompt(ctx) }], maxTokens: 450, timeoutMs: this.provider === 'chrome' ? 25000 : 15000, schema: { type: 'object', properties: { say: { type: 'string' } }, required: ['say'] } });
    const j = parseJson(text);
    return j && j.say ? clean(j.say, 1500) : null;
  }

  /** Personalised end-of-interview feedback. Returns {summary, strengths[], improvements[], studyTopics[]} or null. */
  async summarize({ items, position, persona, level, mode }) {
    if (!this.active || !items.length) return null;
    const text = await this.complete({ system: interviewerSystem({ persona, position, level, mode }).replace(/Everything you write is spoken[^\n]*\n/, ''), messages: [{ role: 'user', content: summaryPrompt({ items, position }) }], maxTokens: 700, timeoutMs: this.provider === 'chrome' ? 40000 : 25000 });
    const j = parseJson(text);
    if (!j || !j.summary) return null;
    const list = (x) => (Array.isArray(x) ? x : []).map(v => clean(v, 300)).filter(Boolean).slice(0, 4);
    return { summary: clean(j.summary, 800), strengths: list(j.strengths), improvements: list(j.improvements), studyTopics: list(j.studyTopics), provider: this.provider };
  }
}
