import json
import os
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PORTS_PATH = ROOT / "data" / "fishing-ports-v18.json"
OUTDIR = ROOT / "data" / "forecast-history"
OUTDIR.mkdir(parents=True, exist_ok=True)

KST = timezone(timedelta(hours=9))
NOW = datetime.now(KST)
TODAY = NOW.date()
END_DATE = TODAY + timedelta(days=6)

WEATHER_URL = os.environ.get(
    "OPEN_METEO_WEATHER_URL",
    "https://api.open-meteo.com/v1/forecast",
).strip()
MARINE_URL = os.environ.get(
    "OPEN_METEO_MARINE_URL",
    "https://marine-api.open-meteo.com/v1/marine",
).strip()
API_KEY = os.environ.get("OPEN_METEO_API_KEY", "").strip()
KEEP_HOURS = set(range(0, 24, 3))


def fetch_json(base_url, params, retries=2):
    if API_KEY:
        params = dict(params)
        params["apikey"] = API_KEY
    url = base_url + "?" + urllib.parse.urlencode(params)
    last_error = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "FICAMX-Forecast-Archive/1.0"},
            )
            with urllib.request.urlopen(req, timeout=30) as response:
                raw = response.read().decode("utf-8", "replace")
            return json.loads(raw)
        except Exception as exc:
            last_error = exc
            if attempt < retries:
                time.sleep(1.2 * (attempt + 1))
    raise last_error


def value_at(values, index):
    if not isinstance(values, list) or index >= len(values):
        return None
    value = values[index]
    try:
        if value is None:
            return None
        return round(float(value), 2)
    except Exception:
        return None


def fetch_port(port):
    common = {
        "latitude": port["lat"],
        "longitude": port["lon"],
        "timezone": "Asia/Seoul",
        "start_date": str(TODAY),
        "end_date": str(END_DATE),
    }
    weather_params = dict(common)
    weather_params.update({
        "hourly": ",".join([
            "temperature_2m",
            "precipitation",
            "weather_code",
            "wind_speed_10m",
            "wind_gusts_10m",
            "wind_direction_10m",
        ]),
        "wind_speed_unit": "ms",
    })
    marine_params = dict(common)
    marine_params.update({
        "hourly": "wave_height",
        "cell_selection": "sea",
    })

    weather = fetch_json(WEATHER_URL, weather_params)
    try:
        marine = fetch_json(MARINE_URL, marine_params)
    except Exception as exc:
        print("MARINE_WARNING", port["id"], str(exc))
        marine = {}

    mh = marine.get("hourly") or {}
    wave_by_time = {}
    for idx, stamp in enumerate(mh.get("time") or []):
        wave_by_time[stamp] = value_at(mh.get("wave_height"), idx)

    wh = weather.get("hourly") or {}
    hours = []
    for idx, stamp in enumerate(wh.get("time") or []):
        try:
            hour = int(stamp[11:13])
        except Exception:
            continue
        if hour not in KEEP_HOURS:
            continue
        hours.append([
            stamp,
            value_at(wh.get("wind_speed_10m"), idx),
            value_at(wh.get("wind_gusts_10m"), idx),
            value_at(wh.get("wind_direction_10m"), idx),
            value_at(wh.get("precipitation"), idx),
            value_at(wh.get("temperature_2m"), idx),
            value_at(wh.get("weather_code"), idx),
            wave_by_time.get(stamp),
        ])

    return {
        "id": port["id"],
        "name": port["name"],
        "region": port.get("region"),
        "lat": port["lat"],
        "lon": port["lon"],
        "hours": hours,
    }


ports = json.loads(PORTS_PATH.read_text(encoding="utf-8"))
print("forecast archive ports:", len(ports))
print("forecast range:", TODAY, "to", END_DATE)

results = []
errors = []
with ThreadPoolExecutor(max_workers=6) as pool:
    futures = {pool.submit(fetch_port, port): port for port in ports}
    for future in as_completed(futures):
        port = futures[future]
        try:
            results.append(future.result())
        except Exception as exc:
            errors.append({"id": port["id"], "name": port["name"], "error": str(exc)})
            print("ERROR", port["id"], str(exc))

results.sort(key=lambda x: x["id"])

snapshot = {
    "schema": 1,
    "generated_at": NOW.isoformat(timespec="seconds"),
    "forecast_from": str(TODAY),
    "forecast_to": str(END_DATE),
    "interval_hours": 3,
    "fields": [
        "time",
        "wind_ms",
        "gust_ms",
        "wind_dir_deg",
        "rain_mm",
        "temp_c",
        "weather_code",
        "wave_m",
    ],
    "port_count": len(results),
    "ports": results,
    "errors": errors,
}

day_dir = OUTDIR / NOW.strftime("%Y") / NOW.strftime("%m") / NOW.strftime("%d")
day_dir.mkdir(parents=True, exist_ok=True)
snapshot_path = day_dir / (NOW.strftime("%H%M") + ".json")
compact = json.dumps(snapshot, ensure_ascii=False, separators=(",", ":"))
snapshot_path.write_text(compact, encoding="utf-8")
(OUTDIR / "latest.json").write_text(compact, encoding="utf-8")

index_path = OUTDIR / "index.json"
try:
    index = json.loads(index_path.read_text(encoding="utf-8"))
except Exception:
    index = {}

if not index.get("started_at"):
    index["started_at"] = snapshot["generated_at"]
index["schema"] = 1
index["last_snapshot"] = snapshot["generated_at"]
index["last_path"] = snapshot_path.relative_to(ROOT).as_posix()
index["snapshot_count"] = int(index.get("snapshot_count") or 0) + 1
index["port_count"] = len(results)
index["forecast_days"] = 7
index["interval_hours"] = 3
index["last_error_count"] = len(errors)
index_path.write_text(
    json.dumps(index, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)

print("saved:", snapshot_path.relative_to(ROOT))
print("ports saved:", len(results), "errors:", len(errors))
