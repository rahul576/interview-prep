// Validates the offline question bank: schema, coverage per role/level, and
// that every model answer actually satisfies its own key points (accuracy).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS, belongsTo, topicsFor, topicGroup, TECH_TYPES } from '../../www/js/data/questions.js';
import { CATEGORIES, LEVEL_IDS } from '../../www/js/data/meta.js';
import { scoreAnswer } from '../../www/js/engine/score.js';
import { prepare, matchKeyword } from '../../www/js/engine/text.js';

test('every question has a valid schema', () => {
  const ids = new Set();
  for (const q of QUESTIONS) {
    assert.ok(q.id && !ids.has(q.id), `duplicate or missing id ${q.id}`);
    ids.add(q.id);
    assert.ok(['java-backend', 'devops', 'common', 'shared'].includes(q.cat), `${q.id} cat`);
    if (q.cat === 'shared') assert.ok(Array.isArray(q.roles) && q.roles.length, `${q.id} shared needs roles`);
    assert.ok(q.topic, `${q.id} topic`);
    assert.ok(Array.isArray(q.levels) && q.levels.length, `${q.id} levels`);
    for (const l of q.levels) assert.ok(LEVEL_IDS.includes(l), `${q.id} bad level ${l}`);
    assert.ok(['intro', 'concept', 'scenario', 'design', 'behavioral', 'managerial'].includes(q.type), `${q.id} type`);
    assert.ok(q.q.endsWith('?') || q.q.endsWith('.'), `${q.id} question punctuation`);
    assert.ok(q.keyPoints.length >= 3 && q.keyPoints.length <= 6, `${q.id} needs 3-6 key points`);
    for (const p of q.keyPoints) {
      assert.ok(p.label && p.k.length >= 1, `${q.id} key point`);
      for (const k of p.k) assert.ok(typeof k === 'string' && k.trim().length >= 2, `${q.id} keyword "${k}"`);
    }
    assert.ok(q.ideal.split(' ').length >= 50, `${q.id} ideal answer too short`);
    assert.ok(q.followUp && q.followUp.endsWith('?'), `${q.id} followUp`);
  }
});

test('bank size and coverage for every role x level', () => {
  assert.ok(QUESTIONS.length >= 300, `bank has ${QUESTIONS.length} questions`);
  for (const c of CATEGORIES) {
    for (const l of LEVEL_IDS) {
      const n = QUESTIONS.filter(q => TECH_TYPES.includes(q.type) && belongsTo(q, c.id) && q.levels.includes(l)).length;
      assert.ok(n >= 25, `${c.id}/${l} only has ${n} technical questions`);
    }
  }
  for (const l of LEVEL_IDS) {
    const n = QUESTIONS.filter(q => q.cat === 'common' && q.type === 'behavioral' && q.levels.includes(l)).length;
    assert.ok(n >= 6, `behavioural/${l} only has ${n}`);
  }
  for (const l of ['senior', 'lead']) {
    const n = QUESTIONS.filter(q => q.type === 'managerial' && q.levels.includes(l)).length;
    assert.ok(n >= 15, `managerial/${l} only has ${n}`);
  }
  assert.equal(QUESTIONS.filter(q => q.type === 'managerial' && q.levels.some(l => l === 'entry' || l === 'mid')).length, 0, 'managerial is for senior/lead only');
});

test('requested topic areas are present', () => {
  const java = topicsFor('java-backend').map(t => t.topic);
  const ops = topicsFor('devops').map(t => t.topic);
  for (const t of ['DSA', 'Kafka', 'Elasticsearch', 'Spring & Spring Boot', 'Concurrency', 'System Design & Architecture']) assert.ok(java.includes(t), `java missing ${t}`);
  for (const t of ['Azure', 'Kubernetes', 'Kafka', 'Elasticsearch', 'CI/CD & Git', 'GitOps & Helm', 'DevSecOps & Code Quality', 'Observability & SRE', 'IaC & Config Management']) assert.ok(ops.includes(t), `devops missing ${t}`);
  for (const t of [...java, ...ops]) assert.ok(topicsFor('java-backend').concat(topicsFor('devops')).find(x => x.topic === t).count >= 3, `category ${t} too thin`);
  assert.ok(QUESTIONS.filter(q => topicGroup(q.topic) === 'Azure').length >= 20, 'Azure coverage');
  assert.ok(QUESTIONS.filter(q => topicGroup(q.topic) === 'DSA').length >= 30, 'DSA coverage');
});

test('ACCURACY: each model answer covers 100% of its own key points', () => {
  const failures = [];
  for (const q of QUESTIONS) {
    const r = scoreAnswer(q, q.ideal);
    if (r.missed.length) failures.push(`${q.id}: missed ${r.missed.map(m => m.label).join(' | ')}`);
  }
  assert.deepEqual(failures, []);
});

test('ACCURACY: model answers score highly overall (>= 85)', () => {
  for (const q of QUESTIONS) {
    const r = scoreAnswer(q, q.ideal);
    assert.ok(r.overall >= 85, `${q.id} ideal scored ${r.overall}`);
  }
});

test('ACCURACY: an answer from a different topic scores low (discrimination)', () => {
  const tech = QUESTIONS.filter(q => q.cat !== 'common');
  let pairs = 0, low = 0, worst = [];
  for (const a of tech) {
    for (const b of tech) {
      if (a.topic === b.topic || a.cat !== b.cat) continue;
      pairs++;
      const r = scoreAnswer(a, b.ideal);
      if (r.technical < 60) low++; else worst.push(`${a.id} <- ${b.id} (${r.technical})`);
    }
  }
  const ratio = low / pairs;
  console.log(`    discrimination: ${(ratio * 100).toFixed(2)}% of ${pairs} cross-topic pairs scored < 60`);
  assert.ok(ratio >= 0.97, `only ${(ratio * 100).toFixed(1)}% of off-topic answers scored low. e.g. ${worst.slice(0, 10).join(', ')}`);
});

test('each keyword is reachable: it matches its own text', () => {
  for (const q of QUESTIONS) for (const p of q.keyPoints) for (const k of p.k) {
    const text = k.replace(/\*$/, '');
    assert.ok(matchKeyword(prepare(text + (k.endsWith('*') ? 'ing' : '')), k), `${q.id}: "${k}" does not match itself`);
  }
});
