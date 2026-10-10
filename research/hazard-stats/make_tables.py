"""LaTeX tables for the node hazard characterisation of Chapter 3.

Usage: python make_tables.py <out_dir>
Reads <out_dir>/results/*.csv and writes <out_dir>/tables/*.tex, so that every number in
the chapter tables comes from the analysis outputs without manual copying.
"""
import os
import sys

import numpy as np
import pandas as pd

OUT = sys.argv[1].rstrip("/") + "/"
RES, TAB = OUT + "results/", OUT + "tables/"
os.makedirs(TAB, exist_ok=True)

EN = {"Suez": "Suez Canal", "Bab el-Mandeb": "Bab el-Mandeb Strait", "Hormuz": "Strait of Hormuz",
      "Malacca": "Strait of Malacca", "Stretto di Taiwan": "Taiwan Strait", "Panama": "Panama Canal",
      "Gibilterra": "Strait of Gibraltar", "Antofagasta": "Antofagasta (copper)", "Morowali": "Morowali (nickel)",
      "Weda Bay": "Weda Bay (nickel)", "Hsinchu": "Hsinchu (chips)", "Tainan": "Tainan (chips)"}
ORDER = ["Suez", "Bab el-Mandeb", "Hormuz", "Malacca", "Stretto di Taiwan", "Panama", "Gibilterra",
         "Antofagasta", "Morowali", "Weda Bay", "Hsinchu", "Tainan"]
PAIR = {"PS-YA": "PS--YA", "ON-PS": "ON--PS", "NZ-SA": "NZ--SA", "AP-SA": "AP--SA", "MS-BS": "MS--BS",
        "SU-BH": "SU--BH", "MS-SU": "MS--SU", "MS-BH": "MS--BH", "SO-AR": "SO--AR", "AR-EU": "AR--EU",
        "EU-AF": "EU--AF", "NZ-PM": "NZ--PM", "PM-ND": "PM--ND", "PM-CA": "PM--CA", "SU-BU": "SU--BU",
        "AF-AR": "AF--AR", "AR-AF": "AF--AR", "YA-SU": "YA--SU", "SU-AU": "SU--AU", "YA-ON": "YA--ON"}


def fmt_T(x):
    if not np.isfinite(x) or x > 1000:
        return "$>$1{,}000"
    if x >= 100:
        return f"{x:,.0f}".replace(",", "{,}")
    return f"{x:.0f}" if x >= 10 else f"{x:.1f}"


def pair_label(s):
    if s.startswith("intermediate"):
        return "intermediate depth"
    if s.startswith("deep"):
        return "deep ($>$300~km)"
    p = s.replace("shallow, ", "").split(" ")[0]
    return PAIR.get(p, p) + ", shallow"


t = pd.read_csv(RES + "t1_node_seismic_statistics.csv").set_index("nodo").loc[ORDER]
dec = pd.read_csv(RES + "t2_setting_decomposition.csv")

# ---------------------------------------------------------------- main seismic table
lines = []
for n in ORDER:
    r = t.loc[n]
    cells = [EN[n], f"{r.boundary_km:.0f} ({PAIR.get(r.boundary_plates.replace(chr(92), '-').replace('/', '-'), r.boundary_plates)})",
             f"{int(r.n_Mw6_300km_raw)} / {int(r.n_Mw6_300km_decl)}"]
    for I in (5, 6):
        T = 1 / r[f"rate_I{I}"] if r[f"rate_I{I}"] > 0 else np.inf
        if r[f"n_eff_I{I}"] >= 1:
            lo, hi = 1 / r[f"rate_I{I}_hi"], (1 / r[f"rate_I{I}_lo"] if r[f"rate_I{I}_lo"] > 0 else np.inf)
            cells.append(f"{fmt_T(T)} ({fmt_T(lo)}--{fmt_T(hi)})")
        else:
            cells.append(f"{fmt_T(T)}$^{{a}}$")
    cells.append(f"{100 * r.P50_I6:.0f}\\%")
    d = dec[(dec.nodo == n) & (dec.intensity == 6)].sort_values("share", ascending=False)
    cells.append(f"{pair_label(d.iloc[0].setting)} ({100 * d.iloc[0].share:.0f}\\%)" if len(d) else "--")
    lines.append(" & ".join(cells) + " \\\\")
    if n == "Gibilterra":
        lines.append("\\midrule")
open(TAB + "tab_node_seismic.tex", "w").write("\n".join(lines) + "\n")

# ---------------------------------------------------------------- completeness (supplementary)
c = pd.read_csv(RES + "s1_completeness_iscgem.csv")
rows = [f"{p.replace('-', '--')} & {e:,} & {m:.2f} $\\pm$ {s:.2f} & {a:.2f} & {b:.2f} & {d:.2f} \\\\".replace(",", "{,}", 1)
        for p, e, m, s, a, b, d in zip(c.period, c.events, c.Mc_boot_mean, c.Mc_boot_sd, c["rate_ratio_M5.6"],
                                       c["rate_ratio_M6.0"], c["rate_ratio_M7.0"])]
open(TAB + "tab_completeness.tex", "w").write("\n".join(rows) + "\n")

# ---------------------------------------------------------------- declustering sensitivity (supplementary)
s = pd.read_csv(RES + "s7_declustering_sensitivity.csv").set_index("nodo").loc[ORDER]
rows = []
for n in ORDER:
    r, q = s.loc[n], t.loc[n]
    rows.append(" & ".join([EN[n], str(int(q.n_Mw6_300km_raw)), str(int(q.n_Mw6_300km_decl)), str(int(q.n_Mw6_300km_decl_uh)),
                            str(int(q.n_Mw6_300km_decl_af)), fmt_T(r["T_I6_Gardner-Knopoff"]), fmt_T(r["T_I6_Uhrhammer"]),
                            fmt_T(r["T_I6_none"])]) + " \\\\")
open(TAB + "tab_declustering.tex", "w").write("\n".join(rows) + "\n")

# ---------------------------------------------------------------- top episodes (supplementary)
e = pd.read_csv(RES + "s3_top_episodes.csv")
rows = []
for n in ORDER:
    for _, r in e[e.nodo == n].iterrows():
        rows.append(" & ".join([EN[n], str(r.date)[:10], f"{r.mw:.1f}", f"{r.depth_f:.0f}", f"{r.dist:.0f}",
                                f"{r.mmi:.1f}", f"{r.p6:.2f}",
                                PAIR.get(str(r.bplates).replace(chr(92), "-").replace("/", "-"), str(r.bplates))]) + " \\\\")
open(TAB + "tab_top_episodes.tex", "w").write("\n".join(rows) + "\n")

# ---------------------------------------------------------------- influence distances (supplementary)
d = pd.read_csv(RES + "s4_influence_distances.csv")
rows = [" & ".join([f"{r.Mw:.1f}"] + [("$\\geq$300" if v >= 300 else ("--" if v == 0 else f"{v:.0f}")) for v in
                    (r.R_I5_h15, r.R_I6_h15, r.R_I7_h15, r.R_I5_h100, r.R_I6_h100, r.R_I7_h100)]) + " \\\\"
        for r in d.itertuples()]
open(TAB + "tab_influence.tex", "w").write("\n".join(rows) + "\n")

# ---------------------------------------------------------------- Weichert (supplementary)
rows = []
for n in ORDER:
    r = t.loc[n]
    b = "--" if not np.isfinite(r.weichert_b) or r.weichert_n < 20 else f"{r.weichert_b:.2f} $\\pm$ {r.weichert_sb:.2f}"
    rows.append(f"{EN[n]} & {int(r.weichert_n)} & {b} & {r.rate_Mw6_300km_complete:.2f} & {r.rate_Mw7_300km_complete:.2f} \\\\")
open(TAB + "tab_weichert.tex", "w").write("\n".join(rows) + "\n")

# ---------------------------------------------------------------- volcanic table
v = pd.read_csv(RES + "t3_node_volcanic_statistics.csv").set_index("nodo").loc[ORDER]
rows = []
for n in ORDER:
    r = v.loc[n]

    def rate(k, R):
        nn = int(r[f"n_VEI{k}_{R}km"])
        return f"{nn}" if nn == 0 else f"{nn} ({1 / r[f'rate_VEI{k}_{R}km']:.0f}~yr)"
    rows.append(" & ".join([EN[n], f"{r.nearest_km:.0f}", str(int(r.volcanoes_30km)), str(int(r.volcanoes_100km)),
                            str(int(r.volcanoes_300km)), rate(2, 100), rate(3, 100), rate(2, 300), rate(3, 300),
                            str(int(r.n_VEI4_300km))]) + " \\\\")
    if n == "Gibilterra":
        rows.append("\\midrule")
open(TAB + "tab_volcanic.tex", "w").write("\n".join(rows) + "\n")

# ---------------------------------------------------------------- EM-DAT aggregates
em = pd.read_csv(RES + "t4_emdat_aggregates.csv")
rows = []
for n in ORDER:
    a = em[(em.nodo == n) & (em.period == "1922-1971")].iloc[0]
    b = em[(em.nodo == n) & (em.period == "1972-2021")].iloc[0]
    f = lambda x: f"{int(x):,}".replace(",", "{,}")
    rows.append(" & ".join([EN[n], f(a.disasters), f(a.deaths), f(a.affected), f(b.disasters), f(b.deaths), f(b.affected),
                            ("--" if b.damage_adj_kusd == 0 else f"{b.damage_adj_kusd / 1e6:.2f}")]) + " \\\\")
    if n == "Gibilterra":
        rows.append("\\midrule")
open(TAB + "tab_emdat.tex", "w").write("\n".join(rows) + "\n")
print("tables written to", TAB)
