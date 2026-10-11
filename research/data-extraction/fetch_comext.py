"""Download EU and Italian imports of the thesis strategic goods from Eurostat Comext.

Dataset DS-045409 (EU trade since 1988 by HS2-4-6 and CN8), dissemination API, JSON-stat.
One request per product x reporter x year x indicator, all partners. Output:
  <out>/comext_imports_long.csv   one row per product, reporter, year, indicator, partner
  <out>/comext_dependence.csv     extra-EU total, top origins and HHI of extra-EU origins
Source: Eurostat (acknowledgement required by the Eurostat reuse policy).
"""
import csv
import itertools
import json
import os
import sys
import time
import urllib.request

BASE = "https://ec.europa.eu/eurostat/api/comext/dissemination/statistics/1.0/data/DS-045409"
PRODUCTS = ["1001", "2603", "2604", "2709", "271012", "271019", "271111", "271121", "3102", "3105",
            "720260", "7403", "7501", "7502", "7601", "8542"]
REPORTERS = ["EU27_2020", "IT"]
YEARS = [str(y) for y in range(2019, 2025)]
INDICATORS = ["VALUE_IN_EUROS", "QUANTITY_IN_KG"]
EU27 = set("AT BE BG CY CZ DE DK EE ES FI FR GR HR HU IE IT LT LU LV MT NL PL PT RO SE SI SK".split())
UA = "RiskSentinel-research/1.0 (PhD research, University of Bari; github.com/gstorelli/worldmonitor)"


def get(params):
    url = BASE + "?" + "&".join(f"{k}={v}" for k, v in params)
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r), url
        except Exception as e:  # retry on transient errors
            err = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"{url}: {err}")


def jsonstat_rows(js):
    """Yield (category codes by dimension, value) from a JSON-stat 2.0 dataset."""
    ids, sizes = js["id"], js["size"]
    cats = []
    for d in ids:
        idx = js["dimension"][d]["category"]["index"]
        order = sorted(idx, key=idx.get) if isinstance(idx, dict) else idx
        cats.append(order)
    values = js.get("value", {})
    items = values.items() if isinstance(values, dict) else enumerate(values)
    for k, v in items:
        if v is None:
            continue
        k = int(k)
        pos = []
        for s in reversed(sizes):
            pos.append(k % s)
            k //= s
        pos.reverse()
        yield {d: cats[i][p] for i, (d, p) in enumerate(zip(ids, pos))}, v


# Comext partner codes that are not countries (stores and provisions, high seas, countries
# not specified for commercial or military reasons, ...). QA (Qatar) is a country.
NOT_COUNTRY = set("QP QQ QR QS QU QV QW QX QY QZ".split())


def is_country(code):
    """Extra-EU partner country (excludes aggregates, EU members and special codes)."""
    return len(code) == 2 and code not in EU27 and code not in NOT_COUNTRY


def main(out):
    os.makedirs(out, exist_ok=True)
    rows, log = [], []
    labels = {}
    for prod, rep, year, ind in itertools.product(PRODUCTS, REPORTERS, YEARS, INDICATORS):
        params = [("format", "JSON"), ("lang", "en"), ("freq", "A"), ("reporter", rep), ("flow", "1"),
                  ("product", prod), ("indicators", ind), ("time", year)]
        try:
            js, url = get(params)
        except Exception as e:
            log.append(f"ERROR {prod} {rep} {year} {ind}: {e}")
            continue
        n = 0
        for c, v in jsonstat_rows(js):
            rows.append({"product": prod, "reporter": rep, "year": year, "indicator": ind,
                         "partner": c.get("partner"), "value": v})
            n += 1
        labels.update({k: v for k, v in js["dimension"]["partner"]["category"].get("label", {}).items()})
        labels[prod] = js["dimension"]["product"]["category"].get("label", {}).get(prod, "")
        log.append(f"ok {prod} {rep} {year} {ind}: {n} values")
        time.sleep(0.3)

    with open(os.path.join(out, "comext_imports_long.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["product", "reporter", "year", "indicator", "partner", "value"])
        w.writeheader()
        w.writerows(rows)

    dep = []
    for prod, rep, year in itertools.product(PRODUCTS, REPORTERS, YEARS):
        sel = [r for r in rows if r["product"] == prod and r["reporter"] == rep and r["year"] == year
               and r["indicator"] == "VALUE_IN_EUROS"]
        ext = next((r["value"] for r in sel if r["partner"] == "EXT_EU27_2020"), None)
        intra = next((r["value"] for r in sel if r["partner"] == "INT_EU27_2020"), None)
        countries = sorted([r for r in sel if is_country(r["partner"])], key=lambda r: -r["value"])
        tot_c = sum(r["value"] for r in countries)
        hhi = sum((r["value"] / tot_c) ** 2 for r in countries) if tot_c else None
        top = countries[:5]
        dep.append({"product": prod, "product_label": labels.get(prod, ""), "reporter": rep, "year": year,
                    "extra_eu_eur": ext, "intra_eu_eur": intra,
                    "extra_share_of_total": (ext / (ext + intra)) if ext and intra else None,
                    "hhi_extra_eu_origins": round(hhi, 4) if hhi is not None else None,
                    **{f"top{i+1}": (f"{r['partner']} {100*r['value']/ext:.1f}%" if ext else r["partner"])
                       for i, r in enumerate(top)}})
    with open(os.path.join(out, "comext_dependence.csv"), "w", newline="") as f:
        fields = ["product", "product_label", "reporter", "year", "extra_eu_eur", "intra_eu_eur",
                  "extra_share_of_total", "hhi_extra_eu_origins", "top1", "top2", "top3", "top4", "top5"]
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(dep)
    with open(os.path.join(out, "comext_log.txt"), "w") as f:
        f.write("\n".join(log) + "\n")
    print(f"comext: {len(rows)} rows, {sum(1 for l in log if l.startswith('ERROR'))} errors")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "out")
