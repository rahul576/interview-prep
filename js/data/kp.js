/** Helper to declare a key point: a label plus any-of keywords. */
export const kp = (label, ...k) => ({ label, k });

const LV = { E: 'entry', M: 'mid', S: 'senior', L: 'lead' };

/**
 * Compact question factory.
 * Q(id, topic, 'EMSL', type, question, keyPoints, ideal, followUp, extra?)
 */
export const Q = (id, topic, levels, type, q, keyPoints, ideal, followUp, extra = {}) => ({
  id, topic, levels: [...levels].map(c => LV[c]), type, q, keyPoints, ideal, followUp, ...extra,
});
