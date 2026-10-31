// V1.2: progress tracking, no repeats across sessions, preparation mode, selection chance, voices.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS, questionById, belongsTo, TECH_TYPES } from '../../www/js/data/questions.js';
import { INTERVIEWERS } from '../../www/js/data/meta.js';
import { selectQuestions, freshFirst } from '../../www/js/engine/select.js';
import { updateProgress, weakQuestions, markLearned, seenMap, progressStats, PASS_SCORE } from '../../www/js/engine/progress.js';
import { scoreAnswer, selectionChance } from '../../www/js/engine/score.js';
import { InterviewSession } from '../../www/js/engine/session.js';
import { pickVoice, voiceQuality, rankedVoices } from '../../www/js/services/speech.js';

const item = (id, answer, extra = {}) => { const q = questionById(id); return { questionId: id, question: q, answer, skipped: !answer, result: scoreAnswer(q, answer), ...extra }; };

test('Java bank is large: 250+ technical questions for the Java role', () => {
  const n = QUESTIONS.filter(q => belongsTo(q, 'java-backend') && TECH_TYPES.includes(q.type)).length;
  assert.ok(n >= 250, `java role has ${n}`);
  assert.ok(QUESTIONS.length >= 420);
});

test('progress: wrong answers go to the revision list, correct answers leave it', () => {
  let p = {};
  p = updateProgress(p, { category: 'java-backend', items: [item('java-009', questionById('java-009').ideal), item('java-003', 'not sure'), item('java-033', '')] }, 1000);
  const weak = weakQuestions(p).map(w => w.id).sort();
  assert.deepEqual(weak, ['java-003', 'java-033']);
  assert.equal(p['java-009'].wrong, false);
  assert.equal(p['java-033'].skipped, true);
  assert.ok(p['java-003'].lastAnswer.includes('not sure'));
  assert.ok(p['java-003'].missed.length > 0);
  // answering java-003 correctly later clears it
  p = updateProgress(p, { category: 'java-backend', items: [item('java-003', questionById('java-003').ideal)] }, 2000);
  assert.deepEqual(weakQuestions(p).map(w => w.id), ['java-033']);
  assert.equal(p['java-003'].n, 2);
  assert.deepEqual(p['java-003'].scores.length, 2);
  // mark learned
  p = markLearned(p, 'java-033', 3000);
  assert.equal(weakQuestions(p).length, 0);
  // filter by role
  p = updateProgress(p, { category: 'devops', items: [item('devops-015', 'no')] }, 4000);
  assert.equal(weakQuestions(p, { role: 'java-backend' }).length, 0);
  assert.equal(weakQuestions(p, { role: 'devops' }).length, 1);
  assert.equal(PASS_SCORE, 60);
  const st = progressStats(p, 'java-backend', ['java-009', 'java-003', 'java-033', 'java-001']);
  assert.deepEqual(st, { seen: 3, total: 4, correct: 3, weak: 0 });
});

test('NO REPEATS: consecutive sessions never repeat a question while unseen ones remain', () => {
  for (const role of ['java-backend', 'devops']) {
    for (const [pos, exp] of [['mid', 'mid'], ['senior', 'senior'], ['entry', 'entry']]) {
      let progress = {};
      let last = [];
      const asked = new Set();
      const pool = QUESTIONS.filter(q => belongsTo(q, role) && TECH_TYPES.includes(q.type) && q.levels.includes(pos)).length;
      const rounds = Math.floor(pool / 8);
      for (let r = 0; r < rounds; r++) {
        const qs = selectQuestions({ bank: QUESTIONS, category: role, positionLevel: pos, experienceLevel: exp, count: 8, mode: 'technical', seed: r + 1, seen: seenMap(progress), recentIds: last });
        for (const q of qs) {
          assert.ok(!asked.has(q.id), `${role}/${pos} round ${r}: ${q.id} repeated before the pool (${pool}) was exhausted`);
          asked.add(q.id);
        }
        progress = updateProgress(progress, { category: role, items: qs.map(q => ({ questionId: q.id, answer: 'x', result: scoreAnswer(q, 'x') })) }, (r + 1) * 1000);
        last = qs.map(q => q.id);
      }
      // after the pool is exhausted: still no question from the immediately previous session
      for (let r = rounds; r < rounds + 4; r++) {
        const qs = selectQuestions({ bank: QUESTIONS, category: role, positionLevel: pos, experienceLevel: exp, count: 8, mode: 'technical', seed: r + 1, seen: seenMap(progress), recentIds: last });
        for (const q of qs) assert.ok(!last.includes(q.id), `${role}/${pos}: ${q.id} repeated from the previous session`);
        progress = updateProgress(progress, { category: role, items: qs.map(q => ({ questionId: q.id, answer: 'x', result: scoreAnswer(q, 'x') })) }, (r + 1) * 1000);
        last = qs.map(q => q.id);
      }
    }
  }
});

test('freshFirst orders never-asked, then oldest, then last session', () => {
  const pool = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  assert.deepEqual(freshFirst(pool, 2, { a: 5, b: 1 }, new Set(['c'])).map(q => q.id), ['d', 'b']);
  assert.deepEqual(freshFirst(pool, 4, { a: 5, b: 1 }, new Set(['c'])).map(q => q.id), ['d', 'b', 'a', 'c']);
});

test('preparation mode: review after each answer, retry rescoring, no follow-up probing', async () => {
  const qs = ['java-009', 'java-033'].map(questionById);
  const said = []; const reviews = [];
  const answers = [
    { action: 'done', text: 'It stores keys.', hintUsed: true },
    { action: 'done', text: qs[0].ideal },             // retry
    { action: 'done', text: 'Indexes make reads faster.' },
  ];
  let i = 0, r = 0;
  const choices = ['retry', 'next', 'next'];
  const io = {
    say: async (t, m) => { said.push(m.kind); },
    getAnswer: async () => answers[i++],
    review: async (it) => { reviews.push(it.result.overall); return choices[r++]; },
  };
  const s = new InterviewSession({ questions: qs, config: { interviewer: INTERVIEWERS[0], position: 'X', followUps: true, mode: 'prep', seed: 1 }, io });
  const out = await s.run();
  assert.equal(out.items.length, 2);
  assert.equal(out.items[0].attempts, 2);
  assert.ok(out.items[0].hintUsed);
  assert.ok(out.items[0].firstScore < out.items[0].result.overall);
  assert.equal(out.items[0].result.technical, 100);
  assert.equal(reviews.length, 3);
  assert.ok(!said.includes('nudge') && !said.includes('followup') && !said.includes('transition'));
  assert.equal(said[0], 'greeting');
});

test('selection chance: strong performance high, weak/skipped low, practice aids reduce it', () => {
  const ids = ['java-009', 'java-033', 'java-012', 'java-028', 'java-015'];
  const strong = ids.map(id => item(id, questionById(id).ideal));
  const weak = ids.map((id, k) => item(id, k % 2 ? '' : 'I am not sure'));
  const a = selectionChance(strong, { mode: 'interview' });
  const b = selectionChance(weak, { mode: 'interview' });
  assert.ok(a.score >= 80, `strong ${a.score}`);
  assert.equal(a.tone, 'great');
  assert.ok(b.score < 30, `weak ${b.score}`);
  assert.equal(b.tone, 'bad');
  assert.ok(b.reasons.some(r => /skipped/.test(r)));
  const aided = selectionChance(strong.map(x => ({ ...x, hintUsed: true, attempts: 2 })), { mode: 'prep' });
  assert.ok(aided.score < a.score);
  for (const r of [a, b, aided]) assert.ok(r.score >= 0 && r.score <= 100);
  assert.equal(selectionChance([]).score, 0);
});

test('voices: natural/premium voices win over robotic ones, user choice wins over all', () => {
  const voices = [
    { name: 'Fred', lang: 'en-US' },
    { name: 'Samantha', lang: 'en-US' },
    { name: 'Microsoft Ava Online (Natural) - English (United States)', lang: 'en-US' },
    { name: 'Microsoft Andrew Online (Natural) - English (United States)', lang: 'en-US' },
    { name: 'Zoe (Premium)', lang: 'en-US' },
    { name: 'Microsoft Neerja Online (Natural) - English (India)', lang: 'en-IN' },
  ];
  assert.ok(voiceQuality(voices[0]) < 0);
  assert.ok(voiceQuality(voices[2]) > voiceQuality(voices[1]));
  assert.match(pickVoice(voices, { gender: 'female', lang: 'en-US' }).name, /Ava|Zoe/);
  assert.match(pickVoice(voices, { gender: 'male', lang: 'en-US' }).name, /Andrew/);
  assert.match(pickVoice(voices, { gender: 'female', lang: 'en-IN' }).name, /Neerja/);
  assert.equal(pickVoice(voices, { gender: 'male', preferred: 'Samantha' }).name, 'Samantha');
  const ranked = rankedVoices(voices);
  assert.ok(ranked[0].natural && ranked.at(-1).robotic);
});

test('drift: on-topic answers are never interrupted; off-topic ones are', async () => {
  const { driftCheck, interruptionLine, DRIFT } = await import('../../www/js/engine/drift.js');
  const tech = QUESTIONS.filter(q => ['concept', 'scenario', 'design'].includes(q.type));
  const first = (t, n) => t.split(' ').slice(0, n).join(' ');
  for (const q of tech) for (const n of [DRIFT.minWords, 70, 200]) assert.equal(driftCheck(q, first(q.ideal, n)).drifting, false, `${q.id} model answer flagged at ${n} words`);
  // too short to judge
  assert.equal(driftCheck(questionById('java-009'), 'I like football and cricket a lot.').drifting, false);
  // open questions are never interrupted
  assert.equal(driftCheck(questionById('hr-001'), 'football '.repeat(80)).drifting, false);
  // completely different direction
  const chat = 'Well I think the most important thing in my career has been working with great people and learning every day from my mentors who taught me how to be patient and kind and to always keep growing as a person in whatever I do in my life and at home with my family on weekends';
  const hits = tech.filter(q => driftCheck(q, chat).drifting).length;
  assert.ok(hits / tech.length > 0.9, `off-topic chat detected for ${hits}/${tech.length}`);
  let pairs = 0, caught = 0;
  for (const a of tech) for (const b of tech.filter((_, i) => i % 9 === 0)) { if (a.topic === b.topic || a.cat !== b.cat) continue; pairs++; if (driftCheck(a, first(b.ideal, 60)).drifting) caught++; }
  assert.ok(caught / pairs > 0.7, `off-topic answers caught ${(caught / pairs * 100).toFixed(1)}%`);
  assert.match(interruptionLine(questionById('java-009')), /^Sorry to interrupt/);
});

test('selection chance penalises interruptions', () => {
  const ids = ['java-009', 'java-033', 'java-012', 'java-028', 'java-015'];
  const base = ids.map(id => item(id, questionById(id).ideal));
  const a = selectionChance(base);
  const b = selectionChance(base.map((x, k) => ({ ...x, interrupted: k < 2 })));
  assert.ok(b.score < a.score, `${b.score} < ${a.score}`);
  assert.ok(b.reasons.some(r => /redirect 2 off-topic answers \(−6\)/.test(r)));
});
