self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // 基本的 PWA 要求：必須有一個 fetch listener
  // 這裡不介入 fetch 請求，讓瀏覽器照常處理
});
