const KHOA_ENDPOINT = 'https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService';

// 조석 기준 지점은 국립해양조사원 조석예보 지점 중 해당 항구 또는 인접 지점을 사용합니다.
const PORTS = [
  { id:'ocheon', name:'오천항', lat:36.4373, lon:126.5240, tideCode:'DT_0025', tideStation:'보령' },
  { id:'incheon', name:'인천항', lat:37.4519, lon:126.5922, tideCode:'DT_0001', tideStation:'인천' },
  { id:'muchangpo', name:'무창포항', lat:36.2458, lon:126.5367, tideCode:'SO_1261', tideStation:'무창포항' },
  { id:'daecheon', name:'대천항', lat:36.3187, lon:126.5048, tideCode:'DT_0025', tideStation:'보령' },
  { id:'namdang', name:'남당항', lat:36.5380, lon:126.4694, tideCode:'SO_1260', tideStation:'방포항' },
  { id:'jeongok', name:'전곡항', lat:37.1870, lon:126.6538, tideCode:'DT_0008', tideStation:'안산' },
  { id:'pyeongtaek', name:'평택항', lat:36.9670, lon:126.8210, tideCode:'DT_0002', tideStation:'평택' },
  { id:'samgilpo', name:'삼길포', lat:37.0040, lon:126.4525, tideCode:'SO_1270', tideStation:'삼길포항' },
  { id:'yeongmok', name:'영목항', lat:36.4049, lon:126.4215, tideCode:'DT_0025', tideStation:'보령' },
  { id:'sinjindo', name:'신진도', lat:36.6807, lon:126.1343, tideCode:'DT_0067', tideStation:'안흥' },
  { id:'anheung', name:'안흥항', lat:36.6741, lon:126.1349, tideCode:'DT_0067', tideStation:'안흥' },
  { id:'hongwon', name:'홍원항', lat:36.1589, lon:126.5015, tideCode:'DT_0051', tideStation:'서천마량' },
  { id:'bieung', name:'비응항', lat:35.9458, lon:126.5318, tideCode:'DT_0018', tideStation:'군산' },
  { id:'gyeokpo', name:'격포항', lat:35.6231, lon:126.4697, tideCode:'SO_1262', tideStation:'격포항' },
];

// 사용자가 익숙한 바다타임식 물흐름 참고 수치(서해 7물때식)
const FLOW_INDEX = {1:12,2:27,3:45,4:63,5:74,6:78,7:79,8:80,9:76,10:71,11:62,12:51,13:39,14:25,15:12};
const WATER_NAMES = {1:'1물',2:'2물',3:'3물',4:'4물',5:'5물',6:'6물',7:'7물',8:'8물',9:'9물',10:'10물',11:'11물',12:'12물',13:'조금',14:'무시',15:'1물'};
const DOW = ['일','월','화','수','목','금','토'];

const els = {
  portGrid: document.querySelector('#portGrid'), portToggle: document.querySelector('#portToggle'), selectedPortLabel: document.querySelector('#selectedPortLabel'),
  dateStrip: document.querySelector('#dateStrip'), datePicker: document.querySelector('#datePicker'), selectedDateLong: document.querySelector('#selectedDateLong'),
  tideName: document.querySelector('#tideName'), lunarDate: document.querySelector('#lunarDate'), flowPercent: document.querySelector('#flowPercent'), flowBar: document.querySelector('#flowBar'),
  tideEvents: document.querySelector('#tideEvents'), hourlyWeather: document.querySelector('#hourlyWeather'), tideSourceBadge: document.querySelector('#tideSourceBadge'), tideStationLabel: document.querySelector('#tideStationLabel'),
  tempRange: document.querySelector('#tempRange'), maxWind: document.querySelector('#maxWind'), maxWave: document.querySelector('#maxWave'), rainTotal: document.querySelector('#rainTotal'),
  statusBanner: document.querySelector('#statusBanner'), refreshBtn: document.querySelector('#refreshBtn'), installBtn: document.querySelector('#installBtn'), settingsBtn: document.querySelector('#settingsBtn'),
  installDialog: document.querySelector('#installDialog'), installGuide: document.querySelector('#installGuide'), closeInstallDialog: document.querySelector('#closeInstallDialog'),
  settingsDialog: document.querySelector('#settingsDialog'), apiKeyInput: document.querySelector('#apiKeyInput'), saveApiKeyBtn: document.querySelector('#saveApiKeyBtn'), clearApiKeyBtn: document.querySelector('#clearApiKeyBtn'), closeSettingsDialog: document.querySelector('#closeSettingsDialog'), apiKeyState: document.querySelector('#apiKeyState'),
};

const state = {
  port: PORTS.find(p => p.id === localStorage.getItem('ficamxPort')) || PORTS[0],
  date: normalizeDate(localStorage.getItem('ficamxDate') ? new Date(localStorage.getItem('ficamxDate') + 'T12:00:00') : new Date()),
  deferredInstall: null,
  requestNo: 0,
};

function pad(n){ return String(n).padStart(2,'0'); }
function normalizeDate(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12,0,0); }
function isoDate(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function compactDate(d){ return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`; }
function addDays(d,n){ const x = new Date(d); x.setDate(x.getDate()+n); return normalizeDate(x); }
function dateDiffDays(a,b){ const aa = Date.UTC(a.getFullYear(),a.getMonth(),a.getDate()); const bb = Date.UTC(b.getFullYear(),b.getMonth(),b.getDate()); return Math.round((aa-bb)/86400000); }
function sameDay(a,b){ return isoDate(a) === isoDate(b); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function deg2rad(v){ return v*Math.PI/180; }
function mod(a,n){ return ((a%n)+n)%n; }
function escapeHtml(s){ return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

function renderPorts(){
  els.portGrid.innerHTML = PORTS.map(p => `<button type="button" class="port-btn ${p.id===state.port.id?'active':''}" data-port="${p.id}">${p.name}</button>`).join('');
  els.selectedPortLabel.textContent = state.port.name;
  els.tideStationLabel.textContent = `공식 조석 기준: ${state.port.tideStation} (${state.port.tideCode})`;
}

function renderDateStrip(){
  const today = normalizeDate(new Date());
  const start = addDays(state.date, -2);
  const dates = Array.from({length:7}, (_,i)=>addDays(start,i));
  els.dateStrip.innerHTML = dates.map(d => {
    const isToday = sameDay(d,today);
    const weekend = d.getDay()===0 || d.getDay()===6;
    return `<button type="button" class="date-btn ${sameDay(d,state.date)?'active':''} ${weekend?'weekend':''}" data-date="${isoDate(d)}"><span>${isToday?'오늘':DOW[d.getDay()]}</span><strong>${d.getDate()}</strong></button>`;
  }).join('');
  els.selectedDateLong.textContent = `${state.date.getFullYear()}년 ${state.date.getMonth()+1}월 ${state.date.getDate()}일 (${DOW[state.date.getDay()]})`;
  els.datePicker.value = isoDate(state.date);
}

// Meeus 신월 근사치로 한국 음력 일자 추정. 서해 7물때식 표시에만 사용합니다.
function trueNewMoonJDE(k){
  const T=k/1236.85, T2=T*T, T3=T2*T, T4=T3*T;
  let jde=2451550.09765 + 29.530588853*k + 0.0001337*T2 - 0.000000150*T3 + 0.00000000073*T4;
  const E=1-0.002516*T-0.0000074*T2;
  const M=deg2rad(mod(2.5534+29.10535670*k-0.0000014*T2-0.00000011*T3,360));
  const Mp=deg2rad(mod(201.5643+385.81693528*k+0.0107582*T2+0.00001238*T3-0.000000058*T4,360));
  const F=deg2rad(mod(160.7108+390.67050284*k-0.0016118*T2-0.00000227*T3+0.000000011*T4,360));
  const Om=deg2rad(mod(124.7746-1.56375580*k+0.0020672*T2+0.00000215*T3,360));
  let c = -0.40720*Math.sin(Mp) + 0.17241*E*Math.sin(M) + 0.01608*Math.sin(2*Mp) + 0.01039*Math.sin(2*F)
    + 0.00739*E*Math.sin(Mp-M) - 0.00514*E*Math.sin(Mp+M) + 0.00208*E*E*Math.sin(2*M)
    - 0.00111*Math.sin(Mp-2*F) - 0.00057*Math.sin(Mp+2*F) + 0.00056*E*Math.sin(2*Mp+M)
    - 0.00042*Math.sin(3*Mp) + 0.00042*E*Math.sin(M+2*F) + 0.00038*E*Math.sin(M-2*F)
    - 0.00024*E*Math.sin(2*Mp-M) - 0.00017*Math.sin(Om) - 0.00007*Math.sin(Mp+2*M)
    + 0.00004*Math.sin(2*Mp-2*F) + 0.00004*Math.sin(3*M) + 0.00003*Math.sin(Mp+M-2*F)
    + 0.00003*Math.sin(2*Mp+2*F) - 0.00003*Math.sin(Mp+M+2*F) + 0.00003*Math.sin(Mp-M+2*F)
    - 0.00002*Math.sin(Mp-M-2*F) - 0.00002*Math.sin(3*Mp+M) + 0.00002*Math.sin(4*Mp);
  const A=[299.77+0.107408*k-0.009173*T2,251.88+0.016321*k,251.83+26.651886*k,349.42+36.412478*k,84.66+18.206239*k,141.74+53.303771*k,207.14+2.453732*k,154.84+7.306860*k,34.52+27.261239*k,207.19+0.121824*k,291.34+1.844379*k,161.72+24.198154*k,239.56+25.513099*k,331.55+3.592518*k].map(x=>deg2rad(mod(x,360)));
  const C=[.000325,.000165,.000164,.000126,.000110,.000062,.000060,.000056,.000047,.000042,.000040,.000037,.000035,.000023];
  c += A.reduce((s,a,i)=>s+C[i]*Math.sin(a),0);
  return jde+c;
}
function dateToJulian(d){ return d.getTime()/86400000 + 2440587.5; }
function julianToDate(jd){ return new Date((jd-2440587.5)*86400000); }
function koreanLunarDay(date){
  const targetJd = dateToJulian(new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate(),3,0,0)));
  const y = date.getFullYear() + (date.getMonth()+1-0.5)/12;
  let k = Math.floor((y-2000)*12.3685);
  while(trueNewMoonJDE(k+1) <= targetJd+1) k++;
  while(trueNewMoonJDE(k) > targetJd+1) k--;
  const nmUtc = julianToDate(trueNewMoonJDE(k) - 70/86400);
  const nmKst = new Date(nmUtc.getTime()+9*3600000);
  const nmLocalDate = new Date(nmKst.getUTCFullYear(), nmKst.getUTCMonth(), nmKst.getUTCDate(),12);
  let day = dateDiffDays(date,nmLocalDate)+1;
  if(day<1){
    const prev = julianToDate(trueNewMoonJDE(k-1)-70/86400); const pk=new Date(prev.getTime()+9*3600000);
    const pld=new Date(pk.getUTCFullYear(),pk.getUTCMonth(),pk.getUTCDate(),12); day=dateDiffDays(date,pld)+1;
  }
  return clamp(day,1,30);
}
function waterInfo(date){
  const ld=koreanLunarDay(date);
  // 서해 7물때식: 음력 9/25=1물, 9/26=2물처럼 순환
  let idx = mod(ld - 25, 15) + 1;
  // 14=조금, 15=무시가 되도록 보정
  const name = idx===14?'조금':idx===15?'무시':`${idx}물`;
  const flowKey = idx===15?15:idx;
  return {lunarDay:ld, index:idx, name, flow:FLOW_INDEX[flowKey] ?? 12};
}
function renderWaterInfo(){
  const w=waterInfo(state.date);
  els.tideName.textContent=w.name;
  els.lunarDate.textContent=`음력 ${w.lunarDay}일 기준`;
  els.flowPercent.textContent=`${w.flow}%`;
  els.flowBar.style.width=`${w.flow}%`;
}

function weatherInfo(code){
  if(code===0) return ['☀️','맑음'];
  if([1,2].includes(code)) return ['🌤️','구름 조금'];
  if(code===3) return ['☁️','흐림'];
  if([45,48].includes(code)) return ['🌫️','안개'];
  if([51,53,55,56,57].includes(code)) return ['🌦️','이슬비'];
  if([61,63,65,66,67].includes(code)) return ['🌧️','비'];
  if([71,73,75,77].includes(code)) return ['🌨️','눈'];
  if([80,81,82].includes(code)) return ['🌦️','소나기'];
  if([85,86].includes(code)) return ['🌨️','눈 소나기'];
  if([95,96,99].includes(code)) return ['⛈️','뇌우'];
  return ['🌥️','날씨'];
}
function windDir(deg){
  const dirs=['북','북동','동','남동','남','남서','서','북서'];
  return dirs[Math.round((deg||0)/45)%8];
}
function fmt(v,d=1){ return Number.isFinite(Number(v))?Number(v).toFixed(d):'-'; }

function showStatus(text,type='info'){
  if(!text){ els.statusBanner.className='status-banner hidden'; els.statusBanner.textContent=''; return; }
  els.statusBanner.className=`status-banner ${type==='error'?'error':''}`; els.statusBanner.textContent=text;
}
function setLoading(){
  els.tideEvents.innerHTML='<div class="loading-card"></div><div class="loading-card"></div><div class="loading-card"></div><div class="loading-card"></div>';
  els.hourlyWeather.innerHTML=Array.from({length:5},()=>'<div class="hour-card"><div class="loading-card" style="height:155px"></div></div>').join('');
}

function getApiKey(){ return localStorage.getItem('ficamxKhoaApiKey') || ''; }
function normalizeApiKey(raw){
  const key=(raw||'').trim();
  try { return key.includes('%') ? decodeURIComponent(key) : key; } catch { return key; }
}
function updateApiKeyState(){
  const has=!!getApiKey();
  els.apiKeyState.textContent=has?'인증키가 이 기기에 저장되어 있습니다.':'아직 인증키가 저장되지 않았습니다.';
  els.apiKeyState.className=`key-state ${has?'ok':''}`;
}
function openSettings(){
  els.apiKeyInput.value='';
  els.apiKeyInput.placeholder=getApiKey()?'저장됨 · 변경하려면 새 키 입력':'공공데이터포털 일반 인증키 입력';
  updateApiKeyState();
  els.settingsDialog.showModal();
}

async function fetchJson(url){
  const r=await fetch(url,{cache:'no-store'});
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
async function fetchKhoaDay(port,date,key){
  const u=new URL(KHOA_ENDPOINT);
  u.searchParams.set('serviceKey', normalizeApiKey(key));
  u.searchParams.set('numOfRows','20');
  u.searchParams.set('pageNo','1');
  u.searchParams.set('type','json');
  u.searchParams.set('obsCode',port.tideCode);
  u.searchParams.set('reqDate',compactDate(date));
  const r=await fetch(u.toString(),{cache:'no-store'});
  const text=await r.text();
  if(!r.ok) throw new Error(`공식 조석 API HTTP ${r.status}`);
  if(!text.trim()) throw new Error('공식 조석 API 응답이 비어 있습니다.');
  if(text.trim().startsWith('<')){
    const msg=text.match(/<resultMsg>([^<]+)<\/resultMsg>/)?.[1] || text.match(/<returnAuthMsg>([^<]+)<\/returnAuthMsg>/)?.[1] || 'XML 오류 응답';
    throw new Error(msg);
  }
  let data;
  try { data=JSON.parse(text); } catch { throw new Error('공식 조석 API 응답 형식을 읽지 못했습니다.'); }
  const header=data?.response?.header ?? data?.header ?? {};
  const code=String(header?.resultCode ?? '');
  if(code && !['0','00'].includes(code)) throw new Error(header?.resultMsg || `API 오류 ${code}`);
  const body=data?.response?.body ?? data?.body ?? data;
  let raw=body?.items?.item ?? body?.items ?? [];
  if(!Array.isArray(raw)) raw=raw?[raw]:[];
  return raw.map(it=>{
    const dt=String(it.predcDt ?? '').trim();
    const m=dt.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    const time=m?new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),Number(m[4]),Number(m[5]),0):null;
    const extr=Number(it.extrSe);
    const type=[1,3].includes(extr)?'high':[2,4].includes(extr)?'low':null;
    const height=Number(it.predcTdlvVl);
    return {type,time,height,station:it.obsvtrNm || port.tideStation,extr};
  }).filter(x=>x.type && x.time && !Number.isNaN(x.time.getTime()) && Number.isFinite(x.height));
}

async function loadForecast(){
  const req=++state.requestNo; setLoading();
  showStatus('공식 조석과 예보 정보를 불러오는 중입니다.');
  const p=state.port, d=isoDate(state.date);
  const weatherUrl=`https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=ms&timezone=Asia%2FSeoul&start_date=${d}&end_date=${d}`;
  const marineUrl=`https://marine-api.open-meteo.com/v1/marine?latitude=${p.lat}&longitude=${p.lon}&hourly=wave_height&timezone=Asia%2FSeoul&cell_selection=sea&start_date=${d}&end_date=${d}`;
  const key=getApiKey();
  const tidePromise = key ? Promise.allSettled([fetchKhoaDay(p,addDays(state.date,-1),key),fetchKhoaDay(p,state.date,key)]) : Promise.resolve(null);
  const [wres,mres,tres]=await Promise.all([fetchJson(weatherUrl).then(v=>({ok:true,v})).catch(e=>({ok:false,e})), fetchJson(marineUrl).then(v=>({ok:true,v})).catch(e=>({ok:false,e})), tidePromise]);
  if(req!==state.requestNo) return;
  const weather=wres.ok?wres.v:null;
  const marine=mres.ok?mres.v:null;
  let officialTides=null, tideError='';
  if(key && Array.isArray(tres)){
    const prev=tres[0]?.status==='fulfilled'?tres[0].value:[];
    const curr=tres[1]?.status==='fulfilled'?tres[1].value:[];
    officialTides=[...prev,...curr].sort((a,b)=>a.time-b.time);
    if(tres[1]?.status==='rejected') tideError=tres[1].reason?.message || '공식 조석 API 오류';
  }

  const notices=[];
  if(!key) notices.push('공식 조석 API 인증키를 한 번 설정해 주세요. 우측 상단 ⚙ 설정에서 저장하면 이 기기에서 계속 사용됩니다.');
  else if(tideError) notices.push(`공식 조석 불러오기 실패: ${tideError}`);
  if(!weather) notices.push('선택 날짜의 시간별 날씨 예보가 아직 제공되지 않습니다.');
  if(!marine) notices.push('선택 날짜의 파고 예보가 아직 제공되지 않습니다.');
  if(notices.length) showStatus(notices.join(' '), tideError?'error':'info'); else showStatus('');

  renderHourly(weather||{hourly:{}},marine||{hourly:{}});
  renderOfficialTides(officialTides,key,tideError);
  renderDaySummary(weather||{hourly:{}},marine||{hourly:{}});
}

function marineMap(marine){
  const m=new Map(); const h=marine?.hourly||{};
  (h.time||[]).forEach((t,i)=>m.set(t.slice(0,13), {wave:h.wave_height?.[i]}));
  return m;
}
function renderHourly(weather,marine){
  const h=weather?.hourly||{}, mm=marineMap(marine); const rows=[];
  (h.time||[]).forEach((t,i)=>{
    const hour=Number(t.slice(11,13)); if(hour%3!==0) return;
    const [ico,desc]=weatherInfo(h.weather_code?.[i]); const m=mm.get(t.slice(0,13))||{};
    rows.push({t,hour,ico,desc,temp:h.temperature_2m?.[i],pop:h.precipitation_probability?.[i],rain:h.precipitation?.[i],wind:h.wind_speed_10m?.[i],dir:h.wind_direction_10m?.[i],gust:h.wind_gusts_10m?.[i],wave:m.wave});
  });
  if(!rows.length){ els.hourlyWeather.innerHTML='<div class="empty-state">이 날짜의 시간별 예보가 아직 없습니다.</div>'; return; }
  const now=new Date();
  els.hourlyWeather.innerHTML=rows.map(r=>`<article class="hour-card ${sameDay(state.date,now)&&Math.abs(r.hour-now.getHours())<=1?'nowish':''}">
    <div class="hour-time">${pad(r.hour)}:00</div><div class="weather-icon">${r.ico}</div><div class="hour-temp">${fmt(r.temp,0)}°</div><div class="hour-desc">${r.desc}</div>
    <div class="hour-details">
      <div><span>💨 ${windDir(r.dir)}</span><strong>${fmt(r.wind)}m/s</strong></div>
      <div><span>🌊 파고</span><strong>${fmt(r.wave)}m</strong></div>
      <div><span>🌧 강수</span><strong>${fmt(r.rain)}mm</strong></div>
      <div><span>☔ 확률</span><strong>${fmt(r.pop,0)}%</strong></div>
    </div></article>`).join('');
}

function renderOfficialTides(all,key,tideError){
  els.tideSourceBadge.textContent='국립해양조사원 공식';
  if(!key){
    els.tideEvents.innerHTML='<div class="empty-state">⚙ 설정에서 공공데이터포털 인증키를 한 번 저장하면 공식 만조·간조가 표시됩니다.</div>';
    return;
  }
  if(tideError || !Array.isArray(all)){
    els.tideEvents.innerHTML=`<div class="empty-state">공식 조석 정보를 불러오지 못했습니다.<br><small>${escapeHtml(tideError||'네트워크 또는 API 설정을 확인해 주세요.')}</small></div>`;
    return;
  }
  const selected=all.filter(e=>sameDay(e.time,state.date));
  if(!selected.length){ els.tideEvents.innerHTML='<div class="empty-state">이 날짜의 공식 만조·간조 예보값이 없습니다.</div>'; return; }
  els.tideEvents.innerHTML=selected.slice(0,4).map(ev=>{
    const idx=all.indexOf(ev), prev=idx>0?all[idx-1]:null;
    const delta=prev?Math.round(ev.height-prev.height):null;
    const hi=ev.type==='high'; const sign=delta==null?'':(delta>=0?'+':'');
    return `<article class="tide-event ${hi?'high':'low'}">
      <div class="type"><span>${hi?'▲':'▼'}</span><span>${hi?'만조':'간조'}</span><span class="height">${Math.round(ev.height)}cm</span></div>
      <div class="time">${pad(ev.time.getHours())}:${pad(ev.time.getMinutes())}</div>
      <div class="delta">${delta==null?'직전 고저차 -':`${hi?'▲':'▼'} ${sign}${delta}cm`}</div>
    </article>`;
  }).join('');
}

function renderDaySummary(weather,marine){
  const h=weather?.hourly||{};
  const target=isoDate(state.date);
  const temps=(h.time||[]).map((t,i)=>t.startsWith(target)?Number(h.temperature_2m?.[i]):null).filter(Number.isFinite);
  const winds=(h.time||[]).map((t,i)=>t.startsWith(target)?Number(h.wind_speed_10m?.[i]):null).filter(Number.isFinite);
  const rains=(h.time||[]).map((t,i)=>t.startsWith(target)?Number(h.precipitation?.[i]):null).filter(Number.isFinite);
  const mh=marine?.hourly||{};
  const waves=(mh.time||[]).map((t,i)=>t.startsWith(target)?Number(mh.wave_height?.[i]):null).filter(Number.isFinite);
  els.tempRange.textContent=temps.length?`${Math.round(Math.min(...temps))}° / ${Math.round(Math.max(...temps))}°`:'-';
  els.maxWind.textContent=winds.length?`${Math.max(...winds).toFixed(1)}m/s`:'-';
  els.maxWave.textContent=waves.length?`${Math.max(...waves).toFixed(1)}m`:'-';
  els.rainTotal.textContent=rains.length?`${rains.reduce((a,b)=>a+b,0).toFixed(1)}mm`:'-';
}

function selectPort(id){ const p=PORTS.find(x=>x.id===id); if(!p) return; state.port=p; localStorage.setItem('ficamxPort',id); renderPorts(); loadForecast(); }
function selectDate(s){ const d=normalizeDate(new Date(`${s}T12:00:00`)); if(Number.isNaN(d.getTime())) return; state.date=d; localStorage.setItem('ficamxDate',isoDate(d)); renderDateStrip(); renderWaterInfo(); loadForecast(); }

els.portToggle.addEventListener('click',()=>els.portGrid.classList.toggle('open'));
els.portGrid.addEventListener('click',e=>{ const b=e.target.closest('[data-port]'); if(!b)return; selectPort(b.dataset.port); els.portGrid.classList.remove('open'); });
els.dateStrip.addEventListener('click',e=>{ const b=e.target.closest('[data-date]'); if(b) selectDate(b.dataset.date); });
els.datePicker.addEventListener('change',e=>selectDate(e.target.value));
els.refreshBtn.addEventListener('click',loadForecast);
els.settingsBtn.addEventListener('click',openSettings);
els.closeSettingsDialog.addEventListener('click',()=>els.settingsDialog.close());
els.saveApiKeyBtn.addEventListener('click',()=>{
  const v=els.apiKeyInput.value.trim();
  if(v) localStorage.setItem('ficamxKhoaApiKey',v);
  updateApiKeyState();
  els.settingsDialog.close();
  loadForecast();
});
els.clearApiKeyBtn.addEventListener('click',()=>{
  localStorage.removeItem('ficamxKhoaApiKey');
  els.apiKeyInput.value='';
  updateApiKeyState();
  loadForecast();
});
els.closeInstallDialog.addEventListener('click',()=>els.installDialog.close());
window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); state.deferredInstall=e; });
els.installBtn.addEventListener('click',async()=>{
  if(state.deferredInstall){ state.deferredInstall.prompt(); await state.deferredInstall.userChoice; state.deferredInstall=null; return; }
  const isiOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
  els.installGuide.textContent=isiOS?'Safari 하단의 공유 버튼(□↑) → “홈 화면에 추가”를 누르시면 됩니다.':'Chrome 메뉴(⋮) → “홈 화면에 추가” 또는 “앱 설치”를 누르시면 됩니다.';
  els.installDialog.showModal();
});

if('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(()=>{});
renderPorts(); renderDateStrip(); renderWaterInfo(); updateApiKeyState(); loadForecast();
