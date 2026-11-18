import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS, topicsFor, belongsTo } from '../../www/js/data/questions.js';
import { SYSDESIGN } from '../../www/js/data/sysdesign/index.js';
import { CATEGORIES, categoryById } from '../../www/js/data/meta.js';
import { selectQuestions } from '../../www/js/engine/select.js';

test('V1.18 adds a System Design role beside Java and DevOps', () => {
  assert.deepEqual(CATEGORIES.map(c => c.id), ['java-backend', 'devops', 'system-design']);
  const sd = categoryById('system-design');
  assert.equal(sd.positions.length, 4);
  assert.deepEqual(sd.positions.map(p => p.level), ['entry', 'mid', 'senior', 'lead']);
});

test('System Design role has 100 new questions, mostly scenario and design', () => {
  assert.equal(SYSDESIGN.length, 100);
  const inBank = QUESTIONS.filter(q => q.cat === 'system-design');
  assert.equal(inBank.length, 100);
  const practical = SYSDESIGN.filter(q => q.type !== 'concept').length;
  assert.ok(practical >= 50, `scenario/design: ${practical}`);
  for (const q of inBank) assert.ok(!belongsTo(q, 'java-backend') && !belongsTo(q, 'devops'), q.id);
});

test('Existing Java system design questions are shared with the System Design role', () => {
  const shared = QUESTIONS.filter(q => q.cat === 'shared' && q.roles.includes('system-design'));
  assert.ok(shared.length >= 20, `shared: ${shared.length}`);
  for (const q of shared) assert.ok(belongsTo(q, 'java-backend') && belongsTo(q, 'system-design'), q.id);
  assert.ok(topicsFor('java-backend').some(t => t.topic === 'System Design & Architecture'));
});

test('System Design role offers its own topic chips and HR questions', () => {
  const topics = topicsFor('system-design').map(t => t.topic);
  for (const t of ['Classic Design Problems', 'Distributed Systems', 'AI & ML System Design', 'System Design & Architecture']) assert.ok(topics.includes(t), t);
  assert.ok(!topics.includes('Kubernetes') && !topics.includes('Core Java & OOP'));
  assert.ok(QUESTIONS.some(q => q.cat === 'common' && belongsTo(q, 'system-design')));
});

test('Interviews for every System Design level draw from the System Design pool', () => {
  for (const level of ['entry', 'mid', 'senior', 'lead']) {
    const qs = selectQuestions({ bank: QUESTIONS, category: 'system-design', positionLevel: level, experienceLevel: level, count: 8, mode: 'technical', seed: 7 });
    assert.ok(qs.length >= 6, `${level}: ${qs.length}`);
    for (const q of qs) assert.ok(belongsTo(q, 'system-design'), `${level} ${q.id}`);
  }
});
