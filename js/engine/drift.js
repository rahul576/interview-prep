// Detects when a live answer is heading in a completely different direction from the
// question, so the interviewer can politely interrupt (once per question), as real
// interviewers do.
import { prepare, matchKeyword, tokenize, stemWord } from './text.js';

export const DRIFT = Object.freeze({
  minWords: 45,       // never interrupt before the candidate has said this much
  maxRelevance: 0,    // no key point covered at all ...
  maxOverlap: 0.06,   // ... and almost no shared vocabulary with question + key points
});

const STOP = new Set(('a an the and or but if then so to of in on at for with by from as is are was were be been being it its this that these those '
  + 'i you he she we they me my your our their them us do does did have has had can could would should will shall may might must not no yes '
  + 'what when where which who whom why how about into over under more most some any all each other such only own same than too very just '
  + 'also like well really basically actually there here one two three use used using make made way thing things get got lot').split(' '));

/** Content vocabulary of a question: words of the question and of every key-point keyword. */
export function questionVocabulary(q) {
  const words = new Set();
  const add = (text) => tokenize(String(text).replace(/\*/g, '')).forEach(w => { if (w.length > 2 && !STOP.has(w)) words.add(stemWord(w)); });
  add(q.q);
  for (const p of q.keyPoints) { add(p.label); p.k.forEach(add); }
  return words;
}

/**
 * Is this (partial) answer drifting off-topic?
 * Open questions (intro, behavioural, managerial) are never interrupted.
 * @returns {{drifting: boolean, words: number, overlap: number, covered: number}}
 */
export function driftCheck(q, text) {
  const prep = prepare(text);
  const words = prep.raw.length;
  const res = { drifting: false, words, overlap: 0, covered: 0 };
  if (!['concept', 'scenario', 'design'].includes(q.type) || words < DRIFT.minWords) return res;
  res.covered = q.keyPoints.filter(p => p.k.some(k => matchKeyword(prep, k))).length;
  const vocab = questionVocabulary(q);
  const content = prep.stem.filter((w, i) => prep.raw[i].length > 2 && !STOP.has(prep.raw[i]));
  const hits = content.filter(w => vocab.has(w)).length;
  res.overlap = content.length ? hits / content.length : 0;
  res.drifting = res.covered <= DRIFT.maxRelevance && res.overlap <= DRIFT.maxOverlap;
  return res;
}

export function interruptionLine(q) {
  const focus = q.keyPoints[0].label.split(/[–(]/)[0].trim();
  return `Sorry to interrupt \u2014 I think we\u2019re drifting away from the question. I was asking: ${q.q} Could you bring it back to that? A good place to start: ${focus}.`;
}
