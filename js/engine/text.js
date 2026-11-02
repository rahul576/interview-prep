// Text normalisation and keyword matching used by the offline scorer.
// Designed to be tolerant of speech-to-text output ("hash code" vs "hashCode",
// "caching" vs "cache", "O(1)" vs "o 1").

export function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/\+\+/g, ' plus plus ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function tokenize(s) {
  const n = normalize(s);
  return n ? n.split(' ') : [];
}

const DOUBLE_OK = new Set(['l', 's', 'z']);

/** A tiny, deterministic suffix stemmer (Porter-lite). */
export function stemWord(w) {
  let t = w;
  if (t.length <= 3 || /^\d+$/.test(t)) return t;
  if (t.endsWith('ies') && t.length > 4) t = t.slice(0, -3) + 'y';
  else if (t.endsWith('sses')) t = t.slice(0, -2);
  else if (/(ss|x|ch|sh|z)es$/.test(t)) t = t.slice(0, -2);
  else if (t.endsWith('s') && !/(ss|us|is)$/.test(t) && t.length > 3) t = t.slice(0, -1);

  let stripped = false;
  if (t.endsWith('ing') && t.length - 3 >= 4) { t = t.slice(0, -3); stripped = true; }
  else if (t.endsWith('ed') && t.length - 2 >= 3) { t = t.slice(0, -2); stripped = true; }
  if (stripped) {
    const a = t[t.length - 1], b = t[t.length - 2];
    if (a === b && !'aeiou'.includes(a) && !DOUBLE_OK.has(a)) t = t.slice(0, -1);
  }
  if (t.endsWith('e') && t.length > 4) t = t.slice(0, -1);
  return t;
}

/** Pre-process an answer once so many keywords can be matched quickly. */
export function prepare(text) {
  const raw = tokenize(text);
  const stem = raw.map(stemWord);
  const compact = new Set();
  for (let i = 0; i < raw.length; i++) {
    for (let len = 2; len <= 3 && i + len <= raw.length; len++) {
      compact.add(stemWord(raw.slice(i, i + len).join('')));
    }
  }
  return { raw, stem, stemSet: new Set(stem), joined: ' ' + stem.join(' ') + ' ', compact };
}

/**
 * Does the prepared answer contain the keyword?
 * - multi-word keywords match as a phrase
 * - "word*" matches any word starting with the prefix
 * - spacing variants are tolerated ("hash code" == "hashcode")
 */
export function matchKeyword(prep, keyword) {
  const isPrefix = keyword.trim().endsWith('*');
  const toks = tokenize(keyword.replace(/\*\s*$/, ''));
  if (!toks.length || !prep.raw.length) return false;

  if (isPrefix) {
    const n = toks.length;
    const head = toks.slice(0, -1).map(stemWord);
    const last = toks[n - 1];
    for (let i = 0; i + n <= prep.raw.length; i++) {
      let ok = true;
      for (let j = 0; j < n - 1; j++) if (prep.stem[i + j] !== head[j]) { ok = false; break; }
      if (ok && (prep.raw[i + n - 1].startsWith(last) || prep.stem[i + n - 1].startsWith(stemWord(last)))) return true;
    }
    const compactPrefix = toks.join('');
    if (compactPrefix.length >= 6) {
      for (const c of prep.compact) if (c.startsWith(compactPrefix)) return true;
    }
    return false;
  }

  const kwStem = toks.map(stemWord);
  if (prep.joined.includes(' ' + kwStem.join(' ') + ' ')) return true;

  const compactKw = stemWord(toks.join(''));
  if (compactKw.length >= 5) {
    if (prep.compact.has(compactKw)) return true;               // answer split, keyword joined
    if (toks.length > 1 && prep.stemSet.has(compactKw)) return true; // answer joined, keyword split
  }
  return false;
}

export function countPhrases(prep, phrases) {
  let count = 0;
  for (const p of phrases) {
    const kw = tokenize(p).join(' ');
    if (!kw) continue;
    const hay = ' ' + prep.raw.join(' ') + ' ';
    let idx = hay.indexOf(' ' + kw + ' ');
    while (idx !== -1) { count++; idx = hay.indexOf(' ' + kw + ' ', idx + kw.length + 1); }
  }
  return count;
}
