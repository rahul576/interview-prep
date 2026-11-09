import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mouthOpenFromLevel } from '../../www/js/ui/avatar.js';

test('mouth opening follows voice loudness: silent closed, louder opens more, capped', () => {
  assert.equal(mouthOpenFromLevel(0), 0);
  assert.equal(mouthOpenFromLevel(0.01), 0);
  assert.ok(mouthOpenFromLevel(0.05) > 0 && mouthOpenFromLevel(0.05) < mouthOpenFromLevel(0.1));
  assert.equal(mouthOpenFromLevel(0.5), 1);
});

test('talking-head rig: one face position per base frame, valid mouth levels and blink frames', () => {
  const rig = JSON.parse(readFileSync(new URL('../../www/img/interviewers/ananya-rig.json', import.meta.url)));
  assert.equal(rig.frames.length, 366);
  for (const f of rig.frames) { assert.equal(f.length, 6); assert.ok(Math.abs(f[0] - 1) < 0.15 && Math.abs(f[3] - 1) < 0.15, 'near-identity scale'); }
  assert.equal(rig.mouth.levels.length, 7);
  const cells = [...rig.mouth.levels.flat(), ...rig.eyes.seq];
  assert.equal(new Set(cells).size, cells.length, 'every cell used once');
  assert.equal(rig.eyes.seq.length, 3);
});
