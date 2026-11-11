import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserVoiceOptions, SpeechService, pickVoice, BROWSER_PREFIX } from '../../www/js/services/speech.js';

const VOICES = [
  { name: 'Google US English', lang: 'en-US', localService: false },
  { name: 'Google UK English Female', lang: 'en-GB', localService: false },
  { name: 'Google UK English Male', lang: 'en-GB', localService: false },
  { name: 'Google Deutsch', lang: 'de-DE', localService: false },
  { name: 'Samantha', lang: 'en-US', localService: true },
  { name: 'Rishi', lang: 'en-IN', localService: true },
];

test('Google voices are offered in their own group, English only, plus other device voices', () => {
  const { google, other } = browserVoiceOptions(VOICES);
  assert.deepEqual(google.map(v => v.name).sort(), ['Google UK English Female', 'Google UK English Male', 'Google US English']);
  assert.deepEqual(other.map(v => v.name).sort(), ['Rishi', 'Samantha']);
  assert.ok(google.every(v => v.id.startsWith(BROWSER_PREFIX) && v.online));
});

test('a chosen Google voice is used for speaking; missing voices fall back to the natural default', () => {
  const sp = new SpeechService();
  sp.voices = VOICES;
  sp.voiceName = 'browser:Google UK English Female';
  assert.equal(sp.resolveVoice('female'), 'browser:Google UK English Female');
  assert.equal(sp._browserPreferred(), 'Google UK English Female');
  assert.equal(pickVoice(VOICES, { gender: 'male', preferred: sp._browserPreferred() }).name, 'Google UK English Female');
  sp.voiceName = 'Google US English'; // saved by an old version, without the prefix
  assert.equal(sp.resolveVoice('female'), 'browser:Google US English');
  sp.voiceName = 'browser:Microsoft Zira'; // not available in this browser
  assert.equal(sp.resolveVoice('female'), 'kokoro:af_heart');
  sp.voiceName = 'kokoro:am_michael';
  assert.equal(sp.resolveVoice('female'), 'kokoro:am_michael');
  assert.equal(sp._browserPreferred(), null);
});
