// Interviewer on the call (V1.14): like a Teams call with the camera off. A round picture of the
// interviewer; while they speak, a soft ring around the picture follows their voice. The picture
// itself never moves, and there is no video or lip animation.

/** Ring strength 0..1 from voice loudness (RMS about 0..0.3). */
export function ringFromLevel(rms) {
  return Math.max(0, Math.min(1, (rms - 0.01) / 0.12));
}

export class CallAvatar {
  constructor(host, persona, { levelSource = null } = {}) {
    this.host = host;
    this.levelSource = levelSource;
    this.speaking = false;
    this.ring = 0;
    const wrap = document.createElement('div');
    wrap.className = 'call-avatar';
    const circle = document.createElement('div');
    circle.className = 'ca-circle';
    const img = new Image();
    img.className = 'ca-photo';
    img.alt = `${persona.name}, interviewer`;
    img.decoding = 'async';
    img.src = persona.avatar || persona.photo;
    if (!persona.avatar) img.classList.add('ca-uncropped');
    img.onerror = () => { circle.classList.add('ca-initials'); circle.textContent = initialsOf(persona.name); };
    circle.appendChild(img);
    wrap.appendChild(circle);
    this.wrap = wrap; this.circle = circle;
    host.replaceChildren(wrap);
    host.dataset.state = 'listening';
  }

  _tick() {
    if (!this.wrap.isConnected) return;
    const real = this.levelSource ? this.levelSource() : null;
    // with the system voice there is no audio level: a calm steady ring instead
    const target = !this.speaking ? 0 : real === null || real === undefined ? 0.45 : ringFromLevel(real);
    this.ring += (target - this.ring) * (target > this.ring ? 0.35 : 0.12);
    this.wrap.style.setProperty('--lv', this.ring.toFixed(3));
    if (this.speaking || this.ring > 0.01) this._raf = requestAnimationFrame(() => this._tick());
    else this.wrap.style.setProperty('--lv', '0');
  }

  setExpression(name) { this.host.dataset.expression = name; }
  nod() {}
  setState(s) { this.host.dataset.state = s; if (s !== 'speaking') this.speaking = false; }
  startSpeech() {
    this.speaking = true; this.host.dataset.state = 'speaking';
    cancelAnimationFrame(this._raf); this._raf = requestAnimationFrame(() => this._tick());
  }
  syncToChar() {}
  endSpeech() { this.speaking = false; }
  destroy() { cancelAnimationFrame(this._raf); this.host.replaceChildren(); }
}

function initialsOf(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

export function createAvatar(host, persona, opts = {}) { return new CallAvatar(host, persona, opts); }
