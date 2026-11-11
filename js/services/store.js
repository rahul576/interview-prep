// Local persistence (browser storage / app WebView storage). Fails soft.
//
// V1.6: user profiles. Each person practising on this device has their own history, progress
// (seen questions, revision list) and last-session ids. Device settings (voice, microphone,
// AI key) stay shared. The original profile keeps the original storage keys, so existing users
// keep everything they have.
const BASE = { history: 'interviewpro.history.v1', progress: 'interviewpro.progress.v1', last: 'interviewpro.lastsession.v1' };
const PREFS = 'interviewpro.prefs.v1';
const PROFILES = 'interviewpro.profiles.v1';
const MAX = 30;
export const DEFAULT_PROFILE = 'default';

function read(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
function remove(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } }

const keyFor = (kind, id) => (id === DEFAULT_PROFILE ? BASE[kind] : `${BASE[kind]}.${id}`);

export const store = {
  // ------------------------------------------------------------ profiles
  profiles() {
    const p = read(PROFILES, null);
    if (p && Array.isArray(p.list) && p.list.length) return p;
    const name = (read(PREFS, {}).candidateName || '').trim();
    return { active: DEFAULT_PROFILE, list: [{ id: DEFAULT_PROFILE, name: name || 'Me', created: Date.now() }] };
  },
  activeProfile() {
    const p = this.profiles();
    return p.list.find(x => x.id === p.active) || p.list[0];
  },
  _k(kind) { return keyFor(kind, this.activeProfile().id); },
  createProfile(name) {
    const p = this.profiles();
    const clean = String(name || '').trim().slice(0, 30) || `User ${p.list.length + 1}`;
    const id = `u${Date.now().toString(36)}`;
    p.list.push({ id, name: clean, created: Date.now() });
    p.active = id;
    write(PROFILES, p);
    return this.activeProfile();
  },
  switchProfile(id) {
    const p = this.profiles();
    if (!p.list.some(x => x.id === id)) return this.activeProfile();
    p.active = id; write(PROFILES, p);
    return this.activeProfile();
  },
  renameProfile(id, name) {
    const p = this.profiles();
    const prof = p.list.find(x => x.id === id);
    if (prof && String(name || '').trim()) { prof.name = String(name).trim().slice(0, 30); write(PROFILES, p); }
    return prof;
  },
  /** Forget everything this user has answered: history, progress, revision list, last session. */
  resetProfile(id = this.activeProfile().id) {
    for (const kind of Object.keys(BASE)) remove(keyFor(kind, id));
  },
  deleteProfile(id) {
    const p = this.profiles();
    if (id === DEFAULT_PROFILE || p.list.length <= 1) { this.resetProfile(id); return this.activeProfile(); }
    this.resetProfile(id);
    p.list = p.list.filter(x => x.id !== id);
    if (p.active === id) p.active = p.list[0].id;
    write(PROFILES, p);
    return this.activeProfile();
  },

  // ------------------------------------------------------------ per-profile data
  history() { return read(this._k('history'), []); },
  saveSession(session) {
    const list = this.history().filter(s => s.id !== session.id);
    list.unshift(session);
    write(this._k('history'), list.slice(0, MAX));
  },
  getSession(id) { return this.history().find(s => s.id === id); },
  deleteSession(id) { write(this._k('history'), this.history().filter(s => s.id !== id)); },
  clearHistory() { write(this._k('history'), []); },
  recentQuestionIds(category, n = 20) {
    const ids = [];
    for (const s of this.history()) if (s.category === category) for (const it of s.items) ids.push(it.questionId);
    return ids.slice(0, n);
  },
  progress() { return read(this._k('progress'), {}); },
  saveProgress(p) { return write(this._k('progress'), p); },
  resetProgress() { write(this._k('progress'), {}); write(this._k('last'), {}); },
  /** ids asked in the previous session for a role (never repeated next time if avoidable) */
  lastSessionIds(role) { return (read(this._k('last'), {})[role]) || []; },
  setLastSessionIds(role, ids) { const all = read(this._k('last'), {}); all[role] = ids; write(this._k('last'), all); },

  // ------------------------------------------------------------ device settings (shared)
  prefs() { return read(PREFS, {}); },
  savePrefs(p) { write(PREFS, { ...this.prefs(), ...p }); },
};
