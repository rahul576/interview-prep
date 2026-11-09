// Offline cache for the web/PWA build. Bump VERSION when assets change.
const CDN_CACHE = 'interviewpro-cdn-v1';
const VERSION = 'interviewpro-v1.10.2';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/main.js', './js/data/meta.js', './js/data/kp.js', './js/data/questions.js',
  './js/data/questions-java.js', './js/data/questions-java-more.js', './js/data/questions-devops.js', './js/data/questions-devops-more.js',
  './js/data/questions-azure.js', './js/data/questions-kafka-es.js', './js/data/questions-dsa.js', './js/data/questions-managerial.js',
  './js/data/questions-extra.js', './js/data/questions-java-core2.js', './js/data/questions-java-spring2.js', './js/data/questions-java-arch2.js', './js/data/questions-jb300-core.js', './js/data/questions-jb300-runtime.js', './js/data/questions-jb300-spring.js', './js/data/questions-jb300-arch.js', './js/data/questions-devops-v16a.js', './js/data/questions-devops-v16b.js', './js/data/questions-devops-v16c.js', './js/data/questions-devops-v16d.js', './js/data/topics/index.js', './js/data/topics/docker-1.js', './js/data/topics/docker-2.js', './js/data/topics/docker-3.js', './js/data/topics/aws-1.js', './js/data/topics/aws-2.js', './js/data/topics/aws-3.js', './js/data/topics/iac-1.js', './js/data/topics/iac-2.js', './js/data/topics/iac-3.js', './js/data/questions-common.js',
  './js/engine/text.js', './js/engine/score.js', './js/engine/select.js', './js/engine/session.js', './js/engine/progress.js',
  './js/ui/avatar.js', './js/ui/explain.js', './js/services/speech.js', './js/services/media.js', './js/services/ai.js', './js/services/natural-voice.js', './js/services/recordings.js', './img/interviewers/vikram.jpg', './img/interviewers/ananya.jpg', './img/interviewers/daniel.jpg', './img/interviewers/priya.jpg', './img/interviewers/minjun.jpg', './img/interviewers/sarah.jpg', './js/services/store.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  // Only remove our own old app caches. Never touch the natural-voice model cache ("transformers-cache")
  // or the CDN cache, otherwise the 325 MB voice model would be downloaded again after every update.
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('interviewpro-v') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network first, so a new release shows up on the next load; the cache keeps it working offline.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Natural-voice engine code from the CDN: versioned URLs never change, so cache-first (works offline).
  if (url.host === 'cdn.jsdelivr.net') {
    e.respondWith(caches.open(CDN_CACHE).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(res => { if (res.ok) c.put(e.request, res.clone()); return res; }))));
    return;
  }
  const same = url.origin === location.origin;
  if (!same) return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(hit => hit || caches.match('./index.html'))));
});
