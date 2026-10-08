"""Analisi dei pericoli sismici e vulcanici dei nodi critici - Risk Sentinel.
Input (file scaricati il 7-8/10/2026, vedi README): ISC-GEM v12.1 (main + supplement), GVP Holocene
volcano list (VOTW 5.4.0), GVP Holocene eruption list (VOTW 5.3.5), EM-DAT public incl. hist (2026-10-02).
Uso: python analisi_pericoli_nodi.py <cartella_dati>  ->  <cartella_dati>/results.pkl
"""
import re, html, math, pickle
import numpy as np, pandas as pd

import os, sys
D = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HAZARD_DATA_DIR', 'data')).rstrip('/') + '/'
R_MAIN, R_SENS = 300.0, 150.0
Y0, Y1 = 1922, 2021          # ultimi 100 anni coperti da ISC-GEM v12.1

NODES = [  # nome, tipo, bene, lat, lon
    ("Suez", "Stretto", "—", 30.60, 32.33),
    ("Bab el-Mandeb", "Stretto", "—", 12.60, 43.33),
    ("Hormuz", "Stretto", "—", 26.57, 56.25),
    ("Malacca", "Stretto", "—", 2.50, 101.40),
    ("Stretto di Taiwan", "Stretto", "—", 24.00, 119.50),
    ("Panama", "Stretto", "—", 9.08, -79.68),
    ("Gibilterra", "Stretto", "—", 35.95, -5.60),
    ("Antofagasta", "Area produttiva", "Rame", -23.30, -69.00),
    ("Morowali", "Area produttiva", "Nichel", -2.83, 122.16),
    ("Weda Bay", "Area produttiva", "Nichel", 0.47, 127.94),
    ("Hsinchu", "Area produttiva", "Chip", 24.78, 121.01),
    ("Tainan", "Area produttiva", "Chip", 23.11, 120.27),
]
nodes = pd.DataFrame(NODES, columns=["nodo", "tipo", "bene", "lat", "lon"])

def hav(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = map(np.radians, (lat1, lon1, lat2, lon2))
    h = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371.0 * np.arcsin(np.sqrt(h))

# ---------------- ISC-GEM ----------------
def read_isc(path):
    lines = [l for l in open(path, encoding='utf-8', errors='replace') if not l.startswith('#') and l.strip()]
    cols = ["date", "lat", "lon", "smajax", "sminax", "strike", "q_loc", "depth", "depth_unc", "q_depth",
            "mw", "mw_unc", "q_mw", "mw_src", "mo", "fac", "mo_auth", "mpp", "mpr", "mrr", "mrt", "mtp", "mtt",
            "str1", "dip1", "rake1", "str2", "dip2", "rake2", "type", "eventid"]
    recs = [[x.strip() for x in l.rstrip('\n').split(',')] for l in lines]
    df = pd.DataFrame([r[:31] for r in recs], columns=cols)
    for c in ["lat", "lon", "depth", "mw", "mw_unc"]:
        df[c] = pd.to_numeric(df[c], errors='coerce')
    df["date"] = pd.to_datetime(df["date"].str.slice(0, 19), errors='coerce')
    df["year"] = df["date"].dt.year
    return df

isc = read_isc(D + 'iscgem_main.csv')
sup = read_isc(D + 'iscgem_suppl.csv')

eq_rows, sup_rows = [], []
for n in NODES:
    d = hav(n[3], n[4], isc.lat.values, isc.lon.values)
    sel = isc[d <= R_MAIN].copy(); sel["dist_km"] = d[d <= R_MAIN].round(0); sel["nodo"] = n[0]
    eq_rows.append(sel)
    ds = hav(n[3], n[4], sup.lat.values, sup.lon.values)
    ss = sup[ds <= R_MAIN].copy(); ss["dist_km"] = ds[ds <= R_MAIN].round(0); ss["nodo"] = n[0]
    sup_rows.append(ss)
eq = pd.concat(eq_rows, ignore_index=True)
eqs = pd.concat(sup_rows, ignore_index=True)

def eq_summary(eq, R):
    out = []
    for n in NODES:
        e = eq[(eq.nodo == n[0]) & (eq.dist_km <= R) & (eq.year >= Y0) & (eq.year <= Y1)]
        big = e.sort_values("mw", ascending=False).head(1)
        out.append({
            "nodo": n[0],
            "M≥5.5": int((e.mw >= 5.5).sum()), "M≥6.0": int((e.mw >= 6.0).sum()), "M≥7.0": int((e.mw >= 7.0).sum()),
            "M≥6.0 superficiali (≤70 km)": int(((e.mw >= 6.0) & (e.depth <= 70)).sum()),
            "Tasso annuo M≥6.0": round((e.mw >= 6.0).sum() / (Y1 - Y0 + 1), 2),
            "Mw massima": float(big.mw.iloc[0]) if len(big) else np.nan,
            "Data Mw massima": big.date.dt.strftime('%Y-%m-%d').iloc[0] if len(big) else "",
            "Distanza Mw massima (km)": float(big.dist_km.iloc[0]) if len(big) else np.nan,
        })
    return pd.DataFrame(out)

eq_sum = eq_summary(eq, R_MAIN)
eq_sum150 = eq_summary(eq, R_SENS)

decades = list(range(1922, 2022, 10))
def per_decade(thr):
    rows = []
    for n in NODES:
        e = eq[(eq.nodo == n[0]) & (eq.mw >= thr)]
        rows.append([n[0]] + [int(((e.year >= a) & (e.year <= a + 9)).sum()) for a in decades])
    return pd.DataFrame(rows, columns=["nodo"] + [f"{a}-{a+9}" for a in decades])
dec6, dec55 = per_decade(6.0), per_decade(5.5)

sup_sum = eqs[(eqs.year >= Y0) & (eqs.year <= Y1)].groupby("nodo").size().reindex(nodes.nodo, fill_value=0)

# ---------------- GVP ----------------
s = open(D + 'gvp_volcanoes.xls', encoding='utf-8', errors='replace').read()
rows = re.findall(r'<Row[^>]*>(.*?)</Row>', s, flags=re.S)
def cells(r):
    out = []
    for m in re.finditer(r'<Cell([^>]*)>(.*?)</Cell>|<Cell([^>]*)/>', r, flags=re.S):
        attrs = m.group(1) or m.group(3) or ""
        idx = re.search(r'ss:Index="(\d+)"', attrs)
        if idx:
            while len(out) < int(idx.group(1)) - 1: out.append(None)
        dm = re.search(r'<Data[^>]*>(.*?)</Data>', m.group(2) or "", flags=re.S)
        out.append(html.unescape(dm.group(1)) if dm else None)
    return out
hdr = cells(rows[1])
vol = pd.DataFrame([cells(r) + [None] * (len(hdr) - len(cells(r))) for r in rows[2:]], columns=hdr)
vol["Latitude"] = pd.to_numeric(vol["Latitude"], errors='coerce')
vol["Longitude"] = pd.to_numeric(vol["Longitude"], errors='coerce')
vol["Volcano Number"] = pd.to_numeric(vol["Volcano Number"], errors='coerce')

er = pd.read_excel(D + 'gvp_eruptions.xlsx', sheet_name='Eruption List', header=1)
er = er.replace('NULL', np.nan)
er["Start Year"] = pd.to_numeric(er["Start Year"], errors='coerce')
er["VEI"] = pd.to_numeric(er["VEI"], errors='coerce')
er = er.merge(vol[["Volcano Number", "Latitude", "Longitude", "Country"]], on="Volcano Number", how="left")
er_missing_coords = int(er.Latitude.isna().sum())

vrows, erows, vsum = [], [], []
for n in NODES:
    dv = hav(n[3], n[4], vol.Latitude.values, vol.Longitude.values)
    v = vol[dv <= R_MAIN].copy(); v["dist_km"] = dv[dv <= R_MAIN].round(0); v["nodo"] = n[0]; vrows.append(v)
    de = hav(n[3], n[4], er.Latitude.values, er.Longitude.values)
    e = er[de <= R_MAIN].copy(); e["dist_km"] = de[de <= R_MAIN].round(0); e["nodo"] = n[0]; erows.append(e)
    rec = e[e["Start Year"] >= Y0]
    for R, tag in [(R_MAIN, ""), (R_SENS, " (150 km)")]:
        pass
    vsum.append({
        "nodo": n[0],
        "Vulcani olocenici": len(v),
        "Vulcani olocenici (150 km)": int((v.dist_km <= R_SENS).sum()),
        "Eruzioni oloceniche confermate": len(e),
        f"Eruzioni dal {Y0}": len(rec),
        f"Vulcani con eruzioni dal {Y0}": rec["Volcano Number"].nunique(),
        f"VEI massimo dal {Y0}": rec.VEI.max() if rec.VEI.notna().any() else np.nan,
        f"Eruzioni dal {Y0} (150 km)": int((rec.dist_km <= R_SENS).sum()),
        "Vulcano più vicino": v.sort_values("dist_km")["Volcano Name"].iloc[0] if len(v) else "",
        "Distanza vulcano più vicino (km)": v.dist_km.min() if len(v) else np.nan,
    })
volc = pd.concat(vrows, ignore_index=True)
erup = pd.concat(erows, ignore_index=True)
vsum = pd.DataFrame(vsum)

# ---------------- EM-DAT ----------------
em = pd.read_excel(D + 'emdat.xlsx', sheet_name='EM-DAT Data')
em["Latitude"] = pd.to_numeric(em["Latitude"], errors='coerce')
em["Longitude"] = pd.to_numeric(em["Longitude"], errors='coerce')
geo = em[em["Disaster Type"].isin(["Earthquake", "Volcanic activity"])].copy()
geo_cov = geo.groupby("Disaster Type").apply(lambda g: pd.Series({"eventi": len(g), "con coordinate": int(g.Latitude.notna().sum())}))
PLAUS = {'Suez':['EGY','ISR','PSE','JOR','SAU'],'Bab el-Mandeb':['YEM','YMN','YMD','DJI','ERI','ETH','SOM'],'Hormuz':['IRN','OMN','ARE'],
 'Malacca':['MYS','IDN','SGP'],'Stretto di Taiwan':['TWN','CHN'],'Hsinchu':['TWN','CHN'],'Tainan':['TWN','CHN'],'Panama':['PAN','COL','CRI'],
 'Gibilterra':['ESP','MAR','GIB','PRT'],'Antofagasta':['CHL','ARG','BOL'],'Morowali':['IDN'],'Weda Bay':['IDN']}
EXCLUDED = []
imp_rows, isum = [], []
for n in NODES:
    d = hav(n[3], n[4], geo.Latitude.values, geo.Longitude.values)
    g = geo[(d <= R_MAIN)].copy(); g["dist_km"] = d[d <= R_MAIN].round(0); g["nodo"] = n[0]
    g = g[(g["Start Year"] >= Y0)]
    okc = PLAUS[n[0]]
    excl = g[~g.ISO.isin(okc)]
    if len(excl): EXCLUDED.append(excl.assign(nodo=n[0]))
    g = g[g.ISO.isin(okc)]
    imp_rows.append(g)
    for typ in ["Earthquake", "Volcanic activity"]:
        gg = g[g["Disaster Type"] == typ]
        isum.append({"nodo": n[0], "tipo": "Terremoto" if typ == "Earthquake" else "Attività vulcanica",
                     "Eventi EM-DAT": len(gg),
                     "Morti": int(gg["Total Deaths"].fillna(0).sum()),
                     "Persone colpite": int(gg["Total Affected"].fillna(0).sum()),
                     "Danni adj. ('000 US$)": int(gg["Total Damage, Adjusted ('000 US$)"].fillna(0).sum()),
                     "di cui 'Historic'": int((gg["Historic"] == "Yes").sum())})
imp = pd.concat(imp_rows, ignore_index=True)
isum = pd.DataFrame(isum)

# altri inneschi naturali per paese (indicativo), 2000-2025
COUNTRIES = {"Suez": ["EGY"], "Bab el-Mandeb": ["YEM", "DJI", "ERI"], "Hormuz": ["IRN", "OMN", "ARE"],
             "Malacca": ["MYS", "IDN", "SGP"], "Stretto di Taiwan": ["TWN"], "Panama": ["PAN"],
             "Gibilterra": ["ESP", "MAR", "GIB"], "Antofagasta": ["CHL"], "Morowali": ["IDN"], "Weda Bay": ["IDN"],
             "Hsinchu": ["TWN"], "Tainan": ["TWN"]}
nat = em[(em["Disaster Group"] == "Natural") & (em["Start Year"] >= 2000) & (em["Start Year"] <= 2025)]
types = ["Earthquake", "Volcanic activity", "Flood", "Storm", "Drought", "Mass movement (wet)", "Extreme temperature", "Wildfire"]
other = []
for nodo, isos in COUNTRIES.items():
    sub = nat[nat.ISO.isin(isos)]
    row = {"nodo": nodo, "paesi (ISO)": ", ".join(isos)}
    for t in types: row[t] = int((sub["Disaster Type"] == t).sum())
    row["Totale naturali"] = len(sub)
    other.append(row)
other = pd.DataFrame(other)
twn_present = "TWN" in set(em.ISO)

meta = {"isc_main_n": len(isc), "isc_sup_n": len(sup), "isc_years": (int(isc.year.min()), int(isc.year.max())),
        "vol_n": len(vol), "er_n": len(er), "er_missing_coords": er_missing_coords, "emdat_n": len(em),
        "geo_cov": geo_cov, "twn_present": twn_present, "emdat_years": (int(em["Start Year"].min()), int(em["Start Year"].max()))}
excluded = pd.concat(EXCLUDED) if EXCLUDED else pd.DataFrame()
pickle.dump(dict(excluded=excluded, nodes=nodes, eq=eq, eqs=eqs, eq_sum=eq_sum, eq_sum150=eq_sum150, dec6=dec6, dec55=dec55, sup_sum=sup_sum,
                 volc=volc, erup=erup, vsum=vsum, imp=imp, isum=isum, other=other, meta=meta),
            open(D + 'results.pkl', 'wb'))
pd.set_option('display.width', 250); pd.set_option('display.max_columns', 30)
print(meta)
print(eq_sum.to_string()); print(eq_sum150[["nodo","M≥6.0","M≥7.0"]].to_string())
print(dec6.to_string()); print(sup_sum.to_string())
print(vsum.to_string()); print(isum.to_string()); print(other.to_string())
