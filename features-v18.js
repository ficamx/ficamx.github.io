(() => {
'use strict';

const F18_PLAN_KEY='ficamxPlansV18';
const F18_LOG_KEY='ficamxCatchLogV18';
const F18_TIDE_KEY='ficamxFinderTidesV18';
const F18_VERSION='18.0.0';
const SPECIES=['쭈꾸미','갑오징어','문어','갈치','한치','방어','부시리','볼락','열기','삼치','광어','우럭','참돔','농어','대구','가자미','민어','붕장어','무늬오징어','기타'];

function f18Get(key, fallback=[]){try{return JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback))}catch(_){return fallback}}
function f18Set(key, value){localStorage.setItem(key,JSON.stringify(value))}
function f18Esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function f18Pad(n){return String(n).padStart(2,'0')}
function f18Iso(d){return `${d.getFullYear()}-${f18Pad(d.getMonth()+1)}-${f18Pad(d.getDate())}`}
function f18Num(v,d=1){const n=Number(v);return Number.isFinite(n)?n.toFixed(d):'-'}
function f18Signed(v,d=1){const n=Number(v);if(!Number.isFinite(n))return '-';return `${n>0?'+':''}${n.toFixed(d)}`}
function f18Now(){return new Date()}
function f18CurrentPort(){try{return state?.port||null}catch(_){return null}}
function f18CurrentDate(){try{return state?.date||new Date()}catch(_){return new Date()}}
function f18Water(d){try{return waterInfo(d)}catch(_){return {name:'-',idx:null,flow:null}}}
function f18FindPort(id){try{return state?.ports?.find(p=>p.id===id)||null}catch(_){return null}}

function f18SpeciesOptions(sel=''){
  return SPECIES.map(x=>`<option value="${f18Esc(x)}"${x===sel?' selected':''}>${f18Esc(x)}</option>`).join('');
}

function f18Inject(){
  if(document.getElementById('f18Hub')) return;
  const weather=document.querySelector('.weather-section');
  if(!weather) return;

  const hub=document.createElement('section');
  hub.id='f18Hub';
  hub.className='f18-hub panel';
  hub.innerHTML=`
    <div class="f18-hub-head">
      <div><h2>FICAMX 출조도우미</h2><p>예보 변화를 보고, 출조와 조과를 내 기록으로 쌓습니다.</p></div>
      <span class="f18-badge">BETA</span>
    </div>
    <div class="f18-actions">
      <button class="f18-action" data-f18="plans"><strong>출조예정 · 예보변화</strong><span>예약한 날짜의 예보가 어떻게 바뀌는지 비교</span></button>
      <button class="f18-action" data-f18="confidence"><strong>예보 신뢰도</strong><span>ECMWF · GFS · JMA 모델 일치도 비교</span></button>
      <button class="f18-action" data-f18="logs"><strong>나만의 조과기록</strong><span>물때와 조과를 함께 쌓아 나만의 패턴 확인</span></button>
      <button class="f18-action" data-f18="finder"><strong>장기 예약일 찾기</strong><span>2027~2028년 원하는 물때·주말 후보 검색</span></button>
    </div>
    <div id="f18Upcoming" class="f18-upcoming"></div>
    <div class="f18-source-note">기상예보: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> · 조석예보: 국립해양조사원. 예보는 실제 기상과 달라질 수 있습니다.</div>`;
  weather.insertAdjacentElement('afterend',hub);

  const modal=document.createElement('div');
  modal.id='f18Modal';
  modal.className='f18-modal hidden';
  modal.innerHTML=`<section class="f18-sheet"><div class="f18-handle"></div><div class="f18-sheet-head"><h3 id="f18Title"></h3><button id="f18Close" class="f18-close">닫기</button></div><div id="f18Body" class="f18-body"></div></section>`;
  document.body.appendChild(modal);

  hub.addEventListener('click',e=>{
    const b=e.target.closest('[data-f18]'); if(!b)return;
    const k=b.dataset.f18;
    if(k==='plans') f18OpenPlans();
    if(k==='confidence') f18OpenConfidence();
    if(k==='logs') f18OpenLogs();
    if(k==='finder') f18OpenFinder();
  });
  document.getElementById('f18Close').onclick=f18Close;
  modal.addEventListener('click',e=>{if(e.target===modal)f18Close()});
  f18RenderUpcoming();
  f18SyncFlow();
  f18WatchCore();
}

function f18Open(title, html){
  document.getElementById('f18Title').textContent=title;
  document.getElementById('f18Body').innerHTML=html;
  document.getElementById('f18Modal').classList.remove('hidden');
  document.body.classList.add('f18-open');
}
function f18Close(){
  document.getElementById('f18Modal')?.classList.add('hidden');
  document.body.classList.remove('f18-open');
}

function f18WatchCore(){
  const dateEl=document.getElementById('selectedDateLong');
  const portEl=document.getElementById('selectedPortLabel');
  if(!dateEl||!portEl)return;
  const obs=new MutationObserver(()=>{clearTimeout(window.__f18FlowTimer);window.__f18FlowTimer=setTimeout(f18SyncFlow,300)});
  obs.observe(dateEl,{childList:true,subtree:true,characterData:true});
  obs.observe(portEl,{childList:true,subtree:true,characterData:true});
}

async function f18SyncFlow(){
  const pill=document.querySelector('.flow-pill'); const p=f18CurrentPort(); const d=f18CurrentDate();
  if(!pill||!p||!p.tideCode)return;
  pill.classList.add('f18-flow-hidden');
  try{
    const ds=f18Iso(d);
    const r=await fetch(`data/tides/${encodeURIComponent(p.tideCode)}.json?f18=${Date.now()}`,{cache:'no-store'});
    if(!r.ok)return;
    const j=await r.json();
    if(Array.isArray(j?.days?.[ds])&&j.days[ds].length) pill.classList.remove('f18-flow-hidden');
  }catch(_){}
}

async function f18ForecastAt(port,date,time='06:00'){
  if(!port||!Number.isFinite(Number(port.lat))||!Number.isFinite(Number(port.lon))) throw new Error('항구 좌표 없음');
  const lat=Number(port.lat),lon=Number(port.lon),ds=typeof date==='string'?date:f18Iso(date);
  const wu=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m&wind_speed_unit=ms&timezone=Asia%2FSeoul&start_date=${ds}&end_date=${ds}`;
  const mu=`https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&hourly=wave_height&timezone=Asia%2FSeoul&cell_selection=sea&start_date=${ds}&end_date=${ds}`;
  const [wr,mr]=await Promise.all([fetch(wu,{cache:'no-store'}),fetch(mu,{cache:'no-store'}).catch(()=>null)]);
  if(!wr.ok)throw new Error('예보 제공기간 전 또는 예보 없음');
  const w=await wr.json(),m=mr&&mr.ok?await mr.json():null;
  const key=`${ds}T${time}`;
  let i=(w.hourly?.time||[]).indexOf(key);
  if(i<0){const hh=Number(time.slice(0,2));i=(w.hourly?.time||[]).findIndex(t=>t.startsWith(ds)&&Number(t.slice(11,13))===hh)}
  if(i<0)throw new Error('선택 시간 예보 없음');
  let wave=null;
  if(m?.hourly?.time){const mi=m.hourly.time.indexOf(key);if(mi>=0)wave=Number(m.hourly.wave_height?.[mi])}
  return {
    capturedAt:new Date().toISOString(), target:`${ds}T${time}`,
    wind:Number(w.hourly.wind_speed_10m?.[i]),gust:Number(w.hourly.wind_gusts_10m?.[i]),
    rain:Number(w.hourly.precipitation?.[i]),temp:Number(w.hourly.temperature_2m?.[i]),
    dir:Number(w.hourly.wind_direction_10m?.[i]),wave:Number.isFinite(wave)?wave:null
  };
}

function f18PlanStatus(base,cur){
  if(!base||!cur)return {cls:'wait',text:'비교 기준이 아직 없습니다.'};
  let score=0;
  if(Number.isFinite(cur.wind)&&Number.isFinite(base.wind))score+=(cur.wind-base.wind)>1.5?2:(cur.wind-base.wind)<-1.5?-1:0;
  if(Number.isFinite(cur.gust)&&Number.isFinite(base.gust))score+=(cur.gust-base.gust)>2?1:(cur.gust-base.gust)<-2?-1:0;
  if(Number.isFinite(cur.wave)&&Number.isFinite(base.wave))score+=(cur.wave-base.wave)>.3?2:(cur.wave-base.wave)<-.3?-1:0;
  if(Number.isFinite(cur.rain)&&Number.isFinite(base.rain))score+=(cur.rain-base.rain)>1?1:(cur.rain-base.rain)<-1?-1:0;
  if(score>=2)return {cls:'bad',text:'등록 당시보다 예보조건이 악화되었습니다.'};
  if(score<=-2)return {cls:'good',text:'등록 당시보다 예보조건이 개선되었습니다.'};
  return {cls:'neutral',text:'등록 당시와 비교해 큰 변화는 없습니다.'};
}
function f18DeltaHtml(base,cur){
  if(!base||!cur)return '';
  const wave=(Number.isFinite(cur.wave)&&Number.isFinite(base.wave))?f18Signed(cur.wave-base.wave):'-';
  return `<div class="f18-deltas">
    <div class="f18-delta">바람 m/s<b>${f18Num(base.wind)} → ${f18Num(cur.wind)} (${f18Signed(cur.wind-base.wind)})</b></div>
    <div class="f18-delta">돌풍 m/s<b>${f18Num(base.gust)} → ${f18Num(cur.gust)} (${f18Signed(cur.gust-base.gust)})</b></div>
    <div class="f18-delta">파고 m<b>${f18Num(base.wave)} → ${f18Num(cur.wave)} (${wave})</b></div>
    <div class="f18-delta">강수 mm<b>${f18Num(base.rain)} → ${f18Num(cur.rain)} (${f18Signed(cur.rain-base.rain)})</b></div>
  </div>`;
}

function f18RenderUpcoming(){
  const el=document.getElementById('f18Upcoming');if(!el)return;
  const today=f18Iso(new Date());
  const plans=f18Get(F18_PLAN_KEY,[]).filter(x=>x.date>=today).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)).slice(0,3);
  if(!plans.length){el.innerHTML=`<div class="f18-upcoming-title"><strong>다가오는 출조</strong><span>아직 등록된 일정 없음</span></div>`;return}
  el.innerHTML=`<div class="f18-upcoming-title"><strong>다가오는 출조</strong><span>${plans.length}건</span></div>`+
    plans.map(p=>{const st=p.last&&p.baseline?f18PlanStatus(p.baseline,p.last):null;return `<div class="f18-plan-mini"><b>${f18Esc(p.date)} · ${f18Esc(p.portName)} · ${f18Esc(p.species)}</b><small>${f18Esc(p.time)} ${p.boat?`· ${f18Esc(p.boat)}`:''}${st?`<br>${f18Esc(st.text)}`:''}</small></div>`}).join('');
}

function f18OpenPlans(){
  const p=f18CurrentPort(), d=f18Iso(f18CurrentDate());
  f18Open('출조예정 · 예보변화',`
    <div class="f18-current">현재 선택: ${f18Esc(p?.name||'-')} · ${d}</div>
    <div class="f18-grid2">
      <div class="f18-field"><label>어종</label><select id="f18PlanSpecies">${f18SpeciesOptions('갑오징어')}</select></div>
      <div class="f18-field"><label>출항 시간</label><input id="f18PlanTime" type="time" value="06:00"></div>
    </div>
    <div class="f18-grid2">
      <div class="f18-field"><label>출항항</label><input id="f18PlanPort" value="${f18Esc(p?.name||'')}" readonly></div>
      <div class="f18-field"><label>날짜</label><input id="f18PlanDate" type="date" value="${d}"></div>
    </div>
    <div class="f18-field"><label>선사/배 이름 (선택)</label><input id="f18PlanBoat" placeholder="예: 정원호"></div>
    <div class="f18-field"><label>메모 (선택)</label><textarea id="f18PlanMemo" placeholder="자리, 채비, 집결시간 등"></textarea></div>
    <button id="f18PlanAdd" class="f18-primary" style="width:100%">출조예정 등록 + 현재 예보 저장</button>
    <div class="f18-section-title">등록된 출조</div><div id="f18PlanList"></div>`);
  document.getElementById('f18PlanAdd').onclick=f18AddPlan;
  f18RenderPlans();
}

async function f18AddPlan(){
  const port=f18CurrentPort();if(!port)return;
  const date=document.getElementById('f18PlanDate').value,time=document.getElementById('f18PlanTime').value||'06:00';
  const btn=document.getElementById('f18PlanAdd');btn.disabled=true;btn.textContent='예보 저장 중...';
  let baseline=null,note='';
  try{baseline=await f18ForecastAt(port,date,time)}catch(e){note=String(e.message||e)}
  const plans=f18Get(F18_PLAN_KEY,[]);
  plans.push({id:`p${Date.now()}`,createdAt:new Date().toISOString(),portId:port.id,portName:port.name,lat:port.lat,lon:port.lon,tideCode:port.tideCode,date,time,species:document.getElementById('f18PlanSpecies').value,boat:document.getElementById('f18PlanBoat').value.trim(),memo:document.getElementById('f18PlanMemo').value.trim(),baseline,last:null,note});
  f18Set(F18_PLAN_KEY,plans);f18RenderPlans();f18RenderUpcoming();
  btn.disabled=false;btn.textContent='출조예정 등록 + 현재 예보 저장';
}

function f18RenderPlans(){
  const el=document.getElementById('f18PlanList');if(!el)return;
  const plans=f18Get(F18_PLAN_KEY,[]).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
  if(!plans.length){el.innerHTML='<div class="f18-note">등록된 출조예정이 없습니다.</div>';return}
  el.innerHTML=plans.map(p=>{
    const st=p.last&&p.baseline?f18PlanStatus(p.baseline,p.last):null;
    return `<div class="f18-card" data-plan="${f18Esc(p.id)}">
      <div class="f18-card-top"><div><h4>${f18Esc(p.date)} ${f18Esc(p.time)} · ${f18Esc(p.portName)}</h4><p>${f18Esc(p.species)} ${p.boat?`· ${f18Esc(p.boat)}`:''}${p.memo?`<br>${f18Esc(p.memo)}`:''}</p></div></div>
      ${p.baseline?`<span class="f18-chip">등록예보 저장됨</span>`:`<span class="f18-chip">예보 대기</span>`}
      ${st?`<div class="f18-status ${st.cls}">${st.text}</div>${f18DeltaHtml(p.baseline,p.last)}`:(p.note?`<div class="f18-status wait">${f18Esc(p.note)}</div>`:'')}
      <div class="f18-log-tools"><button class="f18-tiny" data-refresh="${f18Esc(p.id)}">현재 예보와 비교</button><button class="f18-tiny" data-delete-plan="${f18Esc(p.id)}">삭제</button></div>
    </div>`;
  }).join('');
  el.onclick=e=>{
    const r=e.target.closest('[data-refresh]'),d=e.target.closest('[data-delete-plan]');
    if(r)f18RefreshPlan(r.dataset.refresh,r);
    if(d)f18DeletePlan(d.dataset.deletePlan);
  };
}
async function f18RefreshPlan(id,btn){
  const plans=f18Get(F18_PLAN_KEY,[]),p=plans.find(x=>x.id===id);if(!p)return;
  btn.disabled=true;btn.textContent='확인 중...';
  const port={id:p.portId,name:p.portName,lat:p.lat,lon:p.lon,tideCode:p.tideCode};
  try{
    const cur=await f18ForecastAt(port,p.date,p.time);
    if(!p.baseline)p.baseline=cur; else p.last=cur;
    p.note='';f18Set(F18_PLAN_KEY,plans);
  }catch(e){p.note=String(e.message||e);f18Set(F18_PLAN_KEY,plans)}
  f18RenderPlans();
}
function f18DeletePlan(id){f18Set(F18_PLAN_KEY,f18Get(F18_PLAN_KEY,[]).filter(x=>x.id!==id));f18RenderPlans();f18RenderUpcoming()}

async function f18ModelSnapshot(base,date,time,lat,lon){
  const url=`https://api.open-meteo.com/v1/${base}?latitude=${lat}&longitude=${lon}&hourly=wind_speed_10m,wind_gusts_10m,precipitation&wind_speed_unit=ms&timezone=Asia%2FSeoul&start_date=${date}&end_date=${date}`;
  const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`${base} 없음`);
  const j=await r.json(),key=`${date}T${time}`,i=(j.hourly?.time||[]).indexOf(key);if(i<0)throw new Error(`${base} 시간 없음`);
  return {wind:Number(j.hourly.wind_speed_10m?.[i]),gust:Number(j.hourly.wind_gusts_10m?.[i]),rain:Number(j.hourly.precipitation?.[i])};
}
function f18Spread(a,key){const v=a.map(x=>x.data[key]).filter(Number.isFinite);return v.length?Math.max(...v)-Math.min(...v):null}
function f18OpenConfidence(){
  const p=f18CurrentPort(),d=f18Iso(f18CurrentDate());
  f18Open('예보 신뢰도 · 모델 일치도',`
    <div class="f18-current">${f18Esc(p?.name||'-')} · 여러 예보모델이 얼마나 비슷하게 보는지 비교합니다.</div>
    <div class="f18-grid2"><div class="f18-field"><label>날짜</label><input id="f18ConfDate" type="date" value="${d}"></div><div class="f18-field"><label>시간</label><input id="f18ConfTime" type="time" value="06:00" step="3600"></div></div>
    <button id="f18ConfRun" class="f18-primary" style="width:100%">ECMWF · GFS · JMA 비교</button>
    <div id="f18ConfResult"></div>
    <div class="f18-note" style="margin-top:10px">‘신뢰도’는 실제 적중확률이 아니라 <b>모델 일치도</b>입니다. 모델들이 비슷할수록 예보가 안정적일 가능성이 높지만 실제 날씨를 보장하지 않습니다.</div>`);
  document.getElementById('f18ConfRun').onclick=f18RunConfidence;
}
async function f18RunConfidence(){
  const p=f18CurrentPort(),out=document.getElementById('f18ConfResult'),btn=document.getElementById('f18ConfRun');if(!p)return;
  const date=document.getElementById('f18ConfDate').value,time=(document.getElementById('f18ConfTime').value||'06:00').slice(0,5);
  btn.disabled=true;btn.textContent='3개 모델 비교 중...';out.innerHTML='';
  const defs=[['ECMWF','ecmwf'],['GFS','gfs'],['JMA','jma']];
  const res=await Promise.all(defs.map(async([name,base])=>{try{return {name,data:await f18ModelSnapshot(base,date,time,Number(p.lat),Number(p.lon))}}catch(e){return {name,error:String(e.message||e)}}}));
  const ok=res.filter(x=>x.data);
  if(ok.length<2){out.innerHTML='<div class="f18-status wait">비교 가능한 모델이 부족합니다. 먼 미래 날짜는 모델별 제공기간이 다를 수 있습니다.</div>';btn.disabled=false;btn.textContent='ECMWF · GFS · JMA 비교';return}
  const ws=f18Spread(ok,'wind'),gs=f18Spread(ok,'gust'),rs=f18Spread(ok,'rain');
  let level='낮음',cls='low',desc='모델 간 차이가 큽니다. 예보 변동 가능성을 크게 보세요.';
  if(ws<=1.2&&gs<=2.0){level='높음';cls='high';desc='주요 모델의 바람 예보가 서로 비슷합니다.'}
  else if(ws<=2.5&&gs<=4.0){level='보통';cls='mid';desc='모델 간 차이가 일부 있습니다. 최신 예보를 다시 확인하세요.'}
  out.innerHTML=`<div class="f18-confidence ${cls}">모델 일치도 ${level}<div style="font-size:11px;font-weight:750;margin-top:4px">${desc}</div></div>
    <div class="f18-models">${res.map(x=>x.data?`<div class="f18-model">${x.name}<b>${f18Num(x.data.wind)} m/s</b>돌풍 ${f18Num(x.data.gust)} · 강수 ${f18Num(x.data.rain)}</div>`:`<div class="f18-model">${x.name}<b>-</b>제공 없음</div>`).join('')}</div>
    <div class="f18-archive">모델 간 풍속 차이 <b>${f18Num(ws)}m/s</b> · 돌풍 차이 <b>${f18Num(gs)}m/s</b> · 강수 차이 <b>${f18Num(rs)}mm</b></div>`;
  btn.disabled=false;btn.textContent='ECMWF · GFS · JMA 다시 비교';
}

function f18OpenLogs(){
  const p=f18CurrentPort(),d=f18Iso(f18CurrentDate()),w=f18Water(f18CurrentDate());
  f18Open('나만의 조과기록',`
    <div class="f18-current">${f18Esc(p?.name||'-')} · ${d} · ${f18Esc(w.name||'-')}</div>
    <div class="f18-grid2"><div class="f18-field"><label>어종</label><select id="f18LogSpecies">${f18SpeciesOptions('갑오징어')}</select></div><div class="f18-field"><label>조과 (마릿수)</label><input id="f18LogCount" type="number" min="0" value="0"></div></div>
    <div class="f18-grid2"><div class="f18-field"><label>채비/봉돌</label><input id="f18LogRig" placeholder="예: 봉돌 20호 / 가지 20cm"></div><div class="f18-field"><label>루어/미끼</label><input id="f18LogLure" placeholder="예: 레이저수박"></div></div>
    <div class="f18-field"><label>메모</label><textarea id="f18LogMemo" placeholder="수심, 액션, 히트시간 등"></textarea></div>
    <button id="f18LogAdd" class="f18-primary" style="width:100%">현재 항구·날짜로 기록 저장</button>
    <div id="f18LogStats"></div><div class="f18-section-title">내 기록</div><div id="f18LogList"></div>
    <div class="f18-note">기록은 현재 기기의 브라우저에 저장됩니다. 브라우저 데이터 삭제 시 사라질 수 있습니다.</div>`);
  document.getElementById('f18LogAdd').onclick=f18AddLog;
  f18RenderLogs();
}
function f18AddLog(){
  const p=f18CurrentPort(),d=f18CurrentDate(),w=f18Water(d);if(!p)return;
  const logs=f18Get(F18_LOG_KEY,[]);
  logs.unshift({id:`l${Date.now()}`,savedAt:new Date().toISOString(),date:f18Iso(d),portId:p.id,portName:p.name,species:document.getElementById('f18LogSpecies').value,count:Number(document.getElementById('f18LogCount').value||0),rig:document.getElementById('f18LogRig').value.trim(),lure:document.getElementById('f18LogLure').value.trim(),memo:document.getElementById('f18LogMemo').value.trim(),tideName:w.name,tideIdx:w.idx});
  f18Set(F18_LOG_KEY,logs);f18RenderLogs();
}
function f18RenderLogs(){
  const logs=f18Get(F18_LOG_KEY,[]),list=document.getElementById('f18LogList'),stats=document.getElementById('f18LogStats');if(!list||!stats)return;
  const avg=logs.length?logs.reduce((s,x)=>s+Number(x.count||0),0)/logs.length:0;
  const by={};logs.forEach(x=>{const k=x.tideName||'-';(by[k]??=[]).push(Number(x.count||0))});
  const best=Object.entries(by).map(([k,v])=>[k,v.reduce((a,b)=>a+b,0)/v.length,v.length]).sort((a,b)=>b[1]-a[1])[0];
  stats.innerHTML=`<div class="f18-stat-grid"><div class="f18-stat"><b>${logs.length}</b><span>출조기록</span></div><div class="f18-stat"><b>${avg.toFixed(1)}</b><span>평균 조과</span></div><div class="f18-stat"><b>${best?f18Esc(best[0]):'-'}</b><span>최고 평균 물때*</span></div></div>${best?`<div class="f18-note">* ${f18Esc(best[0])} 평균 ${best[1].toFixed(1)}마리 · ${best[2]}회 기록 기준. 표본이 적을 때는 참고용입니다.</div>`:''}`;
  list.innerHTML=logs.length?logs.map(x=>`<div class="f18-log-row"><b>${f18Esc(x.date)} · ${f18Esc(x.portName)} · ${f18Esc(x.species)} ${x.count}마리</b><small>${f18Esc(x.tideName||'-')}${x.rig?` · ${f18Esc(x.rig)}`:''}${x.lure?` · ${f18Esc(x.lure)}`:''}${x.memo?`<br>${f18Esc(x.memo)}`:''}</small><div class="f18-log-tools"><button class="f18-tiny" data-del-log="${f18Esc(x.id)}">삭제</button></div></div>`).join(''):'<div class="f18-note">아직 저장된 조과기록이 없습니다.</div>';
  list.onclick=e=>{const b=e.target.closest('[data-del-log]');if(b){f18Set(F18_LOG_KEY,logs.filter(x=>x.id!==b.dataset.delLog));f18RenderLogs()}};
}

function f18MonthShift(d,n){return new Date(d.getFullYear(),d.getMonth()+n,1,12)}
function f18MonthVal(d){return `${d.getFullYear()}-${f18Pad(d.getMonth()+1)}`}
function f18TidePicks(){
  let saved=f18Get(F18_TIDE_KEY,null);
  if(!Array.isArray(saved)||!saved.length)saved=Array.from({length:15},(_,i)=>i+1);
  return saved;
}
function f18TideLabel(i){return i===14?'조금':i===15?'무시':`${i}물`}
function f18OpenFinder(){
  const now=new Date(),s=f18MonthShift(now,1),e=f18MonthShift(now,12),picks=f18TidePicks();
  f18Open('장기 출조 · 예약일 찾기',`
    <div class="f18-current">조석 API가 아직 없는 먼 미래도 ‘몇물’ 계산으로 후보 날짜를 찾습니다.</div>
    <div class="f18-grid2"><div class="f18-field"><label>시작 월</label><input id="f18FindStart" type="month" value="${f18MonthVal(s)}"></div><div class="f18-field"><label>종료 월</label><input id="f18FindEnd" type="month" value="${f18MonthVal(e)}"></div></div>
    <label class="f18-check"><input id="f18Weekend" type="checkbox"> 주말(토·일)만 보기</label>
    <div class="f18-field"><label>찾을 물때 선택</label><div id="f18TidePicks" class="f18-tide-picks">${Array.from({length:15},(_,i)=>i+1).map(i=>`<button class="f18-tide-pick ${picks.includes(i)?'active':''}" data-tide="${i}">${f18TideLabel(i)}</button>`).join('')}</div></div>
    <button id="f18FindRun" class="f18-primary" style="width:100%">후보 날짜 찾기</button>
    <div id="f18FindSummary"></div><div id="f18FindResults"></div>
    <div class="f18-note" style="margin-top:10px">좋은 물때는 어종·지역·낚시방법에 따라 다르므로 앱이 임의로 ‘최고 물때’를 지정하지 않습니다. 원하는 물때를 직접 선택해 검색합니다.</div>`);
  document.getElementById('f18TidePicks').onclick=e=>{const b=e.target.closest('[data-tide]');if(!b)return;b.classList.toggle('active');const a=[...document.querySelectorAll('.f18-tide-pick.active')].map(x=>Number(x.dataset.tide));f18Set(F18_TIDE_KEY,a)};
  document.getElementById('f18FindRun').onclick=f18RunFinder;
}
function f18RunFinder(){
  const sv=document.getElementById('f18FindStart').value,ev=document.getElementById('f18FindEnd').value,weekend=document.getElementById('f18Weekend').checked;
  if(!sv||!ev)return;
  const [sy,sm]=sv.split('-').map(Number),[ey,em]=ev.split('-').map(Number),start=new Date(sy,sm-1,1,12),end=new Date(ey,em,0,12);
  if(end<start)return;
  const months=(ey-sy)*12+(em-sm)+1;if(months>24){document.getElementById('f18FindSummary').innerHTML='<div class="f18-status wait">한 번에 최대 24개월까지 검색해 주세요.</div>';return}
  const picks=[...document.querySelectorAll('.f18-tide-pick.active')].map(x=>Number(x.dataset.tide));
  const found=[];for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1)){const dow=d.getDay(),w=f18Water(d);if(weekend&&dow!==0&&dow!==6)continue;if(picks.length&&!picks.includes(w.idx))continue;found.push({date:f18Iso(d),name:w.name,dow:['일','월','화','수','목','금','토'][dow]})}
  document.getElementById('f18FindSummary').innerHTML=`<div class="f18-archive">조건에 맞는 날짜 <b>${found.length}개</b>${weekend?' · 주말만':''}</div>`;
  document.getElementById('f18FindResults').innerHTML=found.slice(0,180).map(x=>`<div class="f18-result"><div><b>${f18Esc(x.date)} (${x.dow})</b><br><span>${f18Esc(x.name)}</span></div><button data-go="${x.date}">이 날짜 보기</button></div>`).join('')+(found.length>180?'<div class="f18-note">결과가 많아 앞 180개만 표시했습니다.</div>':'');
  document.getElementById('f18FindResults').onclick=e=>{const b=e.target.closest('[data-go]');if(!b)return;try{selectDateValue(new Date(`${b.dataset.go}T12:00:00`));f18Close();window.scrollTo({top:0,behavior:'smooth'})}catch(_){}};
}

async function f18AutoRefreshUpcoming(){
  const today=f18Iso(new Date());
  const plans=f18Get(F18_PLAN_KEY,[]);
  const targets=plans.filter(x=>x.date>=today).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)).slice(0,2);
  let changed=false;
  for(const p of targets){
    try{
      const port={id:p.portId,name:p.portName,lat:p.lat,lon:p.lon,tideCode:p.tideCode};
      const cur=await f18ForecastAt(port,p.date,p.time);
      if(!p.baseline)p.baseline=cur;
      else p.last=cur;
      p.note='';
      changed=true;
    }catch(_){}
  }
  if(changed){f18Set(F18_PLAN_KEY,plans);f18RenderUpcoming()}
}

async function f18ArchiveStatus(){
  try{
    const r=await fetch(`data/forecast-history/index.json?f18=${Date.now()}`,{cache:'no-store'});if(!r.ok)return null;return await r.json()
  }catch(_){return null}
}

async function f18EnhanceUpcoming(){
  const el=document.getElementById('f18Upcoming');if(!el)return;
  const idx=await f18ArchiveStatus();
  if(idx){const s=document.createElement('div');s.className='f18-source-note';s.textContent=`예보 원본 수집: ${idx.snapshot_count||0}회 · 마지막 ${idx.last_snapshot||'-'}`;el.appendChild(s)}
}

function f18Ready(){
  try{return !!(document.querySelector('.weather-section')&&state&&state.ports&&state.ports.length)}catch(_){return false}
}
let tries=0;
const timer=setInterval(()=>{
  tries++;
  if(f18Ready()){clearInterval(timer);f18Inject();setTimeout(f18EnhanceUpcoming,300);setTimeout(f18AutoRefreshUpcoming,700)}
  else if(tries>40)clearInterval(timer);
},250);
})();
