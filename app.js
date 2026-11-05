const $=id=>document.getElementById(id);
const DOW=['일요일','월요일','화요일','수요일','목요일','금요일','토요일'];
const FLOW={1:12,2:27,3:45,4:63,5:74,6:78,7:79,8:80,9:76,10:71,11:62,12:51,13:39,14:25,15:12};
const BUILD='v6.0.0';
const state={ports:[],port:null,date:fromStoredDate(),deferred:null,seq:0,region:'전체',query:'',stationCache:new Map(),calendarMonth:null,sheetDrag:null,dateTouch:null,lastWheel:0};

function pad(n){return String(n).padStart(2,'0')}
function iso(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function day(d,n){const x=new Date(d);x.setDate(x.getDate()+n);x.setHours(12,0,0,0);return x}
function same(a,b){return iso(a)===iso(b)}
function mod(a,n){return((a%n)+n)%n}
function fromStoredDate(){const s=localStorage.getItem('ficamxDate');const d=s?new Date(s+'T12:00:00'):new Date();d.setHours(12,0,0,0);return d}
function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

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
function wx(c){if(c===0)return['☀️','맑음'];if([1,2].includes(c))return['🌤️','구름 조금'];if(c===3)return['☁️','흐림'];if([45,48].includes(c))return['🌫️','안개'];if([51,53,55,56,57].includes(c))return['🌦️','이슬비'];if([61,63,65,66,67].includes(c))return['🌧️','비'];if([71,73,75,77].includes(c))return['🌨️','눈'];if([80,81,82].includes(c))return['🌦️','소나기'];if([95,96,99].includes(c))return['⛈️','뇌우'];return['🌥️','날씨']}
function windDir(d){return['북','북동','동','남동','남','남서','서','북서'][Math.round((Number(d)||0)/45)%8]}
function fmt(v,n=1){const x=Number(v);return Number.isFinite(x)?x.toFixed(n):'-'}
function favoriteIds(){try{return JSON.parse(localStorage.getItem('ficamxFavorites')||'[]')}catch{return[]}}
function setFavorites(a){localStorage.setItem('ficamxFavorites',JSON.stringify([...new Set(a)]))}
function isFavorite(id){return favoriteIds().includes(id)}
function toggleFavorite(id){const a=favoriteIds();const i=a.indexOf(id);if(i>=0)a.splice(i,1);else a.unshift(id);setFavorites(a);renderFavoriteButton();renderPortSheet()}
function showStatus(t){const e=$('statusBanner');if(!t){e.classList.add('hidden');e.textContent=''}else{e.classList.remove('hidden');e.textContent=t}}
async function json(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}

function renderHeader(){
  $('selectedPortLabel').textContent=state.port?.name||'항구 선택';
  $('selectedDateLong').textContent=`${state.date.getFullYear()}년 ${state.date.getMonth()+1}월 ${state.date.getDate()}일 ${DOW[state.date.getDay()]}`;
  const w=waterInfo(state.date);
  const lm=w.lunar.month?`${w.lunar.month}월 `:'';
  $('lunarDate').textContent=`(음력 ${lm}${w.lunar.day}일)`;
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
    return `<article class="tide-event ${hi?'high':'low'}"><div class="tide-time">${tm}</div><div class="tide-delta">${hi?'▲':'▼'} ${delta==null?'-':Math.abs(delta)}</div><div class="tide-height">${Math.round(Number(ev.predcTdlvVl))}cm</div></article>`;
  }).join('');
}
function renderWeather(w,m){
  const h=w?.hourly||{},mh=m?.hourly||{},waves={};(mh.time||[]).forEach((t,i)=>waves[t.slice(0,13)]=mh.wave_height?.[i]);const cards=[];
  (h.time||[]).forEach((t,i)=>{const hr=+t.slice(11,13);if(hr%3)return;const [ico,desc]=wx(h.weather_code?.[i]);cards.push(`<article class="weather-card"><div class="weather-time">${pad(hr)}:00</div><div class="weather-top"><span class="weather-icon">${ico}</span><span class="weather-temp">${fmt(h.temperature_2m?.[i],0)}°</span></div><div class="weather-desc">${desc}</div><div class="wx-row"><span>💨 ${windDir(h.wind_direction_10m?.[i])}</span><b>${fmt(h.wind_speed_10m?.[i])}m/s</b></div><div class="wx-row"><span>🌊 파고</span><b>${fmt(waves[t.slice(0,13)])}m</b></div><div class="wx-row"><span>🌧 강수</span><b>${fmt(h.precipitation?.[i])}mm</b></div><div class="wx-row"><span>☔ 확률</span><b>${fmt(h.precipitation_probability?.[i],0)}%</b></div></article>`)});
  $('hourlyWeather').innerHTML=cards.length?cards.join(''):'<div class="empty">선택 날짜의 시간별 날씨 예보가 아직 없습니다.</div>';
}
async function load(){
  if(!state.port)return;const seq=++state.seq,ds=iso(state.date);showStatus('정보를 불러오는 중입니다.');
  const tide=await stationData(state.port.tideCode);if(seq!==state.seq)return;renderTides(tide);
  let lat=Number(state.port.lat),lon=Number(state.port.lon);if(!Number.isFinite(lat)||!Number.isFinite(lon)){lat=Number(tide?.meta?.lat);lon=Number(tide?.meta?.lon)}
  if(!Number.isFinite(lat)||!Number.isFinite(lon)){renderWeather(null,null);showStatus('공식 조석은 표시되지만 이 지점의 좌표 데이터가 아직 준비되지 않았습니다.');return}
  const wu=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_direction_10m&wind_speed_unit=ms&timezone=Asia%2FSeoul&start_date=${ds}&end_date=${ds}`;
  const mu=`https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&hourly=wave_height&timezone=Asia%2FSeoul&cell_selection=sea&start_date=${ds}&end_date=${ds}`;
  const [w,m]=await Promise.all([json(wu).catch(()=>null),json(mu).catch(()=>null)]);if(seq!==state.seq)return;renderWeather(w,m);
  const notes=[];if(!tide)notes.push('공식 조석 데이터 갱신 전');if(!w)notes.push('이 날짜의 날씨 예보 없음');showStatus(notes.join(' · '));
}
function selectPort(id){const p=state.ports.find(x=>x.id===id);if(!p)return;state.port=p;localStorage.setItem('ficamxPort',id);renderHeader();closePortSheet();load()}
function selectDateValue(d){state.date=new Date(d.getFullYear(),d.getMonth(),d.getDate(),12);localStorage.setItem('ficamxDate',iso(state.date));renderHeader();load()}
function selectDate(s){const d=new Date(s+'T12:00:00');if(isNaN(d))return;selectDateValue(d)}
function stepDate(n){selectDateValue(day(state.date,n))}

// 항구 바텀시트
function updateVisualViewport(){
  const vv=window.visualViewport;
  const h=vv?vv.height:window.innerHeight;
  const top=vv?vv.offsetTop:0;
  document.documentElement.style.setProperty('--visual-vh',`${h}px`);
  document.documentElement.style.setProperty('--visual-top',`${top}px`);
}
function openPortSheet(focusSearch=false){
  state.query='';state.region='전체';$('portSearch').value='';renderPortSheet();
  const s=$('portSheet');s.classList.remove('hidden');s.setAttribute('aria-hidden','false');document.body.classList.add('modal-open');updateVisualViewport();
  requestAnimationFrame(()=>$('portPanel').classList.add('open'));
  if(focusSearch)setTimeout(()=>{const input=$('portSearch');input.focus({preventScroll:true});input.scrollIntoView({block:'start',behavior:'smooth'});},180);
}
function closePortSheet(){
  const s=$('portSheet'),p=$('portPanel');p.classList.remove('open');p.style.transform='';p.style.transition='';
  setTimeout(()=>{s.classList.add('hidden');s.setAttribute('aria-hidden','true');document.body.classList.remove('modal-open');},180);
}
function initSheetDrag(){
  const zone=$('sheetDragZone'),panel=$('portPanel'),back=$('portSheet');
  const start=e=>{if(e.target.closest('button,input'))return;state.sheetDrag={id:e.pointerId,y:e.clientY,t:performance.now(),dy:0};zone.setPointerCapture?.(e.pointerId);panel.style.transition='none'};
  const move=e=>{const d=state.sheetDrag;if(!d||d.id!==e.pointerId)return;const dy=Math.max(0,e.clientY-d.y);d.dy=dy;panel.style.transform=`translateY(${dy}px)`;back.style.background=`rgba(10,22,38,${Math.max(.12,.42-dy/700)})`};
  const end=e=>{const d=state.sheetDrag;if(!d||d.id!==e.pointerId)return;const elapsed=Math.max(1,performance.now()-d.t),velocity=d.dy/elapsed;state.sheetDrag=null;panel.style.transition='transform .18s ease';back.style.background='';if(d.dy>90||velocity>.55)closePortSheet();else panel.style.transform='translateY(0)'};
  zone.addEventListener('pointerdown',start);zone.addEventListener('pointermove',move);zone.addEventListener('pointerup',end);zone.addEventListener('pointercancel',end);
  back.addEventListener('pointerdown',e=>{if(e.target===back)closePortSheet()});
}

// 날짜 위/아래 스와이프 및 PC 마우스휠
function initDateGestures(){
  const el=$('dateLine');
  el.addEventListener('touchstart',e=>{if(e.target.closest('button'))return;state.dateTouch={y:e.touches[0].clientY}},{passive:true});
  el.addEventListener('touchend',e=>{if(!state.dateTouch)return;const dy=e.changedTouches[0].clientY-state.dateTouch.y;state.dateTouch=null;if(Math.abs(dy)<36)return;stepDate(dy<0?1:-1)},{passive:true});
  el.addEventListener('wheel',e=>{if(Math.abs(e.deltaY)<8)return;const now=Date.now();if(now-state.lastWheel<350)return;state.lastWheel=now;e.preventDefault();stepDate(e.deltaY>0?1:-1)},{passive:false});
}

// 커스텀 달력
function renderCalendar(){
  const base=state.calendarMonth||new Date(state.date.getFullYear(),state.date.getMonth(),1);const y=base.getFullYear(),m=base.getMonth();
  $('calendarTitle').textContent=`${y}년 ${m+1}월`;
  const first=new Date(y,m,1),start=first.getDay(),days=new Date(y,m+1,0).getDate(),prevDays=new Date(y,m,0).getDate();let html='';
  for(let i=0;i<42;i++){
    let dnum,cur=true,dateObj;
    if(i<start){dnum=prevDays-start+i+1;dateObj=new Date(y,m-1,dnum,12);cur=false}else if(i>=start+days){dnum=i-start-days+1;dateObj=new Date(y,m+1,dnum,12);cur=false}else{dnum=i-start+1;dateObj=new Date(y,m,dnum,12)}
    const dow=dateObj.getDay(),sel=same(dateObj,state.date),today=same(dateObj,new Date());
    html+=`<button class="cal-day ${cur?'':'outside'} ${sel?'selected':''} ${today?'today':''} ${dow===0?'sun':''} ${dow===6?'sat':''}" data-date="${iso(dateObj)}" type="button"><span>${dnum}</span></button>`;
  }
  $('calendarGrid').innerHTML=html;
}
function openCalendar(){state.calendarMonth=new Date(state.date.getFullYear(),state.date.getMonth(),1,12);renderCalendar();const o=$('calendarOverlay');o.classList.remove('hidden');o.setAttribute('aria-hidden','false');document.body.classList.add('modal-open')}
function closeCalendar(){const o=$('calendarOverlay');o.classList.add('hidden');o.setAttribute('aria-hidden','true');if($('portSheet').classList.contains('hidden'))document.body.classList.remove('modal-open')}

async function init(){
  state.ports=await json(`ports.json?v=${BUILD}`);const saved=localStorage.getItem('ficamxPort');state.port=state.ports.find(p=>p.id===saved)||state.ports.find(p=>p.id==='yeongmok')||state.ports[0];
  if(!localStorage.getItem('ficamxFavorites'))setFavorites(state.ports.filter(p=>p.favoriteDefault).map(p=>p.id));renderHeader();renderPortSheet();initSheetDrag();initDateGestures();updateVisualViewport();load();
}

$('portToggle').onclick=()=>openPortSheet(false);
$('searchPortBtn').onclick=()=>openPortSheet(true);
$('favoriteBtn').onclick=()=>{if(state.port)toggleFavorite(state.port.id)};
$('closePortSheet').onclick=closePortSheet;
$('portSearch').onfocus=()=>setTimeout(()=>{$('portPanel').scrollTop=0;$('portSearch').scrollIntoView({block:'start',behavior:'smooth'})},120);
$('portSearch').oninput=e=>{state.query=e.target.value;renderPortSheet()};
$('regionFilters').onclick=e=>{const b=e.target.closest('[data-region]');if(b){state.region=b.dataset.region;renderPortSheet()}};
$('portList').onclick=e=>{const s=e.target.closest('[data-select]'),f=e.target.closest('[data-star]');if(f){toggleFavorite(f.dataset.star);return}if(s)selectPort(s.dataset.select)};
$('favoriteSection').onclick=e=>{const b=e.target.closest('[data-select]');if(b)selectPort(b.dataset.select)};

$('prevDateBtn').onclick=()=>stepDate(-1);$('nextDateBtn').onclick=()=>stepDate(1);$('calendarBtn').onclick=openCalendar;
$('calendarPrevMonth').onclick=()=>{state.calendarMonth=new Date(state.calendarMonth.getFullYear(),state.calendarMonth.getMonth()-1,1,12);renderCalendar()};
$('calendarNextMonth').onclick=()=>{state.calendarMonth=new Date(state.calendarMonth.getFullYear(),state.calendarMonth.getMonth()+1,1,12);renderCalendar()};
$('calendarToday').onclick=()=>{selectDateValue(new Date());closeCalendar()};$('calendarClose').onclick=closeCalendar;
$('calendarGrid').onclick=e=>{const b=e.target.closest('[data-date]');if(b){selectDate(b.dataset.date);closeCalendar()}};
$('calendarOverlay').onclick=e=>{if(e.target===$('calendarOverlay'))closeCalendar()};

$('settingsBtn').onclick=()=>$('settingsDialog').showModal();$('closeSettingsDialog').onclick=()=>$('settingsDialog').close();
$('refreshBtn').onclick=()=>{state.stationCache.clear();$('settingsDialog').close();load()};
$('resetFavoritesBtn').onclick=()=>{setFavorites(state.ports.filter(p=>p.favoriteDefault).map(p=>p.id));renderFavoriteButton();renderPortSheet()};
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.deferred=e});
$('installBtn').onclick=async()=>{if(state.deferred){state.deferred.prompt();await state.deferred.userChoice;state.deferred=null;return}const ios=/iphone|ipad|ipod/i.test(navigator.userAgent);$('installGuide').textContent=ios?'Safari의 공유 버튼(□↑) → 홈 화면에 추가를 누르세요.':'Chrome 메뉴(⋮) → 앱 설치 또는 홈 화면에 추가를 누르세요.';$('installDialog').showModal()};
$('closeInstallDialog').onclick=()=>$('installDialog').close();
window.visualViewport?.addEventListener('resize',updateVisualViewport);window.visualViewport?.addEventListener('scroll',updateVisualViewport);window.addEventListener('resize',updateVisualViewport);
if('serviceWorker' in navigator){navigator.serviceWorker.register(`sw.js?v=${BUILD}`,{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{})}
init();
