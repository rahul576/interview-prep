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

const FEMALE = ['female', 'woman', 'samantha', 'victoria', 'karen', 'moira', 'tessa', 'veena', 'zira', 'susan', 'hazel', 'serena', 'fiona', 'aria', 'jenny', 'natasha', 'sonia', 'neerja', 'heera', 'libby', 'ava', 'allison', 'kate', 'emma', 'joanna', 'salli', 'kimberly', 'raveena', 'aditi', 'swara', 'kajal', 'michelle', 'sara', 'catherine', 'martha'];
const MALE = ['male', 'man ', 'daniel', 'alex', 'fred', 'david', 'mark', 'george', 'rishi', 'ravi', 'guy', 'ryan', 'prabhat', 'thomas', 'oliver', 'aaron', 'arthur', 'matthew', 'joey', 'justin', 'brian', 'eric', 'christopher', 'roger', 'steffan', 'william', 'liam', 'madhur', 'hemant'];
const QUALITY = ['natural', 'neural', 'online', 'enhanced', 'premium', 'google'];

/** Pick the best voice for a persona. Pure so it can be unit tested. */
export function pickVoice(voices, { gender = 'female', lang = 'en-US' } = {}) {
  const en = voices.filter(v => /^en([-_]|$)/i.test(v.lang || ''));
  if (!en.length) return voices[0] || null;
  const want = gender === 'male' ? MALE : FEMALE;
  const avoid = gender === 'male' ? FEMALE : MALE;
  const score = (v) => {
    const n = ` ${(v.name || '').toLowerCase()} `;
    let s = 0;
    if ((v.lang || '').replace('_', '-').toLowerCase() === lang.toLowerCase()) s += 4;
    else if ((v.lang || '').toLowerCase().startsWith(lang.slice(0, 2).toLowerCase())) s += 1;
    if (want.some(w => n.includes(w))) s += 6;
    if (avoid.some(w => n.includes(w)) && !want.some(w => n.includes(w))) s -= 8;
    if (QUALITY.some(q => n.includes(q))) s += 2;
    if (v.localService) s += 0.5;
    return s;
  };
  return en.slice().sort((a, b) => score(b) - score(a))[0];
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
    this.rate = 1;
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

  ttsAvailable() {
    if (this.fast) return false;
    return this.native ? !!this.tts : ('speechSynthesis' in window);
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
  async speak(text, { gender = 'female', onStart, onBoundary } = {}) {
    const token = ++this._speakToken;
    const est = estimateDurationMs(text, this.rate) * (this.fast ? 0.08 : 1);
    if (!this.ttsAvailable()) {
      onStart && onStart(est);
      await sleep(est);
      return;
    }
    const chunks = chunkText(text);
    let offset = 0;
    const t0 = Date.now();
    onStart && onStart(est);
    for (const chunk of chunks) {
      if (token !== this._speakToken) return;
      const base = offset;
      await this._speakChunk(chunk, gender, (i) => onBoundary && onBoundary(base + i));
      offset += chunk.length + 1;
    }
    // If the engine returned almost instantly (no voice installed / muted engine),
    // keep the interviewer "talking" at a natural pace so captions can be read.
    const elapsed = Date.now() - t0;
    if (token === this._speakToken && elapsed < est * 0.4) await sleep(est * 0.9 - elapsed);
  }

  async _speakChunk(chunk, gender, onBoundary) {
    const fallback = estimateDurationMs(chunk, this.rate) * 1.7 + 2500;
    if (this.native) {
      const voice = pickVoice(this.voices, { gender, lang: this.lang });
      const voiceIndex = voice ? this.voices.indexOf(voice) : undefined;
      let handle;
      try {
        handle = await this.tts.addListener('onRangeStart', (e) => onBoundary(e.start || 0));
      } catch { /* older plugin */ }
      try {
        await Promise.race([
          this.tts.speak({ text: chunk, lang: this.lang, rate: this.rate, pitch: gender === 'male' ? 0.95 : 1.05, volume: 1, voice: voiceIndex >= 0 ? voiceIndex : undefined, category: 'playback' }),
          sleep(fallback),
        ]);
      } catch { await sleep(estimateDurationMs(chunk)); }
      finally { handle && handle.remove && handle.remove(); }
      return;
    }
    await new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(chunk);
      const v = pickVoice(this.voices, { gender, lang: this.lang });
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = this.lang;
      u.rate = this.rate;
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
  startListening({ onText, onError, onState } = {}) {
    if (this._listen) this._listen.stop();
    const ctl = this.native ? this._listenNative({ onText, onError, onState }) : this._listenWeb({ onText, onError, onState });
    this._listen = ctl;
    return ctl;
  }

  _listenWeb({ onText, onError, onState }) {
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    let committed = '';
    let interim = '';
    let active = true;
    let rec = null;
    let restarts = [];
    const emit = (final) => onText && onText((committed + ' ' + interim).replace(/\s+/g, ' ').trim(), final);
    const start = () => {
      rec = new Rec();
      rec.lang = this.lang;
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.onresult = (e) => {
        interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) committed += ' ' + r[0].transcript;
          else interim += ' ' + r[0].transcript;
        }
        emit(false);
      };
      rec.onerror = (e) => {
        if (e.error === 'no-speech' || e.error === 'aborted') return;
        // network, audio-capture, not-allowed, language-not-supported...: stop and let the UI fall back to typing
        active = false;
        onError && onError(e.error);
      };
      rec.onend = () => {
        if (interim) { committed += ' ' + interim; interim = ''; }
        const now = Date.now();
        restarts = restarts.filter(t => now - t < 10000);
        if (active && restarts.length < 8) { restarts.push(now); try { start(); } catch { active = false; } }
        else { if (active) { active = false; onError && onError('restart-limit'); } onState && onState('stopped'); }
      };
      try { rec.start(); onState && onState('listening'); } catch (err) { onError && onError(String(err)); }
    };
    start();
    return {
      stop: () => {
        active = false;
        try { rec && rec.stop(); } catch { /* ignore */ }
        if (interim) { committed += ' ' + interim; interim = ''; }
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
