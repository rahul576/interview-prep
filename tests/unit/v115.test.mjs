import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS, topicsFor, belongsTo, questionById } from '../../www/js/data/questions.js';
import { selectQuestions, topicQuestions, dropTwins } from '../../www/js/engine/select.js';

const NEW = QUESTIONS.filter(q => q.source === 'owner-set2');

test('owner question set 2: all 357 questions with answers, key points and follow-ups', () => {
  assert.equal(NEW.length, 357);
  const ids = new Set(NEW.map(q => q.id));
  for (let i = 1; i <= 357; i++) assert.ok(ids.has(`nq-${String(i).padStart(3, '0')}`), `nq-${i}`);
  for (const q of NEW) {
    assert.ok(q.ideal.length > 150 && q.keyPoints.length >= 3 && q.followUp, q.id);
    assert.ok(q.levels.length && q.levels.every(Boolean), q.id);
  }
});

test('CI/CD, cloud, Agile and GenAI questions are shared with DevOps; Java-only ones are not', () => {
  const shared = NEW.filter(q => q.cat === 'shared');
  assert.equal(shared.length, 69);
  for (const q of shared) { assert.ok(belongsTo(q, 'java-backend') && belongsTo(q, 'devops'), q.id); }
  assert.ok(!belongsTo(questionById('nq-014'), 'devops'), 'virtual threads stay Java-only');
  assert.ok(belongsTo(questionById('nq-347'), 'devops'), 'MCP is shared');
});

test('new categories appear for both roles', () => {
  const java = topicsFor('java-backend').map(t => t.topic), devops = topicsFor('devops').map(t => t.topic);
  for (const t of ['Modern Java (11-21)', 'Coding Exercises', 'AI/ML & GenAI', 'Agile & Scrum', 'Project Experience']) assert.ok(java.includes(t), t);
  for (const t of ['AI/ML & GenAI', 'Agile & Scrum']) assert.ok(devops.includes(t), t);
  assert.ok(!devops.includes('Modern Java (11-21)'));
});

test('linked duplicates (sameAs) are never asked together and count as seen together', () => {
  const twins = NEW.filter(q => q.sameAs);
  assert.equal(twins.length, 8);
  for (const q of twins) assert.ok(questionById(q.sameAs), q.sameAs);
  const a = questionById('nq-024'), b = questionById('jb-064');
  assert.equal(dropTwins([a, b]).length, 1);
  // practising a topic after answering the old twin does not show the new one again
  const seen = { 'jb-064': Date.now() };
  const list = topicQuestions({ bank: QUESTIONS, category: 'java-backend', topic: 'Java 8+ Features', seen });
  assert.ok(!list.some(q => q.id === 'nq-024' || q.id === 'jb-064'));
  // many random sessions: never both twins in one session
  for (let seed = 1; seed <= 60; seed++) {
    const qs = selectQuestions({ bank: QUESTIONS, category: 'java-backend', positionLevel: 'mid', experienceLevel: 'mid', count: 20, seed, topics: ['Java 8+ Features', 'Concurrency', 'Design Patterns', 'Spring & Spring Boot', 'REST & API Design', 'Microservices', 'Testing & Observability', 'CI/CD & Git'] });
    const ids = new Set(qs.map(q => q.id));
    for (const q of twins) assert.ok(!(ids.has(q.id) && ids.has(q.sameAs)), `${q.id} with ${q.sameAs} (seed ${seed})`);
  }
});
