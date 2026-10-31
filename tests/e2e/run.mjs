// End-to-end test: runs complete interviews in headless Chromium with a fake
// camera/microphone on desktop, iPad and Android-tablet viewports, then checks
// the report against scores recomputed independently in Node.
// Usage: node tests/e2e/run.mjs   (needs Playwright + Chromium)
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createServer } from '../../scripts/serve.mjs';
import { QUESTIONS, belongsTo, topicGroup } from '../../www/js/data/questions.js';
import { scoreAnswer, summarize } from '../../www/js/engine/score.js';
import { targetLevels } from '../../www/js/engine/select.js';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }

const PORT = 5321;
const OUT = new URL('../../test-results/', import.meta.url);
await mkdir(OUT, { recursive: true });
const byText = new Map(QUESTIONS.map(q => [q.q, q]));

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'ipad-landscape', width: 1180, height: 820, isMobile: true, hasTouch: true },
  { name: 'ipad-portrait', width: 820, height: 1180, isMobile: true, hasTouch: true },
  { name: 'android-tablet', width: 1280, height: 800, isMobile: true, hasTouch: true },
  { name: 'phone', width: 390, height: 844, isMobile: true, hasTouch: true },
];

const SCENARIOS = [
  { role: 'java-backend', position: 'java-senior', years: 6, mode: 'mixed', count: 8, policy: 'mixed' },
  { role: 'devops', position: 'devops-lead', years: 9, mode: 'technical', count: 5, policy: 'strong', topics: ['Azure', 'Kafka', 'Kubernetes'] },
];

const server = createServer().listen(PORT);
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
let failures = 0;
const log = (...a) => console.log(...a);

async function noHorizontalScroll(page, label) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  assert.ok(sw <= iw + 1, `${label}: horizontal overflow ${sw} > ${iw}`);
}

async function runInterview(vp, sc, idx) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch, permissions: ['camera', 'microphone'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', d => d.accept());
  const tag = `${vp.name}/${sc.role}`;
  const shot = (n) => page.screenshot({ path: new URL(`${vp.name}-${sc.role}-${n}.png`, OUT).pathname });

  await page.goto(`http://localhost:${PORT}/?fast=1&seed=${1000 + idx}`);
  await page.waitForSelector('.role-card');
  await noHorizontalScroll(page, `${tag} home`);
  await shot('1-home');

  // Setup
  await page.click(`.role-card [data-role="${sc.role}"]`);
  await page.waitForSelector('#toCheck');
  await page.fill('#name', 'Rahul');
  await page.click(`[data-pos="${sc.position}"]`);
  await page.$eval('#years', (el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); }, sc.years);
  await page.click(`[data-mode="${sc.mode}"]`);
  await page.click(`[data-count="${sc.count}"]`);
  // all categories selected by default
  const pressed = await page.$$eval('[data-topic]', els => els.map(e => e.getAttribute('aria-pressed')));
  assert.ok(pressed.length >= 10 && pressed.every(p => p === 'true'), `${tag}: all topics should be selected by default`);
  if (sc.topics) {
    await page.click('#topicsNone');
    assert.ok(await page.$eval('#toCheck', b => b.disabled), `${tag}: continue disabled with no topics`);
    for (const t of sc.topics) await page.click(`[data-topic="${t}"]`);
  }
  await noHorizontalScroll(page, `${tag} setup`);
  await shot('2-setup');
  await page.click('#toCheck');

  // Device check
  await page.waitForFunction(() => document.querySelector('#checks')?.textContent.includes('Camera is working'), null, { timeout: 10000 });
  await noHorizontalScroll(page, `${tag} check`);
  await shot('3-check');
  await page.click('#start');

  // Interview room: answer every prompt
  const asked = [];
  let shotTaken = false;
  for (let turn = 0; turn < 60; turn++) {
    const state = await Promise.race([
      page.waitForSelector('#doneBtn:not([disabled])', { timeout: 20000 }).then(() => 'answer'),
      page.waitForSelector('#reportHead', { timeout: 20000 }).then(() => 'report'),
    ]);
    if (state === 'report') break;
    const qtext = (await page.textContent('#qcard .qtext')).trim();
    const meta = (await page.textContent('#qcard .qmeta')).trim();
    const q = byText.get(qtext);
    assert.ok(q, `${tag}: unknown question on screen: ${qtext}`);
    const isFollow = meta.includes('Follow-up');
    let text;
    if (isFollow) text = 'I would look at metrics and logs first, then check recent changes.';
    else {
      asked.push(q);
      const n = asked.length;
      if (sc.policy === 'strong') text = q.ideal;
      else text = n % 4 === 0 ? 'Sorry, I am not sure about this one.' : (n % 3 === 0 ? q.ideal.split('. ').slice(0, 1).join('. ') : q.ideal);
    }
    if (!isFollow && sc.policy === 'mixed' && asked.length === 2) {
      // exercise Skip on the second question
      await page.click('#skipBtn');
    } else {
      await page.fill('#answer', text);
      if (!shotTaken && asked.length === 2) { await noHorizontalScroll(page, `${tag} room`); await shot('4-room'); shotTaken = true; }
      await page.click('#doneBtn');
    }
  }
  await page.waitForSelector('#reportHead', { timeout: 20000 });
  await page.waitForTimeout(300);
  await noHorizontalScroll(page, `${tag} report`);
  await shot('5-report');

  // ---- correctness checks
  assert.equal(asked.length, sc.count, `${tag}: asked ${asked.length} questions, expected ${sc.count}`);
  assert.equal(new Set(asked.map(q => q.id)).size, sc.count, `${tag}: duplicate questions`);
  const posLevel = { 'java-senior': 'senior', 'devops-lead': 'lead' }[sc.position];
  const expLevel = sc.years >= 8 ? 'lead' : sc.years >= 5 ? 'senior' : sc.years >= 2 ? 'mid' : 'entry';
  const lv = targetLevels(posLevel, expLevel);
  for (const q of asked) {
    if (q.cat === 'common') continue;
    assert.ok(belongsTo(q, sc.role), `${tag}: wrong role ${q.id}`);
    if (sc.topics) assert.ok(sc.topics.includes(topicGroup(q.topic)), `${tag}: ${q.id} outside chosen topics`);
    assert.ok(q.levels.some(l => lv.includes(l)), `${tag}: ${q.id} levels ${q.levels} not in ${lv}`);
  }
  if (sc.mode === 'mixed' && posLevel === 'senior') assert.ok(asked.some(q => q.type === 'managerial'), `${tag}: senior interview has a managerial scenario`);
  if (sc.topics) assert.equal(new Set(asked.map(q => topicGroup(q.topic))).size, sc.topics.length, `${tag}: all chosen topics covered`);
  if (sc.mode === 'mixed') assert.equal(asked[0].type, 'intro', `${tag}: intro first`);
  else assert.ok(asked.every(q => q.cat !== 'common'), `${tag}: technical-only contains HR`);

  const report = await page.evaluate(() => window.__ip.report);
  // Independently recompute every score from the stored answers
  const items = report.items.map(it => {
    const q = QUESTIONS.find(x => x.id === it.questionId);
    const combined = it.nudge && it.nudge.answer ? `${it.answer} ${it.nudge.answer}` : it.answer;
    const r = it.skipped ? scoreAnswer(q, '') : scoreAnswer(q, combined, { durationSec: it.durationSec });
    assert.equal(it.result.technical, r.technical, `${tag}: technical mismatch on ${q.id}`);
    assert.equal(it.result.communication, r.communication, `${tag}: communication mismatch on ${q.id}`);
    assert.equal(it.result.overall, r.overall, `${tag}: overall mismatch on ${q.id}`);
    return { question: q, result: r, skipped: it.skipped };
  });
  const sum = summarize(items);
  assert.equal(report.summary.overall, sum.overall, `${tag}: summary overall`);
  const ringVal = Number((await page.textContent('.ring .val b')).trim());
  assert.equal(ringVal, sum.overall, `${tag}: ring shows ${ringVal}, expected ${sum.overall}`);
  const pills = await page.$$eval('.qa .score-pill', els => els.map(e => Number(e.textContent)));
  assert.deepEqual(pills, items.map(i => i.result.overall), `${tag}: per-question pills`);
  assert.equal(await page.$$eval('.qa', els => els.length), sc.count);

  if (sc.policy === 'strong') {
    assert.ok(sum.overall >= 80, `${tag}: model answers should score >= 80, got ${sum.overall}`);
    assert.ok(items.every(i => i.result.technical === 100), `${tag}: model answers should get full technical marks`);
  } else {
    assert.ok(report.items.some(i => i.skipped), `${tag}: skip recorded`);
    assert.ok(sum.overall < 85 && sum.overall > 20, `${tag}: mixed answers should land mid-range, got ${sum.overall}`);
    const dk = items.find(i => i.result.flags.dontKnow);
    assert.ok(!dk || dk.result.technical === 0, `${tag}: "not sure" answer has zero technical`);
  }

  // History persisted
  await page.click('[data-nav="history"] >> nth=0');
  await page.waitForSelector('.hist-row');
  const rows = await page.$$eval('.hist-row', els => els.length);
  assert.equal(rows, 1, `${tag}: history rows`);
  await shot('6-history');

  assert.deepEqual(errors, [], `${tag}: console errors`);
  await ctx.close();
  return sum.overall;
}

let idx = 0;
for (const vp of VIEWPORTS) {
  for (const sc of SCENARIOS) {
    idx++;
    try {
      const overall = await runInterview(vp, sc, idx);
      log(`PASS  ${vp.name.padEnd(15)} ${sc.role.padEnd(13)} ${sc.mode.padEnd(9)} ${String(sc.count).padStart(2)} questions  overall=${overall}`);
    } catch (e) {
      failures++;
      log(`FAIL  ${vp.name.padEnd(15)} ${sc.role.padEnd(13)} ${e.message}`);
    }
  }
}

// Pause / resume and End-early behaviour
try {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, permissions: ['camera', 'microphone'] });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  await page.goto(`http://localhost:${PORT}/?fast=1&seed=77`);
  await page.click('.role-card [data-role="devops"]');
  await page.click('#toCheck');
  await page.waitForFunction(() => document.querySelector('#checks')?.textContent.includes('Camera'));
  await page.click('#start');
  await page.waitForSelector('#doneBtn:not([disabled])');
  await page.click('#pauseBtn');
  await page.waitForSelector('.pause-overlay');
  const t1 = await page.textContent('#ansTimer');
  await page.waitForTimeout(1500);
  assert.equal(await page.textContent('#ansTimer'), t1, 'timer frozen while paused');
  await page.screenshot({ path: new URL('pause.png', OUT).pathname });
  await page.click('#resume');
  await page.fill('#answer', 'I am a DevOps engineer with five years of experience building CI CD pipelines and Kubernetes platforms on AWS.');
  await page.click('#doneBtn');
  await page.waitForSelector('#doneBtn:not([disabled])');
  await page.click('#endBtn');
  await page.waitForSelector('#reportHead', { timeout: 15000 });
  const rep = await page.evaluate(() => window.__ip.report);
  assert.ok(rep.endedEarly, 'ended early flagged');
  assert.ok(rep.items.length >= 1 && rep.items.length < 8, 'partial report');
  log('PASS  pause/resume + end early');
  await ctx.close();
} catch (e) { failures++; log('FAIL  pause/end', e.message); }

await browser.close();
server.close();
log(failures ? `\n${failures} E2E scenario(s) failed` : '\nAll E2E scenarios passed. Screenshots in test-results/');
process.exit(failures ? 1 : 0);
