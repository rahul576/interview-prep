// Text-to-speech and speech-to-text with one API for:
//  - browsers (Web Speech API), and
//  - the Capacitor native apps (Android/iOS) via community plugins.
// Everything degrades gracefully: no TTS -> timed captions; no STT -> typing.

const cap = () => (typeof window !== 'undefined' ? window.Capacitor : undefined);
export const isNative = () => !!(cap() && cap().isNativePlatform && cap().isNativePlatform());

function nativePlugin(name) {
  const C = cap();
  if (!C) return null;
  if (C.Plugins && C.Plugins[name]) return C.Plugins[name];
  if (C.registerPlugin) return C.registerPlugin(name);
  return null;
}

const FEMALE = ['female', 'woman', 'zoe', 'jenny', 'ava', 'samantha', 'emma', 'neerja', 'libby', 'sonia', 'natasha', 'samantha', 'victoria', 'karen', 'moira', 'tessa', 'veena', 'zira', 'susan', 'hazel', 'serena', 'fiona', 'aria', 'jenny', 'natasha', 'sonia', 'neerja', 'heera', 'libby', 'ava', 'allison', 'kate', 'emma', 'joanna', 'salli', 'kimberly', 'raveena', 'aditi', 'swara', 'kajal', 'michelle', 'sara', 'catherine', 'martha'];
const MALE = ['male', 'man ', 'evan', 'nathan', 'tom', 'andrew', 'brian', 'prabhat', 'ryan', 'guy', 'daniel', 'alex', 'fred', 'david', 'mark', 'george', 'rishi', 'ravi', 'guy', 'ryan', 'prabhat', 'thomas', 'oliver', 'aaron', 'arthur', 'matthew', 'joey', 'justin', 'brian', 'eric', 'christopher', 'roger', 'steffan', 'william', 'liam', 'madhur', 'hemant'];
// Voice quality tiers: neural/"natural" voices sound human; novelty and eSpeak voices sound robotic.
const TOP = ['natural', 'neural', 'premium', 'wavenet', 'studio'];
const GOOD = ['enhanced', 'siri', 'online'];
const OK = ['google'];
const ROBOTIC = ['compact', 'espeak', 'fred', 'albert', 'zarvox', 'bad news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos', 'good news', 'jester', 'organ', 'superstar', 'trinoids', 'whisper', 'wobble', 'junior', 'ralph', 'kathy', 'grandma', 'grandpa', 'eddy', 'flo', 'reed', 'rocko', 'sandy', 'shelley', 'novelty'];

/** How natural a voice is likely to sound (higher is better). */
export function voiceQuality(v) {
  const n = ` ${(v.name || '').toLowerCase()} `;
  if (ROBOTIC.some(w => n.includes(` ${w}`))) return -20;
  if (TOP.some(w => n.includes(w))) return 14;
  if (GOOD.some(w => n.includes(w))) return 8;
  if (OK.some(w => n.includes(w))) return 2;
  return 0;
}

/** Pick the best voice for a persona. Pure so it can be unit tested. */
export function pickVoice(voices, { gender = 'female', lang = 'en-US', preferred = null } = {}) {
  if (preferred) { const v = voices.find(x => x.name === preferred); if (v) return v; }
  const en = voices.filter(v => /^en([-_]|$)/i.test(v.lang || ''));
  if (!en.length) return voices[0] || null;
  const want = gender === 'male' ? MALE : FEMALE;
  const avoid = gender === 'male' ? FEMALE : MALE;
  const score = (v) => {
    const n = ` ${(v.name || '').toLowerCase()} `;
    let s = 0;
    if ((v.lang || '').replace('_', '-').toLowerCase() === lang.toLowerCase()) s += 4;
    else if ((v.lang || '').toLowerCase().startsWith(lang.slice(0, 2).toLowerCase())) s += 1;
    const has = (w) => new RegExp(`\\b${w.trim()}\\b`).test(n); // whole words: "female" must not match "male"
    if (want.some(has)) s += 6;
    if (avoid.some(has) && !want.some(has)) s -= 8;
    s += voiceQuality(v);
    if (v.localService) s += 0.5;
    return s;
  };
  return en.slice().sort((a, b) => score(b) - score(a))[0];
}

/** English voices ranked for display in a picker. */
export function rankedVoices(voices, { gender = 'female', lang = 'en-US' } = {}) {
  return voices.filter(v => /^en([-_]|$)/i.test(v.lang || '')).map(v => ({ v, q: voiceQuality(v) }))
    .sort((a, b) => b.q - a.q || (a.v.lang === lang ? -1 : 1)).map(({ v, q }) => ({ name: v.name, lang: v.lang, natural: q >= 8, robotic: q < 0 }));
}

/** Split long text into sentence chunks (Chrome cuts utterances off after ~15s). */
export function chunkText(text, max = 180) {
  const parts = String(text).match(/[^.!?]+[.!?]*\s*/g) || [String(text)];
  const out = [];
  let buf = '';
  for (const p of parts) {
    if ((buf + p).length > max && buf) { out.push(buf.trim()); buf = ''; }
    buf += p;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

export function estimateDurationMs(text, rate = 1) {
  return Math.max(600, (String(text).length / (14.5 * rate)) * 1000);
}

export class SpeechService {
  constructor({ fast = false } = {}) {
    this.fast = fast;
    this.lang = 'en-US';
    this.rate = 0.96; // slightly slower than default sounds more conversational
    this.voiceName = null; // user-chosen voice (null = best available)
    this.voices = [];
    this.native = isNative();
    this.tts = this.native ? nativePlugin('TextToSpeech') : null;
    this.stt = this.native ? nativePlugin('SpeechRecognition') : null;
    this._speakToken = 0;
    this._listen = null;
  }

  async init() {
    if (this.fast) return;
    try {
      if (this.native && this.tts) {
        const r = await this.tts.getSupportedVoices();
        this.voices = (r && r.voices) || [];
      } else if ('speechSynthesis' in window) {
        this.voices = speechSynthesis.getVoices();
        if (!this.voices.length) {
          await new Promise(res => {
            const done = () => { this.voices = speechSynthesis.getVoices(); res(); };
            speechSynthesis.addEventListener('voiceschanged', done, { once: true });
            setTimeout(done, 1200);
          });
        }
      }
    } catch { this.voices = []; }
  }

  /** Is the best voice we would use a natural-sounding one? */
  hasNaturalVoice(gender = 'female') {
    const v = pickVoice(this.voices, { gender, lang: this.lang, preferred: this.voiceName });
    return !!v && voiceQuality(v) >= 8;
  }

  ttsAvailable() {
    if (this.fast) return false;
    return this.native ? !!this.tts : ('speechSynthesis' in window);
  }

  /**
   * Prefer on-device (offline) speech recognition where the browser offers it (Chrome 139+).
   * The online service can hang mid-answer on some networks, which stopped long answers being captured.
   * Downloads the language model if needed. Returns 'on-device', 'cloud' or 'unsupported'.
   */
  async prepareOnDevice() {
    if (this.fast || this.native) return 'unsupported';
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!R || typeof R.available !== 'function') { this.onDevice = false; return R ? 'cloud' : 'unsupported'; }
    // Automated/headless browsers have no speech service (calling available() crashes headless Chromium).
    if (typeof navigator !== 'undefined' && navigator.webdriver) return 'cloud';
    const opts = { langs: [this.lang], processLocally: true };
    try {
      let st = await R.available(opts);
      if ((st === 'downloadable' || st === 'downloading') && typeof R.install === 'function') {
        this._log(`on-device model ${st}, installing`);
        await Promise.race([R.install(opts), sleep(60000)]);
        st = await R.available(opts);
      }
      // The online service is more accurate and faster, so it stays the default; the on-device model is the
      // automatic fallback when the online service stalls or fails (as it did on the owner's network).
      this.onDeviceCapable = st === 'available';
      this.onDevice = false;
      this._log(`on-device recognition: ${st}`);
      return this.onDeviceCapable ? 'on-device' : 'cloud';
    } catch (err) { this.onDevice = false; this._log(`on-device check failed: ${err && err.name}`); return 'cloud'; }
  }

  sttAvailable() {
    if (this.fast) return false;
    if (this.native) return !!this.stt;
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  /**
   * Speak text. Calls onStart(durationEstimate), onBoundary(charIndex) for lip-sync.
   * Always resolves (with a timeout fallback) so the interview never stalls.
   */
  async speak(text, { gender = 'female', onStart, onBoundary, rate = null } = {}) {
    const token = ++this._speakToken;
    const r = rate || this.rate;
    const est = estimateDurationMs(text, r) * (this.fast ? 0.08 : 1);
    if (!this.ttsAvailable()) {
      onStart && onStart(est);
      await sleep(est);
      return;
    }
    const chunks = chunkText(text, 140);
    let offset = 0;
    const t0 = Date.now();
    onStart && onStart(est);
    for (const chunk of chunks) {
      if (token !== this._speakToken) return;
      const base = offset;
      await this._speakChunk(chunk, gender, (i) => onBoundary && onBoundary(base + i), r);
      offset += chunk.length + 1;
      if (token === this._speakToken && chunks.length > 1) await sleep(/[?]$/.test(chunk) ? 120 : 220); // breath between sentences
    }
    // If the engine returned almost instantly (no voice installed / muted engine),
    // keep the interviewer "talking" at a natural pace so captions can be read.
    const elapsed = Date.now() - t0;
    if (token === this._speakToken && elapsed < est * 0.4) await sleep(est * 0.9 - elapsed);
  }

  async _speakChunk(chunk, gender, onBoundary, rate = this.rate) {
    const fallback = estimateDurationMs(chunk, rate) * 1.7 + 2500;
    if (this.native) {
      const voice = pickVoice(this.voices, { gender, lang: this.lang, preferred: this.voiceName });
      const voiceIndex = voice ? this.voices.indexOf(voice) : undefined;
      let handle;
      try {
        handle = await this.tts.addListener('onRangeStart', (e) => onBoundary(e.start || 0));
      } catch { /* older plugin */ }
      try {
        await Promise.race([
          this.tts.speak({ text: chunk, lang: this.lang, rate, pitch: gender === 'male' ? 0.95 : 1.05, volume: 1, voice: voiceIndex >= 0 ? voiceIndex : undefined, category: 'playback' }),
          sleep(fallback),
        ]);
      } catch { await sleep(estimateDurationMs(chunk)); }
      finally { handle && handle.remove && handle.remove(); }
      return;
    }
    await new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(chunk);
      const v = pickVoice(this.voices, { gender, lang: this.lang, preferred: this.voiceName });
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = this.lang;
      u.rate = rate;
      u.pitch = gender === 'male' ? 0.95 : 1.05;
      let done = false;
      const finish = () => { if (!done) { done = true; clearTimeout(timer); resolve(); } };
      const timer = setTimeout(finish, fallback);
      u.onboundary = (e) => onBoundary(e.charIndex || 0);
      u.onend = finish;
      u.onerror = finish;
      speechSynthesis.speak(u);
      // Safari/Chrome sometimes stay paused after tab switches
      if (speechSynthesis.paused) speechSynthesis.resume();
    });
  }

  stopSpeaking() {
    this._speakToken++;
    try {
      if (this.native && this.tts) this.tts.stop();
      else if ('speechSynthesis' in window) speechSynthesis.cancel();
    } catch { /* ignore */ }
  }

  async requestMicPermission() {
    if (!this.native || !this.stt) return true;
    try {
      const avail = await this.stt.available();
      if (!avail.available) return false;
      let p = await this.stt.checkPermissions();
      if (p.speechRecognition !== 'granted') p = await this.stt.requestPermissions();
      return p.speechRecognition === 'granted';
    } catch { return false; }
  }

  /**
   * Continuous dictation. onText(fullTranscript, isFinal) is called as speech arrives.
   * Returns a controller with stop() -> final transcript.
   */
  startListening({ onText, onError, onState, track = null, level = null } = {}) {
    if (this._listen) this._listen.stop();
    const ctl = this.native ? this._listenNative({ onText, onError, onState }) : this._listenWeb({ onText, onError, onState, track, level });
    this._listen = ctl;
    return ctl;
  }

  /** Small rolling log of recognition events, kept in localStorage for troubleshooting voice input. */
  _log(msg) {
    try {
      const key = 'interviewpro.sttlog.v1';
      const log = JSON.parse(localStorage.getItem(key) || '[]');
      log.push(`${new Date().toISOString().slice(11, 23)} ${msg}`);
      localStorage.setItem(key, JSON.stringify(log.slice(-300)));
    } catch { /* storage unavailable */ }
  }

  _listenWeb({ onText, onError, onState, track, level }) {
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    let committed = '';
    let interim = '';
    let active = true;
    let rec = null;
    let restarts = [];
    let transientErrors = 0;
    // Feed the microphone the user picked. The engine is only switched to the browser default input if
    // start(track) is not supported at all — never because of a later, transient error, because the default
    // input can be a silent virtual device (Teams, Zoom…), which made long answers stop being captured.
    let useTrack = !!(track && track.readyState === 'live');
    const FATAL = new Set(['not-allowed', 'service-not-allowed', 'language-not-supported']);
    const log = (m) => this._log(m);
    let session = 0, lastProgress = Date.now(), loudSince = 0, watchdog = null;
    // Watchdog: some engines silently stop producing results while still "listening". If the microphone
    // clearly hears speech but no words arrive for a few seconds, restart the recogniser (words so far are kept).
    if (typeof level === 'function') {
      watchdog = setInterval(() => {
        if (!active || !rec) return;
        const now = Date.now();
        const loud = level() > 0.08;
        if (loud && !loudSince) loudSince = now;
        if (!loud && loudSince && now - loudSince > 1500) loudSince = 0;
        if (loudSince && now - lastProgress > 6000 && now - loudSince > 2500) {
          log(`watchdog: speech heard but no words for ${Math.round((now - lastProgress) / 1000)}s, restarting`);
          // A stalled online service usually stays stalled: continue on the device if possible.
          if (!this.onDevice && this.onDeviceCapable) { this.onDevice = true; log('switching to on-device recognition'); }
          lastProgress = now; loudSince = 0;
          try { rec.abort(); } catch { /* ignore */ }
        }
      }, 400);
    }
    const emit = (final) => onText && onText((committed + ' ' + interim).replace(/\s+/g, ' ').trim(), final);
    const flushInterim = () => { if (interim.trim()) { committed += ' ' + interim; } interim = ''; };
    const start = () => {
      if (!active) return;
      rec = new Rec();
      rec.lang = this.lang;
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      const local = !!this.onDevice;
      if (local) rec.processLocally = true;
      const k = ++session;
      rec.onstart = () => { lastProgress = Date.now(); log(`#${k} start${useTrack ? ' (selected mic)' : ' (default mic)'}${local ? ' on-device' : ' online'}`); };
      rec.onresult = (e) => {
        lastProgress = Date.now();
        transientErrors = 0;
        interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) committed += ' ' + r[0].transcript;
          else interim += ' ' + r[0].transcript;
        }
        emit(false);
      };
      rec.onerror = (e) => {
        log(`#${k} error ${e.error}`);
        if (e.error === 'no-speech' || e.error === 'aborted') return;
        // On-device model missing or refused: fall back to the online service instead of giving up.
        if (local && (e.error === 'language-not-supported' || e.error === 'service-not-allowed')) { this.onDevice = false; return; }
        // The online service hangs or drops on some networks: switch to on-device recognition when it exists.
        if (!local && e.error === 'network' && this.onDeviceCapable) { this.onDevice = true; return; }
        if (FATAL.has(e.error)) { active = false; flushInterim(); emit(true); onError && onError(e.error); return; }
        // network / audio-capture hiccups happen in long sessions: keep the words so far and restart (onend).
        transientErrors++;
        if (transientErrors > 4) { active = false; flushInterim(); emit(true); onError && onError(e.error); }
      };
      rec.onend = () => {
        log(`#${k} end (${committed.split(' ').filter(Boolean).length} words so far)`);
        if (interim.trim()) { flushInterim(); emit(true); }
        if (!active) { clearInterval(watchdog); onState && onState('stopped'); return; }
        const now = Date.now();
        restarts = restarts.filter(t => now - t < 10000);
        if (restarts.length >= 8) { active = false; onError && onError('restart-limit'); onState && onState('stopped'); return; }
        restarts.push(now);
        // Restart on the next tick (calling start() inside onend can throw InvalidStateError in some browsers).
        setTimeout(() => {
          if (!active) return;
          try { start(); } catch { setTimeout(() => { try { start(); } catch (err) { active = false; onError && onError('restart-failed'); } }, 300); }
        }, transientErrors ? 250 * transientErrors : 0);
      };
      if (useTrack && track.readyState !== 'live') useTrack = false;
      if (useTrack) {
        try { rec.start(track); }
        catch (err) {
          if (err && err.name === 'InvalidStateError') throw err;
          useTrack = false; rec.start(); // engine does not accept a track
        }
      } else rec.start();
      onState && onState('listening');
    };
    try { start(); } catch (err) { active = false; onError && onError(String(err && err.name || err)); }
    return {
      stop: () => {
        active = false;
        clearInterval(watchdog);
        try { rec && rec.stop(); } catch { /* ignore */ }
        flushInterim();
        return committed.replace(/\s+/g, ' ').trim();
      },
      setText: (t) => { committed = t; interim = ''; },
    };
  }

  _listenNative({ onText, onError, onState }) {
    const stt = this.stt;
    let committed = '';
    let current = '';
    let active = true;
    const handles = [];
    const emit = () => onText && onText((committed + ' ' + current).replace(/\s+/g, ' ').trim(), false);
    const begin = async () => {
      try {
        await stt.start({ language: this.lang, partialResults: true, popup: false, maxResults: 1 });
      } catch (e) {
        // Android ends a session after silence: restart while we are still listening
        if (active) setTimeout(() => active && begin(), 350);
      }
    };
    (async () => {
      try {
        handles.push(await stt.addListener('partialResults', (d) => {
          current = (d && d.matches && d.matches[0]) || current;
          emit();
        }));
        handles.push(await stt.addListener('listeningState', (d) => {
          if (d && d.status === 'stopped') {
            if (current) { committed += ' ' + current; current = ''; }
            if (active) setTimeout(() => active && begin(), 250);
          }
        }));
      } catch (e) { onError && onError(String(e)); }
      onState && onState('listening');
      begin();
    })();
    return {
      stop: () => {
        active = false;
        try { stt.stop(); } catch { /* ignore */ }
        handles.forEach(h => h && h.remove && h.remove());
        if (current) { committed += ' ' + current; current = ''; }
        return committed.replace(/\s+/g, ' ').trim();
      },
      setText: (t) => { committed = t; current = ''; },
    };
  }

  stopListening() {
    const t = this._listen ? this._listen.stop() : '';
    this._listen = null;
    return t;
  }
}

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** Human explanation + fix for a speech-recognition error code. */
export function sttErrorHelp(code) {
  const mac = /Mac/i.test(typeof navigator !== 'undefined' ? navigator.platform || navigator.userAgent : '');
  const macPerm = mac ? ' On a Mac also check System Settings → Privacy & Security → Microphone, switch your browser on, then quit and reopen the browser.' : '';
  switch (code) {
    case 'not-allowed': return 'Microphone access is blocked for this site. Click the lock/settings icon in the address bar and allow Microphone.' + macPerm;
    case 'service-not-allowed': return 'The browser\u2019s speech-recognition service is turned off. In Safari it uses macOS Dictation: System Settings → Keyboard → Dictation → On. Or use Chrome or Edge.';
    case 'network': return 'The browser\u2019s speech service could not be reached. Chrome and Edge recognise speech online, so check your internet. Brave, Arc and Opera often block this service: use Chrome, Edge or Safari.';
    case 'audio-capture': return 'No audio could be captured from the microphone. Pick the right microphone on the device-check screen.' + macPerm;
    case 'language-not-supported': return 'The selected accent is not supported for recognition here. Choose English (United States) in setup.';
    case 'restart-limit': return 'Speech recognition kept stopping without hearing anything. Check the microphone input and permissions.' + macPerm;
    case 'unsupported': return 'This browser has no speech recognition (for example Firefox). Use Chrome, Edge or Safari to answer by voice, or type your answers.';
    default: return `Speech recognition stopped (${code}).` + macPerm;
  }
}

/** Known browser limitations worth warning about before the interview. */
export function browserSpeechNote() {
  if (typeof navigator === 'undefined') return '';
  if (navigator.brave) return 'Brave blocks the online speech service that voice answers rely on. For voice answers use Chrome, Edge or Safari.';
  if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) return sttErrorHelp('unsupported');
  return '';
}
