// Interview recordings (V1.9).
// - fixWebmDuration: browsers record WebM without a total duration, so players show a few seconds,
//   keep "loading" and cannot seek. We write the real duration into the file's header.
// - RecordingStore: keeps recordings on this device (IndexedDB) for a retention period
//   (default 3 days), with manual clearing. Each recording has per-question chapters.

// ------------------------------------------------------------------ WebM duration fix
function readVint(b, p) {
  const first = b[p];
  if (first === undefined) return null;
  let len = 1, mask = 0x80;
  while (len <= 8 && !(first & mask)) { len++; mask >>= 1; }
  if (len > 8) return null;
  let val = first & (mask - 1);
  let allOnes = val === mask - 1;
  for (let i = 1; i < len; i++) { val = val * 256 + b[p + i]; if (b[p + i] !== 0xff) allOnes = false; }
  return { len, val, unknown: allOnes };
}
function readId(b, p) {
  const first = b[p];
  let len = 1, mask = 0x80;
  while (len <= 4 && !(first & mask)) { len++; mask >>= 1; }
  if (len > 4) return null;
  let id = 0;
  for (let i = 0; i < len; i++) id = id * 256 + b[p + i];
  return { id, len };
}
const ID = { EBML: 0x1a45dfa3, Segment: 0x18538067, Info: 0x1549a966, TimecodeScale: 0x2ad7b1, Duration: 0x4489, Cluster: 0x1f43b675 };

/**
 * Return a copy of a WebM recording with its Duration set (in milliseconds).
 * Returns the original bytes unchanged if the file is not a WebM we understand or already has one.
 */
export function fixWebmDurationBytes(bytes, durationMs) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    let p = 0;
    const h = readId(b, p); if (!h || h.id !== ID.EBML) return b;
    const hs = readVint(b, p + h.len); p += h.len + hs.len + hs.val;
    const seg = readId(b, p); if (!seg || seg.id !== ID.Segment) return b;
    const ss = readVint(b, p + seg.len);
    let q = p + seg.len + ss.len;
    const segEnd = ss.unknown ? b.length : Math.min(b.length, q + ss.val);
    while (q < segEnd) {
      const el = readId(b, q); if (!el) return b;
      const sz = readVint(b, q + el.len); if (!sz) return b;
      const dataStart = q + el.len + sz.len;
      if (el.id === ID.Cluster) return b; // Info must come before the first cluster
      if (el.id === ID.Info) {
        const infoEnd = dataStart + sz.val;
        let r = dataStart, scale = 1000000;
        const kept = [];
        while (r < infoEnd) {
          const c = readId(b, r); const cs = readVint(b, r + c.len);
          const end = r + c.len + cs.len + cs.val;
          if (c.id === ID.TimecodeScale) { let v = 0; for (let i = r + c.len + cs.len; i < end; i++) v = v * 256 + b[i]; scale = v || scale; }
          if (c.id === ID.Duration) {
            const dv = new DataView(b.buffer, b.byteOffset + r + c.len + cs.len, cs.val);
            const existing = cs.val === 8 ? dv.getFloat64(0) : cs.val === 4 ? dv.getFloat32(0) : 0;
            if (existing > 0) return b; // already has a duration
          } else kept.push(b.subarray(r, end));
          r = end;
        }
        const dur = new Uint8Array(11);
        dur[0] = 0x44; dur[1] = 0x89; dur[2] = 0x88; // Duration, size 8
        new DataView(dur.buffer).setFloat64(3, durationMs * 1000000 / scale);
        const bodyLen = kept.reduce((n, k) => n + k.length, 0) + dur.length;
        const head = new Uint8Array(4 + 8);
        head.set([0x15, 0x49, 0xa9, 0x66], 0);
        head[4] = 0x01; // 8-byte size vint
        let v = bodyLen;
        for (let i = 11; i >= 5; i--) { head[i] = v & 0xff; v = Math.floor(v / 256); }
        const out = new Uint8Array(q + head.length + bodyLen + (b.length - infoEnd));
        let o = 0;
        out.set(b.subarray(0, q), o); o += q;
        out.set(head, o); o += head.length;
        for (const k of kept) { out.set(k, o); o += k.length; }
        out.set(dur, o); o += dur.length;
        out.set(b.subarray(infoEnd), o);
        // A segment with a known size must grow by the same amount.
        if (!ss.unknown) {
          const grow = out.length - b.length;
          const sizePos = p + seg.len;
          let nv = ss.val + grow;
          if (nv >= Math.pow(2, 7 * ss.len) - 1) return b;
          for (let i = ss.len - 1; i >= 0; i--) { out[sizePos + i] = (i === 0 ? (0x80 >> (ss.len - 1)) : 0) | (nv & 0xff); nv = Math.floor(nv / 256); }
        }
        return out;
      }
      if (sz.unknown) return b;
      q = dataStart + sz.val;
    }
  } catch { /* fall through */ }
  return b;
}

export async function fixWebmDuration(blob, durationMs) {
  if (!blob || !/webm/i.test(blob.type || '') || !(durationMs > 0)) return blob;
  const fixed = fixWebmDurationBytes(new Uint8Array(await blob.arrayBuffer()), durationMs);
  return new Blob([fixed], { type: blob.type });
}

// ------------------------------------------------------------------ storage
const DB = 'interviewpro-recordings';
const STORE = 'recordings';
export const RETENTION_CHOICES = [1, 3, 7, 30];
export const DEFAULT_RETENTION_DAYS = 3;

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no IndexedDB'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { const s = req.result.createObjectStore(STORE, { keyPath: 'id' }); s.createIndex('createdAt', 'createdAt'); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function tx(mode, fn) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(out && out.result !== undefined ? out.result : out); };
    t.onerror = () => { db.close(); reject(t.error); };
  }));
}

export const recordings = {
  /** Save a recording for a session. chapters: [{ index, questionId, title, start, end }] in seconds. */
  async save({ id, profileId, blob, chapters = [], durationSec = 0 }) {
    const rec = { id, profileId, blob, type: blob.type, size: blob.size, chapters, durationSec, createdAt: Date.now() };
    await tx('readwrite', s => s.put(rec));
    return rec;
  },
  async get(id) {
    try { const r = await tx('readonly', s => s.get(id)); return r || null; } catch { return null; }
  },
  async remove(id) { try { await tx('readwrite', s => s.delete(id)); } catch { /* ignore */ } },
  async list() {
    try {
      const all = await tx('readonly', s => s.getAll());
      return (all || []).map(({ blob, ...meta }) => meta).sort((a, b) => b.createdAt - a.createdAt);
    } catch { return []; }
  },
  async clear(profileId = null) {
    if (!profileId) { try { await tx('readwrite', s => s.clear()); } catch { /* ignore */ } return; }
    for (const r of await this.list()) if (r.profileId === profileId) await this.remove(r.id);
  },
  /** Delete recordings older than the retention period. Returns how many were removed. */
  async purge(days = DEFAULT_RETENTION_DAYS, now = Date.now()) {
    const cutoff = now - days * 86400000;
    let n = 0;
    for (const r of await this.list()) if (r.createdAt < cutoff) { await this.remove(r.id); n++; }
    return n;
  },
  async usage() {
    const list = await this.list();
    return { count: list.length, bytes: list.reduce((n, r) => n + (r.size || 0), 0) };
  },
};

export const fmtBytes = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${Math.round(n / 1e6)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
