const CACHE='ficamx-v17-20261107-1';
const STATIC=['./','index.html?v=17.0.0','styles.css?v=15.0.0','tide-layout-v16.css?v=16.0.0','ports-extra-v17.js?v=17.0.0','app.js?v=15.0.0','ports.json?v=v15.0.0','manifest.webmanifest?v=15','icons/icon-180.png?v=15','icons/icon-192.png?v=15','icons/icon-512.png?v=15'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>Promise.allSettled(STATIC.map(x=>c.add(x)))).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&k.startsWith('ficamx-')).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);
  if(u.pathname.includes('/data/tides/')){
    e.respondWith(fetch(e.request,{cache:'no-store'}));
    return;
  }
  if(u.hostname.includes('open-meteo.com')){
    e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request)));
    return;
  }
  e.respondWith(fetch(e.request,{cache:'reload'}).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request)));
});
