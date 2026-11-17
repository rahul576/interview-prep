import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS, topicsFor, belongsTo } from '../../www/js/data/questions.js';
import { V117 } from '../../www/js/data/v117/index.js';

const count = (topic) => V117.filter(q => q.topic === topic).length;

test('V1.17 adds at least 100 questions each for Kubernetes, Terraform, Azure and MCP Servers', () => {
  assert.equal(count('Kubernetes'), 100);
  assert.equal(count('Terraform'), 100);
  assert.equal(V117.filter(q => /^Azure/.test(q.topic)).length, 100);
  assert.equal(count('MCP Servers'), 100);
});

test('V1.17 puts the main focus on AI/ML topics', () => {
  const ai = ['MCP Servers', 'MLOps', 'LLMOps & RAG', 'AI Agents & AIOps', 'AI/ML & GenAI', 'Azure AI & Foundry'];
  const n = V117.filter(q => ai.includes(q.topic)).length;
  assert.ok(n >= 430, `AI/ML questions: ${n}`);
  assert.ok(n > V117.length / 2);
  assert.equal(count('MLOps'), 85);
  assert.equal(count('LLMOps & RAG'), 90);
  assert.equal(count('AI Agents & AIOps'), 85);
  assert.equal(count('AI/ML & GenAI'), 60);
  assert.equal(V117.length, 720);
});

test('AI topics are offered to both roles; infrastructure topics to DevOps', () => {
  for (const t of ['MCP Servers', 'LLMOps & RAG', 'AI Agents & AIOps', 'AI/ML & GenAI'])
    for (const role of ['devops', 'java-backend'])
      assert.ok(topicsFor(role).some(x => x.topic === t), `${t} for ${role}`);
  for (const t of ['Kubernetes', 'Terraform', 'MLOps'])
    assert.ok(QUESTIONS.filter(q => q.topic === t && V117.some(v => v.id === q.id)).every(q => belongsTo(q, 'devops')), t);
  assert.ok(topicsFor('devops').some(x => x.topic === 'Azure' && x.count >= 117));
});

test('many V1.17 questions are real-world scenarios or designs', () => {
  const s = V117.filter(q => q.type === 'scenario' || q.type === 'design').length;
  assert.ok(s >= 180, `scenario/design questions: ${s}`);
  const ids = new Set(QUESTIONS.map(q => q.id));
  assert.equal(ids.size, QUESTIONS.length);
});
