// Verifies the native-project patcher on copies of the Capacitor templates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { patchAndroidManifest, patchInfoPlist, ANDROID_PERMISSIONS, IOS_KEYS } from '../../scripts/patch-native.mjs';

const fx = (n) => readFile(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const xmllintOk = (() => { try { execFileSync('xmllint', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const wellFormed = (xml) => {
  if (!xmllintOk) return true;
  const f = join(mkdtempSync(join(tmpdir(), 'ip-')), 'x.xml');
  writeFileSync(f, xml);
  execFileSync('xmllint', ['--noout', '--nonet', f], { stdio: 'pipe' });
  return true;
};

test('Android manifest gets every permission once, stays well-formed, idempotent', async () => {
  const once = patchAndroidManifest(await fx('AndroidManifest.xml'));
  for (const p of ANDROID_PERMISSIONS) assert.equal(once.split(`android:name="${p}"`).length - 1, 1, p);
  assert.ok(once.includes('android.speech.RecognitionService'));
  assert.ok(once.trim().endsWith('</manifest>'));
  assert.equal(patchAndroidManifest(once), once, 'idempotent');
  assert.ok(wellFormed(once));
});

test('iOS Info.plist gets usage descriptions and iPad orientations, idempotent', async () => {
  const once = patchInfoPlist(await fx('Info.plist'));
  for (const k of Object.keys(IOS_KEYS)) assert.equal(once.split(`<key>${k}</key>`).length - 1, 1, k);
  assert.ok(once.includes('UISupportedInterfaceOrientations~ipad'));
  assert.ok(once.includes('UIInterfaceOrientationLandscapeLeft'));
  assert.equal(patchInfoPlist(once), once, 'idempotent');
  assert.ok(wellFormed(once));
});
