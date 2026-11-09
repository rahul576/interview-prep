// Natural interviewer voices (V1.8): Kokoro-82M, an open-weight neural text-to-speech model that
// runs inside the browser (WebGPU, or WebAssembly on devices without it). Free, private, and
// offline after the first download. The model is downloaded once per browser from Hugging Face
// (about 325 MB with WebGPU, about 90 MB on the WebAssembly fallback) and cached by the browser.
//
// Text is split into sentences: the first sentence is synthesised and starts playing while the
// next ones are generated, so the interviewer starts speaking quickly.

export const NATURAL_VOICES = [
  { id: 'kokoro:af_heart', voice: 'af_heart', label: 'Heart', desc: 'Female, US English', gender: 'female' },
  { id: 'kokoro:af_bella', voice: 'af_bella', label: 'Bella', desc: 'Female, US English', gender: 'female' },
  { id: 'kokoro:am_michael', voice: 'am_michael', label: 'Michael', desc: 'Male, US English', gender: 'male' },
  { id: 'kokoro:bm_george', voice: 'bm_george', label: 'George', desc: 'Male, British English', gender: 'male' },
];
export const SYSTEM_VOICE = 'system';
export const isNaturalVoice = (id) => typeof id === 'string' && id.startsWith('kokoro:');
export const naturalVoiceById = (id) => NATURAL_VOICES.find(v => v.id === id) || null;
/** Default voice for an interviewer when the user has not chosen one. */
export const defaultNaturalVoice = (gender) => (gender === 'male' ? NATURAL_VOICES[2] : NATURAL_VOICES[0]).id;

const LIB = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm';
const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';

/** Sentence chunks small enough to synthesise quickly. */
export function splitSentences(text, max = 220) {
  const parts = String(text).replace(/\s+/g, ' ').trim().match(/[^.!?;:]+[.!?;:]*\s*/g) || [String(text)];
  const out = [];
  let buf = '';
  for (const p of parts) {
    // The first sentence goes alone so speech starts as soon as possible; later ones are grouped.
    if (buf && ((buf + p).length > max || out.length === 0)) { out.push(buf.trim()); buf = ''; }
    buf += p;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

export class NaturalVoice {
  constructor() {
    this.state = 'idle'; // idle | loading | ready | failed | unsupported
    this.progress = 0;
    this.error = null;
    this.tts = null;
    this._loading = null;
    this._token = 0;
    this._src = null;
    this.ctx = null;
    this.listeners = new Set();
  }

  /** Can this browser run it at all? (needs WebAssembly + Web Audio; WebGPU makes it fast) */
  supported() {
    return typeof WebAssembly === 'object' && typeof (window.AudioContext || window.webkitAudioContext) === 'function' && !navigator.webdriver;
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit() { for (const fn of this.listeners) { try { fn(this.status()); } catch { /* ignore */ } } }
  status() { return { state: this.state, progress: this.progress, error: this.error, device: this.device }; }

  /** Download (first time) and load the model. Safe to call repeatedly. */
  load() {
    if (this.tts) return Promise.resolve(true);
    if (this._loading) return this._loading;
    if (!this.supported()) { this.state = 'unsupported'; this._emit(); return Promise.resolve(false); }
    this.state = 'loading'; this.progress = 0; this._emit();
    this._loading = (async () => {
      try {
        const { KokoroTTS } = await import(/* @vite-ignore */ LIB);
        const gpu = !!(navigator.gpu && await navigator.gpu.requestAdapter().catch(() => null));
        this.device = gpu ? 'webgpu' : 'wasm';
        const files = {};
        this.tts = await KokoroTTS.from_pretrained(MODEL, {
          dtype: gpu ? 'fp32' : 'q8',
          device: this.device,
          progress_callback: (p) => {
            if (p && p.file && p.total) {
              files[p.file] = { loaded: p.loaded || 0, total: p.total };
              const all = Object.values(files);
              this.progress = Math.min(0.99, all.reduce((n, f) => n + f.loaded, 0) / Math.max(1, all.reduce((n, f) => n + f.total, 0)));
              this._emit();
            }
          },
        });
        this.state = 'ready'; this.progress = 1; this._emit();
        return true;
      } catch (e) {
        this.state = 'failed'; this.error = (e && e.message) || String(e); this.tts = null; this._emit();
        return false;
      } finally { this._loading = null; }
    })();
    return this._loading;
  }

  get ready() { return this.state === 'ready' && !!this.tts; }

  _context() {
    if (!this.ctx) { const C = window.AudioContext || window.webkitAudioContext; this.ctx = new C(); }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  /** Optional: send audio to a specific speaker (Chrome/Edge). */
  async setOutput(deviceId) {
    try { const c = this._context(); if (c.setSinkId) await c.setSinkId(deviceId || ''); } catch { /* keep default */ }
  }

  async _synth(text, voice, speed) {
    const a = await this.tts.generate(text, { voice, speed });
    return { samples: a.audio, rate: a.sampling_rate };
  }

  _play({ samples, rate }, token, onProgress) {
    return new Promise((resolve) => {
      if (token !== this._token) return resolve();
      const ctx = this._context();
      const buf = ctx.createBuffer(1, samples.length, rate);
      buf.copyToChannel(samples, 0);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      this._src = src;
      const dur = samples.length / rate;
      const start = ctx.currentTime;
      const timer = setInterval(() => onProgress && onProgress(Math.min(1, (ctx.currentTime - start) / dur)), 80);
      src.onended = () => { clearInterval(timer); if (this._src === src) this._src = null; resolve(); };
      src.start();
    });
  }

  /**
   * Speak text. Calls onStart(estimatedMs) when audio starts and onBoundary(charIndex) as it plays,
   * so the avatar's lips and the captions follow the voice. Resolves when finished or stopped.
   */
  async speak(text, { voice = 'af_heart', speed = 1, onStart, onBoundary } = {}) {
    if (!this.ready) throw new Error('natural voice not ready');
    const token = ++this._token;
    const parts = splitSentences(text);
    let offset = 0;
    let next = this._synth(parts[0], voice, speed);
    for (let i = 0; i < parts.length; i++) {
      const audio = await next;
      if (token !== this._token) return;
      if (i + 1 < parts.length) next = this._synth(parts[i + 1], voice, speed); // generate ahead while playing
      if (i === 0 && onStart) onStart(Math.round((String(text).length / parts[0].length) * (audio.samples.length / audio.rate) * 1000));
      const base = offset, len = parts[i].length;
      await this._play(audio, token, (f) => onBoundary && onBoundary(base + Math.floor(f * len)));
      offset += len + 1;
    }
  }

  stop() {
    this._token++;
    if (this._src) { try { this._src.stop(); } catch { /* already ended */ } this._src = null; }
  }
}
