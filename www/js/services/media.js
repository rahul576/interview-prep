// Camera / microphone access and local session recording (never uploaded).
import { isNative } from './speech.js';

export class MediaService {
  constructor() {
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
    this.audioCtx = null;
  }

  supported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  /**
   * On native apps the microphone is used by the speech recogniser, so we only
   * capture video there to avoid both fighting over the mic.
   */
  async start({ video = true, audio = true } = {}) {
    if (!this.supported()) throw new Error('Camera API not available');
    this.stop();
    const wantAudio = audio && !isNative();
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: video ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } : false,
      audio: wantAudio ? { echoCancellation: true, noiseSuppression: true } : false,
    });
    return this.stream;
  }

  attach(videoEl) {
    if (!videoEl || !this.stream) return;
    videoEl.srcObject = this.stream;
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.play().catch(() => {});
  }

  hasVideo() { return !!(this.stream && this.stream.getVideoTracks().some(t => t.readyState === 'live' && t.enabled)); }
  hasAudio() { return !!(this.stream && this.stream.getAudioTracks().some(t => t.readyState === 'live')); }

  setVideoEnabled(on) { this.stream && this.stream.getVideoTracks().forEach(t => { t.enabled = on; }); }

  /** Returns a function that gives mic level 0..1 (web only). */
  levelMeter() {
    if (!this.hasAudio()) return () => 0;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = this.audioCtx || new Ctx();
      const src = this.audioCtx.createMediaStreamSource(this.stream);
      const an = this.audioCtx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      const buf = new Uint8Array(an.fftSize);
      return () => {
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) { const d = (v - 128) / 128; sum += d * d; }
        return Math.min(1, Math.sqrt(sum / buf.length) * 4);
      };
    } catch { return () => 0; }
  }

  startRecording() {
    if (!this.stream || typeof MediaRecorder === 'undefined') return false;
    const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    const mimeType = types.find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t));
    try {
      this.chunks = [];
      this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType, videoBitsPerSecond: 600000 } : undefined);
      this.recorder.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
      this.recorder.start(1000);
      return true;
    } catch { this.recorder = null; return false; }
  }

  stopRecording() {
    return new Promise((resolve) => {
      const r = this.recorder;
      if (!r || r.state === 'inactive') return resolve(null);
      r.onstop = () => {
        const blob = this.chunks.length ? new Blob(this.chunks, { type: r.mimeType || 'video/webm' }) : null;
        this.recorder = null;
        resolve(blob);
      };
      try { r.stop(); } catch { resolve(null); }
    });
  }

  stop() {
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null;
    if (this.audioCtx) { this.audioCtx.close().catch(() => {}); this.audioCtx = null; }
  }
}
