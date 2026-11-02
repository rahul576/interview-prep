// V1.5 AI interviewer: conversation flow with a stubbed AI, limits, fallbacks, proxy security.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InterviewSession, isRepeatRequest, dontKnowLine } from '../../www/js/engine/session.js';
import { QUESTIONS } from '../../www/js/data/questions.js';
import { AIInterviewer, parseJson } from '../../www/js/services/ai.js';

const persona = { name: 'Ananya Rao', title: 'Engineering Manager', gender: 'female' };
const q1 = QUESTIONS.find(q => q.id === 'java-009');
const q2 = QUESTIONS.find(q => q.id === 'kafka-001');

function run({ answers, react, followUps = true }) {
  const said = []; const asked = [];
  let a = 0;
  const io = {
    say: async (text, meta) => { said.push({ text, kind: meta.kind }); },
    getAnswer: async (meta) => { asked.push(meta.kind); return answers[a++] || { action: 'done', text: '' }; },
    react,
  };
  const s = new InterviewSession({ questions: [q1, q2], config: { interviewer: persona, candidateName: 'Rahul', position: 'Java Backend Engineer', followUps, seed: 3, mode: 'interview' }, io });
  return s.run().then(r => ({ r, said, asked }));
}

test('AI reaction replaces the stock transition after "I don\'t know"', async () => {
  const calls = [];
  const { r, said } = await run({
    answers: [{ action: 'done', text: 'Honestly I do not know this one' }, { action: 'done', text: q2.ideal }],
    react: async (ctx) => { calls.push(ctx); return ctx.question === q1 ? { action: 'next', say: 'No problem. HashMap stores entries in buckets chosen by the hash code.', intent: 'dont_know' } : { action: 'next', say: 'Nice, that was thorough.' }; },
  });
  assert.equal(calls[0].answer, 'Honestly I do not know this one');
  assert.ok(said.some(s => s.text.startsWith('No problem. HashMap stores entries')), 'AI reaction spoken');
  assert.ok(!said.some(s => /^(Thank you|Okay, got it|Alright, thanks|Understood|Thanks for that)/.test(s.text)), 'no stock acknowledgement');
  assert.equal(r.items.length, 2);
});

test('AI nudge asks a targeted question and the extra answer is scored together', async () => {
  let n = 0;
  const { r, said, asked } = await run({
    answers: [{ action: 'done', text: 'It uses an array of buckets.' }, { action: 'done', text: 'It calls hashCode, uses equals for collisions, and treeifies long chains into red black trees; it resizes at the load factor.' }, { action: 'skip', text: '' }],
    react: async (ctx) => (++n === 1 ? { action: 'nudge', say: 'How does it handle two keys with the same hash?', intent: 'partial' } : { action: 'next', say: 'Good, that covers it.' }),
  });
  assert.ok(said.some(s => s.text === 'How does it handle two keys with the same hash?' && s.kind === 'nudge'));
  assert.deepEqual(asked.slice(0, 2), ['answer', 'nudge']);
  assert.ok(r.items[0].result.overall > 40, `combined answer scored ${r.items[0].result.overall}`);
  assert.equal(r.items[0].nudge.prompt, 'How does it handle two keys with the same hash?');
});

test('repeat request: question is repeated and only the real answer is scored', async () => {
  let n = 0;
  const { r, said } = await run({
    answers: [{ action: 'done', text: 'sorry can you repeat the question' }, { action: 'done', text: q1.ideal }, { action: 'skip' }],
    react: async () => (++n === 1 ? { action: 'repeat', say: 'Sure.', intent: 'repeat' } : { action: 'next', say: 'Great answer.' }),
  });
  assert.ok(said.some(s => s.text === `Sure. ${q1.q}`));
  assert.equal(r.items[0].answer, q1.ideal);
  assert.ok(r.items[0].result.overall >= 80);
});

test('AI unavailable (null) falls back to the rule-based interviewer', async () => {
  const { r, said } = await run({ answers: [{ action: 'done', text: 'I don\'t know' }, { action: 'skip' }], react: async () => null });
  assert.equal(r.items.length, 2);
  assert.ok(said.some(s => /fine|No worries|okay/.test(s.text)), 'offline "don\'t know" reaction');
});

test('offline helpers: repeat detection and don\'t-know line', () => {
  assert.ok(isRepeatRequest('Sorry, could you repeat that?'));
  assert.ok(isRepeatRequest('pardon'));
  assert.ok(!isRepeatRequest('HashMap uses buckets and I repeat the hash function for each key to spread entries evenly across the table which avoids collisions'));
  assert.match(dontKnowLine(() => 0, q1, false), /move on/);
});

function fakeClaude(reply) {
  const calls = [];
  const fetchImpl = async (url, opts) => { calls.push({ url, opts, body: JSON.parse(opts.body) }); return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: typeof reply === 'function' ? reply() : reply }] }) }; };
  globalThis.localStorage = { _s: { 'interviewpro.ai.v1': JSON.stringify({ apiKey: 'sk-ant-test' }) }, getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = v; } };
  const ai = new AIInterviewer({ fetchImpl });
  ai.provider = 'claude-browser';
  return { ai, calls };
}
const ctx = (over = {}) => ({ persona, position: 'Java Backend Engineer', level: 'Senior', mode: 'interview', question: q1, answer: 'buckets', history: [], result: { matched: [], missed: q1.keyPoints }, followUpsLeft: 1, allowFollowUps: true, isLast: false, turn: 0, ...over });

test('AIInterviewer.react: parses JSON from Claude and sends a context-rich prompt', async () => {
  const { ai, calls } = fakeClaude('Here you go: {"intent":"partial","action":"nudge","say":"What happens on a collision?"}');
  const r = await ai.react(ctx());
  assert.deepEqual(r, { action: 'nudge', say: 'What happens on a collision?', intent: 'partial' });
  const b = calls[0].body;
  assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(calls[0].opts.headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.match(b.messages[0].content, /CANDIDATE'S LATEST ANSWER: "buckets"/);
  assert.match(b.system, /Never reveal the model answer/);
});

test('AIInterviewer.react enforces turn and follow-up limits', async () => {
  const { ai } = fakeClaude('{"action":"followup","say":"Tell me more about treeification?"}');
  assert.deepEqual(await ai.react(ctx({ turn: 2 })), { action: 'next', say: '', intent: '' });
  assert.equal((await ai.react(ctx({ followUpsLeft: 0 }))).action, 'next');
  assert.equal((await ai.react(ctx())).action, 'followup');
});

test('AIInterviewer returns null on garbage or errors (caller falls back)', async () => {
  const { ai } = fakeClaude('sorry I cannot help');
  assert.equal(await ai.react(ctx()), null);
  const bad = new AIInterviewer({ fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'invalid x-api-key' } }) }) });
  bad.provider = 'claude-browser';
  assert.equal(await bad.react(ctx()), null);
  assert.match(bad.lastError, /invalid/);
});

test('coach and summarize', async () => {
  const { ai } = fakeClaude('{"say":"You scored 40. You mentioned buckets, good. Next time explain hashCode and equals."}');
  assert.match(await ai.coach({ ...ctx(), result: { overall: 40, technical: 30, communication: 60, matched: [], missed: q1.keyPoints } }), /hashCode and equals/);
  const s2 = fakeClaude('{"summary":"Solid basics.","strengths":["Clear"],"improvements":["Go deeper"],"studyTopics":["HashMap"]}');
  const fb = await s2.ai.summarize({ items: [{ question: q1, answer: 'x', result: { overall: 50 } }], position: 'Java', persona, level: 'Senior', mode: 'interview' });
  assert.equal(fb.summary, 'Solid basics.');
  assert.deepEqual(fb.studyTopics, ['HashMap']);
});

test('parseJson handles fences and nested braces', () => {
  assert.deepEqual(parseJson('```json\n{"a":{"b":"}"}}\n```'), { a: { b: '}' } });
  assert.equal(parseJson('no json'), null);
});

test('local AI proxy: same-origin only, key stored privately, no key -> clear error', async () => {
  process.env.INTERVIEWPRO_DATA = await mkdtemp(join(tmpdir(), 'ip-'));
  delete process.env.ANTHROPIC_API_KEY;
  const { createServer } = await import(`../../scripts/serve.mjs?${Date.now()}`);
  const server = createServer().listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/ai/status`)).status, 403, 'missing header rejected');
    assert.equal((await fetch(`${base}/api/ai/status`, { headers: { 'x-interviewpro': '1', origin: 'https://evil.example' } })).status, 403, 'foreign origin rejected');
    const h = { 'x-interviewpro': '1', 'content-type': 'application/json' };
    assert.deepEqual((await (await fetch(`${base}/api/ai/status`, { headers: h })).json()).claude, false);
    assert.equal((await fetch(`${base}/api/ai/messages`, { method: 'POST', headers: h, body: '{}' })).status, 400);
    assert.equal((await fetch(`${base}/api/ai/key`, { method: 'POST', headers: h, body: JSON.stringify({ key: 'nope' }) })).status, 400);
    const key = 'sk-ant-api03-' + 'x'.repeat(40);
    assert.equal((await fetch(`${base}/api/ai/key`, { method: 'POST', headers: h, body: JSON.stringify({ key }) })).status, 200);
    const file = join(process.env.INTERVIEWPRO_DATA, 'anthropic.key');
    assert.equal((await readFile(file, 'utf8')).trim(), key);
    assert.equal((await stat(file)).mode & 0o777, 0o600, 'key file is private');
    assert.equal((await (await fetch(`${base}/api/ai/status`, { headers: h })).json()).claude, true);
    await fetch(`${base}/api/ai/key`, { method: 'DELETE', headers: h });
    assert.equal((await (await fetch(`${base}/api/ai/status`, { headers: h })).json()).claude, false);
    assert.equal((await fetch(`${base}/index.html`)).status, 200, 'static files still served');
  } finally { server.close(); }
});
