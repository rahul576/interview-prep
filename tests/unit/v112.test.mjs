import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mouthOpenFromLevel, followEnvelope, ladderBlend, VOICE_SMOOTHING } from '../../www/js/ui/avatar.js';

test('mouth opening: silent closed, louder opens more, capped', () => {
  assert.equal(mouthOpenFromLevel(0), 0);
  assert.equal(mouthOpenFromLevel(0.01), 0);
  assert.ok(mouthOpenFromLevel(0.05) > 0 && mouthOpenFromLevel(0.05) < mouthOpenFromLevel(0.1));
  assert.equal(mouthOpenFromLevel(0.5), 1);
});

test('jaw-like envelope: opens fast, closes slower, frame-rate independent', () => {
  const up = followEnvelope(0, 0.2, 1 / 60), down = 0.2 - followEnvelope(0.2, 0, 1 / 60);
  assert.ok(up > down, 'opens faster than it closes');
  let a = 0; for (let i = 0; i < 6; i++) a = followEnvelope(a, 0.2, 1 / 60);
  let b = 0; for (let i = 0; i < 3; i++) b = followEnvelope(b, 0.2, 1 / 30);
  assert.ok(Math.abs(a - b) < 1e-9, 'same result at 60 and 30 fps');
  assert.ok(VOICE_SMOOTHING.tauR > VOICE_SMOOTHING.tauA);
});

test('ladder blend picks the two neighbouring real frames', () => {
  const open = [0, 0.2, 0.5, 1];
  assert.deepEqual(ladderBlend(open, 0), [0, 0]);
  const [k, f] = ladderBlend(open, 0.35); assert.equal(k, 1); assert.ok(Math.abs(f - 0.5) < 1e-9);
  assert.deepEqual(ladderBlend(open, 1), [2, 1]);
});

test('talking-head rig: face position per base frame, monotone mouth ladder, blink frames', () => {
  const rig = JSON.parse(readFileSync(new URL('../../www/img/interviewers/ananya-rig.json', import.meta.url)));
  assert.equal(rig.frames.length, 366);
  for (const f of rig.frames) { assert.equal(f.length, 6); assert.ok(Math.abs(f[0] - 1) < 0.15 && Math.abs(f[3] - 1) < 0.15); }
  const o = rig.mouth.open;
  assert.equal(o[0], 0); assert.equal(o[o.length - 1], 1);
  for (let i = 1; i < o.length; i++) assert.ok(o[i] > o[i - 1], 'opening increases along the ladder');
  assert.equal(rig.mouth.ladder.length, o.length);
  assert.equal(rig.eyes.seq.length, 3);
});
