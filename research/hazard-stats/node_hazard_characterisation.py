"""Node hazard characterisation for Chapter 3 of the thesis (RQ1).

Extends analisi_pericoli_nodi.py (first characterisation, October 2026) with:
  1. magnitude of completeness of ISC-GEM by period (maximum curvature + rate check);
  2. window declustering (Gardner-Knopoff; Uhrhammer as sensitivity) on the global catalogue;
  3. node hazard zones based on predicted intensity at the node (Allen et al. 2012) instead
     of a fixed 300 km radius, with the tectonic setting of each source from PB2002 (Bird 2003);
  4. intensity exceedance rates with completeness-dependent observation periods (Weichert 1980);
  5. volcanic statistics (GVP) by VEI with completeness years and Poisson intervals;
  6. EM-DAT impacts as aggregates only (records are never written to disk).

Usage:
  python node_hazard_characterisation.py <data_dir> <pb2002_dir> <out_dir>
data_dir: iscgem_main.csv, gvp_volcanoes.xls, gvp_eruptions.xlsx, emdat.xlsx (see README)
pb2002_dir: PB2002_steps.json, PB2002_orogens.json (GeoJSON of Bird 2003, see README)
out_dir: results/*.csv and figures/*.png
"""
import os
import re
import sys
import html
import pickle

import numpy as np
import pandas as pd
from scipy.stats import norm, gamma

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hazard_lib import (NODES_DF, hav, read_isc, mc_maxc, mc_bootstrap, decluster_window, window_gk,
                        window_uhrhammer, weichert, load_pb2002, nearest_boundary, in_orogen,
                        mmi_allen2012_rhyp, sigma_allen2012_rhyp, r_threshold, b_value_aki)

DATA, PB, OUT = [a.rstrip("/") + "/" for a in sys.argv[1:4]]
RES, FIG = OUT + "results/", OUT + "figures/"
os.makedirs(RES, exist_ok=True)
os.makedirs(FIG, exist_ok=True)

Y0, Y1 = 1922, 2021            # last hundred years covered by ISC-GEM v12.1
R_SCREEN = 300.0               # screening radius = distance limit of the intensity equation
INTENSITIES = (5, 6, 7)
# completeness classes adopted for rates (Section 3.x; see completeness table)
COMPLETE = [  # (Mw from, Mw to, first year, last year)
    (5.6, 7.0, 1964, 2021),
    (7.0, 10.0, 1922, 2021),
]
VOLC_COMPLETE = {2: 1950, 3: 1950, 4: 1900}   # VEI class -> first year of completeness (estimated below)
VOLC_RINGS = (10, 30, 100)
FAMILY = {"SUB": "convergent", "OCB": "convergent", "CCB": "convergent", "CTF": "transform", "OTF": "transform",
          "CRB": "divergent", "OSR": "divergent"}
NODES = NODES_DF.copy()


def complete_weight(mw, year):
    """1/T for events in a complete magnitude-period class, 0 otherwise."""
    w = np.zeros(len(mw))
    for a, b, y0, y1 in COMPLETE:
        sel = (mw >= a) & (mw < b) & (year >= y0) & (year <= y1)
        w[sel] = 1.0 / (y1 - y0 + 1)
    return w


def gamma_ci(n, alpha=0.05):
    """Garwood interval for a Poisson mean, valid also for non-integer 'counts'."""
    lo = 0.0 if n <= 0 else gamma.ppf(alpha / 2, n)
    hi = gamma.ppf(1 - alpha / 2, n + 1)
    return lo, hi


# =============================================================== 1. ISC-GEM, completeness
isc = read_isc(DATA + "iscgem_main.csv")
PERIODS = [(1904, 1917), (1918, 1929), (1930, 1939), (1940, 1949), (1950, 1963), (1964, 1975),
           (1976, 1990), (1991, 2005), (2006, 2021)]

dep_gk, cl_gk = decluster_window(isc, window_gk)
dep_uh, cl_uh = decluster_window(isc, window_uhrhammer)
dep_af, _ = decluster_window(isc, window_gk, fs_prop=0.0)   # sensitivity: aftershocks only
isc["dep_gk"], isc["cl_gk"], isc["dep_uh"], isc["cl_uh"], isc["dep_af"] = dep_gk, cl_gk, dep_uh, cl_uh, dep_af
decl = isc[~isc.dep_gk]

thr = [5.6, 6.0, 6.5, 7.0, 7.5]
ref = decl[decl.year >= 1964]
ref_rate = {m: (ref.mw >= m).sum() / (2021 - 1964 + 1) for m in thr}
rows = []
for a, b in PERIODS:
    s = isc[(isc.year >= a) & (isc.year <= b)]
    sd = decl[(decl.year >= a) & (decl.year <= b)]
    mc, mc_sd = mc_bootstrap(s.mw.values, n=300)
    row = {"period": f"{a}-{b}", "events": len(s), "mainshocks_gk": len(sd),
           "Mc_maxc": round(mc_maxc(s.mw.values), 2), "Mc_boot_mean": round(mc, 2), "Mc_boot_sd": round(mc_sd, 2)}
    for m in thr:
        row[f"rate_ratio_M{m}"] = round(((sd.mw >= m).sum() / (b - a + 1)) / ref_rate[m], 2)
    rows.append(row)
completeness = pd.DataFrame(rows)
completeness.to_csv(RES + "s1_completeness_iscgem.csv", index=False)

declust_summary = pd.DataFrame({
    "method": ["Gardner-Knopoff", "Uhrhammer", "Gardner-Knopoff, aftershocks only"],
    "events": [len(isc)] * 3,
    "dependent": [int(dep_gk.sum()), int(dep_uh.sum()), int(dep_af.sum())],
    "share_dependent": [round(dep_gk.mean(), 3), round(dep_uh.mean(), 3), round(dep_af.mean(), 3)],
    "dependent_Mw6": [int((d & (isc.mw >= 6)).sum()) for d in (dep_gk, dep_uh, dep_af)],
    "events_Mw6": [int((isc.mw >= 6).sum())] * 3,
})
declust_summary.to_csv(RES + "s2_declustering_summary.csv", index=False)

# =============================================================== 2. events around the nodes
pts, orogens = load_pb2002(PB + "PB2002_steps.json", PB + "PB2002_orogens.json")
nd, nc, nb = nearest_boundary(NODES.lat.values, NODES.lon.values, pts)
NODES["boundary_km"], NODES["boundary_class"], NODES["boundary_plates"] = nd.round(0), nc, nb
NODES["orogen"] = in_orogen(NODES.lat.values, NODES.lon.values, orogens)

parts = []
for r in NODES.itertuples():
    d = hav(r.lat, r.lon, isc.lat.values, isc.lon.values)
    s = isc[d <= R_SCREEN].copy()
    s["dist"], s["nodo"] = d[d <= R_SCREEN], r.nodo
    parts.append(s)
ev = pd.concat(parts, ignore_index=True)
ev["depth_f"] = ev.depth.fillna(15.0)
ev["rhyp"] = np.hypot(ev.dist, ev.depth_f)
ev["mmi"] = mmi_allen2012_rhyp(ev.mw, ev.rhyp)
sig = sigma_allen2012_rhyp(ev.rhyp)
for I in INTENSITIES:
    ev[f"p{I}"] = 1 - norm.cdf((I - ev.mmi) / sig)
uq = ev.drop_duplicates("eventid")
bd, bc, bp = nearest_boundary(uq.lat.values, uq.lon.values, pts)
tect = pd.DataFrame({"eventid": uq.eventid.values, "bdist": bd, "bclass": bc, "bplates": bp,
                     "orogen": in_orogen(uq.lat.values, uq.lon.values, orogens)})
ev = ev.merge(tect, on="eventid", how="left")
ev["depth_class"] = pd.cut(ev.depth_f, [-1, 70, 300, 1000], labels=["shallow (<=70 km)", "intermediate (70-300 km)", "deep (>300 km)"])

# clusters: one trigger episode per Gardner-Knopoff cluster; mainshock attributes from the global catalogue
def cluster_key(df, col):
    return np.where(df[col] > 0, "c" + df[col].astype(str), "e" + df.eventid.astype(str))

ev["cid"] = cluster_key(ev, "cl_gk")
ms = decl.copy()
ms["cid"] = cluster_key(ms, "cl_gk")
ms = ms.set_index("cid")[["mw", "year", "date", "lat", "lon", "depth", "eventid"]].add_prefix("ms_")
ev = ev.join(ms, on="cid")
ev["w"] = complete_weight(ev.ms_mw.values, ev.ms_year.values)

# the event of each cluster with the highest predicted intensity at the node represents the episode
idx = ev.groupby(["nodo", "cid"]).mmi.idxmax()
ep = ev.loc[idx].copy()

# =============================================================== 3. node statistics
P = (ev.year >= Y0) & (ev.year <= Y1)
rows = []
for r in NODES.itertuples():
    e = ev[P & (ev.nodo == r.nodo)]
    g = ep[(ep.nodo == r.nodo)]
    gP = g[(g.ms_year >= Y0) & (g.ms_year <= Y1)]
    row = {"nodo": r.nodo, "node": r.node, "kind": r.kind,
           "boundary_km": r.boundary_km, "boundary_class": r.boundary_class, "boundary_plates": r.boundary_plates,
           # October 2026 baseline: all events Mw>=6 within 300 km, 1922-2021
           "n_Mw6_300km_raw": int((e.mw >= 6).sum()),
           "n_Mw6_300km_decl": int(((e.mw >= 6) & ~e.dep_gk).sum()),
           "n_Mw6_300km_decl_uh": int(((e.mw >= 6) & ~e.dep_uh).sum()),
           "n_Mw6_300km_decl_af": int(((e.mw >= 6) & ~e.dep_af).sum()),
           "n_Mw7_300km_decl": int(((e.mw >= 7) & ~e.dep_gk).sum()),
           "rate_Mw6_300km_complete": round(((e.mw >= 6) & ~e.dep_gk & (e.year >= 1964)).sum() / 58, 3),
           "rate_Mw7_300km_complete": round(((e.mw >= 7) & ~e.dep_gk).sum() / 100, 3),
           }
    for I in INTENSITIES:
        # expected number of exceedances among complete episodes, and the rate with
        # class-specific observation periods (Weichert-style)
        lam = float((g[f"p{I}"] * g.w).sum())
        neff = float(g.loc[g.w > 0, f"p{I}"].sum())
        lo, hi = gamma_ci(neff)
        row[f"rate_I{I}"] = lam
        row[f"n_eff_I{I}"] = neff
        row[f"rate_I{I}_lo"] = lam * lo / neff if neff > 0 else 0.0
        row[f"rate_I{I}_hi"] = lam * hi / neff if neff > 0 else hi / 58.0
        row[f"T_I{I}"] = 1 / lam if lam > 0 else np.inf
        row[f"P50_I{I}"] = 1 - np.exp(-50 * lam)
        row[f"n_median_I{I}"] = int(((gP.mmi >= I)).sum())
    # Weichert b-value and rate within 300 km (declustered, completeness classes)
    md = e[~e.dep_gk & (e.mw >= 5.6)]
    mags = np.round(md.mw.values, 1)
    ok = ((mags < 7.0) & (md.year.values >= 1964)) | ((mags >= 7.0) & (md.year.values >= 1922))
    bins = np.round(np.arange(5.6, 9.6, 0.1), 1)
    periods = {k: (58 if k < 7.0 else 100) for k in bins}
    b, sb, rate, n = weichert(mags[ok], periods, bins)
    row.update({"weichert_b": b, "weichert_sb": sb, "weichert_n": n,
                "weichert_rate_Mw6": rate * 10 ** (-b * (6.0 - 5.55)) if n >= 5 else np.nan})
    rows.append(row)
stats = pd.DataFrame(rows)
stats.to_csv(RES + "t1_node_seismic_statistics.csv", index=False)

# geological decomposition of the I>=V and I>=VI rates by tectonic setting and depth of the source
dec_rows = []
for r in NODES.itertuples():
    g = ep[(ep.nodo == r.nodo) & (ep.w > 0)]
    for I in (5, 6):
        tot = float((g[f"p{I}"] * g.w).sum())
        if tot <= 0:
            continue
        # shallow sources are labelled by the nearest PB2002 plate pair (polarity marks removed)
        # and boundary family; intermediate and deep sources by depth, because their nearest
        # mapped boundary at the surface is not their source structure (e.g. slab events)
        pair = g.bplates.fillna("?").str.replace("\\", "-", regex=False).str.replace("/", "-", regex=False)
        fam = g.bclass.map(FAMILY).fillna("?")
        key = np.where(g.depth_f > 300, "deep (>300 km)",
                       np.where(g.depth_f > 70, "intermediate depth (70-300 km)",
                                "shallow, " + pair + " " + fam))
        part = (g[f"p{I}"] * g.w).groupby(key).sum() / tot
        for k, v in part.items():
            dec_rows.append({"nodo": r.nodo, "intensity": I, "setting": k, "share": round(float(v), 3)})
decomp = pd.DataFrame(dec_rows)
decomp.to_csv(RES + "t2_setting_decomposition.csv", index=False)

# sensitivity of the exceedance rates to the declustering choice
def episode_rates(clcol, depcol):
    e2 = ev.copy()
    if clcol is None:                       # no declustering: every event is an episode
        e2["cid2"] = "e" + e2.eventid.astype(str)
        e2["w2"] = complete_weight(e2.mw.values, e2.year.values)
    else:
        e2["cid2"] = cluster_key(e2, clcol)
        m2 = isc[~isc[depcol]].copy()
        m2["cid2"] = cluster_key(m2, clcol)
        m2 = m2.set_index("cid2")[["mw", "year"]].add_prefix("m2_")
        e2 = e2.join(m2, on="cid2")
        e2["w2"] = complete_weight(e2.m2_mw.values, e2.m2_year.values)
    g2 = e2.loc[e2.groupby(["nodo", "cid2"]).mmi.idxmax()]
    return {I: (g2[f"p{I}"] * g2.w2).groupby(g2.nodo).sum() for I in INTENSITIES}

sens = {"Gardner-Knopoff": episode_rates("cl_gk", "dep_gk"), "Uhrhammer": episode_rates("cl_uh", "dep_uh"),
        "none": episode_rates(None, None)}
srows = []
for nodo in NODES.nodo:
    row = {"nodo": nodo}
    for k, v in sens.items():
        for I in INTENSITIES:
            lam = float(v[I].get(nodo, 0.0))
            row[f"T_I{I}_{k}"] = 1 / lam if lam > 0 else np.inf
    srows.append(row)
pd.DataFrame(srows).to_csv(RES + "s7_declustering_sensitivity.csv", index=False)

# list of the episodes with the highest predicted intensity at each node (supplementary)
top = (ep[(ep.ms_year >= Y0) & (ep.ms_year <= Y1)].sort_values("mmi", ascending=False)
       .groupby("nodo").head(3)[["nodo", "date", "mw", "depth_f", "dist", "mmi", "p6", "bclass", "bplates", "ms_mw", "ms_date"]])
top.to_csv(RES + "s3_top_episodes.csv", index=False)

# influence distances R_I(Mw) for the platform rule
rt = []
for m in np.round(np.arange(5.5, 8.6, 0.5), 1):
    rt.append({"Mw": m, **{f"R_I{I}_h15": round(r_threshold(m, I, 15)) for I in INTENSITIES},
               **{f"R_I{I}_h100": round(r_threshold(m, I, 100)) for I in INTENSITIES}})
pd.DataFrame(rt).to_csv(RES + "s4_influence_distances.csv", index=False)

# decade counts of trigger episodes around nodes (Mw>=7 complete from 1922, Mw>=6 from 1964)
decades = list(range(1922, 2022, 10))
drows = []
for r in NODES.itertuples():
    e = ev[(ev.nodo == r.nodo) & ~ev.dep_gk]
    for a in decades:
        s = e[(e.year >= a) & (e.year <= a + 9)]
        drows.append({"nodo": r.nodo, "decade": f"{a}-{a+9}", "Mw6_decl": int((s.mw >= 6).sum()),
                      "Mw7_decl": int((s.mw >= 7).sum()), "Mw6_raw": int(((ev.nodo == r.nodo) & (ev.year >= a) & (ev.year <= a + 9) & (ev.mw >= 6)).sum())})
pd.DataFrame(drows).to_csv(RES + "s5_decades_node.csv", index=False)

# =============================================================== 4. GVP
s = open(DATA + "gvp_volcanoes.xls", encoding="utf-8", errors="replace").read()
xrows = re.findall(r"<Row[^>]*>(.*?)</Row>", s, flags=re.S)


def cells(r):
    out = []
    for m in re.finditer(r"<Cell([^>]*)>(.*?)</Cell>|<Cell([^>]*)/>", r, flags=re.S):
        attrs = m.group(1) or m.group(3) or ""
        ix = re.search(r'ss:Index="(\d+)"', attrs)
        if ix:
            while len(out) < int(ix.group(1)) - 1:
                out.append(None)
        dm = re.search(r"<Data[^>]*>(.*?)</Data>", m.group(2) or "", flags=re.S)
        out.append(html.unescape(dm.group(1)) if dm else None)
    return out


hdr = cells(xrows[1])
vol = pd.DataFrame([cells(r) + [None] * (len(hdr) - len(cells(r))) for r in xrows[2:]], columns=hdr)
for c in ["Latitude", "Longitude", "Volcano Number"]:
    vol[c] = pd.to_numeric(vol[c], errors="coerce")
er = pd.read_excel(DATA + "gvp_eruptions.xlsx", sheet_name="Eruption List", header=1).replace("NULL", np.nan)
er["Start Year"] = pd.to_numeric(er["Start Year"], errors="coerce")
er["VEI"] = pd.to_numeric(er["VEI"], errors="coerce")
er = er.drop(columns=[c for c in ["Latitude", "Longitude", "Country"] if c in er], errors="ignore")
er = er.merge(vol[["Volcano Number", "Latitude", "Longitude", "Country", "Tectonic Setting"]], on="Volcano Number", how="left")

# eruption-record completeness: global counts per 25 years by VEI class
bins25 = list(range(1500, 2001, 25))   # last complete bin: 2000-2024
vc = []
for a in bins25:
    s_ = er[(er["Start Year"] >= a) & (er["Start Year"] < a + 25)]
    vc.append({"period": f"{a}-{a+24}", **{f"VEI>={k}": int((s_.VEI >= k).sum()) for k in (2, 3, 4, 5)},
               "VEI_unknown": int(s_.VEI.isna().sum())})
pd.DataFrame(vc).to_csv(RES + "s6_eruption_record_completeness.csv", index=False)

vrows = []
for r in NODES.itertuples():
    dv = hav(r.lat, r.lon, vol.Latitude.values, vol.Longitude.values)
    de = hav(r.lat, r.lon, er.Latitude.values, er.Longitude.values)
    e = er.assign(d=de)
    row = {"nodo": r.nodo, "nearest_volcano": vol["Volcano Name"].iloc[int(np.nanargmin(dv))],
           "nearest_km": round(float(np.nanmin(dv)))}
    for R in VOLC_RINGS + (300,):
        row[f"volcanoes_{R}km"] = int((dv <= R).sum())
    for R in (100, 300):
        for k, y0 in VOLC_COMPLETE.items():
            n = int(((e.d <= R) & (e.VEI >= k) & (e["Start Year"] >= y0) & (e["Start Year"] <= 2025)).sum())
            T = 2025 - y0 + 1
            lo, hi = gamma_ci(n)
            row[f"n_VEI{k}_{R}km"] = n
            row[f"rate_VEI{k}_{R}km"] = n / T
            row[f"rate_VEI{k}_{R}km_lo"], row[f"rate_VEI{k}_{R}km_hi"] = lo / T, hi / T
        sel = e[(e.d <= R) & (e["Start Year"] >= Y0)]
        row[f"eruptions_since_{Y0}_{R}km"] = len(sel)
        row[f"max_VEI_since_{Y0}_{R}km"] = sel.VEI.max() if sel.VEI.notna().any() else np.nan
        row[f"volcanoes_active_since_{Y0}_{R}km"] = "; ".join(sorted(sel["Volcano Name"].dropna().unique()))
    row["settings_300km"] = "; ".join(sorted(vol[dv <= 300]["Tectonic Setting"].dropna().unique()))
    vrows.append(row)
volc = pd.DataFrame(vrows)
volc.to_csv(RES + "t3_node_volcanic_statistics.csv", index=False)

# =============================================================== 5. EM-DAT (aggregates only)
em = pd.read_excel(DATA + "emdat.xlsx", sheet_name="EM-DAT Data")
for c in ["Latitude", "Longitude"]:
    em[c] = pd.to_numeric(em[c], errors="coerce")
geo = em[em["Disaster Type"].isin(["Earthquake", "Volcanic activity"])].copy()
PLAUS = {'Suez': ['EGY', 'ISR', 'PSE', 'JOR', 'SAU'], 'Bab el-Mandeb': ['YEM', 'YMN', 'YMD', 'DJI', 'ERI', 'ETH', 'SOM'],
         'Hormuz': ['IRN', 'OMN', 'ARE'], 'Malacca': ['MYS', 'IDN', 'SGP'], 'Stretto di Taiwan': ['TWN', 'CHN'],
         'Hsinchu': ['TWN', 'CHN'], 'Tainan': ['TWN', 'CHN'], 'Panama': ['PAN', 'COL', 'CRI'],
         'Gibilterra': ['ESP', 'MAR', 'GIB', 'PRT'], 'Antofagasta': ['CHL', 'ARG', 'BOL'], 'Morowali': ['IDN'], 'Weda Bay': ['IDN']}
irows = []
for r in NODES.itertuples():
    d = hav(r.lat, r.lon, geo.Latitude.values, geo.Longitude.values)
    g = geo[(d <= R_SCREEN) & geo.ISO.isin(PLAUS[r.nodo]) & (geo["Start Year"] >= Y0) & (geo["Start Year"] <= Y1)]
    for half, (a, b) in {"1922-1971": (1922, 1971), "1972-2021": (1972, 2021)}.items():
        h = g[(g["Start Year"] >= a) & (g["Start Year"] <= b)]
        irows.append({"nodo": r.nodo, "period": half, "disasters": len(h),
                      "earthquakes": int((h["Disaster Type"] == "Earthquake").sum()),
                      "volcanic": int((h["Disaster Type"] == "Volcanic activity").sum()),
                      "deaths": int(h["Total Deaths"].fillna(0).sum()),
                      "affected": int(h["Total Affected"].fillna(0).sum()),
                      "damage_adj_kusd": int(h["Total Damage, Adjusted ('000 US$)"].fillna(0).sum()),
                      "with_damage_value": int(h["Total Damage, Adjusted ('000 US$)"].notna().sum())})
pd.DataFrame(irows).to_csv(RES + "t4_emdat_aggregates.csv", index=False)
eq_em = em[em["Disaster Type"] == "Earthquake"]
glob = []
for a in range(1922, 2022, 10):
    glob.append({"decade": f"{a}-{a+9}",
                 "emdat_earthquake_disasters": int(((eq_em["Start Year"] >= a) & (eq_em["Start Year"] <= a + 9)).sum()),
                 "iscgem_mainshocks_Mw6": int(((decl.year >= a) & (decl.year <= a + 9) & (decl.mw >= 6)).sum()),
                 "iscgem_mainshocks_Mw7": int(((decl.year >= a) & (decl.year <= a + 9) & (decl.mw >= 7)).sum())})
pd.DataFrame(glob).to_csv(RES + "t5_global_hazard_vs_disasters.csv", index=False)

# everything needed for the figures, without EM-DAT records
NODES.to_csv(RES + "s0_nodes.csv", index=False)
keep = ["nodo", "eventid", "date", "year", "lat", "lon", "depth_f", "mw", "dist", "rhyp", "mmi", "p5", "p6", "p7",
        "dep_gk", "dep_uh", "cid", "ms_mw", "ms_year", "w", "bclass", "bplates", "bdist", "depth_class"]
pickle.dump({"ev": ev[keep], "ep": ep[keep], "isc": isc[["date", "year", "lat", "lon", "depth", "mw", "dep_gk"]],
             "vol": vol[["Volcano Name", "Latitude", "Longitude", "Tectonic Setting"]],
             "er": er[["Volcano Name", "Start Year", "VEI", "Latitude", "Longitude"]],
             "pts": pts, "nodes": NODES}, open(RES + "figure_inputs.pkl", "wb"))
pd.set_option("display.width", 250)
pd.set_option("display.max_columns", 40)
print(completeness.to_string(index=False))
print(declust_summary.to_string(index=False))
print(volc[["nodo", "nearest_volcano", "nearest_km", "volcanoes_30km", "volcanoes_100km", "volcanoes_300km", "n_VEI2_100km",
            "n_VEI3_100km", "n_VEI4_100km", "n_VEI2_300km", "n_VEI3_300km", "n_VEI4_300km"]].to_string(index=False))
print(stats[["nodo", "boundary_km", "boundary_class", "n_Mw6_300km_raw", "n_Mw6_300km_decl", "n_Mw6_300km_decl_uh",
             "n_Mw7_300km_decl", "rate_I5", "T_I5", "rate_I6", "T_I6", "rate_I7", "T_I7", "P50_I6",
             "n_median_I6", "weichert_b", "weichert_sb", "weichert_n"]].round(3).to_string(index=False))
