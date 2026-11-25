// 앱 껍데기(이 페이지·아이콘)만 저장해 두는 작은 일꾼. 실제 내용은 항상 구글에서 새로 받아요.
var C = 'fc-shell-v22';
var FILES = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(C).then(function (c) { return c.addAll(FILES); })); self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== C; }).map(function (k) { return caches.delete(k); })); }));
  self.clients.claim();
});
self.addEventListener('fetch', function (e) {
  if (new URL(e.request.url).origin !== location.origin) return;
  // 앱 화면(index.html)은 브라우저가 들고 있는 옛 사본(깃허브가 10분 보관하라고 줌)을 쓰지 않고 매번 새로 확인 → 배포하면 바로 새 화면
  var page = e.request.mode === 'navigate' || /\/(index\.html)?$/.test(new URL(e.request.url).pathname);
  e.respondWith(fetch(page ? new Request(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }) : e.request).then(function (r) {
    var cp = r.clone(); caches.open(C).then(function (c) { c.put(e.request, cp); }); return r;
  }).catch(function () { return caches.match(e.request); }));
});
