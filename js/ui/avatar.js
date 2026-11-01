// Animated interviewer (SVG, original artwork). 3D-style shading, business attire,
// facial expressions (warm, curious, listening, thinking, concerned, pleased),
// blinking, gaze, nods and lip-sync driven by a character viseme timeline.
// A PhotoAvatar variant animates a user-supplied interviewer photo.

const NS = 'http://www.w3.org/2000/svg';

const VISEMES = {
  rest:   { w: 22, open: 0,  round: 0 },
  closed: { w: 21, open: 0,  round: 0.1 },
  open:   { w: 22, open: 11, round: 0 },
  wide:   { w: 25, open: 7,  round: 0 },
  round:  { w: 20, open: 9,  round: 0.8 },
  teeth:  { w: 23, open: 3,  round: 0 },
  mid:    { w: 22, open: 5,  round: 0.2 },
};

/** Facial expression presets: smile (mouth corners), brow (raise), frown (inner brows), squint, tilt (deg). */
export const EXPRESSIONS = {
  neutral:   { smile: 0.6, brow: 0,    frown: 0,   squint: 0,    tilt: 0 },
  warm:      { smile: 2.6, brow: 0.4,  frown: 0,   squint: 0.25, tilt: -1.5 },
  curious:   { smile: 1.2, brow: 1,    frown: 0,   squint: 0,    tilt: 2.5 },
  listening: { smile: 1.4, brow: 0.2,  frown: 0,   squint: 0.1,  tilt: 1.5 },
  thinking:  { smile: 0,   brow: 0.3,  frown: 0.5, squint: 0.15, tilt: 3.5 },
  concerned: { smile: -0.6, brow: 0.2, frown: 1,   squint: 0,    tilt: -2 },
  pleased:   { smile: 3.2, brow: 0.6,  frown: 0,   squint: 0.35, tilt: -1 },
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
    front: 'M117 186 C106 112 150 66 205 68 C260 70 297 112 284 188 C280 154 268 128 248 118 C216 136 162 128 134 142 C125 154 120 168 117 186 Z',
    shine: 'M160 92 C185 80 225 80 250 96',
  },
  long: {
    back: 'M108 205 C96 108 148 60 200 60 C252 60 304 108 292 205 C298 262 310 318 302 372 L98 372 C90 318 102 262 108 205 Z',
    front: 'M121 176 C120 108 160 80 205 80 C248 80 280 106 283 170 C266 132 240 112 210 106 C182 128 150 144 121 176 Z',
    shine: 'M150 104 C175 86 215 82 245 96',
  },
  bob: {
    back: 'M110 212 C100 110 150 64 200 64 C250 64 300 110 290 212 C293 250 288 280 272 296 L128 296 C112 280 107 250 110 212 Z',
    front: 'M120 172 C120 106 160 78 202 78 C248 78 282 106 283 172 C270 138 248 116 222 110 C196 132 156 138 120 172 Z',
    shine: 'M150 100 C175 84 220 82 250 98',
  },
};

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

function mouthPaths(p, cx = 200, cy = 252) {
  const hw = p.w * (1 - 0.35 * p.round) + Math.max(0, p.smile) * 2.2;
  const o = Math.max(0, p.open);
  const lift = p.smile * 1.7; // corners up (negative = down)
  const L = [cx - hw, cy - lift], R = [cx + hw, cy - lift];
  const upY = cy - 4.5 - o * 0.22;
  const loY = cy + 5.5 + o * 1.05 + Math.max(0, p.smile) * 1.4;
  const lips = `M${L[0]} ${L[1]} C${cx - hw * 0.5} ${upY} ${cx - 3} ${upY + 1.2} ${cx} ${upY + 0.6} C${cx + 3} ${upY + 1.2} ${cx + hw * 0.5} ${upY} ${R[0]} ${R[1]} C${cx + hw * 0.55} ${loY} ${cx - hw * 0.55} ${loY} ${L[0]} ${L[1]} Z`;
  const iw = hw * 0.82;
  const inTop = cy - 1 - o * 0.12 - Math.max(0, p.smile - 1.8) * 1.2, inBot = cy + o * 0.95 + Math.max(0, p.smile - 1.8) * 6;
  const inner = `M${cx - iw} ${cy - lift * 0.6} C${cx - iw * 0.45} ${inTop} ${cx + iw * 0.45} ${inTop} ${cx + iw} ${cy - lift * 0.6} C${cx + iw * 0.45} ${inBot} ${cx - iw * 0.45} ${inBot} ${cx - iw} ${cy - lift * 0.6} Z`;
  const th = Math.min(5, Math.max(o * 0.35, (p.smile - 1.8) * 4));
  const teeth = `M${cx - iw * 0.66} ${inTop + 0.6} L${cx + iw * 0.66} ${inTop + 0.6} L${cx + iw * 0.6} ${inTop + 0.6 + th} L${cx - iw * 0.6} ${inTop + 0.6 + th} Z`;
  const line = `M${L[0]} ${L[1]} C${cx - hw * 0.4} ${cy + 1.2 + Math.max(0, p.smile) * 0.4} ${cx + hw * 0.4} ${cy + 1.2 + Math.max(0, p.smile) * 0.4} ${R[0]} ${R[1]}`;
  const showInner = o > 0.8 || p.smile > 1.9;
  return { lips, inner, teeth, line, open: o, showInner, showTeeth: o > 2 || p.smile > 1.9 };
}

export class InterviewerAvatar {
  /** @param {HTMLElement} host @param {object} persona from meta.INTERVIEWERS */
  constructor(host, persona) {
    this.host = host;
    this.persona = persona;
    this.state = 'idle'; // idle | speaking | listening | thinking
    this.cur = { ...VISEMES.rest, ...EXPRESSIONS.warm };
    this.target = VISEMES.rest;
    this.exprName = 'warm';
    this.expr = EXPRESSIONS.warm;
    this.timeline = null;
    this.gaze = { x: 0, y: 0, tx: 0, ty: 0 };
    this.nextBlink = performance.now() + 1500;
    this.blinkStart = 0;
    this.nextSaccade = 0;
    this.nodStart = -1e9;
    this.nextNod = performance.now() + 3000;
    this.browPulse = 0;
    this._build();
    this._raf = requestAnimationFrame(t => this._tick(t));
  }

  _build() {
    const L = this.persona.look;
    const id = this.persona.id + Math.random().toString(36).slice(2, 6);
    const svg = el('svg', { viewBox: '0 0 400 440', class: 'avatar-svg', role: 'img', 'aria-label': `${this.persona.name}, interviewer` });
    const defs = el('defs', {}, svg);
    const grad = (gid, type, stops, attrs) => { const g = el(type, { id: gid, ...attrs }, defs); stops.forEach(([o, c, op]) => el('stop', { offset: o, 'stop-color': c, ...(op != null ? { 'stop-opacity': op } : {}) }, g)); return `url(#${gid})`; };
    const skin = grad(`skin-${id}`, 'radialGradient', [['0%', shade(L.skin, 14)], ['55%', L.skin], ['100%', L.skinShade]], { cx: '42%', cy: '36%', r: '70%' });
    const neck = grad(`neck-${id}`, 'linearGradient', [['0%', shade(L.skinShade, -18)], ['60%', L.skinShade], ['100%', L.skin]], { x1: '0', y1: '0', x2: '0', y2: '1' });
    const jacket = grad(`jk-${id}`, 'linearGradient', [['0%', shade(L.shirt, 12)], ['100%', shade(L.shirt, -30)]], { x1: '0', y1: '0', x2: '0.2', y2: '1' });
    const hair = grad(`hair-${id}`, 'linearGradient', [['0%', shade(L.hair, 22)], ['100%', L.hair]], { x1: '0', y1: '0', x2: '0.3', y2: '1' });
    const iris = grad(`iris-${id}`, 'radialGradient', [['0%', shade(L.eyes, 35)], ['70%', L.eyes], ['100%', shade(L.eyes, -40)]], { cx: '45%', cy: '40%', r: '60%' });
    const shadowR = grad(`sh-${id}`, 'linearGradient', [['0%', '#000', 0], ['100%', '#000', 0.22]], { x1: '0', y1: '0', x2: '1', y2: '0' });
    const lipG = grad(`lip-${id}`, 'linearGradient', [['0%', shade(L.lips, -10)], ['100%', shade(L.lips, 12)]], { x1: '0', y1: '0', x2: '0', y2: '1' });

    const body = el('g', { class: 'av-body' }, svg);
    const hairDef = HAIR[L.hairStyle] || HAIR.short;
    if (hairDef.back) el('path', { d: hairDef.back, fill: hair }, body);
    // shirt + jacket
    el('path', { d: 'M14 440 C24 376 86 348 160 338 L240 338 C314 348 376 376 386 440 Z', fill: L.blouse || '#f4f5f7' }, body);
    el('path', { d: 'M14 440 C24 378 80 350 150 340 L178 440 Z', fill: jacket }, body);
    el('path', { d: 'M386 440 C376 378 320 350 250 340 L222 440 Z', fill: jacket }, body);
    // lapels
    el('path', { d: 'M150 340 L182 410 L166 440 L140 440 C142 404 144 370 150 340 Z', fill: shade(L.shirt, -18) }, body);
    el('path', { d: 'M250 340 L218 410 L234 440 L260 440 C258 404 256 370 250 340 Z', fill: shade(L.shirt, -18) }, body);
    // neck with shadow
    el('path', { d: 'M168 262 L232 262 L236 346 C222 362 178 362 164 346 Z', fill: neck }, body);
    el('ellipse', { cx: '200', cy: '290', rx: '40', ry: '14', fill: '#000', opacity: '.14' }, body);
    // collar
    el('path', { d: 'M162 338 L200 376 L188 396 L150 352 Z', fill: L.blouse || '#ffffff' }, body);
    el('path', { d: 'M238 338 L200 376 L212 396 L250 352 Z', fill: L.blouse || '#ffffff' }, body);
    if (L.tie) {
      el('path', { d: 'M192 372 L208 372 L212 384 L204 392 L196 392 L188 384 Z', fill: shade(L.tie, -15) }, body);
      el('path', { d: 'M196 390 L204 390 L214 440 L186 440 Z', fill: L.tie }, body);
    }
    if (L.necklace) el('path', { d: 'M176 348 C188 368 212 368 224 348', fill: 'none', stroke: '#d8c48f', 'stroke-width': '2' }, body);
    // pocket square / button details
    el('circle', { cx: '176', cy: '430', r: '3', fill: shade(L.shirt, -40) }, body);

    const head = el('g', { class: 'av-head' }, svg);
    this.headEl = head;
    // ears
    el('ellipse', { cx: '121', cy: '196', rx: '12', ry: '21', fill: L.skinShade }, head);
    el('ellipse', { cx: '279', cy: '196', rx: '12', ry: '21', fill: L.skinShade }, head);
    el('ellipse', { cx: '123', cy: '197', rx: '5', ry: '11', fill: shade(L.skinShade, -15), opacity: '.5' }, head);
    el('ellipse', { cx: '277', cy: '197', rx: '5', ry: '11', fill: shade(L.skinShade, -15), opacity: '.5' }, head);
    // face + 3D shading
    const FACE = 'M122 178 C122 112 160 88 200 88 C240 88 278 112 278 178 C278 238 252 286 200 294 C148 286 122 238 122 178 Z';
    el('path', { d: FACE, fill: skin }, head);
    el('path', { d: FACE, fill: `url(#sh-${id})` }, head);
    el('path', { d: 'M150 262 C170 290 230 290 250 262 C238 284 220 294 200 294 C180 294 162 284 150 262 Z', fill: '#000', opacity: '.08' }, head);
    // cheeks (raise with smile)
    this.cheeks = el('g', {}, head);
    el('ellipse', { cx: '154', cy: '226', rx: '18', ry: '10', fill: '#e0605a', opacity: '.13' }, this.cheeks);
    el('ellipse', { cx: '246', cy: '226', rx: '18', ry: '10', fill: '#e0605a', opacity: '.13' }, this.cheeks);
    if (L.beard) {
      el('path', { d: 'M130 212 C138 268 170 298 200 300 C230 298 262 268 270 212 C258 250 238 270 222 274 C212 264 188 264 178 274 C162 270 142 250 130 212 Z', fill: L.hair, opacity: '.72' }, head);
    }
    // eyes
    this.eyes = [];
    for (const cx of [166, 234]) {
      const g = el('g', { class: 'av-eye' }, head);
      el('path', { d: `M${cx - 18} ${171} Q${cx} ${161} ${cx + 18} ${171}`, fill: 'none', stroke: L.skinShade, 'stroke-width': '2', opacity: '.7' }, head);
      el('ellipse', { cx, cy: '190', rx: '14', ry: '4', fill: L.skinShade, opacity: '.25' }, head); // under-eye
      const lid = el('g', {}, g);
      el('ellipse', { cx, cy: '180', rx: '16', ry: '10', fill: '#fbf8f4' }, lid);
      el('ellipse', { cx, cy: '177', rx: '16', ry: '5', fill: '#000', opacity: '.06' }, lid);
      const irisG = el('g', {}, lid);
      el('circle', { cx, cy: '180', r: '7.6', fill: iris }, irisG);
      el('circle', { cx, cy: '180', r: '3.5', fill: '#0b0806' }, irisG);
      el('circle', { cx: cx + 2.6, cy: '177.4', r: '1.9', fill: '#fff', opacity: '.95' }, irisG);
      el('circle', { cx: cx - 2.4, cy: '182.6', r: '0.9', fill: '#fff', opacity: '.6' }, irisG);
      el('path', { d: `M${cx - 16.5} 180 Q${cx} 168 ${cx + 16.5} 180`, fill: 'none', stroke: '#1b1210', 'stroke-width': '2.8', 'stroke-linecap': 'round' }, lid);
      if (this.persona.gender === 'female') el('path', { d: `M${cx + 14} 175 l5 -3 M${cx - 14} 175 l-5 -3`, stroke: '#1b1210', 'stroke-width': '1.6', 'stroke-linecap': 'round' }, lid);
      // lower lid used for squint
      const lower = el('path', { d: `M${cx - 16} 182 Q${cx} 192 ${cx + 16} 182 L${cx + 16} 194 L${cx - 16} 194 Z`, fill: L.skin }, g);
      this.eyes.push({ lid, iris: irisG, cx, lower });
    }
    // brows (left and right separately for frowns)
    this.browL = el('path', { d: 'M146 156 Q166 145 186 153', fill: 'none', stroke: L.hair, 'stroke-width': '5.5', 'stroke-linecap': 'round' }, head);
    this.browR = el('path', { d: 'M214 153 Q234 145 254 156', fill: 'none', stroke: L.hair, 'stroke-width': '5.5', 'stroke-linecap': 'round' }, head);
    // nose with highlight and nostril shading
    el('path', { d: 'M201 186 C199 202 193 214 191 222 C196 228 205 228 211 222', fill: 'none', stroke: shade(L.skinShade, -10), 'stroke-width': '2.6', 'stroke-linecap': 'round' }, head);
    el('path', { d: 'M203 186 C204 200 205 210 206 216', fill: 'none', stroke: '#fff', 'stroke-width': '2', opacity: '.25', 'stroke-linecap': 'round' }, head);
    el('ellipse', { cx: '193', cy: '224', rx: '3.5', ry: '2', fill: '#000', opacity: '.18' }, head);
    el('ellipse', { cx: '209', cy: '224', rx: '3.5', ry: '2', fill: '#000', opacity: '.18' }, head);
    // smile lines
    this.smileLines = el('path', { d: 'M170 236 C166 246 168 256 174 262 M230 236 C234 246 232 256 226 262', fill: 'none', stroke: L.skinShade, 'stroke-width': '1.6', opacity: '0', 'stroke-linecap': 'round' }, head);
    // mouth
    // lips first, then the mouth opening and teeth on top of them
    const lips = el('path', { fill: lipG, opacity: '.95' }, head);
    this.mouth = {
      lips,
      inner: el('path', { fill: '#3a1214' }, head),
      teeth: el('path', { fill: '#f6f3ec' }, head),
      line: el('path', { fill: 'none', stroke: shade(L.lips, -38), 'stroke-width': '1.6', 'stroke-linecap': 'round' }, head),
    };
    if (L.beard) el('path', { d: 'M176 239 C188 232 212 232 224 239 C214 242 186 242 176 239 Z', fill: L.hair, opacity: '.8' }, head);
    // hair front + shine
    el('path', { d: hairDef.front, fill: hair }, head);
    el('path', { d: hairDef.shine, fill: 'none', stroke: '#fff', 'stroke-width': '5', opacity: '.12', 'stroke-linecap': 'round' }, head);
    if (L.glasses) {
      const gl = el('g', { fill: 'rgba(255,255,255,.08)', stroke: L.glassesColor || '#1d1d1f', 'stroke-width': '3.4' }, head);
      el('rect', { x: '142', y: '162', width: '48', height: '35', rx: '11' }, gl);
      el('rect', { x: '210', y: '162', width: '48', height: '35', rx: '11' }, gl);
      el('path', { d: 'M190 176 Q200 170 210 176', fill: 'none' }, gl);
      el('path', { d: 'M142 172 L123 168 M258 172 L277 168', fill: 'none' }, gl);
      el('path', { d: 'M150 168 L160 166', stroke: '#fff', 'stroke-width': '2', opacity: '.35' }, head);
    }
    this.host.replaceChildren(svg);
    this.svg = svg;
    this.bodyEl = svg.querySelector('.av-body');
    this._renderFace();
  }

  /** Change facial expression (smoothly animated). */
  setExpression(name) {
    if (!EXPRESSIONS[name]) return;
    this.exprName = name;
    this.expr = EXPRESSIONS[name];
    this.host.dataset.expression = name;
  }

  /** A single nod (agreement / acknowledgement). */
  nod() { this.nodStart = performance.now(); }

  setState(s) {
    this.state = s;
    this.host.dataset.state = s;
    if (s !== 'speaking') { this.timeline = null; this.target = VISEMES.rest; }
    if (s === 'listening') this.setExpression('listening');
    else if (s === 'thinking') this.setExpression('thinking');
    else if (s === 'idle' && this.exprName !== 'pleased' && this.exprName !== 'concerned') this.setExpression('warm');
  }

  /** Start a lip-sync timeline for `text` lasting about `durationMs`. */
  startSpeech(text, durationMs, expression = /\?\s*$/.test(text) ? 'curious' : 'warm') {
    this.timeline = { chars: [...text], start: performance.now(), duration: Math.max(400, durationMs), offset: 0 };
    this.state = 'speaking';
    this.host.dataset.state = 'speaking';
    this.setExpression(expression);
    this.browPulse = 1;
  }

  /** Resync timeline to the TTS engine's current character position. */
  syncToChar(charIndex) {
    const tl = this.timeline;
    if (!tl) return;
    const expected = (charIndex / tl.chars.length) * tl.duration;
    tl.offset = expected - (performance.now() - tl.start);
    if (Math.random() < 0.2) this.browPulse = 1;
  }

  endSpeech() {
    this.timeline = null;
    this.target = VISEMES.rest;
  }

  _tick(t) {
    if (!this.svg.isConnected) return; // stopped
    if (this.timeline) {
      const tl = this.timeline;
      const p = (t - tl.start + tl.offset) / tl.duration;
      if (p >= 1.05) this.target = VISEMES.rest;
      else {
        const idx = Math.min(tl.chars.length - 1, Math.max(0, Math.floor(p * tl.chars.length)));
        this.target = VISEMES[visemeForChar(tl.chars[idx])];
        if (Math.random() < 0.01) this.browPulse = 1;
      }
    }
    const k = 0.35, ke = 0.08;
    for (const key of ['w', 'open', 'round']) this.cur[key] += (this.target[key] - this.cur[key]) * k;
    // while talking, smile is damped so the mouth shapes stay readable
    const smileTarget = this.timeline ? Math.min(this.expr.smile, 1.2) : this.expr.smile;
    this.cur.smile += (smileTarget - this.cur.smile) * ke;
    for (const key of ['brow', 'frown', 'squint', 'tilt']) this.cur[key] += (this.expr[key] - this.cur[key]) * ke;
    this.browPulse *= 0.93;
    this._renderFace();

    // Blink (squint narrows the eyes)
    let lidScale = 1 - this.cur.squint * 0.35;
    if (t > this.nextBlink) { this.blinkStart = t; this.nextBlink = t + 2200 + Math.random() * 3800; }
    const bt = t - this.blinkStart;
    if (bt < 160) lidScale = Math.min(lidScale, Math.max(0.08, Math.abs(1 - bt / 80)));

    // Gaze
    if (t > this.nextSaccade) {
      const r = this.state === 'listening' ? 1.1 : 2.4;
      this.gaze.tx = (Math.random() * 2 - 1) * r;
      this.gaze.ty = (Math.random() * 2 - 1) * r * 0.5;
      if (this.exprName === 'thinking') { this.gaze.tx = 3.4; this.gaze.ty = -3; }
      this.nextSaccade = t + 700 + Math.random() * 2400;
    }
    this.gaze.x += (this.gaze.tx - this.gaze.x) * 0.25;
    this.gaze.y += (this.gaze.ty - this.gaze.y) * 0.25;
    for (const e of this.eyes) {
      e.lid.setAttribute('transform', `translate(0 ${180 * (1 - lidScale)}) scale(1 ${lidScale})`);
      e.iris.setAttribute('transform', `translate(${this.gaze.x} ${this.gaze.y})`);
      e.lower.setAttribute('transform', `translate(0 ${-this.cur.squint * 6})`);
    }

    // Brows: raise (curious) and inner frown (concerned / thinking)
    const raise = (this.cur.brow + this.browPulse * 0.6) * 5;
    const fr = this.cur.frown * 7;
    this.browL.setAttribute('d', `M146 ${156 - raise} Q166 ${145 - raise - fr * 0.3} 186 ${153 - raise + fr}`);
    this.browR.setAttribute('d', `M214 ${153 - raise + fr} Q234 ${145 - raise - fr * 0.3} 254 ${156 - raise}`);
    this.cheeks.setAttribute('transform', `translate(0 ${-Math.max(0, this.cur.smile) * 1.4})`);
    this.smileLines.setAttribute('opacity', String(Math.max(0, (this.cur.smile - 1.4) * 0.35)));

    // Head motion, nods while listening
    const s = t / 1000;
    const speaking = this.state === 'speaking';
    const amp = speaking ? 1.6 : 0.8;
    let rot = Math.sin(s * 0.7) * amp + Math.sin(s * 1.9) * (speaking ? 0.7 : 0.2) + this.cur.tilt;
    let dy = Math.sin(s * 1.3) * (speaking ? 1.6 : 0.8);
    if (this.state === 'listening' && t > this.nextNod) { this.nod(); this.nextNod = t + 4000 + Math.random() * 6000; }
    const nt = (t - this.nodStart) / 700;
    if (nt >= 0 && nt < 1) dy += Math.sin(nt * Math.PI * 2) * 5;
    this.headEl.setAttribute('transform', `rotate(${rot.toFixed(2)} 200 300) translate(0 ${dy.toFixed(2)})`);
    this.bodyEl.setAttribute('transform', `translate(0 ${(Math.sin(s * 1.6) * 1.4).toFixed(2)})`);

    this._raf = requestAnimationFrame(tt => this._tick(tt));
  }

  _renderFace() {
    const m = mouthPaths(this.cur);
    this.mouth.lips.setAttribute('d', m.lips);
    this.mouth.inner.setAttribute('d', m.inner);
    this.mouth.teeth.setAttribute('d', m.teeth);
    this.mouth.line.setAttribute('d', m.line);
    this.mouth.inner.style.opacity = m.showInner ? '1' : '0';
    this.mouth.teeth.style.opacity = m.showTeeth ? '1' : '0';
    this.mouth.line.style.opacity = m.showInner ? '0' : '1';
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    this.host.replaceChildren();
  }
}

/**
 * Interviewer from a photo the user supplied (their own or a licensed image).
 * The photo gets subtle breathing/sway, nods while listening, a speaking glow
 * and expression-dependent framing; captions carry the words.
 */
export class PhotoAvatar {
  constructor(host, persona) {
    this.host = host;
    this.persona = persona;
    this.state = 'idle';
    this.exprName = 'warm';
    this.speaking = false;
    this.nodStart = -1e9;
    this.nextNod = performance.now() + 3000;
    const wrap = document.createElement('div');
    wrap.className = 'photo-avatar';
    const img = document.createElement('img');
    img.src = persona.photo;
    img.alt = `${persona.name}, interviewer`;
    wrap.appendChild(img);
    host.replaceChildren(wrap);
    this.wrap = wrap; this.img = img;
    this._raf = requestAnimationFrame(t => this._tick(t));
  }
  setExpression(name) { this.exprName = name; this.host.dataset.expression = name; }
  nod() { this.nodStart = performance.now(); }
  setState(s) { this.state = s; this.host.dataset.state = s; if (s === 'listening') this.setExpression('listening'); if (s === 'thinking') this.setExpression('thinking'); }
  startSpeech(text) { this.speaking = true; this.host.dataset.state = 'speaking'; this.setExpression(/\?\s*$/.test(text) ? 'curious' : 'warm'); }
  syncToChar() { /* no lip-sync on photos */ }
  endSpeech() { this.speaking = false; }
  _tick(t) {
    if (!this.wrap.isConnected) return;
    const s = t / 1000;
    let rot = Math.sin(s * 0.6) * (this.speaking ? 0.9 : 0.4);
    let dy = Math.sin(s * 1.5) * 1.2;
    let scale = 1.03 + Math.sin(s * 1.6) * 0.004 + (this.speaking ? Math.abs(Math.sin(s * 9)) * 0.004 : 0);
    if (this.exprName === 'curious') rot += 0.8;
    if (this.exprName === 'thinking') rot += 1.4;
    if (this.state === 'listening' && t > this.nextNod) { this.nod(); this.nextNod = t + 4000 + Math.random() * 6000; }
    const nt = (t - this.nodStart) / 700;
    if (nt >= 0 && nt < 1) dy += Math.sin(nt * Math.PI * 2) * 4;
    this.img.style.transform = `translateY(${dy.toFixed(2)}px) rotate(${rot.toFixed(2)}deg) scale(${scale.toFixed(4)})`;
    this._raf = requestAnimationFrame(tt => this._tick(tt));
  }
  destroy() { cancelAnimationFrame(this._raf); this.host.replaceChildren(); }
}

/** Lighten (+) or darken (-) a hex colour by percent. */
export function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + (pct / 100) * (pct > 0 ? 255 - c : c))));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
