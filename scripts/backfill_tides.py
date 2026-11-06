import os, json, urllib.parse, urllib.request
from pathlib import Path
from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed

ENDPOINT = 'https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService'
ROOT = Path(__file__).resolve().parents[1]
OUTDIR = ROOT / 'data' / 'tides'
OUTDIR.mkdir(parents=True, exist_ok=True)
MAX_DAYS = 45  # 166 stations x 45 days = 7,470 calls, leaving quota margin.

key = os.environ.get('KHOA_SERVICE_KEY', '').strip()
if not key:
    raise SystemExit('KHOA_SERVICE_KEY secret is missing')
key = urllib.parse.unquote(key)

start_raw = os.environ.get('START_DATE', '').strip()
end_raw = os.environ.get('END_DATE', '').strip()
force = os.environ.get('FORCE', 'false').strip().lower() == 'true'

try:
    start = datetime.strptime(start_raw, '%Y-%m-%d').date()
    end = datetime.strptime(end_raw, '%Y-%m-%d').date()
except ValueError:
    raise SystemExit('START_DATE and END_DATE must use YYYY-MM-DD format')

if end < start:
    raise SystemExit('END_DATE must be on or after START_DATE')
days_count = (end - start).days + 1
if days_count > MAX_DAYS:
    raise SystemExit(f'Maximum range is {MAX_DAYS} days per run. Requested: {days_count} days')

stations = json.loads((ROOT / 'stations.json').read_text(encoding='utf-8'))
kst = timezone(timedelta(hours=9))


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
        headers={'User-Agent': 'FICAMX-Tide-Backfill/1.0'},
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
        current = results[s['code']]['days'].get(ds)
        if force or not current:
            jobs.append((s['code'], d))
    d += timedelta(days=1)

estimated = len(jobs)
print(f'Backfill {start} to {end}: {days_count} days, {len(stations)} stations, {estimated} API calls')
if not jobs:
    print('Nothing to fetch: requested dates already contain data.')

success_rows = 0
errors = 0
if jobs:
    with ThreadPoolExecutor(max_workers=18) as ex:
        futs = [ex.submit(fetch_one, c, d) for c, d in jobs]
        for i, f in enumerate(as_completed(futs), 1):
            code, ds, rows, lat, lon, err = f.result()
            obj = results[code]
            if rows:
                obj['days'][ds] = rows
                success_rows += 1
            elif ds not in obj['days']:
                obj['days'][ds] = []
            if lat is not None:
                obj['meta']['lat'] = float(lat)
            if lon is not None:
                obj['meta']['lon'] = float(lon)
            if err:
                errors += 1
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

print(f'Backfill complete. Dates with data fetched: {success_rows}; errors: {errors}')
print('Existing future/current/history data was preserved and merged.')
