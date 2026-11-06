import os, json, urllib.parse, urllib.request
from pathlib import Path
from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed

ENDPOINT = 'https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService'
ROOT = Path(__file__).resolve().parents[1]
OUTDIR = ROOT / 'data' / 'tides'
OUTDIR.mkdir(parents=True, exist_ok=True)

key = os.environ.get('KHOA_SERVICE_KEY', '').strip()
if not key:
    raise SystemExit('KHOA_SERVICE_KEY secret is missing')
key = urllib.parse.unquote(key)

stations = json.loads((ROOT / 'stations.json').read_text(encoding='utf-8'))
kst = timezone(timedelta(hours=9))
today = datetime.now(kst).date()
start = today - timedelta(days=2)
end = today + timedelta(days=50)


def fetch_one(code, d):
    qs = urllib.parse.urlencode({
        'serviceKey': key,
        'numOfRows': '20',
        'pageNo': '1',
        'type': 'json',
        'obsCode': code,
        'reqDate': d.strftime('%Y%m%d'),
    })
    req = urllib.request.Request(
        ENDPOINT + '?' + qs,
        headers={'User-Agent': 'FICAMX-Tide-Updater/2.0'},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            raw = r.read().decode('utf-8', 'replace')
        data = json.loads(raw)
        head = (data.get('response') or {}).get('header') or data.get('header') or {}
        if str(head.get('resultCode', '00')) not in ('0', '00'):
            return code, str(d), [], None, None, head.get('resultMsg', 'API error')
        body = (data.get('response') or {}).get('body') or data.get('body') or data
        items = body.get('items') or []
        if isinstance(items, dict):
            items = items.get('item') or []
        if isinstance(items, dict):
            items = [items]
        rows, lat, lon = [], None, None
        for x in items:
            rows.append({k: x.get(k) for k in ('predcDt', 'predcTdlvVl', 'extrSe')})
            if lat is None and x.get('lat') is not None:
                lat = x.get('lat')
            if lon is None and x.get('lot') is not None:
                lon = x.get('lot')
        return code, str(d), rows, lat, lon, None
    except Exception as e:
        return code, str(d), [], None, None, str(e)


def load_existing(station):
    path = OUTDIR / f"{station['code']}.json"
    if path.exists():
        try:
            obj = json.loads(path.read_text(encoding='utf-8'))
            if not isinstance(obj.get('days'), dict):
                obj['days'] = {}
            if not isinstance(obj.get('meta'), dict):
                obj['meta'] = {}
            return obj
        except Exception:
            pass
    return {
        'meta': {'name': station['name'], 'region': station['region'], 'lat': None, 'lon': None},
        'days': {},
    }


results = {s['code']: load_existing(s) for s in stations}
jobs = []
d = start
while d <= end:
    ds = str(d)
    for s in stations:
        existing = results[s['code']]['days'].get(ds)
        # Missing or previously empty dates are retried. Existing non-empty history is preserved.
        if not existing:
            jobs.append((s['code'], d))
    d += timedelta(days=1)

print(f'incremental update: {len(jobs)} API calls needed for {start} to {end}')
if jobs:
    with ThreadPoolExecutor(max_workers=18) as ex:
        futs = [ex.submit(fetch_one, c, d) for c, d in jobs]
        for i, f in enumerate(as_completed(futs), 1):
            code, ds, rows, lat, lon, err = f.result()
            obj = results[code]
            if rows:
                obj['days'][ds] = rows
            elif ds not in obj['days']:
                obj['days'][ds] = []
            if lat is not None:
                obj['meta']['lat'] = float(lat)
            if lon is not None:
                obj['meta']['lon'] = float(lon)
            if err:
                print('ERROR', code, ds, err)
            if i % 500 == 0:
                print('done', i, '/', len(futs))

now = datetime.now(kst).isoformat(timespec='seconds')
for s in stations:
    code = s['code']
    obj = results[code]
    obj['meta']['name'] = s['name']
    obj['meta']['region'] = s['region']
    obj['meta']['generated_at'] = now
    keys = sorted(obj['days'])
    if keys:
        obj['meta']['from'] = keys[0]
        obj['meta']['to'] = keys[-1]
    (OUTDIR / f'{code}.json').write_text(
        json.dumps(obj, ensure_ascii=False, separators=(',', ':')),
        encoding='utf-8',
    )

print('updated', len(stations), 'station files; history preserved')
