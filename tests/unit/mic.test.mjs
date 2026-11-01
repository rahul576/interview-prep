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

test('virtual audio devices are recognised so a real microphone is preferred', async () => {
  const { isVirtualMic } = await import('../../www/js/services/media.js');
  for (const l of ['Microsoft Teams Audio Device (Virtual)', 'ZoomAudioDevice', 'BlackHole 2ch', 'Loopback Audio']) assert.ok(isVirtualMic(l), l);
  for (const l of ['Default - Sound Blaster JAM (Bluetooth)', 'MacBook Pro Microphone', 'AirPods Pro', 'Blue Yeti']) assert.ok(!isVirtualMic(l), l);
});
