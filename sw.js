const CACHE='ficamx-v7-20261106-1';
const STATIC=['./','index.html?v=7.0.0','styles.css?v=7.0.0','app.js?v=7.0.0','ports.json?v=v7.0.0','manifest.webmanifest?v=7','icons/icon-180.png?v=7','icons/icon-192.png?v=7','icons/icon-512.png?v=7'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>Promise.allSettled(STATIC.map(x=>c.add(x)))).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&k.startsWith('ficamx-')).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);
  const dynamic=u.hostname.includes('open-meteo.com')||u.pathname.includes('/data/tides/');
  if(dynamic){e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request)));return}
  e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request)));
});
