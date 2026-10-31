// Per-question progress: what was asked, when, how well. Pure functions so they can be
// unit tested; persistence lives in services/store.js.

export const PASS_SCORE = 60; // overall score needed to count an answer as correct

/**
 * Merge a finished session into the progress map.
 * progress: { [questionId]: { n, last, best, lastScore, firstScore, lastAnswer, missed, wrong, role, scores } }
 */
export function updateProgress(progress, session, now = Date.now()) {
  const next = { ...progress };
  for (const it of session.items) {
    const r = it.result;
    const prev = next[it.questionId] || { n: 0, best: 0, scores: [] };
    const ok = !it.skipped && r.overall >= PASS_SCORE;
    next[it.questionId] = {
      ...prev,
      n: prev.n + 1,
      last: now,
      role: session.category,
      lastScore: r.overall,
      firstScore: it.firstScore ?? r.overall,
      best: Math.max(prev.best || 0, r.overall),
      lastAnswer: (it.answer || '').slice(0, 1200),
      missed: (r.missed || []).map(m => m.label),
      skipped: !!it.skipped,
      wrong: !ok,
      learned: ok ? undefined : prev.learned && prev.learned > now ? prev.learned : undefined,
      scores: [...(prev.scores || []), r.overall].slice(-6),
      mode: session.mode || 'interview',
    };
  }
  return next;
}

/** Questions the candidate has not answered correctly yet (most recent first). */
export function weakQuestions(progress, { role = null } = {}) {
  return Object.entries(progress)
    .filter(([, p]) => p.wrong && !p.learned && (!role || p.role === role))
    .sort((a, b) => b[1].last - a[1].last)
    .map(([id, p]) => ({ id, ...p }));
}

/** Manually mark a question as learned (removes it from the revision list). */
export function markLearned(progress, id, now = Date.now()) {
  if (!progress[id]) return progress;
  return { ...progress, [id]: { ...progress[id], wrong: false, learned: now } };
}

/** Map of question id -> timestamp it was last asked. */
export function seenMap(progress) {
  const out = {};
  for (const [id, p] of Object.entries(progress)) out[id] = p.last || 0;
  return out;
}

/** Summary numbers for a role. */
export function progressStats(progress, role, poolIds) {
  const pool = new Set(poolIds);
  let seen = 0, correct = 0, weak = 0;
  for (const [id, p] of Object.entries(progress)) {
    if (!pool.has(id)) continue;
    seen++;
    if (p.wrong && !p.learned) weak++; else correct++;
  }
  return { seen, total: pool.size, correct, weak };
}
