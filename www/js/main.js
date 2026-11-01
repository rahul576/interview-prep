// InterviewPro V1 – app shell, screens and interview room.
import { CATEGORIES, LEVELS, INTERVIEWERS, categoryById, interviewerById as builtinInterviewer, levelFromYears, levelById } from './data/meta.js';
import { QUESTIONS, BANK_VERSION, topicsFor, belongsTo } from './data/questions.js';
import { selectQuestions, targetLevels, planSlots, availableCount } from './engine/select.js';
import { summarize, selectionChance } from './engine/score.js';
import { InterviewSession, hearingCheckLine } from './engine/session.js';
import { InterviewerAvatar, PhotoAvatar } from './ui/avatar.js';
import { driftCheck, interruptionLine } from './engine/drift.js';
import { SpeechService, isNative, sleep, rankedVoices, sttErrorHelp, browserSpeechNote } from './services/speech.js';
import { MediaService } from './services/media.js';
import { store } from './services/store.js';
import { updateProgress, weakQuestions, markLearned, seenMap, progressStats, PASS_SCORE } from './engine/progress.js';

const params = new URLSearchParams(location.search);
const FAST = params.has('fast');           // test mode: silent speech, short timers
const app = document.getElementById('app');
const speech = new SpeechService({ fast: FAST });
const media = new MediaService();
const avatars = new Set();

const ICONS = {
  java: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 18h11a3 3 0 0 0 0-6h-1"/><path d="M5 12h10v6a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z"/><path d="M8 3c1 1.2-1 2 0 3.5M11 2c1.2 1.5-1.2 2.6 0 4.5"/></svg>',
  devops: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7a5 5 0 1 0 5 5"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17"/><path d="M15 3h6v6"/><path d="m21 3-6 6"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/></svg>',
  cc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 10a2 2 0 1 0 0 4M16 10a2 2 0 1 0 0 4"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  end: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 15.5c5-4.7 13-4.7 18 0l-2.4 2.4a1 1 0 0 1-1.3.1l-2.4-1.8a1 1 0 0 1-.4-.9l.2-1.7a12 12 0 0 0-5.4 0l.2 1.7a1 1 0 0 1-.4.9l-2.4 1.8a1 1 0 0 1-1.3-.1z"/></svg>',
  repeat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>',
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tone = (v) => v >= 70 ? 'ok' : v >= 50 ? 'warn' : 'bad';
const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function clearAvatars() { avatars.forEach(a => a.destroy()); avatars.clear(); }
function mountAvatar(host, persona) { const a = persona.photo ? new PhotoAvatar(host, persona) : new InterviewerAvatar(host, persona); avatars.add(a); return a; }

/** Custom interviewer from the user's own photo (stored on this device only). */
function customInterviewer() {
  const c = store.prefs().customInterviewer;
  return c && c.photo ? { id: 'custom', name: c.name || 'My interviewer', title: 'Interviewer', gender: c.gender || 'female', photo: c.photo } : null;
}
function interviewerById(id) { return id === 'custom' ? (customInterviewer() || builtinInterviewer('ananya')) : builtinInterviewer(id); }
function allInterviewers() { const c = customInterviewer(); return c ? [...INTERVIEWERS, c] : INTERVIEWERS; }

/** Resize an uploaded photo to a small JPEG data URL so it fits in local storage. */
function photoToDataUrl(file, max = 560) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function toast(msg, ms = 2600) {
  const t = document.createElement('div');
  t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

// ---------------------------------------------------------------- state
const prefs = store.prefs();
const state = {
  screen: 'home',
  setup: {
    category: prefs.category || 'java-backend',
    positionId: prefs.positionId || null,
    topics: null, // null = all categories
    style: prefs.style || 'interview', // 'interview' | 'prep'
    source: 'new', // prep: 'new' | 'revision'
    practiceIds: null, // explicit question list (from the revision screen)
    years: prefs.years ?? 3,
    mode: prefs.mode || 'mixed',
    count: prefs.count || 8,
    interviewerId: prefs.interviewerId || 'ananya',
    candidateName: prefs.candidateName || '',
    lang: prefs.lang || 'en-US',
    followUps: prefs.followUps ?? true,
    record: prefs.record ?? true,
    answerMode: 'voice',
    camera: true,
  },
  report: null,
};

function shell(content, active = 'home') {
  return `
  <header class="topbar">
    <button class="logo" data-nav="home" aria-label="InterviewPro home">
      <span class="logo-mark" aria-hidden="true">${ICONS.mic}</span> InterviewPro <span class="badge">V1.3</span>
    </button>
    <nav aria-label="Main">
      <button class="navbtn" data-nav="home" ${active === 'home' ? 'aria-current="page"' : ''}>Practice</button>
      <button class="navbtn" data-nav="revision" ${active === 'revision' ? 'aria-current="page"' : ''}>Revision${weakCount() ? ` <span class="nav-badge">${weakCount()}</span>` : ''}</button>
      <button class="navbtn" data-nav="history" ${active === 'history' ? 'aria-current="page"' : ''}>History</button>
    </nav>
  </header>
  <main class="page" id="main">${content}</main>`;
}

function weakCount(role = null) { return weakQuestions(store.progress(), { role }).length; }

function bindNav() {
  $$('[data-nav]').forEach(b => b.addEventListener('click', () => go(b.dataset.nav)));
}

function go(screen, data) {
  clearAvatars();
  document.body.classList.toggle('in-room', screen === 'room');
  state.screen = screen;
  window.scrollTo(0, 0);
  ({ home: renderHome, setup: renderSetup, check: renderCheck, room: renderRoom, report: renderReport, history: renderHistory, revision: renderRevision }[screen])(data);
  window.__ip.screen = screen;
}

// ---------------------------------------------------------------- home
function renderHome() {
  const hist = store.history();
  const scores = hist.map(h => h.summary.overall);
  const best = scores.length ? Math.max(...scores) : 0;
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const roleCards = CATEGORIES.map(c => {
    const roleQs = QUESTIONS.filter(q => belongsTo(q, c.id));
    const counts = LEVELS.map(l => roleQs.filter(q => q.levels.includes(l.id)).length);
    const topics = topicsFor(c.id);
    return `
    <article class="card role-card" style="--role-accent:${c.accent}">
      <div class="role-head">
        <div class="role-icon" aria-hidden="true">${ICONS[c.icon]}</div>
        <div><h3>${esc(c.title)}</h3><span class="muted" style="font-size:13px">${roleQs.length} questions · ${topics.length} categories</span></div>
      </div>
      <p>${esc(c.blurb)}</p>
      <div class="level-row" aria-label="Questions per level">
        ${LEVELS.map((l, i) => `<div class="level-pill"><b>${counts[i]}</b>${esc(l.label.split(' ')[0])}</div>`).join('')}
      </div>
      ${(() => { const st = progressStats(store.progress(), c.id, roleQs.map(q => q.id)); return st.seen ? `<p class="muted" style="font-size:13px;margin:0">Practised <b>${st.seen}</b> of ${st.total} questions · <b>${st.weak}</b> to revise</p>` : ''; })()}
      <button class="btn btn-primary" data-role="${c.id}">Practice ${esc(c.short)} interview</button>
    </article>`;
  }).join('');

  app.innerHTML = shell(`
    <section class="hero">
      <div>
        <div class="eyebrow">Mock interviews · Works offline</div>
        <h1>Rehearse the <em>real</em> interview, face to face.</h1>
        <p class="lead">A live interviewer asks role-specific questions matched to your experience, listens to your spoken answers, asks follow-ups, and scores you on technical depth and communication.</p>
        <div class="hero-actions">
          <button class="btn btn-primary btn-lg" data-role="${state.setup.category}">Start a mock interview</button>
          <button class="btn btn-lg" data-nav="history">View past results</button>
        </div>
      </div>
      <div class="hero-stage" aria-hidden="true">
        <div class="avatar-host" id="heroAvatar"></div>
        <div class="hero-caption"><span class="live-dot"></span><b>Vikram:</b> How does HashMap work internally?</div>
      </div>
    </section>

    ${hist.length ? `
    <div class="section-title"><h2>Your progress</h2></div>
    <div class="stats">
      <div class="card stat"><div class="v">${hist.length}</div><div class="l">Interviews taken</div></div>
      <div class="card stat"><div class="v">${avg}</div><div class="l">Average score</div></div>
      <div class="card stat"><div class="v">${best}</div><div class="l">Best score</div></div>
      <div class="card stat">${sparkline(scores.slice(0, 10).reverse())}<div class="l">Last ${Math.min(10, scores.length)} scores</div></div>
    </div>` : ''}

    <div class="section-title"><h2>Choose a role</h2><span class="muted" style="font-size:14px">More roles coming soon</span></div>
    <div class="roles">${roleCards}</div>

    <div class="section-title"><h2>How it works</h2></div>
    <div class="steps">
      <div class="card step"><h3>Pick role &amp; level</h3><p>Choose position and years of experience. Questions are drawn from an offline bank matched to that level.</p></div>
      <div class="card step"><h3>Check camera &amp; mic</h3><p>See yourself on camera and confirm your microphone. You can also type answers.</p></div>
      <div class="card step"><h3>Talk to the interviewer</h3><p>The interviewer speaks each question, listens, and asks follow-ups when an answer is thin.</p></div>
      <div class="card step"><h3>Get your report</h3><p>Overall, technical and communication scores, missed concepts, model answers and your recording.</p></div>
    </div>
    <p class="muted" style="font-size:12px;margin-top:28px">Question bank v${BANK_VERSION} · ${QUESTIONS.length} questions · Your video and answers never leave this device.</p>
  `, 'home');
  bindNav();
  $$('[data-role]').forEach(b => b.addEventListener('click', () => {
    state.setup.category = b.dataset.role;
    state.setup.positionId = null;
    state.setup.topics = null;
    state.setup.practiceIds = null;
    go('setup');
  }));
  const a = mountAvatar($('#heroAvatar'), interviewerById('vikram'));
  a.setState('listening');
}

function sparkline(vals) {
  if (vals.length < 2) return `<div class="v">${vals[0] ?? '–'}</div>`;
  const w = 160, h = 40, max = 100;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - (v / max) * h}`).join(' ');
  return `<svg class="spark" viewBox="-2 -2 ${w + 4} ${h + 4}" preserveAspectRatio="none" role="img" aria-label="Score trend"><polyline points="${pts}" fill="none" stroke="var(--brand)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
}

// ---------------------------------------------------------------- setup
function currentPosition() {
  const cat = categoryById(state.setup.category);
  const expLevel = levelFromYears(state.setup.years);
  return cat.positions.find(p => p.id === state.setup.positionId) || cat.positions.find(p => p.level === expLevel) || cat.positions[0];
}

function renderSetup() {
  const s = state.setup;
  const cat = categoryById(s.category);
  const pos = currentPosition();
  s.positionId = pos.id;

  app.innerHTML = shell(`
    <button class="btn btn-ghost" data-nav="home" style="margin:-8px 0 8px -12px">← All roles</button>
    <h1 style="font-size:28px;margin-bottom:4px">${esc(cat.title)} interview</h1>
    <p class="muted" style="margin:0 0 20px">Set up your session. Questions are tailored to the position and your experience.</p>
    <div class="setup">
      <div class="card">
        <div class="form-sec">
          <h3>Mode</h3>
          <p class="hint">Preparation mode is for learning; Interview mode simulates the real thing.</p>
          <div class="mode-grid" role="group" aria-label="Mode">
            <button type="button" class="opt mode-opt" data-style="prep" aria-pressed="${s.style === 'prep'}"><b>Preparation mode</b><small>No time limit · hints · instant feedback and model answer after every question · try again as often as you like</small></button>
            <button type="button" class="opt mode-opt" data-style="interview" aria-pressed="${s.style === 'interview'}"><b>Interview mode</b><small>Timed answers · follow-up questions · no hints · full report at the end, like a real interview</small></button>
          </div>
          <div id="prepSource" ${s.style === 'prep' ? '' : 'hidden'} style="margin-top:12px">
            <div class="seg" role="group" aria-label="Question source">
              <button type="button" data-source="new" aria-pressed="${s.source === 'new'}">New questions</button>
              <button type="button" data-source="revision" aria-pressed="${s.source === 'revision'}">My revision list (${weakCount(s.category)})</button>
            </div>
          </div>
        </div>
        <div class="form-sec">
          <h3><label for="name">Your first name</label></h3>
          <p class="hint">The interviewer will greet you by name (optional).</p>
          <input id="name" class="field" maxlength="30" autocomplete="given-name" placeholder="e.g. Rahul" value="${esc(s.candidateName)}">
        </div>
        <div class="form-sec">
          <h3>Position you are interviewing for</h3>
          <p class="hint">Sets the target difficulty of the technical questions.</p>
          <div class="opts" role="group" aria-label="Position">
            ${cat.positions.map(p => `<button class="opt" data-pos="${p.id}" aria-pressed="${p.id === pos.id}">${esc(p.title)}<small>${esc(levelById(p.level).label)} · ${esc(levelById(p.level).years)}</small></button>`).join('')}
          </div>
        </div>
        <div class="form-sec">
          <h3><label for="years">Your experience</label></h3>
          <p class="hint">We mix questions for your experience level and the position's level.</p>
          <div class="range-row">
            <input id="years" type="range" min="0" max="15" step="1" value="${s.years}" aria-describedby="yearsVal">
            <div class="range-val" id="yearsVal"></div>
          </div>
        </div>
        <div class="form-sec">
          <h3>Interview format</h3>
          <p class="hint">Technical + HR adds an introduction and behavioural questions, like a real first round.</p>
          <div class="seg" role="group" aria-label="Format">
            <button data-mode="mixed" aria-pressed="${s.mode === 'mixed'}">Technical + HR</button>
            <button data-mode="technical" aria-pressed="${s.mode === 'technical'}">Technical only</button>
          </div>
          <div style="height:12px"></div>
          <div class="seg" role="group" aria-label="Length">
            ${[[5, 'Quick · 5'], [8, 'Standard · 8'], [12, 'Full · 12']].map(([n, l]) => `<button data-count="${n}" aria-pressed="${s.count === n}">${l}</button>`).join('')}
          </div>
        </div>
        <div class="form-sec">
          <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap">
            <h3>Topics to cover</h3>
            <div class="seg" role="group" aria-label="Select topics">
              <button id="topicsAll" type="button">Select all</button>
              <button id="topicsNone" type="button">Clear</button>
            </div>
          </div>
          <p class="hint" id="topicHint">All categories are selected. Tap a category to include or exclude it.</p>
          <div class="chips topic-chips" role="group" aria-label="Topic categories">
            ${topicsFor(s.category).map(t => `<button type="button" class="topic-chip" data-topic="${esc(t.topic)}" aria-pressed="${!s.topics || s.topics.includes(t.topic)}">${esc(t.topic)} <span class="cnt">${t.count}</span></button>`).join('')}
          </div>
        </div>
        <div class="form-sec">
          <h3>Interviewer</h3>
          <p class="hint">All interviewers are fictional characters.</p>
          <div class="persona-grid" role="group" aria-label="Interviewer">
            ${allInterviewers().map(p => `<button class="persona" data-iv="${p.id}" aria-pressed="${p.id === s.interviewerId}"><div class="ph"><div class="avatar-host" data-av="${p.id}"></div></div><div class="pn"><b>${esc(p.name)}</b><span>${esc(p.title)}</span></div></button>`).join('')}
          </div>
          <details class="custom-iv" style="margin-top:12px">
            <summary>Use your own interviewer photo</summary>
            <p class="hint" style="margin-top:8px">Upload a photo you have the rights to use, for example your own or one licensed from a stock site. It stays on this device. A front-facing head-and-shoulders photo works best.</p>
            <div class="custom-row">
              <input id="ivName" class="field" maxlength="30" placeholder="Interviewer name" value="${esc((store.prefs().customInterviewer || {}).name || '')}">
              <select id="ivGender" class="field"><option value="female">Female voice</option><option value="male" ${(store.prefs().customInterviewer || {}).gender === 'male' ? 'selected' : ''}>Male voice</option></select>
              <label class="btn" for="ivPhoto">Choose photo</label>
              <input id="ivPhoto" type="file" accept="image/*" hidden>
              ${customInterviewer() ? '<button type="button" class="btn btn-ghost" id="ivRemove">Remove</button>' : ''}
            </div>
          </details>
        </div>
        <div class="form-sec">
          <h3><label for="lang">Speech accent</label></h3>
          <p class="hint">Used for the interviewer's voice and for recognising your speech.</p>
          <select id="lang" class="field">
            ${[['en-US', 'English (United States)'], ['en-IN', 'English (India)'], ['en-GB', 'English (United Kingdom)'], ['en-AU', 'English (Australia)']].map(([v, l]) => `<option value="${v}" ${s.lang === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
          <div style="height:12px"></div>
          <label class="toggle"><span><b style="font-size:15px">Follow-up questions</b><br><span class="muted" style="font-size:13px">Interviewer probes thin answers and digs deeper on strong ones</span></span><input type="checkbox" id="followUps" ${s.followUps ? 'checked' : ''}></label>
          <label class="toggle"><span><b style="font-size:15px">Record my session</b><br><span class="muted" style="font-size:13px">Saved only in this session for playback in your report</span></span><input type="checkbox" id="record" ${s.record ? 'checked' : ''}></label>
        </div>
      </div>
      <aside class="card summary" aria-live="polite" id="summary"></aside>
    </div>
  `, 'home');
  bindNav();
  allInterviewers().forEach(p => { const a = mountAvatar($(`[data-av="${p.id}"]`), p); a.setState('listening'); });
  const saveCustom = (patch) => store.savePrefs({ customInterviewer: { ...(store.prefs().customInterviewer || {}), ...patch } });
  $('#ivPhoto').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      const photo = await photoToDataUrl(f);
      saveCustom({ photo, name: $('#ivName').value.trim() || 'My interviewer', gender: $('#ivGender').value });
      s.interviewerId = 'custom';
      saveSetup(); go('setup');
    } catch { toast('Could not read that image.'); }
  });
  $('#ivName').addEventListener('change', () => { if (customInterviewer()) saveCustom({ name: $('#ivName').value.trim() || 'My interviewer' }); });
  $('#ivGender').addEventListener('change', () => { if (customInterviewer()) saveCustom({ gender: $('#ivGender').value }); });
  const rm = $('#ivRemove');
  if (rm) rm.addEventListener('click', () => { store.savePrefs({ customInterviewer: null }); if (s.interviewerId === 'custom') s.interviewerId = 'ananya'; saveSetup(); go('setup'); });

  const update = () => {
    const pos2 = currentPosition();
    const exp = levelFromYears(s.years);
    const lv = targetLevels(pos2.level, exp).map(l => levelById(l).label.split(' ')[0]);
    const rank = Math.max(...targetLevels(pos2.level, exp).map(l => levelById(l).rank));
    const slots = planSlots(s.count, s.mode, rank);
    const fromRevision = s.style === 'prep' && s.source === 'revision';
    const weakN = weakCount(s.category);
    const allTopics = topicsFor(s.category).map(t => t.topic);
    const selected = s.topics || allTopics;
    const avail = availableCount({ bank: QUESTIONS, category: s.category, positionLevel: pos2.level, experienceLevel: exp, topics: selected });
    $('#topicHint').textContent = !s.topics ? `All ${allTopics.length} categories selected. Tap a category to include or exclude it.` : `${selected.length} of ${allTopics.length} categories selected · ${avail} matching questions at this level.`;
    $('#yearsVal').innerHTML = `${s.years}${s.years >= 15 ? '+' : ''} year${s.years === 1 ? '' : 's'}<small>${esc(levelById(exp).label)}</small>`;
    $('#summary').innerHTML = `
      <div class="eyebrow">${s.style === 'prep' ? 'Preparation session' : 'Interview session'}</div>
      <h3 style="font-size:18px">${esc(pos2.title)}</h3>
      <dl>
        <dt>Mode</dt><dd>${s.style === 'prep' ? 'Preparation' : 'Interview'}</dd>
        ${fromRevision ? `<dt>Source</dt><dd>Revision list (${weakN})</dd>` : ''}
        <dt>Difficulty</dt><dd>${esc(lv.join(' → '))}</dd>
        <dt>Questions</dt><dd>${s.count}</dd>
        <dt>Technical</dt><dd>${slots.technical}</dd>
        <dt>${rank >= 3 ? 'Intro + HR / managerial' : 'Intro + behavioural'}</dt><dd>${slots.intro + slots.behavioral}</dd>
        <dt>Topics</dt><dd>${s.topics ? `${selected.length} selected` : 'All'}</dd>
        <dt>Matching questions</dt><dd>${avail}</dd>
        <dt>Estimated time</dt><dd>${Math.round(s.count * 2.6)}–${Math.round(s.count * 3.6)} min</dd>
        <dt>Interviewer</dt><dd>${esc(interviewerById(s.interviewerId).name)}</dd>
      </dl>
      ${fromRevision && weakN === 0 ? '<p style="color:var(--warn);font-size:13px;margin:0">Your revision list is empty. Questions you answer below 60 will appear there.</p>' : ''}
      ${selected.length === 0 ? '<p style="color:var(--bad);font-size:13px;margin:0">Select at least one topic.</p>' : avail < slots.technical ? `<p style="color:var(--warn);font-size:13px;margin:0">Only ${avail} questions match at this level; nearby levels will be used to fill the interview.</p>` : ''}
      <button class="btn btn-primary btn-lg" id="toCheck" ${selected.length === 0 || (fromRevision && weakN === 0) ? 'disabled' : ''}>Continue to device check</button>
      <p class="muted" style="font-size:12px;margin:0">Tip: answer out loud as you would in a real interview — explain, then give an example.</p>`;
    $('#toCheck').addEventListener('click', () => { saveSetup(); go('check'); });
  };
  const saveSetup = () => {
    s.candidateName = $('#name').value.trim().replace(/[^\p{L}\p{M}' -]/gu, '').slice(0, 30);
    s.lang = $('#lang').value;
    s.followUps = $('#followUps').checked;
    s.record = $('#record').checked;
    store.savePrefs({ style: s.style, category: s.category, positionId: s.positionId, years: s.years, mode: s.mode, count: s.count, interviewerId: s.interviewerId, candidateName: s.candidateName, lang: s.lang, followUps: s.followUps, record: s.record });
  };
  const press = (sel, attr, fn) => $$(sel).forEach(b => b.addEventListener('click', () => {
    $$(sel).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    fn(b.dataset[attr]); update();
  }));
  press('[data-pos]', 'pos', v => { s.positionId = v; });
  press('[data-mode]', 'mode', v => { s.mode = v; });
  press('[data-style]', 'style', v => { s.style = v; s.practiceIds = null; $('#prepSource').hidden = v !== 'prep'; });
  press('[data-source]', 'source', v => { s.source = v; s.practiceIds = null; });
  press('[data-count]', 'count', v => { s.count = Number(v); });
  press('[data-iv]', 'iv', v => { s.interviewerId = v; });
  $('#years').addEventListener('input', e => { s.years = Number(e.target.value); update(); });
  const allTopicNames = topicsFor(s.category).map(t => t.topic);
  const syncChips = () => $$('[data-topic]').forEach(b => b.setAttribute('aria-pressed', String(!s.topics || s.topics.includes(b.dataset.topic))));
  $$('[data-topic]').forEach(b => b.addEventListener('click', () => {
    const cur = new Set(s.topics || allTopicNames);
    if (cur.has(b.dataset.topic)) cur.delete(b.dataset.topic); else cur.add(b.dataset.topic);
    s.topics = cur.size === allTopicNames.length ? null : allTopicNames.filter(t => cur.has(t));
    syncChips(); update();
  }));
  $('#topicsAll').addEventListener('click', () => { s.topics = null; syncChips(); update(); });
  $('#topicsNone').addEventListener('click', () => { s.topics = []; syncChips(); update(); });
  update();
}

// ---------------------------------------------------------------- device check
async function renderCheck() {
  const s = state.setup;
  speech.lang = s.lang;
  app.innerHTML = shell(`
    <button class="btn btn-ghost" id="back" style="margin:-8px 0 8px -12px">← Back to setup</button>
    <h1 style="font-size:28px;margin-bottom:4px">Device check</h1>
    <p class="muted" style="margin:0 0 20px">Make sure the interviewer can see and hear you. Nothing is uploaded.</p>
    <div class="check">
      <div>
        <div class="preview" id="preview">
          <video id="pv" autoplay playsinline muted></video>
          <div class="placeholder" id="pvPh">Requesting camera…</div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;margin-top:14px">
          <span style="width:22px;color:var(--muted)" aria-hidden="true">${ICONS.mic}</span>
          <div class="meter" style="flex:1" aria-label="Microphone level"><i id="lvl"></i></div>
        </div>
        <p class="muted" style="font-size:13px" id="micHint">Say something — the bar should move.</p>
        <div id="micBox" hidden style="margin-top:8px">
          <label class="eyebrow" for="micSel" style="display:block;margin-bottom:6px">Microphone</label>
          <select id="micSel" class="field"></select>
        </div>
        <div class="mic-help" id="micHelp" hidden role="alert"></div>
        <div class="stt-test" style="margin-top:12px">
          <button class="btn" id="sttTest">${ICONS.mic} Test voice answers</button>
          <p class="muted" id="sttOut" style="font-size:13px;margin:8px 0 0">Click, then say a sentence. You should see your words appear here.</p>
        </div>
      </div>
      <div class="card card-pad" style="display:flex;flex-direction:column;gap:16px">
        <ul class="checklist" id="checks"></ul>
        <div>
          <div class="eyebrow" style="margin-bottom:8px">How will you answer?</div>
          <div class="seg" role="group" aria-label="Answer mode">
            <button data-am="voice" aria-pressed="${s.answerMode === 'voice'}">Speak (auto-transcribe)</button>
            <button data-am="type" aria-pressed="${s.answerMode === 'type'}">Type</button>
          </div>
        </div>
        <div id="voiceBox" hidden>
          <label class="eyebrow" for="voiceSel" style="display:block;margin-bottom:8px">Interviewer voice</label>
          <select id="voiceSel" class="field"></select>
          <p class="muted" id="voiceTip" style="font-size:12px;margin:8px 0 0"></p>
        </div>
        <button class="btn" id="testVoice">${ICONS.play} Test interviewer voice</button>
        <button class="btn btn-primary btn-lg" id="start">Start interview</button>
      </div>
    </div>`, 'home');
  bindNav();
  $('#back').addEventListener('click', () => { media.stop(); go('setup'); });
  // attach immediately so an early click is never lost while devices are still being checked
  $('#start').addEventListener('click', () => go('room'));

  await speech.init();
  speech.voiceName = store.prefs().voiceName || null;
  const persona0 = interviewerById(s.interviewerId);
  const ranked = rankedVoices(speech.voices, { gender: persona0.gender, lang: s.lang });
  if (ranked.length && !isNative()) {
    $('#voiceBox').hidden = false;
    $('#voiceSel').innerHTML = `<option value="">Auto — most natural available</option>` + ranked.map(v => `<option value="${esc(v.name)}" ${v.name === speech.voiceName ? 'selected' : ''}>${v.natural ? '★ ' : ''}${esc(v.name)} (${esc(v.lang)})${v.robotic ? ' — robotic' : ''}</option>`).join('');
    const tip = () => { $('#voiceTip').innerHTML = speech.hasNaturalVoice(persona0.gender) ? '★ = natural, human-like voice.' : 'Only basic voices were found, so the interviewer may sound robotic. For a human-like voice open this site in <b>Microsoft Edge</b> (free natural voices), or on a Mac add a Premium voice: System Settings → Accessibility → Spoken Content → System voice → Manage Voices (e.g. Ava or Zoe Premium), then reload.'; };
    tip();
    $('#voiceSel').addEventListener('change', (e) => { speech.voiceName = e.target.value || null; store.savePrefs({ voiceName: speech.voiceName }); tip(); speech.speak('Hi, this is how I will sound in your interview.', { gender: persona0.gender }); });
  }
  const sttOk = speech.sttAvailable();
  if (!sttOk) s.answerMode = 'type';
  $$('[data-am]').forEach(b => {
    b.setAttribute('aria-pressed', String(b.dataset.am === s.answerMode));
    if (b.dataset.am === 'voice' && !sttOk) b.disabled = true;
    b.addEventListener('click', () => { s.answerMode = b.dataset.am; $$('[data-am]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
  });

  const checks = { camera: ['warn', 'Camera', 'Checking…'], mic: ['warn', 'Microphone', 'Checking…'], stt: [sttOk ? 'ok' : 'warn', 'Voice answers', sttOk ? (isNative() ? 'On-device speech recognition ready' : 'Speech recognition available in this browser') : 'Not supported here (works in Chrome, Edge, Safari) — you will type answers'], tts: [speech.ttsAvailable() ? 'ok' : 'warn', 'Interviewer voice', speech.ttsAvailable() ? `${speech.voices.length || 'System'} voice${speech.voices.length === 1 ? '' : 's'} available` : 'Voice unavailable — questions appear as captions'] };
  const drawChecks = () => {
    $('#checks').innerHTML = Object.values(checks).map(([st, t, d]) => `<li><span class="st ${st}" aria-hidden="true">${st === 'ok' ? '✓' : st === 'bad' ? '✕' : '!'}</span><div><b>${t}</b><span>${esc(d)}</span></div></li>`).join('');
  };
  drawChecks();

  const setVoiceMode = (on) => {
    s.answerMode = on ? 'voice' : 'type';
    $$('[data-am]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.am === s.answerMode)));
  };
  const showHelp = (html) => { const h = $('#micHelp'); if (!h) return; h.hidden = !html; h.innerHTML = html || ''; };
  const note = browserSpeechNote();
  if (note && !isNative()) checks.stt = ['warn', 'Voice answers', note];

  let meterRun = 0;
  const startMeter = () => {
    const run = ++meterRun;
    const level = media.levelMeter();
    let loudSeen = false;
    const t0 = performance.now();
    const loop = () => {
      if (run !== meterRun || !$('#lvl')) return;
      const v = level();
      $('#lvl').style.width = `${Math.round(v * 100)}%`;
      if (v > 0.04 && !loudSeen) {
        loudSeen = true;
        checks.mic = ['ok', 'Microphone', `Hearing you on: ${media.micLabel() || 'default microphone'}`];
        drawChecks(); showHelp('');
        $('#micHint').textContent = 'Great — the bar is moving, your microphone works.';
      }
      if (!loudSeen && performance.now() - t0 > 6000 && !$('#micHelp').dataset.silent) {
        $('#micHelp').dataset.silent = '1';
        checks.mic = ['warn', 'Microphone', `No sound from: ${media.micLabel() || 'default microphone'}`];
        drawChecks();
        showHelp(`<b>The microphone is connected but silent.</b> Try these:<ol>
          <li>Pick another microphone in the list${$('#micSel') && $('#micSel').options.length > 1 ? ' above' : ''} (a Mac mini has no built-in mic; choose your headset/AirPods/USB mic).</li>
          <li>macOS: <b>System Settings → Privacy &amp; Security → Microphone</b> — switch on your browser (Chrome/Edge/Safari), then <b>quit and reopen the browser</b>. Without this the browser gets silence even though the site is allowed.</li>
          <li>macOS: System Settings → Sound → Input — check the input level moves when you talk.</li></ol>`);
      }
      requestAnimationFrame(loop);
    };
    loop();
  };

  const fillMics = async () => {
    const mics = await media.listMics();
    if (mics.length < 1 || isNative()) return;
    const cur = media.audioTrack()?.getSettings?.().deviceId || store.prefs().micId || '';
    $('#micBox').hidden = false;
    $('#micSel').innerHTML = mics.map(m => `<option value="${esc(m.id)}" ${m.id === cur ? 'selected' : ''}>${esc(m.label)}</option>`).join('');
  };

  const startDevices = async (micId) => {
    try {
      await media.start({ video: true, audio: true, micId });
      if (media.hasVideo()) {
        media.attach($('#pv')); $('#pvPh')?.remove();
        checks.camera = ['ok', 'Camera', 'Camera is working'];
      } else {
        if ($('#pvPh')) $('#pvPh').textContent = 'No camera found. You can still continue — the interviewer will just not see you.';
        checks.camera = ['warn', 'Camera', 'No camera (optional)'];
        state.setup.camera = false;
      }
      if (media.hasAudio()) {
        checks.mic = ['ok', 'Microphone', `Connected: ${media.micLabel() || 'default microphone'} — say something`];
        delete $('#micHelp').dataset.silent; showHelp('');
        startMeter();
        await fillMics();
      } else if (isNative()) {
        const micOk = await speech.requestMicPermission();
        checks.mic = [micOk ? 'ok' : 'warn', 'Microphone', micOk ? 'Microphone access granted for speech recognition' : 'Microphone permission needed for voice answers'];
        $('#micHint').textContent = 'On the app, your microphone is used by speech recognition.';
        if (!micOk) setVoiceMode(false);
      } else {
        const e = media.audioError;
        const denied = e && /NotAllowed|Security/i.test(e.name);
        checks.mic = ['bad', 'Microphone', denied ? 'Blocked by the browser or macOS' : 'No microphone found'];
        $('#micHint').textContent = 'The microphone could not be opened.';
        showHelp(denied ? sttErrorHelp('not-allowed') : `No microphone could be opened${e ? ` (${esc(e.name)})` : ''}. Plug in or select a microphone, then reload this page.`);
      }
    } catch (err) {
      const denied = /NotAllowed|Security/i.test(err && err.name);
      if ($('#pvPh')) $('#pvPh').textContent = 'Camera and microphone unavailable. You can still type your answers.';
      checks.camera = ['bad', 'Camera', denied ? 'Permission denied' : 'No camera'];
      checks.mic = ['bad', 'Microphone', denied ? 'Blocked by the browser or macOS' : 'No microphone found'];
      showHelp(denied ? sttErrorHelp('not-allowed') : 'No camera or microphone could be opened. Check they are connected and not used by another app (Zoom, Teams, FaceTime), then reload.');
      state.setup.camera = false;
    }
    drawChecks();
  };
  await startDevices(store.prefs().micId || null);
  $('#micSel')?.addEventListener('change', async (e) => {
    store.savePrefs({ micId: e.target.value });
    $('#micHint').textContent = 'Switching microphone… say something.';
    await startDevices(e.target.value);
  });

  // End-to-end check of the voice-answer pipeline (mic → browser speech recognition → text).
  let sttCtl = null;
  $('#sttTest').addEventListener('click', () => {
    const out = $('#sttOut'); const btn = $('#sttTest');
    if (sttCtl) { sttCtl.stop(); sttCtl = null; return; }
    if (!speech.sttAvailable()) { out.innerHTML = esc(sttErrorHelp('unsupported')); return; }
    let heard = '';
    out.textContent = 'Listening… say a sentence.';
    btn.innerHTML = `${ICONS.mic} Stop test`;
    const done = (ok, msg) => {
      if (sttCtl) { try { sttCtl.stop(); } catch {} sttCtl = null; }
      btn.innerHTML = `${ICONS.mic} Test voice answers`;
      out.innerHTML = msg;
      checks.stt = [ok ? 'ok' : 'bad', 'Voice answers', ok ? 'Speech recognition works' : 'Speech recognition failed — see the note on the left'];
      drawChecks();
      if (!ok) setVoiceMode(false); else setVoiceMode(true);
    };
    const timer = setTimeout(() => done(!!heard.trim(), heard.trim() ? `✓ Heard: “${esc(heard.trim())}”` : 'Nothing was recognised in 10 seconds. Check the microphone bar above moves when you talk; if it does not, follow the microphone tips. If it does, your browser\u2019s speech service may be blocked: try Chrome, Edge or Safari.'), 10000);
    sttCtl = speech.startListening({
      track: media.audioTrack(),
      onText: (txt) => { heard = txt; out.innerHTML = `Heard: “${esc(txt)}”`; if (txt.trim().split(/\s+/).length >= 3) { clearTimeout(timer); done(true, `✓ Voice answers work. Heard: “${esc(txt.trim())}”`); } },
      onError: (code) => { clearTimeout(timer); done(false, `✕ ${esc(sttErrorHelp(code))}`); },
    });
  });

  $('#testVoice').addEventListener('click', () => speech.speak(`Hello${s.candidateName ? ' ' + s.candidateName : ''}, can you hear me clearly?`, { gender: interviewerById(s.interviewerId).gender }));

}

// ---------------------------------------------------------------- interview room
function answerSeconds(q) {
  if (FAST) return 20;
  if (q.type === 'intro') return 120;
  if (q.type === 'design') return 300;
  if (q.type === 'scenario') return 240;
  return 180;
}

function renderRoom() {
  const s = state.setup;
  const cat = categoryById(s.category);
  const pos = currentPosition();
  const persona = interviewerById(s.interviewerId);
  const seed = Number(params.get('seed')) || Math.floor(Math.random() * 1e9);
  const prep = s.style === 'prep';
  speech.voiceName = store.prefs().voiceName || null;
  const progressNow = store.progress();
  let questions;
  if (prep && (s.practiceIds || s.source === 'revision')) {
    const ids = s.practiceIds || weakQuestions(progressNow, { role: s.category }).map(w => w.id);
    questions = ids.map(id => QUESTIONS.find(q => q.id === id)).filter(Boolean).slice(0, s.practiceIds ? 20 : s.count);
  } else {
    questions = selectQuestions({
      bank: QUESTIONS, category: s.category, positionLevel: pos.level, experienceLevel: levelFromYears(s.years),
      count: s.count, mode: s.mode, topics: s.topics, seed, seen: seenMap(progressNow), recentIds: store.lastSessionIds(s.category),
    });
  }
  window.__ip.questions = questions.map(q => q.id);
  const initials = (s.candidateName || 'You').slice(0, 2).toUpperCase();

  app.innerHTML = `
  <div class="room" id="room">
    <div class="room-top">
      <span class="live-dot" aria-hidden="true"></span>
      <div style="min-width:0"><div class="title">${esc(pos.title)} · ${prep ? 'Preparation' : 'Interview'}</div><div class="sub">with ${esc(persona.name)}, ${esc(persona.title)}</div></div>
      <div class="spacer"></div>
      <span class="pill-dark" id="qcount">Q 0/${questions.length}</span>
      <span class="pill-dark" id="elapsed">00:00</span>
    </div>
    <div class="room-main">
      <section class="stage has-captions" id="stage" aria-label="Interviewer video">
        <div class="avatar-host" id="ivAvatar"></div>
        <div class="nameplate"><span class="bars" aria-hidden="true"><i></i><i></i><i></i></span>${esc(persona.name)}</div>
        <div class="state-tag" id="stateTag">Connecting…</div>
        <div class="captions" id="captions" aria-live="polite"></div>
        <div class="selfview" id="selfview">
          <video id="self" autoplay playsinline muted></video>
          <div class="initials" id="initials" ${media.hasVideo() ? 'hidden' : ''}>${esc(initials)}</div>
          <span class="you">You</span>
        </div>
      </section>
      <aside class="panel">
        <div class="qcard" id="qcard"><div class="qmeta"><span class="tag">${esc(cat.short)}</span><span>Waiting for the interviewer…</span></div><div class="qtext">Your interviewer is joining.</div></div>
        <div class="hints" id="hints" hidden></div>
        <div class="review" id="review" hidden></div>
        <div class="answer" id="answerBox">
          <div class="answer-head">
            <span class="mic-state" id="micState"><span class="dot"></span><span id="micText">Mic idle</span></span>
            <span id="ansTimer" style="font-variant-numeric:tabular-nums">--:--</span>
          </div>
          <div class="timebar" id="timebar" ${prep ? 'hidden' : ''}><i id="timefill"></i></div>
          <label for="answer" class="sr-only">Your answer</label>
          <textarea id="answer" placeholder="${s.answerMode === 'voice' ? 'Your spoken answer will appear here as you talk. You can edit it.' : 'Type your answer here…'}" disabled></textarea>
          <div class="answer-actions">
            <button class="btn" id="repeatBtn" disabled>${ICONS.repeat} Repeat</button>
            ${prep ? '<button class="btn" id="hintBtn" disabled>Hint</button>' : ''}
            <button class="btn" id="skipBtn" disabled>Skip</button>
            <button class="btn btn-primary" id="doneBtn" disabled>${ICONS.check} Done</button>
          </div>
        </div>
        <div class="log" id="log" aria-label="Conversation transcript"></div>
      </aside>
    </div>
    <div class="room-bottom">
      <div class="ctl-wrap"><button class="ctl" id="micBtn" aria-pressed="${s.answerMode === 'voice'}" aria-label="Microphone" ${speech.sttAvailable() ? '' : 'disabled'}>${ICONS.mic}</button><span class="ctl-label">${s.answerMode === 'voice' ? 'Voice' : 'Typing'}</span></div>
      <div class="ctl-wrap"><button class="ctl" id="camBtn" aria-pressed="${media.hasVideo()}" aria-label="Camera">${ICONS.cam}</button><span class="ctl-label">Camera</span></div>
      <div class="ctl-wrap"><button class="ctl" id="ccBtn" aria-pressed="true" aria-label="Captions">${ICONS.cc}</button><span class="ctl-label">Captions</span></div>
      <div class="ctl-wrap"><button class="ctl" id="pauseBtn" aria-pressed="true" aria-label="Pause interview">${ICONS.pause}</button><span class="ctl-label">Pause</span></div>
      <div class="ctl-wrap"><button class="ctl end" id="endBtn" aria-label="End interview">${ICONS.end}</button><span class="ctl-label">End</span></div>
    </div>
  </div>`;

  const avatar = mountAvatar($('#ivAvatar'), persona);
  const ui = {
    stage: $('#stage'), captions: $('#captions'), stateTag: $('#stateTag'), qcard: $('#qcard'), answer: $('#answer'),
    done: $('#doneBtn'), skip: $('#skipBtn'), repeat: $('#repeatBtn'), log: $('#log'), timer: $('#ansTimer'), fill: $('#timefill'),
    micState: $('#micState'), micText: $('#micText'),
  };
  if (media.hasVideo()) media.attach($('#self'));
  let recording = false;
  if (s.record && media.stream) recording = media.startRecording();

  // room-level state
  const started = performance.now();
  let paused = false;
  let ended = false;
  let voice = s.answerMode === 'voice' && speech.sttAvailable();
  let captionsOn = true;
  let pending = null; // current answer promise controls
  let currentQ = null;
  let pausedAt = 0, pausedTotal = 0, pauseEpoch = 0;
  const tick = setInterval(() => {
    if (!document.body.contains(ui.stage)) return clearInterval(tick);
    if (!paused) $('#elapsed').textContent = fmtTime((performance.now() - started - pausedTotal) / 1000);
  }, 500);

  const addLog = (who, text) => {
    const m = document.createElement('div');
    m.className = 'm' + (who === 'You' ? ' you' : '');
    m.innerHTML = `<span class="who">${esc(who)}</span>${esc(text)}`;
    ui.log.appendChild(m);
    ui.log.scrollTop = ui.log.scrollHeight;
  };
  const setTag = (t) => { ui.stateTag.textContent = t; };

  const EXPR_FOR = { check: 'warm', greeting: 'warm', question: 'curious', nudge: 'curious', followup: 'curious', interrupt: 'concerned', closing: 'warm', model: 'warm', repeat: 'curious' };
  const say = async (text, meta = {}) => {
    if (ended && meta.kind !== 'closing') return;
    if (meta.kind === 'transition') { if (meta.score >= 70) { avatar.setExpression('pleased'); avatar.nod(); } else avatar.setExpression('neutral'); await sleep(FAST ? 10 : 500); }
    while (paused) await sleep(200);
    ui.stage.dataset.speaking = 'true';
    setTag('Speaking');
    if (captionsOn) ui.captions.textContent = text;
    addLog(persona.name.split(' ')[0], text);
    for (let attempt = 0; attempt < 3; attempt++) {
      while (paused) await sleep(200);
      const epoch = pauseEpoch;
      await speech.speak(text, {
        gender: persona.gender,
        onStart: (ms) => avatar.startSpeech(text, ms, EXPR_FOR[meta.kind] || undefined),
        onBoundary: (i) => avatar.syncToChar(i),
      });
      avatar.endSpeech();
      if (epoch === pauseEpoch || ended) break; // interrupted by pause -> repeat after resume
    }
    avatar.setState('idle');
    if (meta.kind === 'transition' || meta.kind === 'interrupt') avatar.setExpression('warm');
    ui.stage.dataset.speaking = 'false';
    await sleep(FAST ? 30 : 350);
  };

  const showQuestion = (q, i, kind) => {
    currentQ = q;
    $('#qcount').textContent = `Q ${i + 1}/${questions.length}`;
    const lv = q.levels.map(l => levelById(l).label.split(' ')[0]).join(', ');
    const label = kind === 'nudge' ? 'Follow-up · elaborate' : kind === 'followup' ? 'Follow-up' : q.type === 'intro' ? 'Introduction' : q.type === 'behavioral' ? 'Behavioural' : q.type === 'managerial' ? 'Managerial scenario' : q.type === 'design' ? 'Design' : q.type === 'scenario' ? 'Scenario' : 'Concept';
    ui.qcard.innerHTML = `<div class="qmeta"><span class="tag">${esc(q.topic)}</span>${label !== q.topic ? `<span>${esc(label)}</span>` : ''}${q.cat !== 'common' ? `<span>· ${esc(lv)}</span>` : ''}</div><div class="qtext">${esc(q.q)}</div>`;
  };

  const setMic = (on, text) => { ui.micState.classList.toggle('on', on); ui.micText.textContent = text; $('#selfview').dataset.mic = on ? 'active' : ''; };

  const getAnswer = (meta) => new Promise((resolve) => {
    if (ended) return resolve({ text: '', action: 'end' });
    const q = meta.question;
    showQuestion(q, meta.index, meta.kind);
    if (meta.kind !== 'answer') {
      const prompt = meta.kind === 'nudge' ? 'Add to your previous answer.' : meta.kind === 'retry' ? 'Try again: answer the question in full, covering the missed points.' : 'Answer the follow-up.';
      ui.answer.placeholder = prompt;
    }
    $('#review').hidden = true; $('#answerBox').hidden = false;
    let hintUsed = false;
    const hintBtn = $('#hintBtn');
    $('#hints').hidden = true;
    if (hintBtn) {
      hintBtn.disabled = false;
      hintBtn.onclick = () => {
        hintUsed = true;
        const box = $('#hints');
        box.innerHTML = `<b>Hint: a strong answer covers</b><ul>${q.keyPoints.map(k => `<li>${esc(k.label)}</li>`).join('')}</ul>`;
        box.hidden = false;
        hintBtn.disabled = true;
      };
    }
    ui.answer.value = '';
    ui.answer.disabled = false;
    [ui.done, ui.skip, ui.repeat].forEach(b => { b.disabled = false; });
    ui.skip.hidden = !(meta.kind === 'answer' || meta.kind === 'retry');
    avatar.setState('listening');
    setTag('Listening');
    if (!voice) setTimeout(() => ui.answer.focus(), 50);
    const limit = prep ? Infinity : meta.kind === 'answer' ? answerSeconds(q) : Math.min(120, answerSeconds(q));
    let remaining = limit;
    const t0 = performance.now();
    let pauseOffset = pausedTotal;
    let ctl = null;

    const startListening = () => {
      if (paused) return;
      if (!voice) { setMic(false, 'Typing mode'); return; }
      const base = ui.answer.value;
      ctl = speech.startListening({
        track: media.audioTrack(),
        onText: (txt) => { ui.answer.value = (base ? base + ' ' : '') + txt; ui.answer.scrollTop = ui.answer.scrollHeight; },
        onError: (e) => {
          voice = false;
          const mb = $('#micBtn');
          if (mb) { mb.setAttribute('aria-pressed', 'false'); mb.nextElementSibling.textContent = 'Typing'; }
          const blocked = e === 'not-allowed' || e === 'service-not-allowed';
          setMic(false, blocked ? 'Mic blocked — type instead' : 'Voice unavailable — type instead');
          toast(`${sttErrorHelp(e)} Your words so far are kept — continue by typing.`, 9000);
          ui.answer.focus();
        },
        onState: (st) => setMic(st === 'listening', st === 'listening' ? 'Listening… speak now' : 'Mic idle'),
      });
      setMic(true, 'Listening… speak now');
    };
    const stopListening = () => { if (ctl) { ctl.stop(); ctl = null; } speech._listen = null; setMic(false, voice ? 'Mic idle' : 'Typing mode'); };

    let interrupted = false, interrupting = false, lastCovered = 0, closed = false;
    const driftTimer = setInterval(async () => {
      if (paused || interrupted || interrupting || !(meta.kind === 'answer' || meta.kind === 'retry')) return;
      const d = driftCheck(q, ui.answer.value);
      if (!d.drifting) {
        // live reaction: nod when the candidate hits key points
        if (d.covered > lastCovered) { avatar.nod(); lastCovered = d.covered; }
        return;
      }
      interrupting = true;
      interrupted = true;
      stopListening();
      avatar.setExpression('concerned');
      await say(interruptionLine(q), { kind: 'interrupt' });
      interrupting = false;
      if (closed) return; // answer already submitted while the interviewer was speaking
      toast('The interviewer redirected you. Your answer so far is kept; continue on the question.', 4000);
      avatar.setState('listening');
      setTag('Listening');
      startListening();
    }, FAST ? 300 : 2500);
    const timer = setInterval(() => {
      if (paused || interrupting) return;
      const used = (performance.now() - t0 - (pausedTotal - pauseOffset)) / 1000;
      if (prep) { ui.timer.textContent = fmtTime(used); return; }
      remaining = Math.max(0, limit - used);
      ui.timer.textContent = fmtTime(remaining);
      ui.fill.style.transform = `scaleX(${remaining / limit})`;
      $('#timebar').classList.toggle('low', remaining < 20);
      if (remaining <= 0) finish('timeout');
    }, 250);

    const finish = (action) => {
      closed = true;
      clearInterval(timer);
      clearInterval(driftTimer);
      stopListening();
      document.removeEventListener('keydown', onKey);
      [ui.done, ui.skip, ui.repeat, hintBtn].filter(Boolean).forEach(b => { b.disabled = true; b.onclick = null; });
      ui.answer.disabled = true;
      const text = action === 'skip' ? '' : ui.answer.value.trim();
      const durationSec = Math.round((performance.now() - t0 - (pausedTotal - pauseOffset)) / 1000);
      if (text) addLog('You', text);
      else if (action === 'skip') addLog('You', '(skipped)');
      avatar.setState('thinking');
      setTag('Thinking');
      pending = null;
      if (action === 'timeout') toast('Time is up for this question.');
      resolve({ text, durationSec, hintUsed, interrupted, action: action === 'timeout' ? 'done' : action });
    };
    const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); finish('done'); } };
    document.addEventListener('keydown', onKey);
    ui.done.onclick = () => finish('done');
    ui.skip.onclick = () => finish('skip');
    ui.repeat.onclick = async () => {
      ui.repeat.disabled = true;
      stopListening();
      const text = (meta.kind === 'answer' || meta.kind === 'retry') ? q.q : (meta.kind === 'followup' ? q.followUp : 'Could you elaborate a little more on your previous answer?');
      await say(text, { kind: 'repeat' });
      avatar.setState('listening'); setTag('Listening');
      ui.repeat.disabled = false;
      startListening();
    };
    pending = { finish, startListening, stopListening };
    startListening();
  });

  // ---- two-way audio check ("Can you hear me?") before the interview starts
  let checkPending = null;
  const audioCheck = () => new Promise((resolve) => {
    const first = persona.name.split(' ')[0];
    $('#answerBox').hidden = true; $('#hints').hidden = true;
    const box = $('#review');
    box.innerHTML = `
      <div class="audio-check">

        <div class="ac-row" id="acYou"><span class="st">?</span><div><b>Can you hear ${esc(first)}?</b><span>Tap \u201cYes\u201d or just say \u201cYes, I can hear you\u201d.</span></div></div>
        <div class="ac-row" id="acThem"><span class="st">?</span><div><b>Can ${esc(first)} hear you?</b><span id="acThemHint">${voice ? 'Say something out loud \u2014 your microphone is listening.' : 'Typing mode: your answers will be typed, so the microphone is not needed.'}</span></div></div>
        ${media.hasAudio() ? '<div class="meter ac-meter" aria-label="Your microphone level"><i id="acLevel"></i></div>' : ''}
        <div class="answer-actions">
          <button class="btn" id="hearNo">I can\u2019t hear</button>
          <button class="btn" id="hearRepeat">${ICONS.repeat} Repeat</button>
          <button class="btn btn-primary" id="hearYes">${ICONS.check} Yes, I hear you</button>
        </div>
        <div class="answer-actions" id="acFallback" hidden>
          <button class="btn" id="acCaptions">Continue with captions only</button>
          <button class="btn" id="acType">Type my answers instead</button>
          <button class="btn" id="acRetryMic">Try microphone again</button>
        </div>
        <div class="ac-tips" id="acTips" hidden>
          <b>Can\u2019t hear the interviewer?</b>
          <ul><li>Check that your device is not muted and the volume is up.</li><li>Check the sound output (speakers or headphones) in your system settings.</li><li>Try another voice on the device-check screen, or use Microsoft Edge for natural voices.</li><li>You can also continue with captions only.</li></ul>
        </div>
      </div>`;
    box.hidden = false;
    ui.log.hidden = true;
    ui.qcard.innerHTML = `<div class="qmeta"><span class="tag">Audio check</span><span>Before we start</span></div><div class="qtext">Let\u2019s make sure you can hear each other.</div>`;
    avatar.setState('idle'); avatar.setExpression('warm');
    setTag('Audio check');
    let candidateHears = false, heardCandidate = !voice, done = false, ctl = null, micWait = null;
    const mark = (id, ok) => { const st = $(`#${id} .st`); if (st) { st.textContent = ok ? '\u2713' : '!'; st.className = 'st ' + (ok ? 'ok' : 'bad'); } };
    const level = media.levelMeter();
    let loud = 0;
    const meter = setInterval(() => {
      const v = level(); const bar = $('#acLevel'); if (bar) bar.style.width = `${Math.round(v * 100)}%`;
      loud = v > 0.12 ? loud + 1 : 0;
      if (loud >= 4 && voice && !heardCandidate) { heardCandidate = true; mark('acThem', true); $('#acThemHint').textContent = 'Microphone is working.'; maybeFinish(); }
    }, 100);
    const stopMic = () => { if (ctl) { ctl.stop(); ctl = null; } speech._listen = null; };
    const finish = async (result, line) => {
      if (done) return; done = true;
      clearInterval(meter); clearTimeout(micWait); stopMic(); checkPending = null;
      if (line) { avatar.setExpression('pleased'); avatar.nod(); await say(line, { kind: 'check' }); }
      box.hidden = true; $('#answerBox').hidden = false; ui.log.hidden = false;
      resolve(result);
    };
    checkPending = finish;
    const maybeFinish = () => {
      if (!candidateHears) return;
      if (heardCandidate) finish(voice ? 'ok' : 'typing', voice ? 'Great, I can hear you clearly too.' : 'Great. You\u2019ll be typing your answers, so I\u2019ll read them on screen.');
    };
    const listen = () => {
      if (!voice || ctl) return;
      ctl = speech.startListening({
        track: media.audioTrack(),
        onText: (txt) => {
          if (!txt.trim()) return;
          if (!heardCandidate) { heardCandidate = true; mark('acThem', true); $('#acThemHint').textContent = 'I can hear you.'; }
          if (/\b(no|not|can'?t|cannot|can ?not)\b/i.test(txt) && !/\byes\b/i.test(txt)) { cantHear(); return; }
          if (!candidateHears) { candidateHears = true; mark('acYou', true); }
          maybeFinish();
        },
        onError: (code) => { voice = false; heardCandidate = true; mark('acThem', true); $('#acThemHint').textContent = `Voice input is unavailable, so you will type your answers. ${sttErrorHelp(code)}`; maybeFinish(); },
      });
    };
    const cantHear = () => {
      mark('acYou', false);
      $('#acTips').hidden = false; $('#acFallback').hidden = false;
      $('#acType').hidden = true; $('#acRetryMic').hidden = true;
      speech.rate = Math.max(0.85, speech.rate - 0.06);
    };
    $('#hearYes').onclick = async () => {
      candidateHears = true; mark('acYou', true); $('#acTips').hidden = true;
      if (heardCandidate) return maybeFinish();
      // they can hear us; now make sure we can hear them
      stopMic();
      await say('Great. Now please say a few words, so I can check your microphone.', { kind: 'check' });
      if (done) return;
      listen();
      micWait = setTimeout(async () => {
        if (heardCandidate || done) return;
        mark('acThem', false); stopMic();
        await say('Hmm, I can\u2019t hear you. Please check your microphone, or you can type your answers instead.', { kind: 'check' });
        $('#acFallback').hidden = false; $('#acCaptions').hidden = true; $('#acType').hidden = false; $('#acRetryMic').hidden = false;
      }, FAST ? 1500 : 12000);
    };
    $('#hearNo').onclick = () => cantHear();
    $('#hearRepeat').onclick = async () => { stopMic(); await say(hearingCheckLine({ interviewer: persona, candidateName: s.candidateName }), { kind: 'check' }); listen(); };
    $('#acCaptions').onclick = () => { candidateHears = true; captionsOn = true; mark('acYou', true); finish(voice ? 'captions' : 'typing', 'No problem. I\u2019ll keep the captions on so you can read every question.'); };
    $('#acType').onclick = () => {
      voice = false; heardCandidate = true;
      const mb = $('#micBtn'); if (mb) { mb.setAttribute('aria-pressed', 'false'); mb.nextElementSibling.textContent = 'Typing'; }
      finish('typing', 'Okay, you can type your answers. I\u2019ll read them on screen.');
    };
    $('#acRetryMic').onclick = () => { $('#acFallback').hidden = true; heardCandidate = false; mark('acThem', false); $('#acThemHint').textContent = 'Say something out loud.'; listen(); };
    (async () => {
      await say(hearingCheckLine({ interviewer: persona, candidateName: s.candidateName }), { kind: 'check' });
      if (done) return;
      avatar.setState('listening');
      setTag('Listening');
      listen();
    })();
  });

  let reviewPending = null;
  const review = (item, { isLast }) => new Promise((resolve) => {
    const q = item.question, r = item.result;
    $('#answerBox').hidden = true; $('#hints').hidden = true;
    const box = $('#review');
    const ok = !item.skipped && r.overall >= PASS_SCORE;
    box.innerHTML = `
      <div class="review-head"><span class="score-pill ${tone(r.overall)}">${r.overall}</span>
        <div><b>${item.skipped ? 'Skipped' : ok ? 'Good answer' : 'Needs work'}</b><br><span>Technical ${r.technical} · Communication ${r.communication}${item.attempts > 1 ? ` · attempt ${item.attempts}` : ''}</span></div></div>
      <div class="chips">${r.matched.map(m => `<span class="chip ok">✓ ${esc(m.label)}</span>`).join('')}${r.missed.map(m => `<span class="chip bad">✕ ${esc(m.label)}</span>`).join('')}</div>
      ${r.tips.length ? `<ul class="tips">${r.tips.slice(0, 3).map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      <details open><summary>Model answer</summary><p>${esc(q.ideal)}</p></details>
      <div class="answer-actions">
        <button class="btn" id="retryBtn">Try again</button>
        <button class="btn" id="listenBtn">${ICONS.play} Hear it</button>
        <button class="btn btn-primary" id="nextBtn">${isLast ? 'Finish' : 'Next question'}</button>
      </div>`;
    box.hidden = false;
    avatar.setState('listening'); avatar.setExpression(ok ? 'pleased' : 'thinking'); if (ok) avatar.nod(); setTag(ok ? 'Well done' : 'Review');
    const done = (v) => { reviewPending = null; speech.stopSpeaking(); resolve(v); };
    reviewPending = done;
    $('#retryBtn').onclick = () => done('retry');
    $('#nextBtn').onclick = () => done('next');
    $('#listenBtn').onclick = async (e) => { e.currentTarget.disabled = true; await say(q.ideal, { kind: 'model' }); const b = $('#listenBtn'); if (b) b.disabled = false; };
  });

  // controls
  $('#micBtn').addEventListener('click', (e) => {
    voice = !voice;
    e.currentTarget.setAttribute('aria-pressed', String(voice));
    e.currentTarget.nextElementSibling.textContent = voice ? 'Voice' : 'Typing';
    if (pending) { pending.stopListening(); if (voice) pending.startListening(); else { setMic(false, 'Typing mode'); ui.answer.focus(); } }
  });
  $('#camBtn').addEventListener('click', (e) => {
    const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
    if (!media.stream || !media.stream.getVideoTracks().length) { toast('Camera is not available.'); return; }
    media.setVideoEnabled(on);
    e.currentTarget.setAttribute('aria-pressed', String(on));
    $('#initials').hidden = on;
  });
  $('#ccBtn').addEventListener('click', (e) => {
    captionsOn = !captionsOn;
    e.currentTarget.setAttribute('aria-pressed', String(captionsOn));
    ui.stage.classList.toggle('has-captions', captionsOn);
    if (!captionsOn) ui.captions.textContent = '';
  });
  $('#pauseBtn').addEventListener('click', () => {
    if (paused) return;
    paused = true; pausedAt = performance.now(); pauseEpoch++;
    speech.stopSpeaking();
    if (pending) pending.stopListening();
    const ov = document.createElement('div');
    ov.className = 'pause-overlay';
    ov.innerHTML = `<div><h3>Interview paused</h3><p style="color:var(--room-muted)">Take a breath. Your timer is stopped.</p><button class="btn btn-primary btn-lg" id="resume">Resume</button></div>`;
    ui.stage.appendChild(ov);
    $('#resume').addEventListener('click', () => {
      pausedTotal += performance.now() - pausedAt; paused = false; ov.remove();
      if (pending) { avatar.setState('listening'); pending.startListening(); }
    });
  });
  $('#endBtn').addEventListener('click', () => {
    if (!confirmEnd()) return;
    ended = true;
    session.end();
    speech.stopSpeaking();
    if (pending) pending.finish('end');
    if (reviewPending) reviewPending('end');
    if (checkPending) checkPending('end');
  });
  const confirmEnd = () => FAST || window.confirm('End the interview now? You will get a report for the questions answered so far.');

  const session = new InterviewSession({
    questions,
    config: { interviewer: persona, candidateName: s.candidateName, position: pos.title, followUps: s.followUps && !prep, seed, mode: prep ? 'prep' : 'interview' },
    io: { say, getAnswer, review, audioCheck },
  });
  window.__ip.session = session;

  (async () => {
    await sleep(FAST ? 50 : 900);
    setTag('Connected');
    const result = await session.run();
    if (result.audioCheck === 'end') { speech.stopListening(); if (recording) await media.stopRecording(); media.stop(); toast('Interview cancelled before it started.'); go('home'); return; }
    speech.stopListening();
    const blob = recording ? await media.stopRecording() : null;
    media.stop();
    finishInterview({ result, questions, seed, pos, persona, blob, elapsed: Math.round((performance.now() - started - pausedTotal) / 1000) });
  })().catch(err => {
    console.error(err);
    toast('Something went wrong. Returning home.');
    media.stop();
    go('home');
  });
}

function finishInterview({ result, seed, pos, persona, blob, elapsed }) {
  const s = state.setup;
  const items = result.items;
  const summary = summarize(items);
  const rank = Math.max(...targetLevels(pos.level, levelFromYears(s.years)).map(l => levelById(l).rank));
  const chance = selectionChance(items, { mode: s.style === 'prep' ? 'prep' : 'interview', levelRank: rank });
  const sessionRecord = {
    chance,
    id: `s_${Date.now().toString(36)}`,
    date: new Date().toISOString(),
    category: s.category, position: pos.title, positionLevel: pos.level, years: s.years,
    interviewer: persona.id, mode: s.mode, style: s.style, seed, elapsed, endedEarly: result.endedEarly,
    summary,
    items: items.map(i => ({ questionId: i.questionId, answer: i.answer, durationSec: i.durationSec, skipped: i.skipped, result: stripResult(i.result), nudge: i.nudge, followUp: i.followUp, attempts: i.attempts, hintUsed: i.hintUsed, firstScore: i.firstScore, interrupted: i.interrupted })),
  };
  if (items.length) {
    const before = new Set(weakQuestions(store.progress()).map(w => w.id));
    const progress = updateProgress(store.progress(), { category: s.category, mode: s.style, items: sessionRecord.items });
    store.saveProgress(progress);
    const after = weakQuestions(progress);
    sessionRecord.addedToRevision = after.filter(w => !before.has(w.id)).length;
    sessionRecord.clearedFromRevision = [...before].filter(id => sessionRecord.items.some(i => i.questionId === id) && !after.some(w => w.id === id)).length;
    store.saveSession(sessionRecord);
    // never repeat this session's questions next time (the intro question is exempt)
    store.setLastSessionIds(s.category, sessionRecord.items.map(i => i.questionId).filter(id => id !== 'hr-001'));
  }
  s.practiceIds = null;
  go('report', { session: sessionRecord, videoUrl: blob ? URL.createObjectURL(blob) : null, videoType: blob ? blob.type : null });
}

function stripResult(r) {
  return { technical: r.technical, communication: r.communication, overall: r.overall, coverage: r.coverage, matched: r.matched, missed: r.missed, wordCount: r.wordCount, fillerCount: r.fillerCount, wpm: r.wpm, flags: r.flags, tips: r.tips };
}

// ---------------------------------------------------------------- report
function ring(value, size = 150) {
  const r = 62, c = 2 * Math.PI * r;
  const color = value >= 70 ? 'var(--ok)' : value >= 50 ? 'var(--warn)' : 'var(--bad)';
  return `<div class="ring" style="width:${size}px;height:${size}px" role="img" aria-label="Overall score ${value} out of 100">
    <svg viewBox="0 0 150 150"><circle cx="75" cy="75" r="${r}" fill="none" stroke="var(--line)" stroke-width="12"/><circle cx="75" cy="75" r="${r}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - value / 100)}"/></svg>
    <div class="val"><div><b>${value}</b><span>out of 100</span></div></div></div>`;
}

function renderReport({ session, videoUrl, videoType } = {}) {
  if (!session) return go('home');
  const cat = categoryById(session.category);
  const persona = interviewerById(session.interviewer);
  const sum = session.summary;
  const qmap = new Map(QUESTIONS.map(q => [q.id, q]));
  const date = new Date(session.date);

  const bar = (label, v) => `<div class="bar-row"><span>${esc(label)}</span><div class="bar"><i class="${tone(v)}" style="width:${v}%"></i></div><b>${v}</b></div>`;
  const qa = session.items.map((it, idx) => {
    const q = qmap.get(it.questionId);
    if (!q) return '';
    const r = it.result;
    return `
    <details class="qa" ${idx === 0 ? 'open' : ''}>
      <summary><span class="num">${idx + 1}</span><span class="qt">${esc(q.q)}<small>${esc(q.topic)} · ${it.skipped ? 'Skipped' : `${r.wordCount} words${it.durationSec ? ` · ${fmtTime(it.durationSec)}` : ''}`}</small></span><span class="score-pill ${tone(r.overall)}">${r.overall}</span></summary>
      <div class="qa-body">
        <div class="mini-scores"><span class="chip">Technical ${r.technical}</span><span class="chip">Communication ${r.communication}</span>${it.attempts > 1 ? `<span class="chip">${it.attempts} attempts (first: ${it.firstScore})</span>` : ''}${it.hintUsed ? '<span class="chip">hint used</span>' : ''}${it.interrupted ? '<span class="chip bad">interviewer redirected you (off-topic)</span>' : ''}${r.wpm ? `<span class="chip">${r.wpm} words/min</span>` : ''}${r.fillerCount ? `<span class="chip">${r.fillerCount} filler words</span>` : ''}</div>
        <div><h4>Your answer</h4><p class="quote">${it.answer ? esc(it.answer) : '<span class="muted">No answer given.</span>'}</p>
          ${it.nudge ? `<p class="muted" style="font-size:13px;margin:8px 0 4px">Interviewer: “${esc(it.nudge.prompt)}”</p><p class="quote">${esc(it.nudge.answer || '—')}</p>` : ''}
          ${it.followUp ? `<p class="muted" style="font-size:13px;margin:8px 0 4px">Follow-up: “${esc(it.followUp.prompt)}”</p><p class="quote">${esc(it.followUp.answer || '—')}</p>` : ''}
        </div>
        <div><h4>Key points</h4><div class="chips">${r.matched.map(m => `<span class="chip ok">✓ ${esc(m.label)}</span>`).join('')}${r.missed.map(m => `<span class="chip bad">✕ ${esc(m.label)}</span>`).join('')}</div></div>
        ${r.tips.length ? `<div><h4>Coaching</h4><ul class="list-clean">${r.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
        <div><h4>Model answer</h4><p class="quote ideal">${esc(q.ideal)}</p></div>
      </div>
    </details>`;
  }).join('');

  app.innerHTML = shell(`
    <div class="no-print" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
      <button class="btn btn-ghost" data-nav="home" style="margin-left:-12px">← Home</button>
      <span style="flex:1"></span>
      <button class="btn" id="printBtn">Save as PDF</button>
      <button class="btn btn-primary" id="retake">Retake interview</button>
    </div>
    <section class="card report-head" id="reportHead">
      ${ring(sum.overall)}
      <div>
        <div class="eyebrow">${esc(cat.title)} · ${esc(session.position)}</div>
        <h1 style="font-size:26px;margin:4px 0 8px">${session.style === 'prep' ? 'Preparation report' : 'Interview report'}</h1>
        <span class="verdict ${sum.verdict.tone}" id="verdict">${esc(sum.verdict.label)}</span>
        ${session.chance ? `<div class="chance" id="chance"><div class="chance-top"><span>Selection chance${session.style === 'prep' ? ' (practice estimate)' : ''}</span><b class="${session.chance.tone}">${session.chance.score}/100</b></div><div class="chance-bar"><i class="${session.chance.tone}" style="width:${session.chance.score}%"></i></div><div class="chance-label">${esc(session.chance.label)}</div>${session.chance.reasons.length ? `<details><summary>Why this score?</summary><ul>${session.chance.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul></details>` : ''}</div>` : ''}
        <p class="muted" style="margin:0">${esc(sum.verdict.note)}</p>
        <div class="bars">${bar('Technical knowledge', sum.technical)}${bar('Communication', sum.communication)}</div>
        ${session.addedToRevision || session.clearedFromRevision ? `<p class="revision-note">${session.addedToRevision ? `${session.addedToRevision} question${session.addedToRevision === 1 ? '' : 's'} added to your revision list. ` : ''}${session.clearedFromRevision ? `${session.clearedFromRevision} cleared from it — well done. ` : ''}<button class="linkbtn" data-nav="revision">Open revision list →</button></p>` : ''}
        <p class="muted" style="font-size:13px;margin:12px 0 0">${date.toLocaleString()} · with ${esc(persona.name)} · ${sum.answered}/${session.items.length} answered${sum.skipped ? ` · ${sum.skipped} skipped` : ''} · ${fmtTime(session.elapsed || 0)}${session.endedEarly ? ' · ended early' : ''}</p>
      </div>
    </section>

    <div class="grid-2" style="margin-top:16px">
      <section class="card card-pad">
        <h2 style="font-size:17px;margin-bottom:10px">Score by topic</h2>
        <div class="bars" style="margin:0">${sum.topics.map(t => bar(t.topic, t.score)).join('') || '<p class="muted">No scored answers.</p>'}</div>
      </section>
      <section class="card card-pad">
        <h2 style="font-size:17px;margin-bottom:10px">What to work on</h2>
        ${sum.strengths.length ? `<p style="margin:0 0 6px"><b>Strengths:</b> ${esc(sum.strengths.join(', '))}</p>` : ''}
        ${sum.improve.length ? `<p style="margin:0 0 6px"><b>Practise next:</b> ${esc(sum.improve.join(', '))}</p>` : ''}
        ${sum.focusPoints.length ? `<ul class="list-clean">${sum.focusPoints.slice(0, 6).map(f => `<li>${esc(f.label)} <span class="muted">(${esc(f.topic)})</span></li>`).join('')}</ul>` : '<p class="muted">You covered every key point. Excellent.</p>'}
        <p class="muted" style="font-size:13px;margin:10px 0 0">Average answer length ${sum.avgWords} words · filler words ${sum.fillerRate}% of speech</p>
      </section>
    </div>

    ${videoUrl ? `<section class="card card-pad recording no-print" style="margin-top:16px"><h2 style="font-size:17px;margin-bottom:10px">Your recording</h2><video controls playsinline src="${videoUrl}"></video><div style="margin-top:10px"><a class="btn" href="${videoUrl}" download="interview-${session.id}.${(videoType || '').includes('mp4') ? 'mp4' : 'webm'}">Download recording</a> <span class="muted" style="font-size:13px">Recordings are not stored after you leave this page.</span></div></section>` : ''}

    <section class="card" style="margin-top:16px;overflow:hidden">
      <div class="card-pad" style="padding-bottom:12px"><h2 style="font-size:17px">Question-by-question feedback</h2></div>
      ${qa}
    </section>
    <p class="muted" style="font-size:12px;margin-top:16px">Scores are produced offline by matching your answer against the key concepts an interviewer expects (70% technical) plus answer length, structure, pace and filler words (30% communication). Use them as practice guidance, not as a hiring decision.</p>
  `, 'history');
  bindNav();
  $('#printBtn').addEventListener('click', () => window.print());
  $('#retake').addEventListener('click', () => go('setup'));
  window.__ip.report = session;
}

// ---------------------------------------------------------------- history
function renderHistory() {
  const hist = store.history();
  app.innerHTML = shell(`
    <div class="section-title" style="margin-top:0"><h2>Interview history</h2>${hist.length ? '<button class="btn" id="clear">Clear history</button>' : ''}</div>
    <section class="card" style="overflow:hidden">
      ${hist.length ? hist.map(h => `
        <button class="hist-row" data-open="${h.id}">
          <span class="hist-score score-pill ${tone(h.summary.overall)}">${h.summary.overall}</span>
          <span><b>${esc(h.position)}</b><br><span class="muted" style="font-size:13px">${new Date(h.date).toLocaleString()} · ${h.items.length} questions · Tech ${h.summary.technical} · Comm ${h.summary.communication}${h.chance ? ` · Selection chance ${h.chance.score}/100` : ''}${h.style === 'prep' ? ' · Preparation' : ''}</span></span>
          <span class="muted">›</span>
        </button>`).join('') : `<div class="empty"><p>No interviews yet.</p><button class="btn btn-primary" data-nav="home">Start your first interview</button></div>`}
    </section>`, 'history');
  bindNav();
  $$('[data-open]').forEach(b => b.addEventListener('click', () => go('report', { session: store.getSession(b.dataset.open) })));
  const c = $('#clear');
  if (c) c.addEventListener('click', () => { if (window.confirm('Delete all saved interview results on this device?')) { store.clearHistory(); go('history'); } });
}


// ---------------------------------------------------------------- revision list
function renderRevision({ role = null } = {}) {
  const progress = store.progress();
  const all = weakQuestions(progress, { role });
  const qmap = new Map(QUESTIONS.map(q => [q.id, q]));
  const items = all.filter(w => qmap.has(w.id));
  const roleChip = (id, label) => `<button type="button" class="topic-chip" data-rrole="${id || ''}" aria-pressed="${(role || '') === (id || '')}">${esc(label)} <span class="cnt">${weakQuestions(progress, { role: id }).length}</span></button>`;
  const fmtDate = (t) => new Date(t).toLocaleDateString();
  app.innerHTML = shell(`
    <div class="section-title" style="margin-top:0"><div><h2>Revision list</h2><p class="muted" style="margin:4px 0 0;font-size:14px">Questions you have not answered correctly yet (score below ${PASS_SCORE} or skipped). Answer them well in any later session, or mark them as learned, and they leave this list.</p></div></div>
    <div class="chips" style="margin-bottom:14px">${roleChip(null, 'All roles')}${CATEGORIES.map(c => roleChip(c.id, c.short)).join('')}</div>
    ${items.length ? `<div class="no-print" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
      ${CATEGORIES.filter(c => (!role || role === c.id) && weakQuestions(progress, { role: c.id }).length).map(c => `<button class="btn btn-primary" data-practice="${c.id}">Practise ${esc(c.short)} revision list (${Math.min(20, weakQuestions(progress, { role: c.id }).length)}) in Preparation mode</button>`).join('')}
    </div>` : ''}
    <section class="card" style="overflow:hidden" id="revisionList">
      ${items.length ? items.map((w, idx) => {
        const q = qmap.get(w.id);
        return `<details class="qa" data-qid="${w.id}">
          <summary><span class="num">${idx + 1}</span><span class="qt">${esc(q.q)}<small>${esc(categoryById(w.role)?.short || '')} · ${esc(q.topic)} · asked ${w.n}× · last ${fmtDate(w.last)}${w.skipped ? ' · skipped' : ''}</small></span><span class="score-pill ${tone(w.lastScore)}">${w.lastScore}</span></summary>
          <div class="qa-body">
            <div><h4>Your last answer</h4><p class="quote">${w.lastAnswer ? esc(w.lastAnswer) : '<span class="muted">No answer given.</span>'}</p></div>
            ${w.missed && w.missed.length ? `<div><h4>Missed key points</h4><div class="chips">${w.missed.map(m => `<span class="chip bad">✕ ${esc(m)}</span>`).join('')}</div></div>` : ''}
            <div><h4>Model answer</h4><p class="quote ideal">${esc(q.ideal)}</p></div>
            <div><button class="btn" data-learned="${w.id}">${ICONS.check} Mark as learned</button></div>
          </div>
        </details>`;
      }).join('') : `<div class="empty"><p>Nothing to revise${role ? ' for this role' : ''}. Questions you answer below ${PASS_SCORE} will appear here.</p><button class="btn btn-primary" data-nav="home">Start practising</button></div>`}
    </section>
    <p style="margin-top:20px"><button class="btn btn-ghost" id="resetProgress">Reset all progress</button> <span class="muted" style="font-size:12px">Clears the revision list and question history, so questions can be asked again.</span></p>
  `, 'revision');
  bindNav();
  $$('[data-rrole]').forEach(b => b.addEventListener('click', () => go('revision', { role: b.dataset.rrole || null })));
  $$('[data-learned]').forEach(b => b.addEventListener('click', () => {
    store.saveProgress(markLearned(store.progress(), b.dataset.learned));
    toast('Marked as learned.');
    go('revision', { role });
  }));
  $$('[data-practice]').forEach(b => b.addEventListener('click', () => {
    const r = b.dataset.practice;
    state.setup.category = r;
    state.setup.style = 'prep';
    state.setup.source = 'revision';
    state.setup.practiceIds = weakQuestions(store.progress(), { role: r }).map(w => w.id).slice(0, 20);
    go('check');
  }));
  $('#resetProgress').addEventListener('click', () => {
    if (window.__ip.fast || window.confirm('Reset all progress? Your revision list and question history will be cleared.')) { store.resetProgress(); go('revision'); }
  });
}

// ---------------------------------------------------------------- boot
window.__ip = { go, state, store, version: '1.3.1', fast: FAST };
document.addEventListener('visibilitychange', () => { if (document.hidden && state.screen !== 'room') speech.stopSpeaking(); });

if ('serviceWorker' in navigator && location.protocol === 'https:' && !isNative()) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
if (isNative()) {
  document.documentElement.classList.add('native');
  try { window.Capacitor.Plugins.SplashScreen && window.Capacitor.Plugins.SplashScreen.hide(); } catch { /* optional */ }
}
go('home');
