const CACHE = 'stunden-shell-v4';
const FILES = ['./','./index.html','./styles.css','./app.js','./model.js','./i18n.js?v=3','./manifest.webmanifest','./assets/icon.svg','./assets/icon-192.png','./assets/icon-512.png','./assets/fonts.css','./assets/fraunces-500.ttf','./assets/fraunces-600.ttf','./assets/manrope-400.ttf','./assets/manrope-500.ttf','./assets/manrope-600.ttf','./assets/manrope-700.ttf'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('stunden-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    if(event.request.mode==='navigate'){
      try{return await fetch(event.request);}catch{return await cache.match('./index.html');}
    }
    return await cache.match(event.request)||fetch(event.request);
  })());
});
