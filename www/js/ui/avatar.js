// Animated interviewer face (SVG). Blinks, breathes, moves eyes, nods,
// and lip-syncs to speech using a character-driven viseme timeline.

const NS = 'http://www.w3.org/2000/svg';

const VISEMES = {
  rest:   { w: 22, open: 0,  round: 0,   smile: 1.2 },
  closed: { w: 21, open: 0,  round: 0.1, smile: 0 },
  open:   { w: 22, open: 11, round: 0,   smile: 0.5 },
  wide:   { w: 25, open: 7,  round: 0,   smile: 1.5 },
  round:  { w: 20, open: 9,  round: 0.8, smile: 0 },
  teeth:  { w: 23, open: 3,  round: 0,   smile: 0.6 },
  mid:    { w: 22, open: 5,  round: 0.2, smile: 0.4 },
};

export function visemeForChar(ch) {
  const c = (ch || ' ').toLowerCase();
  if ('a'.includes(c)) return 'open';
  if ('ei'.includes(c)) return 'wide';
  if ('ouwq'.includes(c)) return 'round';
  if ('mbp'.includes(c)) return 'closed';
  if ('fv'.includes(c)) return 'teeth';
  if (/[a-z0-9]/.test(c)) return 'mid';
  return 'rest';
}

const HAIR = {
  short: {
    back: '',
    front: 'M117 186 C106 112 150 68 205 70 C258 72 296 112 284 188 C279 156 266 130 246 120 C214 134 162 130 134 142 C125 154 120 168 117 186 Z',
  },
  long: {
    back: 'M110 205 C98 110 148 62 200 62 C252 62 302 110 290 205 C294 262 304 305 298 352 L102 352 C96 305 106 262 110 205 Z',
    front: 'M121 176 C122 110 160 82 205 82 C246 82 276 106 282 168 C266 132 240 112 210 108 C182 128 150 144 121 176 Z',
  },
  bob: {
    back: 'M112 210 C102 112 150 66 200 66 C250 66 298 112 288 210 C291 246 286 274 272 290 L128 290 C114 274 109 246 112 210 Z',
    front: 'M120 172 C120 108 160 80 202 80 C246 80 280 108 282 172 C270 140 248 118 222 112 C196 132 156 138 120 172 Z',
  },
};

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

function mouthPaths(p, cx = 200, cy = 250) {
  const hw = p.w * (1 - 0.35 * p.round);
  const o = Math.max(0, p.open);
  const lift = p.smile; // corners up
  const L = [cx - hw, cy - lift], R = [cx + hw, cy - lift];
  const upY = cy - 4.5 - o * 0.22;
  const loY = cy + 5.5 + o * 1.05;
  const lips = `M${L[0]} ${L[1]} C${cx - hw * 0.5} ${upY} ${cx - 3} ${upY + 1.2} ${cx} ${upY + 0.6} C${cx + 3} ${upY + 1.2} ${cx + hw * 0.5} ${upY} ${R[0]} ${R[1]} C${cx + hw * 0.55} ${loY} ${cx - hw * 0.55} ${loY} ${L[0]} ${L[1]} Z`;
  const iw = hw * 0.82;
  const inTop = cy - 1 - o * 0.12, inBot = cy + o * 0.95;
  const inner = `M${cx - iw} ${cy - lift * 0.6} C${cx - iw * 0.45} ${inTop} ${cx + iw * 0.45} ${inTop} ${cx + iw} ${cy - lift * 0.6} C${cx + iw * 0.45} ${inBot} ${cx - iw * 0.45} ${inBot} ${cx - iw} ${cy - lift * 0.6} Z`;
  const th = Math.min(3.4, o * 0.35);
  const teeth = `M${cx - iw * 0.62} ${inTop + 0.6} L${cx + iw * 0.62} ${inTop + 0.6} L${cx + iw * 0.58} ${inTop + 0.6 + th} L${cx - iw * 0.58} ${inTop + 0.6 + th} Z`;
  const line = `M${L[0]} ${L[1]} C${cx - hw * 0.4} ${cy + 1.2} ${cx + hw * 0.4} ${cy + 1.2} ${R[0]} ${R[1]}`;
  return { lips, inner, teeth, line, open: o };
}

export class InterviewerAvatar {
  /** @param {HTMLElement} host @param {object} persona from meta.INTERVIEWERS */
  constructor(host, persona) {
    this.host = host;
    this.persona = persona;
    this.state = 'idle'; // idle | speaking | listening | thinking
    this.cur = { ...VISEMES.rest };
    this.target = VISEMES.rest;
    this.timeline = null;
    this.gaze = { x: 0, y: 0, tx: 0, ty: 0 };
    this.nextBlink = performance.now() + 1500;
    this.blinkStart = 0;
    this.nextSaccade = 0;
    this.brow = 0; this.browTarget = 0;
    this.nod = 0;
    this._build();
    this._raf = requestAnimationFrame(t => this._tick(t));
  }

  _build() {
    const L = this.persona.look;
    const id = this.persona.id;
    const svg = el('svg', { viewBox: '0 0 400 440', class: 'avatar-svg', role: 'img', 'aria-label': `${this.persona.name}, interviewer` });
    const defs = el('defs', {}, svg);
    const skinG = el('radialGradient', { id: `skin-${id}`, cx: '50%', cy: '38%', r: '65%' }, defs);
    el('stop', { offset: '0%', 'stop-color': L.skin }, skinG);
    el('stop', { offset: '78%', 'stop-color': L.skin }, skinG);
    el('stop', { offset: '100%', 'stop-color': L.skinShade }, skinG);
    const shirtG = el('linearGradient', { id: `shirt-${id}`, x1: '0', y1: '0', x2: '0', y2: '1' }, defs);
    el('stop', { offset: '0%', 'stop-color': L.shirt }, shirtG);
    el('stop', { offset: '100%', 'stop-color': shade(L.shirt, -25) }, shirtG);
    const hairG = el('linearGradient', { id: `hair-${id}`, x1: '0', y1: '0', x2: '0.3', y2: '1' }, defs);
    el('stop', { offset: '0%', 'stop-color': shade(L.hair, 18) }, hairG);
    el('stop', { offset: '100%', 'stop-color': L.hair }, hairG);

    const body = el('g', { class: 'av-body' }, svg);
    const hair = HAIR[L.hairStyle] || HAIR.short;
    if (hair.back) el('path', { d: hair.back, fill: `url(#hair-${id})` }, body);
    // torso
    el('path', { d: 'M14 440 C24 378 86 350 160 340 L240 340 C314 350 376 378 386 440 Z', fill: `url(#shirt-${id})` }, body);
    // neck
    el('path', { d: 'M170 262 L230 262 L234 344 C220 360 180 360 166 344 Z', fill: L.skinShade }, body);
    el('path', { d: 'M166 340 L200 392 L234 340 C222 352 178 352 166 340 Z', fill: L.skinShade }, body);
    // lapels / collar
    el('path', { d: 'M160 340 L200 400 L178 440 L120 440 C130 400 140 365 160 340 Z', fill: shade(L.shirt, -12), opacity: '.85' }, body);
    el('path', { d: 'M240 340 L200 400 L222 440 L280 440 C270 400 260 365 240 340 Z', fill: shade(L.shirt, -12), opacity: '.85' }, body);
    el('path', { d: 'M164 338 L200 386 L236 338', fill: 'none', stroke: shade(L.shirt, 35), 'stroke-width': '3', opacity: '.6' }, body);

    const head = el('g', { class: 'av-head' }, svg);
    this.headEl = head;
    // ears
    el('ellipse', { cx: '122', cy: '196', rx: '11', ry: '20', fill: L.skinShade }, head);
    el('ellipse', { cx: '278', cy: '196', rx: '11', ry: '20', fill: L.skinShade }, head);
    // face
    el('path', { d: 'M122 178 C122 112 160 88 200 88 C240 88 278 112 278 178 C278 238 252 286 200 294 C148 286 122 238 122 178 Z', fill: `url(#skin-${id})` }, head);
    // cheeks
    el('ellipse', { cx: '156', cy: '228', rx: '16', ry: '9', fill: '#d9534f', opacity: '.10' }, head);
    el('ellipse', { cx: '244', cy: '228', rx: '16', ry: '9', fill: '#d9534f', opacity: '.10' }, head);
    if (L.beard) {
      el('path', { d: 'M130 212 C138 268 170 298 200 300 C230 298 262 268 270 212 C258 250 238 270 222 274 C212 264 188 264 178 274 C162 270 142 250 130 212 Z', fill: L.hair, opacity: '.72' }, head);
    }
    // eyes
    this.eyes = [];
    for (const cx of [166, 234]) {
      const g = el('g', { class: 'av-eye' }, head);
      el('path', { d: `M${cx - 17} ${172} Q${cx} ${163} ${cx + 17} ${172}`, fill: 'none', stroke: L.skinShade, 'stroke-width': '2', opacity: '.7' }, head);
      const lid = el('g', {}, g);
      el('ellipse', { cx, cy: '180', rx: '15', ry: '9', fill: '#fbf8f4' }, lid);
      const iris = el('g', {}, lid);
      el('circle', { cx, cy: '180', r: '7.2', fill: L.eyes }, iris);
      el('circle', { cx, cy: '180', r: '3.4', fill: '#0b0806' }, iris);
      el('circle', { cx: cx + 2.4, cy: '177.6', r: '1.7', fill: '#fff', opacity: '.9' }, iris);
      el('path', { d: `M${cx - 15.5} 179 Q${cx} 168.5 ${cx + 15.5} 179`, fill: 'none', stroke: '#1b1210', 'stroke-width': '2.4', 'stroke-linecap': 'round' }, lid);
      this.eyes.push({ lid, iris, cx });
    }
    // brows
    this.brows = el('g', { class: 'av-brows' }, head);
    el('path', { d: 'M146 156 Q166 145 186 153', fill: 'none', stroke: L.hair, 'stroke-width': '5.5', 'stroke-linecap': 'round' }, this.brows);
    el('path', { d: 'M214 153 Q234 145 254 156', fill: 'none', stroke: L.hair, 'stroke-width': '5.5', 'stroke-linecap': 'round' }, this.brows);
    // nose
    el('path', { d: 'M201 186 C199 202 193 214 191 222 C196 228 205 228 211 222', fill: 'none', stroke: L.skinShade, 'stroke-width': '2.6', 'stroke-linecap': 'round' }, head);
    // mouth
    this.mouth = {
      inner: el('path', { fill: '#3a1214' }, head),
      teeth: el('path', { fill: '#f3efe8' }, head),
      lips: el('path', { fill: L.lips, opacity: '.92' }, head),
      line: el('path', { fill: 'none', stroke: shade(L.lips, -35), 'stroke-width': '1.6', 'stroke-linecap': 'round' }, head),
    };
    if (L.beard) el('path', { d: 'M176 238 C188 231 212 231 224 238 C214 241 186 241 176 238 Z', fill: L.hair, opacity: '.8' }, head);
    // hair front
    el('path', { d: hair.front, fill: `url(#hair-${id})` }, head);
    if (L.glasses) {
      const gl = el('g', { fill: 'rgba(255,255,255,.07)', stroke: '#1d1d1f', 'stroke-width': '3.2' }, head);
      el('rect', { x: '143', y: '163', width: '46', height: '33', rx: '10' }, gl);
      el('rect', { x: '211', y: '163', width: '46', height: '33', rx: '10' }, gl);
      el('path', { d: 'M189 176 Q200 170 211 176', fill: 'none' }, gl);
      el('path', { d: 'M143 172 L124 168 M257 172 L276 168', fill: 'none' }, gl);
    }
    this.host.replaceChildren(svg);
    this.svg = svg;
    this._renderMouth();
  }

  setState(s) {
    this.state = s;
    this.host.dataset.state = s;
    if (s !== 'speaking') { this.timeline = null; this.target = VISEMES.rest; }
  }

  /** Start a lip-sync timeline for `text` lasting about `durationMs`. */
  startSpeech(text, durationMs) {
    const chars = [...text];
    this.timeline = { chars, start: performance.now(), duration: Math.max(400, durationMs), offset: 0 };
    this.setState('speaking');
    this.state = 'speaking';
    this.host.dataset.state = 'speaking';
    this.browTarget = 1;
  }

  /** Resync timeline to the TTS engine's current character position. */
  syncToChar(charIndex) {
    const tl = this.timeline;
    if (!tl) return;
    const now = performance.now();
    const expected = (charIndex / tl.chars.length) * tl.duration;
    tl.offset = expected - (now - tl.start);
    if (Math.random() < 0.25) this.browTarget = 1;
  }

  endSpeech() {
    this.timeline = null;
    this.target = VISEMES.rest;
    this.browTarget = 0;
  }

  _tick(t) {
    if (!this.svg.isConnected) return; // stopped
    // Lip-sync
    if (this.timeline) {
      const tl = this.timeline;
      const p = (t - tl.start + tl.offset) / tl.duration;
      if (p >= 1.05) { this.target = VISEMES.rest; }
      else {
        const idx = Math.min(tl.chars.length - 1, Math.max(0, Math.floor(p * tl.chars.length)));
        const v = visemeForChar(tl.chars[idx]);
        this.target = VISEMES[v];
        if (Math.random() < 0.012) this.browTarget = Math.random() < 0.5 ? 1 : 0;
      }
    }
    const k = 0.35;
    for (const key of ['w', 'open', 'round', 'smile']) this.cur[key] += (this.target[key] - this.cur[key]) * k;
    this._renderMouth();

    // Blink
    let lidScale = 1;
    if (t > this.nextBlink) { this.blinkStart = t; this.nextBlink = t + 2200 + Math.random() * 3800; }
    const bt = t - this.blinkStart;
    if (bt < 160) lidScale = Math.max(0.08, Math.abs(1 - bt / 80));

    // Gaze
    if (t > this.nextSaccade) {
      const listening = this.state === 'listening';
      const r = listening ? 1.2 : 2.6;
      this.gaze.tx = (Math.random() * 2 - 1) * r;
      this.gaze.ty = (Math.random() * 2 - 1) * r * 0.5;
      if (this.state === 'thinking') { this.gaze.tx = 3; this.gaze.ty = -2.5; }
      this.nextSaccade = t + 700 + Math.random() * 2400;
    }
    this.gaze.x += (this.gaze.tx - this.gaze.x) * 0.25;
    this.gaze.y += (this.gaze.ty - this.gaze.y) * 0.25;
    for (const e of this.eyes) {
      e.lid.setAttribute('transform', `translate(0 ${180 * (1 - lidScale)}) scale(1 ${lidScale})`);
      e.iris.setAttribute('transform', `translate(${this.gaze.x} ${this.gaze.y})`);
    }

    // Brows
    this.brow += (this.browTarget - this.brow) * 0.08;
    if (this.state !== 'speaking' && Math.random() < 0.004) this.browTarget = 0;
    this.brows.setAttribute('transform', `translate(0 ${-this.brow * 3.5})`);

    // Head motion
    const s = t / 1000;
    const speaking = this.state === 'speaking';
    const amp = speaking ? 1.6 : 0.8;
    let rot = Math.sin(s * 0.7) * amp + Math.sin(s * 1.9) * (speaking ? 0.7 : 0.2);
    let dy = Math.sin(s * 1.3) * (speaking ? 1.6 : 0.8);
    if (this.state === 'listening') {
      // occasional gentle nod
      if (Math.random() < 0.003) this.nod = 1;
      this.nod *= 0.96;
      dy += Math.sin(this.nod * Math.PI) * 4;
      rot += 1.2;
    }
    if (this.state === 'thinking') rot += 3;
    this.headEl.setAttribute('transform', `rotate(${rot.toFixed(2)} 200 300) translate(0 ${dy.toFixed(2)})`);
    const breathe = Math.sin(s * 1.6) * 1.4;
    this.svg.querySelector('.av-body').setAttribute('transform', `translate(0 ${breathe.toFixed(2)})`);

    this._raf = requestAnimationFrame(tt => this._tick(tt));
  }

  _renderMouth() {
    const m = mouthPaths(this.cur);
    this.mouth.lips.setAttribute('d', m.lips);
    this.mouth.inner.setAttribute('d', m.inner);
    this.mouth.teeth.setAttribute('d', m.teeth);
    this.mouth.line.setAttribute('d', m.line);
    const showInner = m.open > 0.8;
    this.mouth.inner.style.opacity = showInner ? '1' : '0';
    this.mouth.teeth.style.opacity = m.open > 2 ? '1' : '0';
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    this.host.replaceChildren();
  }
}

/** Lighten (+) or darken (-) a hex colour by percent. */
export function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + (pct / 100) * (pct > 0 ? 255 - c : c))));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
