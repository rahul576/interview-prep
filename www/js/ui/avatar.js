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
/**
 * Photo interviewer. With `persona.face` landmarks (pixel positions in the photo) the photo really
 * talks: the jaw opens with the loudness of the voice, a mouth opening appears behind the lips,
 * the eyes blink and the head moves a little. Without landmarks only the head moves.
 *
 * Loudness comes from `levelSource()` (the natural voice's audio analyser). For voices without
 * audio access (the system voice) a syllable-like rhythm is synthesised while speaking.
 */
export class PhotoAvatar {
  constructor(host, persona, { levelSource = null } = {}) {
    this.host = host;
    this.persona = persona;
    this.face = persona.face || null;
    this.levelSource = levelSource;
    this.state = 'idle';
    this.exprName = 'warm';
    this.speaking = false;
    this.open = 0; // smoothed jaw opening in source pixels
    this.nodStart = -1e9;
    this.nextNod = performance.now() + 3000;
    this.nextBlink = performance.now() + 1500 + Math.random() * 2500;
    this.blinkStart = -1e9;
    this.speechStart = 0;
    const wrap = document.createElement('div');
    wrap.className = 'photo-avatar';
    // blurred copy of the photo fills the space around the portrait in wide video areas
    // (absolute URL: a relative one would resolve against the stylesheet's folder)
    let photoUrl = String(persona.photo);
    try { photoUrl = new URL(photoUrl, document.baseURI).href; } catch { /* data: URLs etc. */ }
    wrap.style.setProperty('--photo', `url("${photoUrl.replace(/"/g, '%22')}")`);
    this.wrap = wrap;
    this.img = new Image();
    this.img.alt = `${persona.name}, interviewer`;
    this.img.decoding = 'async';
    this.img.src = persona.photo;
    if (this.face) {
      this.canvas = document.createElement('canvas');
      this.canvas.setAttribute('role', 'img');
      this.canvas.setAttribute('aria-label', this.img.alt);
      this.g = this.canvas.getContext('2d');
      wrap.appendChild(this.canvas);
      this.img.onload = () => { this.canvas.width = this.img.naturalWidth; this.canvas.height = this.img.naturalHeight; this._draw(0); };
    } else wrap.appendChild(this.img);
    host.replaceChildren(wrap);
    this.el = this.canvas || this.img;
    this._raf = requestAnimationFrame(t => this._tick(t));
  }
  setExpression(name) { this.exprName = name; this.host.dataset.expression = name; }
  nod() { this.nodStart = performance.now(); }
  setState(s) { this.state = s; this.host.dataset.state = s; if (s === 'listening') this.setExpression('listening'); if (s === 'thinking') this.setExpression('thinking'); }
  startSpeech(text) { this.speaking = true; this.speechStart = performance.now(); this.host.dataset.state = 'speaking'; this.setExpression(/\?\s*$/.test(text) ? 'curious' : 'warm'); }
  syncToChar() { this.lastBoundary = performance.now(); }
  endSpeech() { this.speaking = false; }

  /** Loudness 0..1 of the voice right now. */
  _level(t) {
    if (!this.speaking) return 0;
    const real = this.levelSource ? this.levelSource() : null;
    if (real !== null && real !== undefined) return Math.min(1, real * 3.2);
    // Synthesised rhythm: ~4.5 syllables per second with pauses, like speech.
    const s = (t - this.speechStart) / 1000;
    const syll = Math.max(0, Math.sin(s * Math.PI * 9.2) * 0.6 + Math.sin(s * Math.PI * 5.3 + 1) * 0.4);
    const phrase = 0.55 + 0.45 * Math.sin(s * 1.7);
    return syll * phrase;
  }

  _tick(t) {
    if (!this.wrap.isConnected) return;
    const s = t / 1000;
    // Jaw follows loudness: opens fast, closes a little slower (like real speech).
    const target = this.face ? this._level(t) * this.face.maxOpen : 0;
    this.open += (target - this.open) * (target > this.open ? 0.55 : 0.32);
    if (!this.speaking && this.open < 0.05) this.open = 0;
    // V1.11: the photo itself never moves (rotating/scaling a still photo looks like shaking, not a person).
    void s;
    if (this.face && this.canvas.width) {
      if (t > this.nextBlink) { this.blinkStart = t; this.nextBlink = t + 2500 + Math.random() * 4000 + (Math.random() < 0.15 ? -2000 : 0); }
      const bt = (t - this.blinkStart) / 160; // a blink lasts ~160 ms
      const blink = bt >= 0 && bt < 1 ? Math.sin(bt * Math.PI) : 0;
      this._draw(this.open, blink);
    }
    this._raf = requestAnimationFrame(tt => this._tick(tt));
  }

  /** Draw the photo with the jaw opened by `open` pixels and eyes closed by `blink` (0..1). */
  _draw(open, blink = 0) {
    const g = this.g, f = this.face, img = this.img;
    if (!img.complete || !img.naturalWidth) return;
    const W = img.naturalWidth, H = img.naturalHeight;
    g.drawImage(img, 0, 0);
    if (open > 0.3) {
      const m = f.mouth;
      const x0 = f.jaw.x0, x1 = f.jaw.x1, top = m.y, chin = f.chin, neck = f.neckEnd;
      // How far each column of the jaw moves: full at the mouth centre, easing to 0 at the jaw edges.
      const half = (x1 - x0) / 2, cx = m.x;
      const weight = (x) => { const d = Math.min(1, Math.abs(x - cx) / half); return Math.pow(Math.cos(d * Math.PI / 2), 1.6); };
      // 1) jaw: each 2px column from the lip seam down moves by its weight; the seam stretches (no gaps),
      //    and the neck below compresses so everything stays attached
      const step = 2, seam = top - 1;
      for (let x = x0; x < x1; x += step) {
        const off = open * weight(x + step / 2);
        if (off < 0.15) continue;
        g.drawImage(img, x, seam, step, chin - seam, x, seam, step, chin - seam + off);
        g.drawImage(img, x, chin, step, neck - chin, x, chin + off, step, neck - chin - off);
      }
      // 2) the opening between the lips (dark, with a hint of upper teeth), soft-edged
      const rx = m.w / 2 * (0.66 + 0.12 * Math.min(1, open / f.maxOpen));
      g.save();
      g.beginPath();
      g.ellipse(m.x, m.y + open * 0.5, rx, open * 0.5, 0, 0, Math.PI * 2);
      g.clip();
      const grad = g.createRadialGradient(m.x, m.y + open * 0.5, 0.5, m.x, m.y + open * 0.5, rx);
      grad.addColorStop(0, 'rgba(34,10,12,0.96)'); grad.addColorStop(0.65, 'rgba(60,20,22,0.92)'); grad.addColorStop(1, 'rgba(95,45,47,0.55)');
      g.fillStyle = grad;
      g.fillRect(m.x - rx, m.y - 1, rx * 2, open + 2);
      if (open > 3) {
        const th = Math.min(2.2, open * 0.22);
        const tg = g.createLinearGradient(0, m.y, 0, m.y + th);
        tg.addColorStop(0, 'rgba(225,214,204,0.45)'); tg.addColorStop(1, 'rgba(225,214,204,0)');
        g.fillStyle = tg;
        g.fillRect(m.x - rx * 0.55, m.y, rx * 1.1, th);
      }
      g.restore();
    }
    if (blink > 0.05 && f.eyes) {
      // eyelids: slide the skin just above each eye down over it
      for (const e of f.eyes) {
        const lidH = (e.h + 2) * blink;
        g.save();
        g.beginPath(); g.ellipse(e.x, e.y, e.w / 2, e.h / 2 + 1.5, 0, 0, Math.PI * 2); g.clip(); // eye-shaped
        g.drawImage(img, e.x - e.w / 2, e.y - e.h / 2 - 6, e.w, 5, e.x - e.w / 2, e.y - e.h / 2 - 1.5, e.w, lidH + 1);
        if (blink > 0.6) { // lash line where the lids meet
          g.strokeStyle = 'rgba(40,26,22,0.55)'; g.lineWidth = 1.1;
          g.beginPath(); g.ellipse(e.x, e.y - e.h / 2 - 1.5 + lidH * 0.92, e.w * 0.46, 1.6, 0, 0, Math.PI); g.stroke();
        }
        g.restore();
      }
    }
  }
  destroy() { cancelAnimationFrame(this._raf); this.host.replaceChildren(); }
}

// ------------------------------------------------------------------ V1.12 talking head (V1.13 lip sync)
// A real-looking interviewer that speaks in sync with her voice. Everything was made offline from
// the interviewer's portrait (see docs/interviewer-video.md):
//  - base video: the portrait animated by LivePortrait (an open portrait-animation model) with calm,
//    natural head movement and no blinks, played as a seamless loop;
//  - rig.json: for every frame of that video, where the face is (an affine transform from the
//    portrait to the frame, measured with image alignment, smoothed over time);
//  - face sprite: one continuous real mouth-opening movement from her animated footage (closed ->
//    open, frames 33 ms apart, so neighbouring shapes match in expression, teeth and light) and three
//    eyelid frames, all with soft edges.
// At run time the loudness of the voice is smoothed like a real jaw (fast to open, slower to close,
// about 4 syllable movements per second) and turned into a mouth opening; the two neighbouring real
// frames are blended, so the lips move smoothly with every syllable and never flicker between
// unrelated shapes. Blinks are added every 2.5 to 7 seconds. Works offline, no model at run time.
const assetCache = new Map();
function cached(key, make) {
  if (!assetCache.has(key)) assetCache.set(key, make().catch((e) => { assetCache.delete(key); throw e; }));
  return assetCache.get(key);
}
const blobUrl = (url) => cached(url, () => fetch(url).then(r => { if (!r.ok) throw new Error(`${url} ${r.status}`); return r.blob(); }).then(b => URL.createObjectURL(b)));
const jsonOf = (url) => cached(url, () => fetch(url).then(r => { if (!r.ok) throw new Error(`${url} ${r.status}`); return r.json(); }));
const imageOf = (url) => cached('img:' + url, () => blobUrl(url).then(src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; })));

/** File extension of the video format this browser plays: H.264 MP4 (Safari, Chrome, Edge) or VP9 WebM. */
export function clipFormat() {
  if (typeof document === 'undefined') return null;
  const v = document.createElement('video');
  if (v.canPlayType('video/mp4; codecs="avc1.4D401E"')) return '.mp4';
  if (v.canPlayType('video/webm; codecs="vp9"')) return '.webm';
  return null;
}

/** Voice smoothing tuned on real interviewer speech (see docs/interviewer-video.md). */
export const VOICE_SMOOTHING = { tauA: 0.035, tauR: 0.08, floor: 0.01, range: 0.14, gamma: 1.0 };

/** Smoothed voice envelope -> mouth opening 0..1. */
export function mouthOpenFromLevel(env, P = VOICE_SMOOTHING) {
  return Math.pow(Math.max(0, Math.min(1, (env - P.floor) / P.range)), P.gamma);
}

/** One step of the jaw-like envelope follower (dt in seconds): opens fast, closes a bit slower. */
export function followEnvelope(env, level, dt, P = VOICE_SMOOTHING) {
  const tau = level > env ? P.tauA : P.tauR;
  return env + (level - env) * (1 - Math.exp(-dt / tau));
}

/** Which two ladder frames to blend for opening x, and how much of the second. */
export function ladderBlend(open, x) {
  let k = 0;
  while (k < open.length - 2 && x >= open[k + 1]) k++;
  const f = Math.max(0, Math.min(1, (x - open[k]) / (open[k + 1] - open[k])));
  return [k, f];
}

export class TalkingHead {
  constructor(host, persona, { levelSource = null } = {}) {
    this.host = host;
    this.persona = persona;
    this.levelSource = levelSource;
    this.speaking = false;
    this.ready = false;
    this.env = 0;         // jaw-like smoothed voice loudness
    this.open = 0;        // mouth opening 0..1
    this.lastT = 0;
    this._pauseAt = 0;
    this.frame = 0;       // current base-video frame
    this.blinks = 0;
    this.speechStart = 0;
    this.nextBlink = performance.now() + 1500 + Math.random() * 2500;
    this.blinkStart = -1e9;
    this.doubleBlink = false;
    const wrap = document.createElement('div');
    wrap.className = 'photo-avatar talking-head';
    let photoUrl = String(persona.photo);
    try { photoUrl = new URL(photoUrl, document.baseURI).href; } catch { /* keep */ }
    wrap.style.setProperty('--photo', `url("${photoUrl.replace(/"/g, '%22')}")`);
    this.wrap = wrap;
    this.img = new Image();
    this.img.alt = `${persona.name}, interviewer`;
    this.img.decoding = 'async';
    this.img.src = persona.photo;
    this.img.className = 'th-still';
    wrap.appendChild(this.img);
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'th-canvas';
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', this.img.alt);
    wrap.appendChild(this.canvas);
    const v = document.createElement('video');
    v.className = 'th-video';
    v.muted = true; v.defaultMuted = true; v.loop = true; v.playsInline = true;
    v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
    this.video = v;
    wrap.appendChild(v);
    host.replaceChildren(wrap);
    this._load();
  }

  async _load() {
    try {
      const r = this.persona.rig, ext = clipFormat();
      // (sprite cells are laid out in one row, cell[0] wide)
      const [meta, sprite, src] = await Promise.all([jsonOf(r.meta), imageOf(r.sprite), blobUrl(r.base + ext)]);
      if (!this.host.contains(this.wrap)) return;
      this.meta = meta; this.sprite = sprite;
      this.canvas.width = meta.size; this.canvas.height = meta.size;
      this.g = this.canvas.getContext('2d');
      this.video.src = src;
      await new Promise((res, rej) => { this.video.onloadeddata = res; this.video.onerror = rej; });
      // Listening: head still (paused on a frame), only blinks. Speaking: natural head movement plays.
      await new Promise((res) => { this.video.onseeked = res; try { this.video.currentTime = Math.random() * Math.max(0, (this.video.duration || 0) - 1); } catch { res(); } setTimeout(res, 1500); });
      if (this.speaking) this.video.play().catch(() => {});
      const onFrame = (now, md) => { this.frame = Math.round(md.mediaTime * meta.fps) % meta.frames.length; this._vfc = this.video.requestVideoFrameCallback(onFrame); };
      if (this.video.requestVideoFrameCallback) this._vfc = this.video.requestVideoFrameCallback(onFrame);
      this.ready = true;
      this._raf = requestAnimationFrame(t => this._tick(t));
    } catch { /* keep the still portrait */ }
  }

  /** Loudness (RMS) of the voice right now: real audio when available, otherwise a speech-like rhythm. */
  _level(t) {
    if (!this.speaking) return 0;
    const real = this.levelSource ? this.levelSource() : null;
    if (real !== null && real !== undefined) return real;
    const s = (t - this.speechStart) / 1000;
    const syl = Math.max(0, Math.sin(2 * Math.PI * 4.2 * s + Math.sin(s * 1.9) * 1.2));
    return 0.17 * Math.pow(syl, 0.8) * (0.65 + 0.35 * Math.sin(s * 1.3)) * (Math.sin(s * 0.9) > -0.85 ? 1 : 0.1);
  }

  _tick(t) {
    if (!this.wrap.isConnected) { this._stop(); return; }
    const m = this.meta, g = this.g;
    if (!this.video.requestVideoFrameCallback || this.video.paused) this.frame = Math.round(this.video.currentTime * m.fps) % m.frames.length;
    if (!this.speaking && !this.video.paused && t > this._pauseAt) this.video.pause();   // she is listening again
    // mouth: jaw-like envelope of the voice -> opening -> blend of two neighbouring real frames
    const dt = Math.min(0.1, Math.max(0.001, (t - (this.lastT || t - 16)) / 1000));
    this.lastT = t;
    const P = m.voice || VOICE_SMOOTHING;
    this.env = followEnvelope(this.env, this._level(t), dt, P);
    this.open = this.speaking || this.env > 0.002 ? mouthOpenFromLevel(this.env, P) : 0;
    // blinks: natural rate, sometimes a double blink, a little less often while speaking
    if (t > this.nextBlink) {
      this.blinkStart = t; this.blinks++;
      this.doubleBlink = Math.random() < 0.12;
      this.nextBlink = t + (this.doubleBlink ? 420 : 0) + (this.speaking ? 3000 : 2500) + Math.random() * 4500;
    }
    let bt = t - this.blinkStart;
    if (this.doubleBlink && bt > 240 && bt < 460) bt -= 240;
    const eyeFrame = bt < 0 || bt > 190 ? -1 : bt < 40 ? 0 : bt < 75 ? 1 : bt < 120 ? 2 : bt < 155 ? 1 : 0;
    // draw
    const A = m.frames[this.frame] || m.frames[0];
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.video, 0, 0, m.size, m.size);
    const [k, f] = ladderBlend(m.mouth.open, this.open);
    this._patch(A, m.mouth.box, m.mouth.ladder[k], 1);
    if (f > 0.01) this._patch(A, m.mouth.box, m.mouth.ladder[k + 1], f);
    if (eyeFrame >= 0) this._patch(A, m.eyes.box, m.eyes.seq[eyeFrame], 1);
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
    if (!this.wrap.classList.contains('th-ready')) this.wrap.classList.add('th-ready');
    this.wrap.dataset.mouth = String(Math.round(this.open * 10));
    this._raf = requestAnimationFrame(tt => this._tick(tt));
  }

  /** Draw one sprite cell (portrait coordinates `box`) onto the face of the current frame. */
  _patch(A, [x, y, w, h], cell, alpha) {
    const g = this.g, cw = this.meta.cell[0];
    g.setTransform(A[0], A[1], A[2], A[3], A[4], A[5]);
    g.globalAlpha = alpha;
    g.drawImage(this.sprite, cell * cw, 0, w, h, x, y, w, h);
  }

  setExpression(name) { this.host.dataset.expression = name; }
  nod() {}
  setState(s) { this.host.dataset.state = s; if (s !== 'speaking' && this.speaking) this.endSpeech(); }
  startSpeech() {
    this.speaking = true; this.speechStart = performance.now(); this.host.dataset.state = 'speaking';
    if (this.ready && this.video.paused) this.video.play().catch(() => {});
  }
  syncToChar() {}
  endSpeech() { this.speaking = false; this._pauseAt = performance.now() + 350; /* let the mouth close first */ }
  _stop() {
    cancelAnimationFrame(this._raf);
    if (this._vfc && this.video.cancelVideoFrameCallback) this.video.cancelVideoFrameCallback(this._vfc);
    try { this.video.pause(); this.video.removeAttribute('src'); this.video.load(); } catch { /* ignore */ }
  }
  destroy() { this._stop(); this.host.replaceChildren(); }
}

/** The best avatar for a persona: the talking head when it has one, otherwise the still photo. */
export function createAvatar(host, persona, opts = {}) {
  if (persona.rig && clipFormat() && typeof HTMLCanvasElement !== 'undefined') return new TalkingHead(host, persona, opts);
  return new PhotoAvatar(host, persona, opts);
}

/** Lighten (+) or darken (-) a hex colour by percent. */
export function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + (pct / 100) * (pct > 0 ? 255 - c : c))));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
