// V1.6: intro opt-in, easy-to-hard ordering, strict no-repeat, topic practice, user profiles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS, topicGroup, topicsFor } from '../../www/js/data/questions.js';
import { selectQuestions, topicQuestions, byDifficulty, planSlots } from '../../www/js/engine/select.js';
import { levelById } from '../../www/js/data/meta.js';
import { greetingLine, prepGreetingLine } from '../../www/js/engine/session.js';

const minRank = q => Math.min(...q.levels.map(l => levelById(l).rank));
const base = { bank: QUESTIONS, category: 'devops', positionLevel: 'entry', experienceLevel: 'entry', count: 8, mode: 'mixed', seed: 7 };

test('"Tell me about yourself" is only asked when the user opts in', () => {
  assert.ok(!selectQuestions(base).some(q => q.type === 'intro'));
  assert.equal(selectQuestions({ ...base, includeIntro: true })[0].type, 'intro');
  assert.equal(selectQuestions(base).length, 8, 'the intro slot becomes a technical question');
  assert.deepEqual(planSlots(8, 'mixed', 1), { intro: 0, behavioral: 2, technical: 6 });
});

test('technical questions are ordered from easiest to hardest', () => {
  for (const [pos, exp] of [['entry', 'entry'], ['senior', 'mid'], ['lead', 'senior']]) {
    const tech = selectQuestions({ ...base, positionLevel: pos, experienceLevel: exp, count: 12, mode: 'technical' });
    for (let i = 1; i < tech.length; i++) assert.ok(byDifficulty(tech[i - 1], tech[i]) <= 0, `${pos}: ${tech[i - 1].id} before ${tech[i].id}`);
  }
});

test('"do not repeat" never returns a question the user has answered', () => {
  const first = selectQuestions({ ...base, mode: 'technical', count: 10 });
  const seen = Object.fromEntries(first.map(q => [q.id, Date.now()]));
  const second = selectQuestions({ ...base, mode: 'technical', count: 10, seen, allowRepeats: false, seed: 99 });
  assert.equal(second.filter(q => seen[q.id]).length, 0);
  // when everything at a level has been seen, fewer (or no) questions come back instead of repeats
  const all = Object.fromEntries(QUESTIONS.map(q => [q.id, 1]));
  assert.equal(selectQuestions({ ...base, mode: 'technical', seen: all, allowRepeats: false }).length, 0);
});

test('topic practice returns every question of the topic, easiest first, skipping answered ones', () => {
  for (const { topic } of topicsFor('devops')) {
    const qs = topicQuestions({ bank: QUESTIONS, category: 'devops', topic });
    assert.ok(qs.length >= 7, `${topic} has ${qs.length}`);
    assert.ok(qs.every(q => topicGroup(q.topic) === topic));
    for (let i = 1; i < qs.length; i++) assert.ok(minRank(qs[i - 1]) <= minRank(qs[i]), `${topic} order`);
  }
  const docker = topicQuestions({ bank: QUESTIONS, category: 'devops', topic: 'Docker' });
  assert.equal(docker[0].levels[0], 'entry', 'a fresher starts with an entry-level question');
  const seen = { [docker[0].id]: 1 };
  assert.ok(!topicQuestions({ bank: QUESTIONS, category: 'devops', topic: 'Docker', seen }).some(q => q.id === docker[0].id));
  assert.equal(topicQuestions({ bank: QUESTIONS, category: 'devops', topic: 'Docker', seen, allowRepeats: true }).length, docker.length);
});

test('DevOps has broad, fresher-friendly coverage in every topic', () => {
  for (const { topic, count } of topicsFor('devops')) {
    assert.ok(count >= 7, `${topic}: ${count}`);
    const entry = QUESTIONS.filter(q => topicGroup(q.topic) === topic && q.levels.includes('entry') && ['concept', 'scenario', 'design'].includes(q.type));
    if (!['Platform Engineering'].includes(topic)) assert.ok(entry.length >= 1, `${topic} has no entry-level question`);
  }
});

test('greetings are short', () => {
  const g = greetingLine({ interviewer: { name: 'Ananya Rao', title: 'Engineering Manager' }, candidateName: 'Rahul', position: 'DevOps Engineer', count: 8, audioChecked: true });
  assert.ok(g.split(' ').length <= 20, g);
  const p = prepGreetingLine({ interviewer: { name: 'Ananya Rao' }, candidateName: 'Rahul', count: 30, audioChecked: true, timeLimitMin: 30, topic: 'Docker' });
  assert.ok(p.split(' ').length <= 24, p);
  assert.match(p, /Docker/);
});

test('user profiles keep separate progress and can be reset', async () => {
  const mem = {};
  globalThis.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
  const { store, DEFAULT_PROFILE } = await import('../../www/js/services/store.js');
  store.saveProgress({ 'java-009': { asked: 1 } });
  assert.equal(store.activeProfile().id, DEFAULT_PROFILE);
  assert.ok(mem['interviewpro.progress.v1'], 'existing user keeps the original storage key');
  const b = store.createProfile('Priya');
  assert.equal(store.activeProfile().name, 'Priya');
  assert.deepEqual(store.progress(), {}, 'new user starts fresh');
  store.saveProgress({ 'dv-001': { asked: 1 } });
  store.switchProfile(DEFAULT_PROFILE);
  assert.ok(store.progress()['java-009'], 'first user data intact');
  store.switchProfile(b.id);
  store.resetProfile();
  assert.deepEqual(store.progress(), {}, 'reset clears only this user');
  store.switchProfile(DEFAULT_PROFILE);
  assert.ok(store.progress()['java-009']);
});
