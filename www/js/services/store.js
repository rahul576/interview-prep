// Local persistence (browser storage / app WebView storage). Fails soft.
const HISTORY = 'interviewpro.history.v1';
const PREFS = 'interviewpro.prefs.v1';
const MAX = 30;

function read(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export const store = {
  history() { return read(HISTORY, []); },
  saveSession(session) {
    const list = this.history().filter(s => s.id !== session.id);
    list.unshift(session);
    write(HISTORY, list.slice(0, MAX));
  },
  getSession(id) { return this.history().find(s => s.id === id); },
  deleteSession(id) { write(HISTORY, this.history().filter(s => s.id !== id)); },
  clearHistory() { write(HISTORY, []); },
  recentQuestionIds(category, n = 20) {
    const ids = [];
    for (const s of this.history()) if (s.category === category) for (const it of s.items) ids.push(it.questionId);
    return ids.slice(0, n);
  },
  prefs() { return read(PREFS, {}); },
  savePrefs(p) { write(PREFS, { ...this.prefs(), ...p }); },
};
