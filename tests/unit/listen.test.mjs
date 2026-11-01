// Long answers: the browser speech engine ends its session every so often (silence limits, ~60 s caps,
// network hiccups). The listener must restart on the SAME microphone and keep every word.
import test from 'node:test';
import assert from 'node:assert/strict';

const tick = (ms) => new Promise(r => setTimeout(r, ms));

function fakeEngine(script) {
  const log = [];
  let session = 0;
  class FakeRec {
    start(track) {
      const n = ++session; log.push({ n, track: track ? track.label : null });
      const steps = script(n);
      let i = 0;
      const results = [];
      const next = () => {
        if (this._stopped || i >= steps.length) { if (!this._ended) { this._ended = true; this.onend && this.onend(); } return; }
        const s = steps[i++];
        if (s.say) { results.push({ 0: { transcript: s.say }, isFinal: true, length: 1 }); this.onresult({ resultIndex: results.length - 1, results }); }
        if (s.partial) { this.onresult({ resultIndex: results.length, results: [...results, { 0: { transcript: s.partial }, isFinal: false, length: 1 }] }); }
        if (s.error) this.onerror({ error: s.error });
        setTimeout(next, 5);
      };
      setTimeout(next, 5);
    }
    stop() { this._stopped = true; }
    abort() { this._stopped = true; }
  }
  return { FakeRec, log };
}

async function listenWith(script, { track = { label: 'Sound Blaster', readyState: 'live' }, ms = 400 } = {}) {
  const { FakeRec, log } = fakeEngine(script);
  globalThis.window = { webkitSpeechRecognition: FakeRec };
  const { SpeechService } = await import('../../www/js/services/speech.js');
  const sp = new SpeechService({ fast: true });
  let text = '', errors = [];
  const ctl = sp._listenWeb({ onText: t => { text = t; }, onError: e => errors.push(e), track });
  await tick(ms);
  const final = ctl.stop();
  return { text, final, errors, log };
}

test('a 1-minute answer survives engine restarts and a network hiccup, on the chosen mic', async () => {
  const words = Array.from({ length: 12 }, (_, i) => `sentence${i + 1}`);
  const { final, errors, log } = await listenWith((n) => {
    if (n > 6) return [{ partial: '' }, { partial: '' }, { partial: '' }];
    const steps = [{ say: words[(n - 1) * 2] }, { say: words[(n - 1) * 2 + 1] }];
    if (n === 3) steps.push({ error: 'network' });
    return steps;
  });
  assert.deepEqual(errors, []);
  for (const w of words) assert.ok(final.includes(w), `kept ${w}: ${final}`);
  assert.ok(log.length >= 6);
  assert.ok(log.every(s => s.track === 'Sound Blaster'), 'every restart used the selected microphone');
});

test('unfinished (interim) words are kept when the engine session ends', async () => {
  const { final } = await listenWith((n) => n === 1 ? [{ say: 'first part' }, { partial: 'then the rest' }] : [{ partial: '' }]);
  assert.match(final, /first part then the rest/);
});

test('fatal errors stop listening and report once', async () => {
  const { errors } = await listenWith(() => [{ say: 'hello' }, { error: 'not-allowed' }]);
  assert.deepEqual(errors, ['not-allowed']);
});
