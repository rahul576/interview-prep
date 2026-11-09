// V1.8 natural voices: choice resolution, fallback to the system voice, sentence streaming.
import test from 'node:test';
import assert from 'node:assert/strict';
import { NATURAL_VOICES, SYSTEM_VOICE, splitSentences, defaultNaturalVoice, NaturalVoice } from '../../www/js/services/natural-voice.js';
import { SpeechService } from '../../www/js/services/speech.js';

test('exactly four natural voices: two female, two male', () => {
  assert.deepEqual(NATURAL_VOICES.map(v => v.label), ['Heart', 'Bella', 'Michael', 'George']);
  assert.equal(NATURAL_VOICES.filter(v => v.gender === 'female').length, 2);
  assert.equal(defaultNaturalVoice('male'), 'kokoro:am_michael');
  assert.equal(defaultNaturalVoice('female'), 'kokoro:af_heart');
});

test('voice choice: natural by default, old robotic preferences move to natural, system on request', () => {
  const sp = new SpeechService({ fast: true });
  assert.equal(sp.resolveVoice('male'), 'kokoro:am_michael');
  sp.voiceName = 'Google UK English Male'; // saved by an older version
  assert.equal(sp.resolveVoice('female'), 'kokoro:af_heart');
  sp.voiceName = 'kokoro:bm_george';
  assert.equal(sp.resolveVoice('female'), 'kokoro:bm_george');
  sp.voiceName = SYSTEM_VOICE;
  assert.equal(sp.resolveVoice('female'), SYSTEM_VOICE);
});

test('sentences are split so speech can start after the first one', () => {
  const parts = splitSentences('Hi Rahul. Thanks for joining! What is Docker? Explain images, containers and layers in detail please.');
  assert.ok(parts.length >= 1 && parts.join(' ').includes('What is Docker?'));
  const long = splitSentences('One. Two. Three. Four.', 8);
  assert.deepEqual(long, ['One.', 'Two.', 'Three.', 'Four.']);
});

function fakeAudio() {
  const played = [];
  globalThis.window = globalThis.window || {};
  class Ctx {
    constructor() { this.currentTime = 0; this.state = 'running'; this.destination = {}; }
    resume() { return Promise.resolve(); }
    createBuffer(ch, len, rate) { return { len, rate, copyToChannel() {} }; }
    createBufferSource() { const src = { connect() {}, start() { played.push(src.buffer.len); setTimeout(() => src.onended && src.onended(), 5); }, stop() { src.onended && src.onended(); } }; return src; }
  }
  window.AudioContext = Ctx;
  return played;
}

test('natural voice streams sentence by sentence with lip-sync callbacks', async () => {
  const played = fakeAudio();
  const nv = new NaturalVoice();
  const gens = [];
  nv.tts = { generate: async (text, o) => { gens.push([text, o.voice, o.speed]); return { audio: new Float32Array(text.length * 100), sampling_rate: 24000 }; } };
  nv.state = 'ready';
  let started = 0; const marks = [];
  await nv.speak('First sentence here. Second one follows!', { voice: 'af_bella', speed: 1.2, onStart: (ms) => { started = ms; }, onBoundary: (i) => marks.push(i) });
  assert.equal(gens.length, 2);
  assert.deepEqual(gens.map(g => g[1]), ['af_bella', 'af_bella']);
  assert.equal(gens[0][2], 1.2);
  assert.equal(played.length, 2);
  assert.ok(started > 0, 'onStart gives the expected duration for the avatar');
});

test('SpeechService uses the natural voice when ready and falls back to the system voice when not', async () => {
  fakeAudio();
  const sp = new SpeechService({ fast: false });
  sp.native = false;
  let natural = 0;
  sp.natural.state = 'ready';
  sp.natural.tts = { generate: async (t) => { natural++; return { audio: new Float32Array(10), sampling_rate: 24000 }; } };
  sp.ttsAvailable = () => false; // no system engine in node: the system path just waits
  await sp.speak('Hello there.', { gender: 'female' });
  assert.equal(natural, 1, 'natural voice used');
  sp.natural.state = 'failed'; sp.natural.tts = null;
  const t = Date.now();
  await sp.speak('Hi.', { gender: 'female' });
  assert.equal(natural, 1, 'system voice used when the natural voice is unavailable');
  assert.ok(Date.now() - t >= 500);
  sp.voiceName = SYSTEM_VOICE; sp.natural.state = 'ready'; sp.natural.tts = { generate: async () => { natural++; return { audio: new Float32Array(10), sampling_rate: 24000 }; } };
  await sp.speak('Hi.', { gender: 'female' });
  assert.equal(natural, 1, 'robotic system voice when the user chose it');
});
