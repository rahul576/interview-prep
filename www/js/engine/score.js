// Offline answer evaluation: technical coverage of key points + communication quality.
import { prepare, matchKeyword, countPhrases } from './text.js';

export const FILLERS = ['um', 'uh', 'uhm', 'umm', 'erm', 'hmm', 'basically', 'actually', 'you know', 'i mean', 'sort of', 'kind of', 'literally'];
export const CONNECTORS = ['because', 'for example', 'for instance', 'such as', 'first', 'second', 'then', 'finally', 'however', 'so that', 'which means', 'in summary', 'trade off', 'on the other hand', 'as a result', 'in practice'];
const DONT_KNOW = ['i dont know', 'i do not know', 'no idea', 'not sure', 'dont remember', 'skip this', 'pass'];

export const WEIGHTS = Object.freeze({ technical: 0.7, communication: 0.3 });

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

/** Number of key points needed for full technical marks (one free miss on long lists). */
export function pointsForFullMarks(total) {
  return total >= 5 ? total - 1 : total;
}

export function lengthScore(words) {
  if (words === 0) return 0;
  if (words < 10) return 20;
  if (words < 25) return 50;
  if (words < 40) return 75;
  if (words <= 260) return 100;
  if (words <= 400) return 85;
  return 70;
}

/**
 * Score a single answer.
 * @param {object} question - bank question
 * @param {string} answer - transcript
 * @param {{durationSec?: number}} [opts]
 */
export function scoreAnswer(question, answer, opts = {}) {
  const prep = prepare(answer);
  const words = prep.raw.length;
  const matched = [];
  const missed = [];
  for (const point of question.keyPoints) {
    const hit = point.k.find(k => matchKeyword(prep, k));
    if (hit) matched.push({ label: point.label, keyword: hit });
    else missed.push({ label: point.label });
  }
  const total = question.keyPoints.length;
  const coverage = total ? matched.length / total : 0;
  const normalizedText = ' ' + prep.raw.join(' ') + ' ';
  const dontKnow = DONT_KNOW.some(p => normalizedText.includes(' ' + p + ' ')) && matched.length === 0;

  let technical = Math.round(100 * Math.min(1, matched.length / pointsForFullMarks(total)));
  if (words < 8) technical = Math.round(technical * 0.5);

  // Communication
  const fillerCount = countPhrases(prep, FILLERS);
  const connectorCount = countPhrases(prep, CONNECTORS);
  const fillerRate = words ? fillerCount / words : 0;
  let communication = lengthScore(words);
  communication -= Math.min(30, Math.round(fillerRate * 300));
  communication += Math.min(10, connectorCount * 3);
  let wpm = null;
  if (opts.durationSec && opts.durationSec > 3 && words > 15) {
    wpm = Math.round(words / (opts.durationSec / 60));
    if (wpm < 90 || wpm > 190) communication -= 10;
  }
  if (dontKnow) communication = Math.min(communication, 40);
  communication = Math.round(clamp(communication));
  if (words === 0) communication = 0;

  const overall = Math.round(WEIGHTS.technical * technical + WEIGHTS.communication * communication);

  const tips = [];
  if (words === 0) tips.push('No answer was recorded for this question.');
  else {
    if (dontKnow) tips.push('It is fine not to know — say how you would find out, or reason from first principles.');
    if (words < 25) tips.push('Your answer was very short. Aim for 45–90 seconds with an explanation and an example.');
    if (words > 400) tips.push('Your answer was long. Lead with the key point, then add detail.');
    if (fillerRate > 0.05) tips.push(`Reduce filler words (${fillerCount} detected).`);
    if (connectorCount === 0 && words >= 25) tips.push('Structure your answer: use signposts like "first", "because", "for example".');
    if (wpm && wpm > 190) tips.push(`You spoke fast (${wpm} words/min). Slow down slightly.`);
    if (wpm && wpm < 90) tips.push(`Your pace was slow (${wpm} words/min). Practise to build fluency.`);
    if (missed.length) tips.push(`Also cover: ${missed.slice(0, 3).map(m => m.label.toLowerCase()).join('; ')}.`);
  }

  return {
    questionId: question.id,
    coverage, technical, communication, overall,
    matched, missed, wordCount: words, fillerCount, connectorCount, wpm,
    flags: { dontKnow, empty: words === 0, tooShort: words > 0 && words < 25 },
    tips,
  };
}

export function verdictFor(score) {
  if (score >= 80) return { label: 'Strong performance', tone: 'great', note: 'You would likely clear this round. Keep polishing depth and examples.' };
  if (score >= 65) return { label: 'Interview-ready with polish', tone: 'good', note: 'Solid fundamentals. Tighten weaker topics and add concrete examples.' };
  if (score >= 50) return { label: 'Borderline', tone: 'warn', note: 'Some good answers, but gaps would show in a real interview. Practise the topics below.' };
  return { label: 'Needs more preparation', tone: 'bad', note: 'Focus on the fundamentals listed below, then retake this interview.' };
}

/**
 * Aggregate per-question results into a session report.
 * @param {Array<{question: object, result: object, skipped?: boolean}>} items
 */
export function summarize(items) {
  const scored = items.filter(i => i.result);
  const avg = (arr) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
  const technical = avg(scored.map(i => i.result.technical));
  const communication = avg(scored.map(i => i.result.communication));
  const overall = Math.round(WEIGHTS.technical * technical + WEIGHTS.communication * communication);

  const byTopic = {};
  for (const i of scored) {
    const t = i.question.topic;
    (byTopic[t] ||= []).push(i.result.overall);
  }
  const topics = Object.entries(byTopic)
    .map(([topic, s]) => ({ topic, score: avg(s), count: s.length }))
    .sort((a, b) => b.score - a.score);

  const strengths = topics.filter(t => t.score >= 70).map(t => t.topic);
  const improve = topics.filter(t => t.score < 55).map(t => t.topic);

  const missedPoints = [];
  for (const i of scored) for (const m of i.result.missed) missedPoints.push({ topic: i.question.topic, label: m.label });

  const totalFillers = scored.reduce((a, i) => a + i.result.fillerCount, 0);
  const totalWords = scored.reduce((a, i) => a + i.result.wordCount, 0);

  return {
    overall, technical, communication,
    verdict: verdictFor(overall),
    answered: scored.filter(i => !i.result.flags.empty).length,
    skipped: items.filter(i => i.skipped).length,
    total: items.length,
    topics, strengths, improve,
    focusPoints: missedPoints.slice(0, 8),
    fillerRate: totalWords ? +(totalFillers / totalWords * 100).toFixed(1) : 0,
    avgWords: scored.length ? Math.round(totalWords / scored.length) : 0,
  };
}

/**
 * Selection chance (0-100): an estimate of how likely this performance would pass a real
 * round. Starts from the overall score, then adjusts for things interviewers notice:
 * skipped/blank answers, very weak answers, inconsistency, hints and level of difficulty.
 * @param {Array<{question:object,result:object,skipped?:boolean,hintUsed?:boolean,attempts?:number}>} items
 * @param {{mode?: 'interview'|'prep', levelRank?: number}} [opts]
 */
export function selectionChance(items, opts = {}) {
  const scored = items.filter(i => i.result);
  if (!scored.length) return { score: 0, label: 'Not enough data', tone: 'bad', reasons: ['No questions were answered.'] };
  const sum = summarize(scored);
  const reasons = [];
  let score = sum.overall;
  const n = scored.length;

  const skipped = scored.filter(i => i.skipped || i.result.flags.empty).length;
  if (skipped) { const p = Math.round((skipped / n) * 25); score -= p; reasons.push(`${skipped} question${skipped === 1 ? '' : 's'} skipped or left blank (−${p})`); }

  const veryWeak = scored.filter(i => !i.skipped && !i.result.flags.empty && i.result.overall < 35).length;
  if (veryWeak) { const p = Math.min(15, veryWeak * 4); score -= p; reasons.push(`${veryWeak} very weak answer${veryWeak === 1 ? '' : 's'} (−${p})`); }

  const vals = scored.map(i => i.result.overall);
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / n);
  if (n >= 3 && sd > 30) { score -= 5; reasons.push('Inconsistent: strong and weak answers mixed (−5)'); }
  else if (n >= 3 && sd < 12 && mean >= 70) { score += 3; reasons.push('Consistently strong answers (+3)'); }

  if (sum.communication >= 80) { score += 2; reasons.push('Clear, well-structured communication (+2)'); }
  else if (sum.communication < 45) { score -= 4; reasons.push('Communication needs work: length, structure or fillers (−4)'); }

  const hints = scored.filter(i => i.hintUsed).length;
  const retried = scored.filter(i => (i.attempts || 1) > 1).length;
  if (opts.mode === 'prep' && (hints || retried)) {
    const p = Math.min(15, hints * 3 + retried * 2);
    score -= p; reasons.push(`Practice aids used: ${hints} hint${hints === 1 ? '' : 's'}, ${retried} retr${retried === 1 ? 'y' : 'ies'} (−${p})`);
  }
  const interrupted = scored.filter(i => i.interrupted).length;
  if (interrupted) { const p = Math.min(10, interrupted * 3); score -= p; reasons.push(`Interviewer had to redirect ${interrupted} off-topic answer${interrupted === 1 ? '' : 's'} (−${p})`); }
  if (n < 4) { score -= 5; reasons.push('Short session: fewer than 4 questions, so less reliable (−5)'); }
  if ((opts.levelRank || 1) >= 3 && sum.technical < 60) { score -= 5; reasons.push('Senior/lead roles expect deeper technical answers (−5)'); }

  score = Math.round(Math.max(0, Math.min(100, score)));
  const band = score >= 80 ? { label: 'High chance of selection', tone: 'great' }
    : score >= 65 ? { label: 'Good chance — polish weak areas', tone: 'good' }
      : score >= 50 ? { label: 'Borderline — could go either way', tone: 'warn' }
        : { label: 'Low chance today — keep practising', tone: 'bad' };
  return { score, ...band, reasons };
}
