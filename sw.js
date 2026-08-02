const CACHE_NAME = "investment-tool-shell-v0.4.0";
const SHELL_URLS = [
  "./", "./index.html", "./styles.css", "./app.js", "./manifest.webmanifest",
  "./src/core.mjs", "./src/data-source.mjs", "./src/demo-data.mjs", "./src/device-setup.mjs",
  "./src/google-auth.mjs", "./src/tracker-contract.mjs",
  "./icons/icon.svg", "./icons/icon-192.png", "./icons/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.endsWith("/config.local.js")) return;

  const shellPath = new URL(request.url);
  shellPath.search = "";
  const isShellAsset = SHELL_URLS.some(item => new URL(item, self.location.href).pathname === shellPath.pathname);
  if (!isShellAsset && request.mode !== "navigate") return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("./index.html")));
    return;
  }

  event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
});
