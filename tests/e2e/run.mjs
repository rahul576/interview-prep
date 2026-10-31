// End-to-end test: runs complete interviews in headless Chromium with a fake
// camera/microphone on desktop, iPad and Android-tablet viewports, then checks
// the report against scores recomputed independently in Node.
// Usage: node tests/e2e/run.mjs   (needs Playwright + Chromium)
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createServer } from '../../scripts/serve.mjs';
import { QUESTIONS, belongsTo, topicGroup } from '../../www/js/data/questions.js';
import { scoreAnswer, summarize, selectionChance } from '../../www/js/engine/score.js';
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
  const chanceShown = Number((await page.textContent('#chance .chance-top b')).split('/')[0]);
  assert.equal(chanceShown, report.chance.score, `${tag}: chance on screen`);
  const rank = { 'java-senior': 3, 'devops-lead': 4 }[sc.position];
  assert.equal(report.chance.score, selectionChance(items.map((x, k) => ({ ...x, hintUsed: report.items[k].hintUsed, attempts: report.items[k].attempts })), { mode: 'interview', levelRank: rank }).score, `${tag}: chance recomputed`);
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
for (const vp of (process.env.E2E_EXTRA_ONLY ? [] : VIEWPORTS)) {
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


// Preparation mode + revision list + no repeats between consecutive sessions
async function startSession(page, { role, style, count = 5, mode = 'technical', source }) {
  await page.click('[data-nav="home"] >> nth=0');
  await page.click(`.role-card [data-role="${role}"]`);
  await page.click(`[data-style="${style}"]`);
  if (source) await page.click(`[data-source="${source}"]`);
  await page.click(`[data-count="${count}"]`);
  await page.click(`[data-mode="${mode}"]`);
  await page.click('#toCheck');
  await page.waitForFunction(() => /Camera (is working|unavailable)|Permission denied/.test(document.querySelector('#checks')?.textContent || ''), null, { timeout: 10000 });
  await page.click('#start');
}
try {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, isMobile: true, hasTouch: true, permissions: ['camera', 'microphone'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('dialog', d => d.accept());
  await page.goto(`http://localhost:${PORT}/?fast=1&seed=501`);
  await page.waitForSelector('.role-card');

  // 1) Preparation mode: hint, weak answer -> review -> retry with model answer -> next
  await startSession(page, { role: 'java-backend', style: 'prep', count: 5 });
  const prepIds = await page.evaluate(() => window.__ip.questions);
  for (let k = 0; k < prepIds.length; k++) {
    await page.waitForSelector('#doneBtn:not([disabled])');
    assert.equal(await page.textContent('#timebar').then(() => page.$eval('#timebar', e => e.hidden)), true, 'prep: no countdown');
    const q = QUESTIONS.find(x => x.id === prepIds[k]);
    if (k === 0) {
      await page.click('#hintBtn');
      const hint = await page.textContent('#hints');
      assert.ok(q.keyPoints.every(p => hint.includes(p.label)), 'hint lists key points');
      await page.fill('#answer', 'I am not sure.');
      await page.click('#doneBtn');
      await page.waitForSelector('#review:not([hidden])');
      assert.ok((await page.textContent('#review')).includes(q.ideal.slice(0, 60)), 'review shows model answer');
      if (k === 0) await page.screenshot({ path: new URL('prep-review.png', OUT).pathname });
      await page.click('#retryBtn');
      await page.waitForSelector('#doneBtn:not([disabled])');
      await page.fill('#answer', q.ideal);
      await page.click('#doneBtn');
      await page.waitForSelector('#review:not([hidden])');
      assert.match(await page.textContent('.review-head'), /attempt 2/);
    } else {
      await page.fill('#answer', k % 2 ? 'No idea, sorry.' : q.ideal);
      await page.click('#doneBtn');
      await page.waitForSelector('#review:not([hidden])');
    }
    await page.click('#nextBtn');
  }
  await page.waitForSelector('#reportHead');
  assert.match(await page.textContent('#reportHead'), /Preparation report/);
  assert.match(await page.textContent('#chance'), /practice estimate/);
  const prepReport = await page.evaluate(() => window.__ip.report);
  const expectedWeak = prepReport.items.filter(i => i.result.overall < 60).map(i => i.questionId).sort();
  assert.ok(expectedWeak.length >= 1, 'some weak answers');
  assert.equal(prepReport.items[0].attempts, 2);
  assert.equal(prepReport.addedToRevision, expectedWeak.length);

  // 2) Revision list shows exactly the weak questions
  await page.click('.revision-note [data-nav="revision"]');
  await page.waitForSelector('#revisionList');
  const listed = (await page.$$eval('#revisionList details', els => els.map(e => e.dataset.qid))).sort();
  assert.deepEqual(listed, expectedWeak, 'revision list = weak answers');
  assert.equal(Number(await page.textContent('.nav-badge')), expectedWeak.length, 'nav badge count');
  await page.screenshot({ path: new URL('revision.png', OUT).pathname });

  // 3) Practise the revision list, answer one correctly -> it leaves the list
  await page.click('[data-practice="java-backend"]');
  await page.waitForFunction(() => /Camera (is working|unavailable)/.test(document.querySelector('#checks')?.textContent || ''));
  await page.click('#start');
  const revIds = await page.evaluate(() => window.__ip.questions);
  assert.deepEqual([...revIds].sort(), expectedWeak, 'revision practice uses the weak questions');
  for (let k = 0; k < revIds.length; k++) {
    await page.waitForSelector('#doneBtn:not([disabled])');
    await page.fill('#answer', k === 0 ? QUESTIONS.find(x => x.id === revIds[0]).ideal : 'still not sure');
    await page.click('#doneBtn');
    await page.waitForSelector('#review:not([hidden])');
    await page.click('#nextBtn');
  }
  await page.waitForSelector('#reportHead');
  await page.click('[data-nav="revision"] >> nth=0');
  await page.waitForSelector('#revisionList');
  const after = await page.$$eval('#revisionList details', els => els.map(e => e.dataset.qid));
  assert.ok(!after.includes(revIds[0]), 'correctly answered question cleared');
  assert.equal(after.length, expectedWeak.length - 1);
  // mark as learned
  if (after.length) {
    await page.click(`details[data-qid="${after[0]}"] summary`);
    await page.click(`[data-learned="${after[0]}"]`);
    await page.waitForSelector('#revisionList');
    assert.equal(await page.$$eval('#revisionList details', els => els.length), after.length - 1, 'mark as learned');
  }

  // 4) Two consecutive interviews: no repeated questions (intro exempt)
  const seenBefore = new Set([...prepIds, ...revIds]);
  await startSession(page, { role: 'java-backend', style: 'interview', count: 8, mode: 'mixed' });
  const s1 = await page.evaluate(() => window.__ip.questions);
  // answer every question so they all count as asked
  for (const until = Date.now() + 120000; Date.now() < until && !(await page.$('#reportHead'));) {
    if (await page.$('#doneBtn:not([disabled])')) { await page.fill('#answer', 'I would explain the concept and give an example from my project.'); await page.click('#doneBtn'); }
    await page.waitForTimeout(150);
  }
  await page.waitForSelector('#reportHead');
  await startSession(page, { role: 'java-backend', style: 'interview', count: 8, mode: 'mixed' });
  const s2 = await page.evaluate(() => window.__ip.questions);
  const overlap = s2.filter(id => s1.includes(id) && id !== 'hr-001');
  assert.deepEqual(overlap, [], `consecutive interviews repeated: ${overlap}`);
  assert.deepEqual(s1.filter(id => seenBefore.has(id)), [], 'interview avoided questions already practised');
  assert.deepEqual(errors, [], 'console errors');
  log('PASS  preparation mode, revision list, no repeats between sessions');
  await ctx.close();
} catch (e) { failures++; log('FAIL  prep/revision/no-repeat', e.message); try { const pg = browser.contexts().at(-1).pages()[0]; await pg.screenshot({ path: new URL('fail-prep.png', OUT).pathname }); log('  screen:', await pg.evaluate(() => window.__ip.screen + ' | ' + (document.querySelector('#qcard')?.textContent || '').slice(0, 120) + ' | review hidden=' + document.querySelector('#review')?.hidden)); } catch {} }


// Interviewer interrupts an off-topic answer once, keeps the text, and the report shows it
try {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, permissions: ['camera', 'microphone'] });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  page.on('dialog', d => d.accept());
  await page.goto(`http://localhost:${PORT}/?fast=1&seed=902`);
  await page.click('.role-card [data-role="java-backend"]');
  await page.click('[data-style="interview"]'); await page.click('[data-mode="technical"]'); await page.click('[data-count="5"]');
  await page.click('#toCheck');
  await page.waitForFunction(() => /Camera is working/.test(document.querySelector('#checks')?.textContent || ''));
  await page.click('#start');
  await page.waitForSelector('#doneBtn:not([disabled])');
  const chat = 'Well I think the most important thing in my career has been working with great people and learning every day from my mentors who taught me how to be patient and kind and to always keep growing as a person in whatever I do in my life and at home with my family on weekends';
  await page.fill('#answer', chat);
  await page.waitForFunction(() => /Sorry to interrupt/.test(document.querySelector('#log')?.textContent || ''), null, { timeout: 15000 });
  assert.equal(await page.inputValue('#answer'), chat, 'answer text kept after interruption');
  await page.screenshot({ path: new URL('interruption.png', OUT).pathname });
  await page.waitForSelector('#doneBtn:not([disabled])');
  await page.click('#doneBtn');
  for (const until = Date.now() + 120000; Date.now() < until && !(await page.$('#reportHead'));) {
    if (await page.$('#doneBtn:not([disabled])')) { await page.fill('#answer', 'short'); await page.click('#doneBtn'); }
    await page.waitForTimeout(150);
  }
  await page.waitForSelector('#reportHead');
  const rep = await page.evaluate(() => window.__ip.report);
  assert.equal(rep.items[0].interrupted, true, 'interruption recorded');
  assert.equal(rep.items.filter(i => i.interrupted).length, 1, 'only off-topic answer interrupted');
  assert.ok(rep.chance.reasons.some(r => /redirect/.test(r)), 'chance mentions redirect');
  assert.deepEqual(errors, []);
  log('PASS  interviewer interrupts off-topic answer');
  await ctx.close();
} catch (e) { failures++; log('FAIL  interruption', e.message); }

await browser.close();
server.close();
log(failures ? `\n${failures} E2E scenario(s) failed` : '\nAll E2E scenarios passed. Screenshots in test-results/');
process.exit(failures ? 1 : 0);
