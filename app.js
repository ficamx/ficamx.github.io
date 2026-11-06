const $=id=>document.getElementById(id);
const DOW=['일요일','월요일','화요일','수요일','목요일','금요일','토요일'];
const FLOW={1:12,2:27,3:45,4:63,5:74,6:78,7:79,8:80,9:76,10:71,11:62,12:51,13:39,14:25,15:12};
const BUILD='v8.0.0';
const WHEEL_ITEM_H=54;
const state={
  ports:[],port:null,date:fromStoredDate(),deferred:null,seq:0,region:'전체',query:'',stationCache:new Map(),sheetDrag:null,
  wheel:{year:null,month:null,day:null,timers:{},programmatic:false}
};

function pad(n){return String(n).padStart(2,'0')}
function iso(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function day(d,n){const x=new Date(d);x.setDate(x.getDate()+n);x.setHours(12,0,0,0);return x}
function mod(a,n){return((a%n)+n)%n}
function fromStoredDate(){const s=localStorage.getItem('ficamxDate');const d=s?new Date(s+'T12:00:00'):new Date();d.setHours(12,0,0,0);return d}
function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function fmt(v,n=1){const x=Number(v);return Number.isFinite(x)?x.toFixed(n):''}
async function json(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}

function lunarInfo(d){
  try{
    const parts=new Intl.DateTimeFormat('ko-KR-u-ca-chinese',{month:'numeric',day:'numeric',timeZone:'Asia/Seoul'}).formatToParts(d);
    const month=parts.find(x=>x.type==='month')?.value;
    const dayNum=parseInt(parts.find(x=>x.type==='day')?.value,10);
    if(month&&dayNum>=1&&dayNum<=30)return{month:String(month).replace(/[^0-9윤]/g,''),day:dayNum};
  }catch(e){}
  const a=new Date(2026,10,5,12),diff=Math.round((d-a)/86400000),dayNum=mod(26-1+diff,30)+1;
  return{month:'',day:dayNum};
}
function waterInfo(d){const li=lunarInfo(d),idx=mod(li.day-25,15)+1;return{lunar:li,idx,name:idx===14?'조금':idx===15?'무시':idx+'물',flow:FLOW[idx]||12}}
function wx(c){
  if(c===0)return['☀️','맑음'];if([1,2].includes(c))return['🌤️','구름'];if(c===3)return['☁️','흐림'];if([45,48].includes(c))return['🌫️','안개'];
  if([51,53,55,56,57].includes(c))return['🌦️','이슬비'];if([61,63,65,66,67].includes(c))return['🌧️','비'];if([71,73,75,77].includes(c))return['🌨️','눈'];
  if([80,81,82].includes(c))return['🌦️','소나기'];if([95,96,99].includes(c))return['⛈️','뇌우'];return['🌥️','날씨'];
}
function windArrow(d){return['↓','↙','←','↖','↑','↗','→','↘'][Math.round((Number(d)||0)/45)%8]}
function windColor(v,max=18){
  const n=Math.max(0,Math.min(max,Number(v)||0));
  const stops=[
    [0,195,80,74],[4,185,88,63],[7,142,78,58],[10,92,82,58],[13,54,90,61],[16,28,93,62],[18,5,88,60]
  ];
  let a=stops[0],b=stops[stops.length-1];for(let i=0;i<stops.length-1;i++){if(n>=stops[i][0]&&n<=stops[i+1][0]){a=stops[i];b=stops[i+1];break}}
  const t=a[0]===b[0]?0:(n-a[0])/(b[0]-a[0]);const lerp=(x,y)=>Math.round(x+(y-x)*t);
  return `hsl(${lerp(a[1],b[1])} ${lerp(a[2],b[2])}% ${lerp(a[3],b[3])}%)`;
}

function favoriteIds(){try{return JSON.parse(localStorage.getItem('ficamxFavorites')||'[]')}catch{return[]}}
function setFavorites(a){localStorage.setItem('ficamxFavorites',JSON.stringify([...new Set(a)]))}
function isFavorite(id){return favoriteIds().includes(id)}
function toggleFavorite(id){const a=favoriteIds();const i=a.indexOf(id);if(i>=0)a.splice(i,1);else a.unshift(id);setFavorites(a);renderFavoriteButton();renderPortSheet()}
function showStatus(t){const e=$('statusBanner');if(!t){e.classList.add('hidden');e.textContent=''}else{e.classList.remove('hidden');e.textContent=t}}

function renderHeader(){
  $('selectedPortLabel').textContent=state.port?.name||'항구 선택';
  const w=waterInfo(state.date);
  $('selectedDateLong').textContent=`${state.date.getFullYear()}년 ${state.date.getMonth()+1}월 ${state.date.getDate()}일 ${DOW[state.date.getDay()]}`;
  $('lunarDate').textContent=`(음력 ${w.lunar.month?`${w.lunar.month}월 `:''}${w.lunar.day}일)`;
  $('tideName').textContent=w.name;
  $('flowPercent').textContent=w.flow+'%';
  $('tideStationLabel').textContent=`공식 조석 기준 · ${state.port?.tideStation||'-'} (${state.port?.tideCode||'-'})`;
  renderFavoriteButton();
}
function renderFavoriteButton(){const b=$('favoriteBtn');const yes=state.port&&isFavorite(state.port.id);b.textContent=yes?'★':'☆';b.classList.toggle('active',!!yes)}
function renderRegionFilters(){const regs=['전체','즐겨찾기','서해','남해','동해','제주'];$('regionFilters').innerHTML=regs.map(x=>`<button class="region-pill ${state.region===x?'active':''}" data-region="${x}">${x}</button>`).join('')}
function portMatches(p){if(state.region==='즐겨찾기'&&!isFavorite(p.id))return false;if(!['전체','즐겨찾기'].includes(state.region)&&p.region!==state.region)return false;const q=state.query.trim().toLowerCase();return !q||`${p.name} ${p.region} ${p.tideStation||''}`.toLowerCase().includes(q)}
function renderPortSheet(){
  renderRegionFilters();
  const favs=favoriteIds().map(id=>state.ports.find(p=>p.id===id)).filter(Boolean);
  $('favoriteSection').innerHTML=favs.length?`<div class="favorite-title">즐겨찾기</div><div class="favorite-chips">${favs.map(p=>`<button class="fav-chip" data-select="${p.id}">★ ${esc(p.name)}</button>`).join('')}</div>`:'';
  const list=state.ports.filter(portMatches);
  $('portList').innerHTML=list.length?list.map(p=>`<div class="port-row"><button class="port-main" data-select="${p.id}"><strong>${esc(p.name)}</strong><span>${esc(p.region)}</span></button><button class="mini-star ${isFavorite(p.id)?'active':''}" data-star="${p.id}">${isFavorite(p.id)?'★':'☆'}</button></div>`).join(''):'<div class="empty">검색 결과가 없습니다.</div>';
}

async function stationData(code){if(state.stationCache.has(code))return state.stationCache.get(code);try{const v=await json(`data/tides/${code}.json?v=${Date.now()}`);state.stationCache.set(code,v);return v}catch{return null}}
function renderTides(data){
  const ds=iso(state.date),prev=iso(day(state.date,-1));const all=[];
  for(const d of [prev,ds])for(const x of data?.days?.[d]||[])all.push(x);
  all.sort((a,b)=>String(a.predcDt).localeCompare(String(b.predcDt)));
  const selected=all.filter(x=>String(x.predcDt).startsWith(ds));
  if(!selected.length){$('tideEvents').innerHTML='<div class="empty">이 날짜의 공식 조석 데이터가 아직 준비되지 않았습니다.</div>';return}
  $('tideEvents').innerHTML=selected.slice(0,4).map(ev=>{
    const i=all.indexOf(ev),pr=i>0?all[i-1]:null,delta=pr?Math.round(Number(ev.predcTdlvVl)-Number(pr.predcTdlvVl)):null,hi=[1,3].includes(Number(ev.extrSe)),tm=String(ev.predcDt).slice(11,16);
    return `<article class="tide-event ${hi?'high':'low'}"><div class="tide-time">${tm}</div><div class="tide-delta">${hi?'▲':'▼'} ${delta==null?'-':Math.abs(delta)}cm</div><div class="tide-height">${Math.round(Number(ev.predcTdlvVl))}cm</div></article>`;
  }).join('');
}

function renderWeather(w,m){
  const grid=$('weatherGrid');const h=w?.hourly||{},mh=m?.hourly||{},waves={};(mh.time||[]).forEach((t,i)=>waves[t.slice(0,13)]=Number(mh.wave_height?.[i]));
  const hours=[];
  (h.time||[]).forEach((t,i)=>{
    const hr=+t.slice(11,13);if(hr%3)return;
    const [ico,desc]=wx(h.weather_code?.[i]);const rain=Number(h.precipitation?.[i]);const wind=Number(h.wind_speed_10m?.[i]);const gust=Number(h.wind_gusts_10m?.[i]);const wave=waves[t.slice(0,13)];
    hours.push({hr,ico,desc,temp:Number(h.temperature_2m?.[i]),rain,wind,gust,dir:Number(h.wind_direction_10m?.[i]),wave});
  });
  if(!hours.length){grid.innerHTML='<div class="empty" style="padding:18px">선택 날짜의 시간별 날씨 예보가 아직 없습니다.</div>';return}
  grid.style.setProperty('--cols',hours.length);
  const cells=(items,cls='weather-cell')=>items.map(x=>`<div class="${cls}">${x}</div>`).join('');
  const row=(label,unit,body)=>`<div class="weather-row"><div class="weather-label"><div>${label}${unit?`<small>${unit}</small>`:''}</div></div>${body}</div>`;
  grid.innerHTML=[
    row('시간','',cells(hours.map(x=>x.hr),'weather-cell weather-time-cell')),
    row('날씨','',hours.map(x=>`<div class="weather-cell weather-icon-cell"><div class="wx-emoji">${x.ico}</div><div class="wx-desc">${x.desc}</div></div>`).join('')),
    row('기온','℃',cells(hours.map(x=>Number.isFinite(x.temp)?`${Math.round(x.temp)}°`:''),'weather-cell weather-big')),
    row('강수','mm',cells(hours.map(x=>Number.isFinite(x.rain)&&x.rain>0?fmt(x.rain):''),'weather-cell weather-big')),
    row('바람','m/s',hours.map(x=>`<div class="weather-cell windbg" style="background:${windColor(x.wind)}">${Number.isFinite(x.wind)?fmt(x.wind):''}</div>`).join('')),
    row('돌풍','m/s',hours.map(x=>`<div class="weather-cell windbg" style="background:${windColor(x.gust,22)}">${Number.isFinite(x.gust)?fmt(x.gust):''}</div>`).join('')),
    row('풍향','',cells(hours.map(x=>Number.isFinite(x.dir)?`<span class="weather-arrow">${windArrow(x.dir)}</span>`:''),'weather-cell')),
    row('파고','m',cells(hours.map(x=>Number.isFinite(x.wave)?fmt(x.wave):''),'weather-cell weather-big'))
  ].join('');
}

async function load(){
  if(!state.port)return;const seq=++state.seq,ds=iso(state.date);showStatus('정보를 불러오는 중입니다.');
  const tide=await stationData(state.port.tideCode);if(seq!==state.seq)return;renderTides(tide);
  let lat=Number(state.port.lat),lon=Number(state.port.lon);if(!Number.isFinite(lat)||!Number.isFinite(lon)){lat=Number(tide?.meta?.lat);lon=Number(tide?.meta?.lon)}
  if(!Number.isFinite(lat)||!Number.isFinite(lon)){renderWeather(null,null);showStatus('공식 조석은 표시되지만 이 지점의 좌표 데이터가 아직 준비되지 않았습니다.');return}
  const wu=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m&wind_speed_unit=ms&timezone=Asia%2FSeoul&start_date=${ds}&end_date=${ds}`;
  const mu=`https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&hourly=wave_height&timezone=Asia%2FSeoul&cell_selection=sea&start_date=${ds}&end_date=${ds}`;
  const [w,m]=await Promise.all([json(wu).catch(()=>null),json(mu).catch(()=>null)]);if(seq!==state.seq)return;renderWeather(w,m);
  const notes=[];if(!tide?.days||!Object.keys(tide.days).length)notes.push('공식 조석 데이터 갱신 전');if(!w)notes.push('이 날짜의 날씨 예보 없음');showStatus(notes.join(' · '));
}

function selectPort(id){const p=state.ports.find(x=>x.id===id);if(!p)return;state.port=p;localStorage.setItem('ficamxPort',id);renderHeader();closePortSheet();load()}
function selectDateValue(d){state.date=new Date(d.getFullYear(),d.getMonth(),d.getDate(),12);localStorage.setItem('ficamxDate',iso(state.date));renderHeader();load()}
function stepDate(n){selectDateValue(day(state.date,n))}

function updateVisualViewport(){const vv=window.visualViewport;const h=vv?vv.height:window.innerHeight;const top=vv?vv.offsetTop:0;document.documentElement.style.setProperty('--visual-vh',`${h}px`);document.documentElement.style.setProperty('--visual-top',`${top}px`)}
function openSheet(backdropId,panelId){const s=$(backdropId),p=$(panelId);s.classList.remove('hidden');s.setAttribute('aria-hidden','false');document.body.classList.add('modal-open');updateVisualViewport();requestAnimationFrame(()=>p.classList.add('open'))}
function closeSheet(backdropId,panelId){const s=$(backdropId),p=$(panelId);p.classList.remove('open');p.style.transform='';p.style.transition='';setTimeout(()=>{s.classList.add('hidden');s.setAttribute('aria-hidden','true');if($('portSheet').classList.contains('hidden')&&$('dateWheelSheet').classList.contains('hidden'))document.body.classList.remove('modal-open')},180)}
function initDraggableSheet(handleId,panelId,backdropId){
  const zone=$(handleId),panel=$(panelId),back=$(backdropId);
  const start=e=>{if(e.target.closest('button,input'))return;state.sheetDrag={id:e.pointerId,y:e.clientY,t:performance.now(),dy:0};zone.setPointerCapture?.(e.pointerId);panel.style.transition='none'};
  const move=e=>{const d=state.sheetDrag;if(!d||d.id!==e.pointerId)return;const dy=Math.max(0,e.clientY-d.y);d.dy=dy;panel.style.transform=`translateY(${dy}px)`;back.style.background=`rgba(10,22,38,${Math.max(.08,.42-dy/700)})`};
  const end=e=>{const d=state.sheetDrag;if(!d||d.id!==e.pointerId)return;const elapsed=Math.max(1,performance.now()-d.t),velocity=d.dy/elapsed;state.sheetDrag=null;panel.style.transition='transform .18s ease';back.style.background='';if(d.dy>80||velocity>.45)closeSheet(backdropId,panelId);else panel.style.transform='translateY(0)'};
  zone.addEventListener('pointerdown',start);zone.addEventListener('pointermove',move);zone.addEventListener('pointerup',end);zone.addEventListener('pointercancel',end);back.addEventListener('pointerdown',e=>{if(e.target===back)closeSheet(backdropId,panelId)});
}

function openPortSheet(focusSearch=false){state.query='';state.region='전체';$('portSearch').value='';renderPortSheet();openSheet('portSheet','portPanel');if(focusSearch)setTimeout(()=>{$('portSearch').focus({preventScroll:true});ensureSearchVisible()},200)}
function closePortSheet(){closeSheet('portSheet','portPanel')}
function ensureSearchVisible(){updateVisualViewport();$('portSearch').scrollIntoView({block:'center',behavior:'smooth'})}

/* 커스텀 룰렛 */
function yearValues(){const y=new Date().getFullYear();return [y-2,y-1,y,y+1,y+2]}
function daysInMonth(y,m){return new Date(y,m,0).getDate()}
function wheelValues(type){if(type==='year')return yearValues();if(type==='month')return Array.from({length:12},(_,i)=>i+1);return Array.from({length:daysInMonth(state.wheel.year,state.wheel.month)},(_,i)=>i+1)}
function wheelLabel(type,v){return type==='year'?`${v}년`:type==='month'?`${v}월`:`${v}일`}
function renderWheel(type,selected){
  const el=$('wheel'+type[0].toUpperCase()+type.slice(1));const vals=wheelValues(type);if(!vals.includes(selected))selected=vals[Math.max(0,Math.min(vals.length-1,vals.indexOf(selected)))]||vals[0];
  state.wheel[type]=selected;el.innerHTML=vals.map(v=>`<div class="wheel-item ${v===selected?'selected':''}" role="option" aria-selected="${v===selected}" data-value="${v}">${wheelLabel(type,v)}</div>`).join('');
  requestAnimationFrame(()=>scrollWheelTo(type,selected,false));
}
function scrollWheelTo(type,value,smooth=true){const el=$('wheel'+type[0].toUpperCase()+type.slice(1));const vals=wheelValues(type);const idx=Math.max(0,vals.indexOf(Number(value)));state.wheel.programmatic=true;el.scrollTo({top:idx*WHEEL_ITEM_H,behavior:smooth?'smooth':'auto'});setTimeout(()=>{state.wheel.programmatic=false;markWheel(type,idx)},smooth?220:30)}
function markWheel(type,idx){const el=$('wheel'+type[0].toUpperCase()+type.slice(1));const vals=wheelValues(type);idx=Math.max(0,Math.min(vals.length-1,idx));const val=vals[idx];state.wheel[type]=val;[...el.children].forEach((node,i)=>{node.classList.toggle('selected',i===idx);node.setAttribute('aria-selected',i===idx?'true':'false')});return val}
function settleWheel(type){
  if(state.wheel.programmatic)return;const el=$('wheel'+type[0].toUpperCase()+type.slice(1));const idx=Math.round(el.scrollTop/WHEEL_ITEM_H);const oldY=state.wheel.year,oldM=state.wheel.month;const val=markWheel(type,idx);el.scrollTo({top:Math.max(0,idx)*WHEEL_ITEM_H,behavior:'smooth'});
  if((type==='year'&&val!==oldY)||(type==='month'&&val!==oldM)){const max=daysInMonth(state.wheel.year,state.wheel.month);state.wheel.day=Math.min(state.wheel.day,max);renderWheel('day',state.wheel.day)}
}
function attachWheel(type){
  const el=$('wheel'+type[0].toUpperCase()+type.slice(1));el.addEventListener('scroll',()=>{clearTimeout(state.wheel.timers[type]);state.wheel.timers[type]=setTimeout(()=>settleWheel(type),90)},{passive:true});
  el.addEventListener('click',e=>{const item=e.target.closest('[data-value]');if(item)scrollWheelTo(type,Number(item.dataset.value),true)});
}
function openDateWheel(){state.wheel.year=state.date.getFullYear();state.wheel.month=state.date.getMonth()+1;state.wheel.day=state.date.getDate();renderWheel('year',state.wheel.year);renderWheel('month',state.wheel.month);renderWheel('day',state.wheel.day);openSheet('dateWheelSheet','dateWheelPanel')}
function closeDateWheel(){closeSheet('dateWheelSheet','dateWheelPanel')}
function applyWheelDate(){selectDateValue(new Date(state.wheel.year,state.wheel.month-1,state.wheel.day,12));closeDateWheel()}

async function init(){
  state.ports=await json(`ports.json?v=${BUILD}`);const saved=localStorage.getItem('ficamxPort');state.port=state.ports.find(p=>p.id===saved)||state.ports.find(p=>p.id==='yeongmok')||state.ports[0];
  if(!localStorage.getItem('ficamxFavorites'))setFavorites(state.ports.filter(p=>p.favoriteDefault).map(p=>p.id));renderHeader();renderPortSheet();initDraggableSheet('sheetDragZone','portPanel','portSheet');initDraggableSheet('dateWheelDragZone','dateWheelPanel','dateWheelSheet');attachWheel('year');attachWheel('month');attachWheel('day');updateVisualViewport();load();
}

$('portToggle').onclick=()=>openPortSheet(false);$('searchPortBtn').onclick=()=>openPortSheet(true);$('favoriteBtn').onclick=()=>{if(state.port)toggleFavorite(state.port.id)};$('closePortSheet').onclick=closePortSheet;
$('portSearch').oninput=e=>{state.query=e.target.value;renderPortSheet()};$('portSearch').onfocus=()=>setTimeout(ensureSearchVisible,120);$('regionFilters').onclick=e=>{const b=e.target.closest('[data-region]');if(b){state.region=b.dataset.region;renderPortSheet()}};
$('portList').onclick=e=>{const s=e.target.closest('[data-select]'),f=e.target.closest('[data-star]');if(f){toggleFavorite(f.dataset.star);return}if(s)selectPort(s.dataset.select)};$('favoriteSection').onclick=e=>{const b=e.target.closest('[data-select]');if(b)selectPort(b.dataset.select)};
$('prevDateBtn').onclick=()=>stepDate(-1);$('nextDateBtn').onclick=()=>stepDate(1);$('datePickerBtn').onclick=openDateWheel;$('closeDateWheel').onclick=closeDateWheel;$('wheelApplyBtn').onclick=applyWheelDate;$('wheelTodayBtn').onclick=()=>{const t=new Date();state.wheel.year=t.getFullYear();state.wheel.month=t.getMonth()+1;state.wheel.day=t.getDate();renderWheel('year',state.wheel.year);renderWheel('month',state.wheel.month);renderWheel('day',state.wheel.day)};
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.deferred=e});$('installBtn').onclick=async()=>{if(state.deferred){state.deferred.prompt();await state.deferred.userChoice;state.deferred=null;return}const ios=/iphone|ipad|ipod/i.test(navigator.userAgent);$('installGuide').textContent=ios?'Safari의 공유 버튼(□↑) → 홈 화면에 추가를 누르세요.':'Chrome 메뉴(⋮) → 앱 설치 또는 홈 화면에 추가를 누르세요.';$('installDialog').showModal()};$('closeInstallDialog').onclick=()=>$('installDialog').close();
window.visualViewport?.addEventListener('resize',updateVisualViewport);window.visualViewport?.addEventListener('scroll',updateVisualViewport);window.visualViewport?.addEventListener('resize',()=>{if(document.activeElement===$('portSearch'))ensureSearchVisible()});window.addEventListener('resize',updateVisualViewport);
if('serviceWorker' in navigator){navigator.serviceWorker.register(`sw.js?v=${BUILD}`,{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{})}
init();
