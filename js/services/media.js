// Camera / microphone access and local session recording (never uploaded).
import { isNative } from './speech.js';

/** Virtual audio devices that usually deliver silence to the browser. */
export const isVirtualMic = (label = '') => /virtual|teams audio|zoomaudio|zoom audio|blackhole|loopback|soundflower|vb-audio|voicemeeter|krisp|aggregate|ndi audio|\bobs\b/i.test(label);

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
  /**
   * Start camera + microphone. They are requested together first, and if that fails
   * (for example a Mac mini with no webcam) each one is requested on its own, so a
   * missing camera never disables a working microphone.
   */
  async start({ video = true, audio = true, micId = null } = {}) {
    if (!this.supported()) throw new Error('Camera API not available');
    this.stop();
    this.audioError = null; this.videoError = null;
    const wantAudio = audio && !isNative();
    const gum = (c) => navigator.mediaDevices.getUserMedia(c);
    const audioC = (id) => wantAudio ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...(id ? { deviceId: { exact: id } } : {}) } : false;
    const videoC = video ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } : false;
    try {
      this.stream = await gum({ video: videoC, audio: audioC(micId) });
    } catch (both) {
      let a = null, v = null;
      if (wantAudio) {
        try { a = await gum({ audio: audioC(micId) }); }
        catch (e) {
          if (micId) { try { a = await gum({ audio: audioC(null) }); } catch (e2) { this.audioError = e2; } }
          else this.audioError = e;
        }
      }
      if (videoC) { try { v = await gum({ video: videoC }); } catch (e) { this.videoError = e; } }
      if (!a && !v) { this.audioError = this.audioError || both; this.videoError = this.videoError || both; throw both; }
      this.stream = new MediaStream([...(v ? v.getVideoTracks() : []), ...(a ? a.getAudioTracks() : [])]);
    }
    return this.stream;
  }

  /** Audio input devices (labels are available once permission was granted). */
  async listMics() {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      return all.filter(d => d.kind === 'audioinput').map(d => ({ id: d.deviceId, label: d.label || 'Microphone' }));
    } catch { return []; }
  }

  /** A real microphone, not a virtual/loopback device created by Teams, Zoom, BlackHole etc. */
  async preferredMicId() {
    const mics = await this.listMics();
    const real = mics.filter(m => !isVirtualMic(m.label));
    return (real.find(m => m.id === 'default') || real.find(m => /^default/i.test(m.label)) || real[0] || {}).id || null;
  }

  audioTrack() { return this.stream ? this.stream.getAudioTracks()[0] || null : null; }
  micLabel() { const t = this.audioTrack(); return t ? t.label : ''; }

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
      // Safari/Chrome may create the context suspended (autoplay rules), which reads as silence.
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
        const wake = () => { this.audioCtx && this.audioCtx.resume().catch(() => {}); };
        document.addEventListener('pointerdown', wake, { once: true });
      }
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
