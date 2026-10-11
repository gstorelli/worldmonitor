"""Download IMF PortWatch daily chokepoint transits for the thesis straits.

PortWatch publishes its datasets through an ArcGIS Hub site. The script discovers the
feature service of the daily chokepoint dataset through the Hub search API (so that it does
not depend on a hard-coded service URL), pages through it and writes:
  <out>/raw/portwatch_chokepoints_daily.csv   raw daily records (kept as a workflow artifact)
  <out>/portwatch_monthly.csv                  monthly mean of daily transits per chokepoint
  <out>/portwatch_log.txt                      what was found and queried
Terms of use: https://www.imf.org/external/terms.htm (raw data are not committed).
"""
import csv
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict

HUB = "https://portwatch.imf.org"
UA = "RiskSentinel-research/1.0 (PhD research, University of Bari; github.com/gstorelli/worldmonitor)"
NAMES = ["Suez", "Bab el-Mandeb", "Hormuz", "Malacca", "Taiwan", "Panama", "Gibraltar"]


def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.load(r)


def discover(log):
    """Return candidate (title, service url) pairs for chokepoint datasets."""
    out = []
    for q in ["Daily Chokepoints Data", "chokepoint transit", "Daily Chokepoint"]:
        url = f"{HUB}/api/search/v1/collections/dataset/items?" + urllib.parse.urlencode({"q": q, "limit": 20})
        try:
            js = get_json(url)
        except Exception as e:
            log.append(f"hub search '{q}': ERROR {e}")
            continue
        for feat in js.get("features", []):
            p = feat.get("properties", {})
            title, svc = p.get("title", ""), p.get("url", "")
            log.append(f"hub search '{q}': {title} -> {svc}")
            if svc and "chokepoint" in title.lower() and (title, svc) not in out:
                out.append((title, svc))
    return out


def fetch_layer(svc, log):
    base = svc.rstrip("/")
    if not base.split("/")[-1].isdigit():
        base += "/0"
    rows, offset = [], 0
    while True:
        q = urllib.parse.urlencode({"where": "1=1", "outFields": "*", "f": "json", "resultOffset": offset,
                                    "resultRecordCount": 2000, "orderByFields": "ObjectId"})
        js = get_json(f"{base}/query?{q}")
        if "error" in js:
            log.append(f"query error at offset {offset}: {js['error']}")
            break
        feats = js.get("features", [])
        rows += [f["attributes"] for f in feats]
        if not feats or not js.get("exceededTransferLimit"):
            break
        offset += len(feats)
        time.sleep(0.2)
    log.append(f"{base}: {len(rows)} records; fields: {sorted(rows[0].keys()) if rows else []}")
    return rows


def main(out):
    os.makedirs(os.path.join(out, "raw"), exist_ok=True)
    log = []
    cands = discover(log)
    rows = []
    for title, svc in cands:
        try:
            rows = fetch_layer(svc, log)
        except Exception as e:
            log.append(f"{svc}: ERROR {e}")
            continue
        if rows:
            log.append(f"using dataset: {title}")
            break
    if rows:
        fields = sorted({k for r in rows for k in r})
        with open(os.path.join(out, "raw", "portwatch_chokepoints_daily.csv"), "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fields)
            w.writeheader()
            w.writerows(rows)
        name_f = next((k for k in fields if k.lower() in ("portname", "name", "chokepoint")), None)
        tot_f = next((k for k in fields if k.lower() in ("n_total", "total", "n_transits")), None)
        date_f = next((k for k in fields if k.lower() in ("date",)), None)
        log.append(f"name field {name_f}, total field {tot_f}, date field {date_f}")
        agg = defaultdict(list)
        for r in rows:
            nm = str(r.get(name_f, ""))
            if name_f and tot_f and date_f and any(n.lower() in nm.lower() for n in NAMES):
                d = r[date_f]
                if isinstance(d, (int, float)):
                    d = time.strftime("%Y-%m", time.gmtime(d / 1000))
                else:
                    d = str(d)[:7]
                agg[(nm, d)].append(r[tot_f] or 0)
        with open(os.path.join(out, "portwatch_monthly.csv"), "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["chokepoint", "month", "mean_daily_transits", "days"])
            for (nm, d), v in sorted(agg.items()):
                w.writerow([nm, d, round(sum(v) / len(v), 2), len(v)])
    with open(os.path.join(out, "portwatch_log.txt"), "w") as f:
        f.write("\n".join(log) + "\n")
    print(f"portwatch: {len(rows)} records")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "out")
