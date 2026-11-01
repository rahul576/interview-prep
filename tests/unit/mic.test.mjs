import test from 'node:test';
import assert from 'node:assert/strict';
import { sttErrorHelp } from '../../www/js/services/speech.js';

test('every speech-recognition error code has an actionable explanation', () => {
  const cases = {
    'not-allowed': /allow Microphone/,
    'service-not-allowed': /Dictation/,
    network: /Chrome, Edge or Safari/,
    'audio-capture': /Pick the right microphone/,
    'language-not-supported': /English/,
    'restart-limit': /microphone input/,
    unsupported: /Firefox/,
  };
  for (const [code, re] of Object.entries(cases)) assert.match(sttErrorHelp(code), re, code);
  assert.match(sttErrorHelp('weird'), /weird/);
});
