import os,json,urllib.parse,urllib.request
from pathlib import Path
from datetime import datetime,timedelta,timezone
from concurrent.futures import ThreadPoolExecutor,as_completed
ENDPOINT='https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService'
ROOT=Path(__file__).resolve().parents[1]
key=os.environ.get('KHOA_SERVICE_KEY','').strip()
if not key: raise SystemExit('KHOA_SERVICE_KEY secret is missing')
key=urllib.parse.unquote(key)
stations=json.loads((ROOT/'stations.json').read_text(encoding='utf-8'))
kst=timezone(timedelta(hours=9));today=datetime.now(kst).date();start=today-timedelta(days=2);end=today+timedelta(days=50)

def fetch_one(code,d):
    qs=urllib.parse.urlencode({'serviceKey':key,'numOfRows':'20','pageNo':'1','type':'json','obsCode':code,'reqDate':d.strftime('%Y%m%d')})
    req=urllib.request.Request(ENDPOINT+'?'+qs,headers={'User-Agent':'FICAMX-Tide-Updater/1.0'})
    try:
        with urllib.request.urlopen(req,timeout=20) as r: raw=r.read().decode('utf-8','replace')
        data=json.loads(raw);head=(data.get('response') or {}).get('header') or data.get('header') or {}
        if str(head.get('resultCode','00')) not in ('0','00'): return code,str(d),[],None,None,head.get('resultMsg','API error')
        body=(data.get('response') or {}).get('body') or data.get('body') or data;items=body.get('items') or []
        if isinstance(items,dict): items=items.get('item') or []
        if isinstance(items,dict): items=[items]
        rows=[];lat=lon=None
        for x in items:
            rows.append({k:x.get(k) for k in ('predcDt','predcTdlvVl','extrSe')})
            if lat is None and x.get('lat') is not None: lat=x.get('lat')
            if lon is None and x.get('lot') is not None: lon=x.get('lot')
        return code,str(d),rows,lat,lon,None
    except Exception as e:return code,str(d),[],None,None,str(e)

jobs=[]
d=start
while d<=end:
    for s in stations: jobs.append((s['code'],d))
    d+=timedelta(days=1)
results={s['code']:{'meta':{'name':s['name'],'region':s['region'],'lat':None,'lon':None,'generated_at':datetime.now(kst).isoformat(timespec='seconds'),'from':str(start),'to':str(end)},'days':{}} for s in stations}
with ThreadPoolExecutor(max_workers=18) as ex:
    futs=[ex.submit(fetch_one,c,d) for c,d in jobs]
    for i,f in enumerate(as_completed(futs),1):
        code,ds,rows,lat,lon,err=f.result();obj=results[code];obj['days'][ds]=rows
        if lat is not None: obj['meta']['lat']=float(lat)
        if lon is not None: obj['meta']['lon']=float(lon)
        if err and i<15: print(code,ds,err)
        if i%500==0: print('done',i,'/',len(futs))
outdir=ROOT/'data/tides';outdir.mkdir(parents=True,exist_ok=True)
for code,obj in results.items():(outdir/f'{code}.json').write_text(json.dumps(obj,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print('wrote',len(results),'station files',start,'to',end)
