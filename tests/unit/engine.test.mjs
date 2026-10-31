// Unit tests for text matching, scoring, selection, session flow and voice helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, stemWord, prepare, matchKeyword } from '../../www/js/engine/text.js';
import { scoreAnswer, summarize, lengthScore, pointsForFullMarks, verdictFor } from '../../www/js/engine/score.js';
import { selectQuestions, targetLevels, planSlots, mulberry32, availableCount } from '../../www/js/engine/select.js';
import { InterviewSession, nudgeLine, RULES } from '../../www/js/engine/session.js';
import { QUESTIONS, questionById, belongsTo, topicGroup, topicsFor } from '../../www/js/data/questions.js';
import { levelFromYears, INTERVIEWERS, CATEGORIES, levelById } from '../../www/js/data/meta.js';
import { pickVoice, chunkText, estimateDurationMs } from '../../www/js/services/speech.js';

const m = (text, kw) => matchKeyword(prepare(text), kw);

test('normalize handles code-ish tokens', () => {
  assert.equal(normalize('@Transactional O(1) N+1 count++ CI/CD'), 'transactional o 1 n 1 count plus plus ci cd');
});

test('stemmer unifies common inflections', () => {
  for (const [a, b] of [['caching', 'cache'], ['caches', 'cache'], ['cached', 'cache'], ['services', 'service'], ['mapping', 'map'], ['committed', 'commit'], ['traces', 'tracing']]) {
    assert.equal(stemWord(a), stemWord(b), `${a} vs ${b}`);
  }
  assert.equal(stemWord('string'), 'string');
  assert.equal(stemWord('class'), 'class');
});

test('keyword matching: phrases, prefixes, spacing variants, whole words', () => {
  assert.ok(m('it uses a red-black tree after eight entries', 'red black tree'));
  assert.ok(m('we autoscale using HPA', 'autoscal*'));
  assert.ok(m('we use auto scaling groups', 'autoscal*'));
  assert.ok(m('equal objects must have the same hash code', 'same hashcode'));
  assert.ok(m('override hashCode as well', 'hash code'));
  assert.ok(m('kill -9 sends SIGKILL', 'kill 9'));
  assert.ok(m('HTTP 429 too many requests', '429'));
  assert.ok(!m('a podcast about kubernetes', 'pod'), 'pod must not match inside podcast');
  assert.ok(!m('we used Docker', 'dockerfile'));
  assert.ok(!m('', 'anything'));
});

test('scoring: empty, short, partial, full answers are ordered correctly', () => {
  const q = questionById('java-009'); // HashMap internals
  const empty = scoreAnswer(q, '');
  const short = scoreAnswer(q, 'It stores keys.');
  const partial = scoreAnswer(q, 'HashMap keeps an array of buckets. The hashCode decides the index, and when two keys collide they go into a linked list in the same bucket.');
  const full = scoreAnswer(q, q.ideal);
  assert.equal(empty.overall, 0);
  assert.ok(empty.flags.empty);
  assert.ok(short.overall < partial.overall, `${short.overall} < ${partial.overall}`);
  assert.ok(partial.overall < full.overall, `${partial.overall} < ${full.overall}`);
  assert.equal(partial.matched.length, 3);
  assert.ok(partial.missed.some(x => /red-black/i.test(x.label)));
  assert.equal(full.technical, 100);
});

test('scoring: speech-to-text style answer (no punctuation, split words) still matches', () => {
  const q = questionById('java-003');
  const r = scoreAnswer(q, 'so basically if two objects are equal they must have the same hash code because hash map and hash set use the hash code to find the bucket and if two different objects collide thats a collision so you always override both');
  assert.equal(r.missed.length, 0, JSON.stringify(r.missed));
});

test('scoring: "I don\'t know" gets zero technical and capped communication', () => {
  const r = scoreAnswer(questionById('devops-020'), "Sorry, I don't know this one.");
  assert.equal(r.technical, 0);
  assert.ok(r.flags.dontKnow);
  assert.ok(r.communication <= 40);
});

test('scoring: filler words and pace affect communication only', () => {
  const q = questionById('devops-015');
  const clean = scoreAnswer(q, q.ideal, { durationSec: 60 });
  const filler = scoreAnswer(q, q.ideal.replace(/\. /g, '. um uh basically you know '), { durationSec: 60 });
  assert.equal(clean.technical, filler.technical);
  assert.ok(filler.communication < clean.communication);
  assert.ok(filler.fillerCount >= 8);
  const rushed = scoreAnswer(q, q.ideal, { durationSec: 20 });
  assert.ok(rushed.wpm > 190 && rushed.communication < clean.communication);
});

test('score helpers', () => {
  assert.equal(pointsForFullMarks(4), 4);
  assert.equal(pointsForFullMarks(5), 4);
  assert.equal(lengthScore(0), 0);
  assert.equal(lengthScore(100), 100);
  assert.equal(verdictFor(85).tone, 'great');
  assert.equal(verdictFor(40).tone, 'bad');
});

test('summarize aggregates weighted scores and topics', () => {
  const qa = questionById('java-009'), qb = questionById('java-033');
  const items = [
    { question: qa, result: scoreAnswer(qa, qa.ideal) },
    { question: qb, result: scoreAnswer(qb, ''), skipped: true },
  ];
  const s = summarize(items);
  assert.equal(s.technical, Math.round((items[0].result.technical + 0) / 2));
  assert.equal(s.overall, Math.round(0.7 * s.technical + 0.3 * s.communication));
  assert.equal(s.skipped, 1);
  assert.equal(s.answered, 1);
  assert.deepEqual(s.strengths, ['Collections']);
  assert.ok(s.improve.includes('Databases & SQL'));
});

test('levels from years of experience', () => {
  assert.equal(levelFromYears(0), 'entry');
  assert.equal(levelFromYears(1.9), 'entry');
  assert.equal(levelFromYears(2), 'mid');
  assert.equal(levelFromYears(5), 'senior');
  assert.equal(levelFromYears(8), 'lead');
  assert.equal(levelFromYears(20), 'lead');
  assert.deepEqual(targetLevels('senior', 'mid'), ['mid', 'senior']);
  assert.deepEqual(targetLevels('lead', 'lead'), ['lead']);
});

test('selection respects role, level, count, uniqueness and is deterministic', () => {
  for (const c of CATEGORIES) {
    for (const [pos, exp] of [['entry', 'entry'], ['mid', 'entry'], ['senior', 'mid'], ['lead', 'lead']]) {
      for (const count of [5, 8, 12]) {
        for (const mode of ['mixed', 'technical']) {
          const args = { bank: QUESTIONS, category: c.id, positionLevel: pos, experienceLevel: exp, count, mode, seed: 1234 };
          const qs = selectQuestions(args);
          assert.equal(qs.length, count, `${c.id} ${pos}/${exp} ${mode} ${count}`);
          assert.equal(new Set(qs.map(q => q.id)).size, count, 'no duplicates');
          const lv = targetLevels(pos, exp);
          const tech = qs.filter(q => q.cat !== 'common');
          const rank = Math.max(...lv.map(l => levelById(l).rank));
          assert.equal(tech.length, planSlots(count, mode, rank).technical);
          for (const q of tech) {
            assert.ok(belongsTo(q, c.id), `${q.id} not in role ${c.id}`);
            assert.ok(q.levels.some(l => lv.includes(l)), `${q.id} level ${q.levels} not in ${lv}`);
          }
          for (const q of qs.filter(q => q.cat === 'common')) { assert.ok(q.levels.some(l => lv.includes(l)), `${q.id} behavioural level`); assert.ok(belongsTo(q, c.id), `${q.id} hr role`); }
          if (mode === 'mixed') assert.equal(qs[0].type, 'intro');
          const topics = new Set(tech.map(q => topicGroup(q.topic)));
          assert.ok(topics.size >= Math.min(tech.length, 4), 'topic diversity');
          assert.deepEqual(selectQuestions(args).map(q => q.id), qs.map(q => q.id), 'deterministic');
        }
      }
    }
  }
});

test('selection avoids recently asked questions when possible', () => {
  const base = { bank: QUESTIONS, category: 'java-backend', positionLevel: 'mid', experienceLevel: 'mid', count: 5, mode: 'technical' };
  const first = selectQuestions({ ...base, seed: 1 });
  const second = selectQuestions({ ...base, seed: 1, recentIds: first.map(q => q.id) });
  assert.equal(second.filter(q => first.some(f => f.id === q.id)).length, 0);
});

test('different seeds give different interviews', () => {
  const base = { bank: QUESTIONS, category: 'devops', positionLevel: 'mid', experienceLevel: 'mid', count: 8, mode: 'mixed' };
  const sets = new Set([1, 2, 3, 4, 5].map(seed => selectQuestions({ ...base, seed }).map(q => q.id).join()));
  assert.ok(sets.size >= 4);
});

test('mulberry32 is deterministic and in [0,1)', () => {
  const a = mulberry32(9), b = mulberry32(9);
  for (let i = 0; i < 100; i++) { const x = a(); assert.equal(x, b()); assert.ok(x >= 0 && x < 1); }
});

// ---- session flow with a scripted candidate
function scriptedIO(answers) {
  const said = [];
  let i = 0;
  return {
    said,
    io: {
      say: async (text, meta) => { said.push({ text, kind: meta.kind }); },
      getAnswer: async (meta) => { const a = answers[i++] || { action: 'done', text: '' }; return typeof a === 'function' ? a(meta) : a; },
    },
  };
}

test('session: strong answers trigger deep follow-ups (max 2), weak trigger a nudge', async () => {
  const qs = ['java-009', 'java-033', 'java-012', 'java-028'].map(questionById);
  const { io, said } = scriptedIO([
    { action: 'done', text: qs[0].ideal, durationSec: 60 },      // strong -> deep follow-up
    { action: 'done', text: 'It is a cache keyed by load.', durationSec: 10 }, // follow-up answer
    { action: 'done', text: 'It makes queries faster.', durationSec: 8 }, // weak -> nudge
    { action: 'done', text: 'It is usually a B-tree and we check with explain.', durationSec: 15 }, // nudge answer
    { action: 'done', text: qs[2].ideal, durationSec: 60 },      // strong -> second deep follow-up
    { action: 'done', text: 'flatMap flattens.', durationSec: 5 },
    { action: 'done', text: qs[3].ideal, durationSec: 60 },      // last question: no deep follow-up
  ]);
  const s = new InterviewSession({ questions: qs, config: { interviewer: INTERVIEWERS[0], candidateName: 'Asha', position: 'Java Backend Engineer', followUps: true, seed: 5 }, io });
  const out = await s.run();
  assert.equal(out.items.length, 4);
  assert.equal(out.endedEarly, false);
  assert.ok(out.items[0].followUp && !out.items[0].nudge);
  assert.ok(out.items[1].nudge && !out.items[1].followUp);
  assert.ok(out.items[1].result.matched.length > scoreAnswer(qs[1], 'It makes queries faster.').matched.length, 'nudge answer improves score');
  assert.ok(out.items[2].followUp);
  assert.equal(out.items[3].followUp, null, 'no follow-up on the last question');
  assert.equal(said.filter(x => x.kind === 'followup').length, 2);
  assert.equal(said[0].kind, 'greeting');
  assert.ok(said[0].text.includes('Asha'));
  assert.equal(said.at(-1).kind, 'closing');
  assert.ok(said.some(x => x.text.startsWith('Last question.')));
});

test('session: skip, and no follow-ups when disabled', async () => {
  const qs = ['devops-015', 'devops-016'].map(questionById);
  const { io, said } = scriptedIO([{ action: 'skip', text: '' }, { action: 'done', text: 'short', durationSec: 2 }]);
  const s = new InterviewSession({ questions: qs, config: { interviewer: INTERVIEWERS[1], position: 'DevOps Engineer', followUps: false, seed: 1 }, io });
  const out = await s.run();
  assert.ok(out.items[0].skipped);
  assert.equal(out.items[0].result.overall, 0);
  assert.equal(said.filter(x => x.kind === 'nudge' || x.kind === 'followup').length, 0);
});

test('session: ending early keeps answered items and reports endedEarly', async () => {
  const qs = ['devops-015', 'devops-016', 'devops-017'].map(questionById);
  const { io } = scriptedIO([{ action: 'done', text: qs[0].ideal, durationSec: 40 }, { action: 'end', text: '' }]);
  const s = new InterviewSession({ questions: qs, config: { interviewer: INTERVIEWERS[0], position: 'DevOps Engineer', followUps: false, seed: 1 }, io });
  const out = await s.run();
  assert.equal(out.items.length, 1);
  assert.equal(out.endedEarly, true);
});

test('greeting uses the right article', async () => {
  const { greetingLine } = await import('../../www/js/engine/session.js');
  const g = (count) => greetingLine({ interviewer: INTERVIEWERS[0], candidateName: '', position: 'X', count });
  assert.match(g(8), /This is an 8-question/);
  assert.match(g(5), /This is a 5-question/);
  assert.match(g(12), /This is a 12-question/);
});

test('nudge line names a missed concept without the full answer', () => {
  const q = questionById('java-009');
  const line = nudgeLine(scoreAnswer(q, 'It uses buckets and hashCode.'));
  assert.match(line, /^Could you elaborate/);
  assert.ok(line.length < 160);
  assert.ok(RULES.nudgeBelowCoverage < RULES.deepAtCoverage);
});

test('voice picking prefers persona gender and requested accent', () => {
  const voices = [
    { name: 'Microsoft David - English (United States)', lang: 'en-US' },
    { name: 'Google UK English Female', lang: 'en-GB' },
    { name: 'Microsoft Zira - English (United States)', lang: 'en-US' },
    { name: 'Rishi', lang: 'en-IN' },
    { name: 'Veena', lang: 'en-IN' },
    { name: 'Thomas', lang: 'fr-FR' },
  ];
  assert.equal(pickVoice(voices, { gender: 'female', lang: 'en-US' }).name, 'Microsoft Zira - English (United States)'); // matching accent wins over a slightly better voice
  assert.equal(pickVoice(voices, { gender: 'male', lang: 'en-US' }).name, 'Microsoft David - English (United States)');
  assert.equal(pickVoice(voices, { gender: 'female', lang: 'en-IN' }).name, 'Veena');
  assert.equal(pickVoice(voices, { gender: 'male', lang: 'en-IN' }).name, 'Rishi');
  assert.equal(pickVoice([], {}), null);
});

test('text chunking keeps sentences and stays under the limit', () => {
  const text = QUESTIONS[0].ideal;
  const chunks = chunkText(text, 180);
  assert.equal(chunks.join(' ').replace(/\s+/g, ' '), text.replace(/\s+/g, ' '));
  for (const c of chunks) assert.ok(c.length <= 260);
  assert.ok(estimateDurationMs('hello world') >= 600);
});

test('topic filter: only chosen categories are asked; empty/null means all', () => {
  for (const role of ['java-backend', 'devops']) {
    const all = topicsFor(role).map(t => t.topic);
    for (const chosen of [['Kafka'], ['DSA', 'Elasticsearch'], all.slice(0, 3)]) {
      const qs = selectQuestions({ bank: QUESTIONS, category: role, positionLevel: 'mid', experienceLevel: 'mid', count: 8, mode: 'technical', topics: chosen, seed: 9 });
      assert.equal(qs.length, 8);
      for (const q of qs) assert.ok(chosen.includes(topicGroup(q.topic)), `${role}: ${q.id} (${q.topic}) not in ${chosen}`);
      if (chosen.length > 1) assert.equal(new Set(qs.map(q => topicGroup(q.topic))).size, chosen.length, 'every chosen category represented');
    }
    const a = selectQuestions({ bank: QUESTIONS, category: role, positionLevel: 'mid', experienceLevel: 'mid', count: 8, mode: 'technical', topics: null, seed: 4 });
    const b = selectQuestions({ bank: QUESTIONS, category: role, positionLevel: 'mid', experienceLevel: 'mid', count: 8, mode: 'technical', topics: [], seed: 4 });
    assert.deepEqual(a.map(q => q.id), b.map(q => q.id));
  }
});

test('topic filter with too few questions at the level widens levels but keeps the category', () => {
  const qs = selectQuestions({ bank: QUESTIONS, category: 'devops', positionLevel: 'lead', experienceLevel: 'lead', count: 12, mode: 'technical', topics: ['Docker'], seed: 2 });
  assert.ok(qs.length >= 5);
  for (const q of qs) assert.equal(topicGroup(q.topic), 'Docker');
  assert.ok(availableCount({ bank: QUESTIONS, category: 'devops', positionLevel: 'lead', experienceLevel: 'lead', topics: ['Docker'] }) < 12);
});

test('Azure questions only go to DevOps; Java-only DSA never goes to DevOps', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const java = selectQuestions({ bank: QUESTIONS, category: 'java-backend', positionLevel: 'senior', experienceLevel: 'senior', count: 12, mode: 'mixed', seed });
    assert.ok(!java.some(q => topicGroup(q.topic) === 'Azure'));
    const ops = selectQuestions({ bank: QUESTIONS, category: 'devops', positionLevel: 'senior', experienceLevel: 'senior', count: 12, mode: 'mixed', seed });
    assert.ok(ops.every(q => belongsTo(q, 'devops')));
  }
});

test('senior/lead interviews include managerial scenarios; entry/mid do not', () => {
  const run = (pos, exp) => selectQuestions({ bank: QUESTIONS, category: 'java-backend', positionLevel: pos, experienceLevel: exp, count: 12, mode: 'mixed', seed: 11 });
  assert.equal(run('entry', 'entry').filter(q => q.type === 'managerial').length, 0);
  assert.equal(run('mid', 'mid').filter(q => q.type === 'managerial').length, 0);
  assert.ok(run('senior', 'senior').filter(q => q.type === 'managerial').length >= 1);
  assert.ok(run('lead', 'lead').filter(q => q.type === 'managerial').length >= 2);
  assert.deepEqual(planSlots(12, 'mixed', 4), { intro: 1, behavioral: 3, technical: 8 });
  assert.deepEqual(planSlots(8, 'mixed', 3), { intro: 1, behavioral: 2, technical: 5 });
  assert.deepEqual(planSlots(8, 'mixed', 2), { intro: 1, behavioral: 2, technical: 5 });
  assert.deepEqual(planSlots(5, 'technical', 4), { intro: 0, behavioral: 0, technical: 5 });
});
