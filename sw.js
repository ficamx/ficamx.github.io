const CACHE='ficamx-v13-20261106-1';
const STATIC=['./','index.html?v=13.0.0','styles.css?v=13.0.0','app.js?v=13.0.0','ports.json?v=v13.0.0','manifest.webmanifest?v=13','icons/icon-180.png?v=13','icons/icon-192.png?v=13','icons/icon-512.png?v=13'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>Promise.allSettled(STATIC.map(x=>c.add(x)))).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&k.startsWith('ficamx-')).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);
  if(u.pathname.includes('/data/tides/')){
    // 공식 조석 JSON은 항상 최신 GitHub Pages 파일을 우선 사용합니다.
    e.respondWith(fetch(e.request,{cache:'no-store'}));
    return;
  }
  if(u.hostname.includes('open-meteo.com')){
    e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request)));
    return;
  }
  e.respondWith(fetch(e.request,{cache:'reload'}).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request)));
});
