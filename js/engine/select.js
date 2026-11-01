// Question selection: filters the offline bank by role, level and chosen categories,
// balances topics, orders fundamentals -> scenarios -> design, and is deterministic per seed.
import { levelById, LEVEL_IDS } from '../data/meta.js';
import { belongsTo, topicGroup, TECH_TYPES } from '../data/questions.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Levels to draw from, given the position's level and the candidate's experience level. */
export function targetLevels(positionLevel, experienceLevel) {
  const set = new Set([positionLevel, experienceLevel].filter(Boolean));
  return LEVEL_IDS.filter(l => set.has(l));
}

const TYPE_ORDER = { intro: 0, concept: 1, scenario: 2, design: 3, behavioral: 4, managerial: 5 };
const minRank = q => Math.min(...q.levels.map(l => levelById(l).rank));

/**
 * How many technical vs HR questions a session has. For senior/lead, HR slots
 * are filled mostly with managerial scenarios; full lead interviews get one extra.
 */
export function planSlots(count, mode, levelRank = 1) {
  if (mode !== 'mixed') return { intro: 0, behavioral: 0, technical: count };
  let behavioral = count >= 8 ? 2 : 1;
  if (levelRank >= 4 && count >= 12) behavioral += 1;
  return { intro: 1, behavioral, technical: Math.max(1, count - 1 - behavioral) };
}

function pickDiverse(pool, n, rand, preferLevel) {
  const shuffled = shuffle(pool, rand).sort((a, b) => {
    const pa = a.levels.includes(preferLevel) ? 0 : 1;
    const pb = b.levels.includes(preferLevel) ? 0 : 1;
    return pa - pb;
  });
  // Round-robin over categories first, then topics, so chosen categories are all represented.
  const byGroup = new Map();
  for (const q of shuffled) {
    const g = topicGroup(q.topic);
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(q);
  }
  for (const [g, list] of byGroup) {
    // interleave topics inside a group (e.g. DSA sub-topics)
    const byTopic = new Map();
    for (const q of list) { if (!byTopic.has(q.topic)) byTopic.set(q.topic, []); byTopic.get(q.topic).push(q); }
    const lists = [...byTopic.values()];
    const out = [];
    for (let i = 0; out.length < list.length; i++) for (const l of lists) if (l[i]) out.push(l[i]);
    byGroup.set(g, out);
  }
  const groups = shuffle([...byGroup.keys()], rand);
  const picked = [];
  for (let round = 0; picked.length < n; round++) {
    let added = false;
    for (const g of groups) {
      const list = byGroup.get(g);
      if (list.length > round) {
        picked.push(list[round]);
        added = true;
        if (picked.length === n) break;
      }
    }
    if (!added) break;
  }
  return picked;
}

/**
 * Order candidates so nothing repeats while unseen questions remain:
 *   1. never asked  2. asked before, oldest first  3. asked in the previous session (last resort).
 * Returns at least n candidates when possible (more when there is room, for topic diversity).
 */
export function freshFirst(pool, n, seen = {}, lastSession = new Set()) {
  const never = pool.filter(q => !seen[q.id] && !lastSession.has(q.id));
  if (never.length >= n) return never;
  const older = pool.filter(q => seen[q.id] && !lastSession.has(q.id)).sort((a, b) => seen[a.id] - seen[b.id]);
  const out = [...never, ...older.slice(0, n - never.length)];
  if (out.length >= n) return out;
  return [...out, ...pool.filter(q => lastSession.has(q.id)).slice(0, n - out.length)];
}

/**
 * @param {object} p
 * @param {Array} p.bank
 * @param {string} p.category - role id, e.g. 'java-backend'
 * @param {string} p.positionLevel
 * @param {string} p.experienceLevel
 * @param {number} p.count - total questions
 * @param {'technical'|'mixed'} p.mode
 * @param {string[]|null} [p.topics] - selected categories (null/empty = all)
 * @param {number} [p.seed]
 * @param {Object<string,number>} [p.seen] - question id -> last asked timestamp
 * @param {string[]} [p.recentIds] - ids asked in the previous session (never repeated if avoidable)
 */
export function selectQuestions({ bank, category, positionLevel, experienceLevel, count = 6, mode = 'mixed', topics = null, seed = Date.now(), seen = {}, recentIds = [] }) {
  const rand = mulberry32(seed);
  const levels = targetLevels(positionLevel, experienceLevel);
  const rank = Math.max(...levels.map(l => levelById(l).rank));
  const slots = planSlots(count, mode, rank);
  const last = new Set(recentIds);
  const chosen = topics && topics.length ? new Set(topics) : null;
  const overlaps = q => q.levels.some(l => levels.includes(l));
  const inTopics = q => !chosen || chosen.has(topicGroup(q.topic));
  const unseen = q => !seen[q.id] && !last.has(q.id);

  // Technical: at-level questions first; nearby levels only to avoid repeats or fill gaps.
  const techBase = bank.filter(q => TECH_TYPES.includes(q.type) && belongsTo(q, category) && inTopics(q));
  const atLevel = techBase.filter(overlaps);
  const ranks = levels.map(l => levelById(l).rank);
  const lo = Math.min(...ranks) - 1, hi = Math.max(...ranks) + 1;
  const near = techBase.filter(q => !overlaps(q) && q.levels.some(l => { const r = levelById(l).rank; return r >= lo && r <= hi; }));
  const far = techBase.filter(q => !overlaps(q) && !near.includes(q));
  let candidates;
  const n = slots.technical;
  if (atLevel.filter(unseen).length >= n) candidates = atLevel.filter(unseen);
  else if (atLevel.filter(q => !last.has(q.id)).length >= n) candidates = freshFirst(atLevel, n, seen, last);
  else candidates = freshFirst([...atLevel, ...near, ...far], n, seen, last);
  const technical = pickDiverse(candidates, n, rand, positionLevel)
    .sort((a, b) => (TYPE_ORDER[a.type] - TYPE_ORDER[b.type]) || (minRank(a) - minRank(b)));

  // Intro + behavioural / managerial (managerial preferred for senior and lead)
  const common = bank.filter(q => q.cat === 'common' && belongsTo(q, category) && overlaps(q));
  const intro = slots.intro ? common.filter(q => q.type === 'intro').slice(0, 1) : [];
  let hr = [];
  if (slots.behavioral) {
    const fresh = (list) => { const f = freshFirst(list, slots.behavioral, seen, last); return [...shuffle(f.filter(unseen), rand), ...f.filter(q => !unseen(q))]; };
    const beh = fresh(common.filter(q => q.type === 'behavioral'));
    const mgr = fresh(common.filter(q => q.type === 'managerial'));
    const wantMgr = rank >= 3 ? Math.min(mgr.length, Math.ceil(slots.behavioral / 2) + (rank >= 4 ? 1 : 0)) : 0;
    hr = [...mgr.slice(0, Math.min(wantMgr, slots.behavioral)), ...beh].slice(0, slots.behavioral);
    if (hr.length < slots.behavioral) hr.push(...mgr.slice(wantMgr, wantMgr + slots.behavioral - hr.length));
    hr.sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type]);
  }
  return [...intro, ...technical, ...hr];
}

/** How many technical questions are available for the given filters (for the setup screen). */
export function availableCount({ bank, category, positionLevel, experienceLevel, topics }) {
  const levels = targetLevels(positionLevel, experienceLevel);
  const chosen = topics && topics.length ? new Set(topics) : null;
  return bank.filter(q => TECH_TYPES.includes(q.type) && belongsTo(q, category) && (!chosen || chosen.has(topicGroup(q.topic))) && q.levels.some(l => levels.includes(l))).length;
}
