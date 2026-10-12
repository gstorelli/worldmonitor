"""Figures for the node hazard characterisation of Chapter 3.

Usage: python make_figures.py <out_dir> <natural_earth_land.geojson>
Reads <out_dir>/results/*.csv and figure_inputs.pkl written by node_hazard_characterisation.py
and writes PNG figures (300 dpi) to <out_dir>/figures/.
"""
import json
import os
import pickle
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.lines import Line2D

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hazard_lib import r_threshold

OUT = sys.argv[1].rstrip("/") + "/"
LAND = sys.argv[2]
RES, FIG = OUT + "results/", OUT + "figures/"
os.makedirs(FIG, exist_ok=True)

# reference categorical slots (light mode) and text inks
C1, C2, C3 = "#2a78d6", "#eb6834", "#1baf7a"
INK, INK2, GRID, LANDC = "#0b0b0b", "#52514e", "#e4e3df", "#ecebe7"
plt.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 8.5, "axes.edgecolor": INK2, "axes.labelcolor": INK,
    "xtick.color": INK2, "ytick.color": INK2, "axes.spines.top": False, "axes.spines.right": False,
    "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.6, "axes.axisbelow": True,
    "legend.frameon": False, "savefig.dpi": 300, "savefig.bbox": "tight",
})
EN = {"Stretto di Taiwan": "Taiwan Strait", "Gibilterra": "Gibraltar", "Panama": "Panama Canal", "Suez": "Suez Canal",
      "Bab el-Mandeb": "Bab el-Mandeb", "Hormuz": "Hormuz", "Malacca": "Malacca"}
name = lambda n: EN.get(n, n)

stats = pd.read_csv(RES + "t1_node_seismic_statistics.csv")
inp = pickle.load(open(RES + "figure_inputs.pkl", "rb"))

# ------------------------------------------------------------- Fig A: influence distance
fig, ax = plt.subplots(figsize=(6.3, 3.0))
M = np.arange(5.5, 8.51, 0.05)
for I, c in zip((5, 6, 7), (C1, C2, C3)):
    ax.plot(M, [r_threshold(m, I, 15) for m in M], color=c, lw=2, label=f"intensity $\\geq$ {['V','VI','VII'][I-5]}, depth 15 km")
    ax.plot(M, [r_threshold(m, I, 100) for m in M], color=c, lw=1.4, ls="--", label=f"intensity $\\geq$ {['V','VI','VII'][I-5]}, depth 100 km")
ax.axhline(300, color=INK2, lw=1, ls=":")
ax.text(5.52, 306, "fixed radius of October 2026 (300 km)", color=INK2, fontsize=7.5, va="bottom")
ax.axvspan(7.9, 8.5, color=GRID, alpha=0.6, lw=0)
ax.text(8.2, 150, "outside the\nmagnitude range\nof the equation", color=INK2, fontsize=7, ha="center")
ax.set_xlabel("Moment magnitude $M_w$")
ax.set_ylabel("Epicentral distance (km)")
ax.set_xlim(5.5, 8.5); ax.set_ylim(0, 330)
ax.legend(ncol=3, fontsize=7, loc="upper center", bbox_to_anchor=(0.5, -0.2))
fig.savefig(FIG + "fig3_hazard_zone_distance.png")
plt.close(fig)

# ------------------------------------------------------------- Fig B: return periods by node
order = ["Tainan", "Hsinchu", "Antofagasta", "Weda Bay", "Stretto di Taiwan", "Morowali", "Hormuz", "Panama",
         "Bab el-Mandeb", "Gibilterra", "Malacca", "Suez"]
st = stats.set_index("nodo").loc[order]
fig, ax = plt.subplots(figsize=(6.3, 3.6))
y = np.arange(len(order))
for k, (I, c) in enumerate(zip((5, 6, 7), (C1, C2, C3))):
    T = 1 / st[f"rate_I{I}"].values
    lo = 1 / st[f"rate_I{I}_hi"].values
    hi = 1 / np.maximum(st[f"rate_I{I}_lo"].values, 1e-12)
    yy = y + (k - 1) * 0.25
    ax.errorbar(np.clip(T, 1, 1e4), yy, xerr=[np.clip(T, 1, 1e4) - np.clip(lo, 1, 1e4), np.clip(hi, 1, 1e4) - np.clip(T, 1, 1e4)],
                fmt="o", ms=4.5, color=c, ecolor=c, elinewidth=1, capsize=0,
                label=f"predicted intensity $\\geq$ {['V','VI','VII'][I-5]}")
ax.set_xscale("log"); ax.set_xlim(1, 1e4)
ax.axvspan(100, 1e4, color=GRID, alpha=0.45, lw=0)
ax.text(1.2e2, -0.9, "longer than the 100-year catalogue", color=INK2, fontsize=7, va="center")
ax.set_yticks(y); ax.set_yticklabels([name(n) + ("  (P)" if st.loc[n, "kind"] == "production" else "") for n in order])
ax.invert_yaxis(); ax.set_ylim(len(order) - 0.4, -1.4)
ax.set_xlabel("Return period at the node reference point (years, log scale; values above 10,000 drawn at the edge)")
ax.legend(loc="lower center", bbox_to_anchor=(0.5, 1.0), ncol=3, fontsize=7.5)
fig.savefig(FIG + "fig3_node_return_periods.png")
plt.close(fig)

# ------------------------------------------------------------- Fig C: hazard vs recorded disasters
g = pd.read_csv(RES + "t5_global_hazard_vs_disasters.csv")
fig, axs = plt.subplots(1, 2, figsize=(6.3, 2.6), sharex=True)
x = np.arange(len(g))
axs[0].plot(x, g.iscgem_mainshocks_Mw7, color=C1, lw=2, marker="o", ms=4, label="$M_w \\geq 7$ (complete from 1922)")
axs[0].plot(x, g.iscgem_mainshocks_Mw6 / 10, color=C2, lw=2, marker="o", ms=4, label="$M_w \\geq 6$, divided by 10 (complete from 1964)")
axs[0].axvspan(-0.5, 3.5, color=GRID, alpha=0.5, lw=0)
axs[0].text(1.5, 132, "$M_w \\geq 6$ incomplete", color=INK2, fontsize=6.8, ha="center")
axs[0].set_title("Earthquakes worldwide (ISC-GEM, declustered)", fontsize=8.5, color=INK, loc="left")
axs[0].set_ylim(0, 140); axs[0].legend(fontsize=6.8, loc="lower right")
axs[0].set_ylabel("Events per decade")
axs[1].bar(x, g.emdat_earthquake_disasters, color=C3, width=0.7)
axs[1].set_title("Earthquake disasters recorded in EM-DAT", fontsize=8.5, color=INK, loc="left")
axs[1].set_ylabel("Disasters per decade")
for a in axs:
    a.set_xticks(x); a.set_xticklabels([d[:4] + "-" + d[-2:] for d in g.decade], rotation=60, fontsize=7)
fig.tight_layout()
fig.savefig(FIG + "fig3_hazard_vs_disasters.png")
plt.close(fig)

# ------------------------------------------------------------- Fig D: node maps (12 small multiples)
land = json.load(open(LAND))
ev, ep, pts, nodes, vol = inp["ev"], inp["ep"], inp["pts"], inp["nodes"], inp["vol"]
isc = inp["isc"]
ms = isc[(~isc.dep_gk) & (isc.mw >= 5.6) & (isc.year >= 1922)]
fig, axs = plt.subplots(3, 4, figsize=(6.6, 5.4))
order_map = ["Suez", "Bab el-Mandeb", "Hormuz", "Malacca", "Stretto di Taiwan", "Panama", "Gibilterra",
             "Antofagasta", "Morowali", "Weda Bay", "Hsinchu", "Tainan"]
dcol = {"s": C1, "i": C2, "d": C3}
for ax, n in zip(axs.flat, order_map):
    r = nodes.set_index("nodo").loc[n]
    k = 3.2 / np.cos(np.radians(r.lat))
    x0, x1, y0, y1 = r.lon - k, r.lon + k, r.lat - 3.2, r.lat + 3.2
    for f in land["features"]:
        geoms = f["geometry"]["coordinates"] if f["geometry"]["type"] == "MultiPolygon" else [f["geometry"]["coordinates"]]
        for poly in geoms:
            xy = np.array(poly[0])
            if xy[:, 0].max() < x0 or xy[:, 0].min() > x1 or xy[:, 1].max() < y0 or xy[:, 1].min() > y1:
                continue
            ax.fill(xy[:, 0], xy[:, 1], color=LANDC, lw=0, zorder=0)
    p = pts[(pts.lon > x0 - 1) & (pts.lon < x1 + 1) & (pts.lat > y0 - 1) & (pts.lat < y1 + 1)]
    ax.scatter(p.lon, p.lat, s=0.25, color=INK2, lw=0, zorder=1)
    s = ms[(ms.lon > x0) & (ms.lon < x1) & (ms.lat > y0) & (ms.lat < y1)]
    dc = np.where(s.depth > 300, "d", np.where(s.depth > 70, "i", "s"))
    ax.scatter(s.lon, s.lat, s=(s.mw - 5.0) ** 2.6 * 1.6, c=[dcol[c] for c in dc], alpha=0.75, lw=0.25,
               edgecolors="white", zorder=2)
    v = vol[(vol.Longitude > x0) & (vol.Longitude < x1) & (vol.Latitude > y0) & (vol.Latitude < y1)]
    ax.scatter(v.Longitude, v.Latitude, marker="^", s=9, facecolor="none", edgecolor=INK, lw=0.6, zorder=3)
    for R, ls in ((r_threshold(7.0, 6, 15), "-"), (300, ":")):
        t = np.linspace(0, 2 * np.pi, 200)
        ax.plot(r.lon + R / 111.2 / np.cos(np.radians(r.lat)) * np.cos(t), r.lat + R / 111.2 * np.sin(t),
                color=INK, lw=0.8, ls=ls, zorder=4)
    ax.scatter([r.lon], [r.lat], marker="D" if r.kind == "production" else "o", s=16, color=INK, zorder=5)
    ax.set_xlim(x0, x1); ax.set_ylim(y0, y1); ax.set_aspect(1 / np.cos(np.radians(r.lat)))
    ax.set_xticks([]); ax.set_yticks([]); ax.grid(False)
    for sp in ax.spines.values():
        sp.set_visible(True); sp.set_color(GRID)
    ax.set_title(name(n), fontsize=7.5, color=INK, pad=2)
handles = [Line2D([], [], marker="o", ls="", color=C1, label="depth $\\leq$70 km"),
           Line2D([], [], marker="o", ls="", color=C2, label="70-300 km"),
           Line2D([], [], marker="o", ls="", color=C3, label=">300 km"),
           Line2D([], [], marker="^", ls="", mfc="none", color=INK, label="Holocene volcano"),
           Line2D([], [], color=INK, lw=0.8, label="intensity VI zone of an $M_w$ 7 at 15 km"),
           Line2D([], [], color=INK, lw=0.8, ls=":", label="300 km"),
           Line2D([], [], marker=".", ls="", color=INK2, label="PB2002 boundary")]
fig.legend(handles=handles, loc="lower center", ncol=4, fontsize=6.6, bbox_to_anchor=(0.5, -0.04))
fig.subplots_adjust(wspace=0.05, hspace=0.18)
fig.savefig(FIG + "figS3_node_maps.png")
plt.close(fig)

# ------------------------------------------------------------- Fig E: completeness (supplementary)
c = pd.read_csv(RES + "s1_completeness_iscgem.csv")
fig, ax = plt.subplots(figsize=(6.3, 2.6))
xx = np.arange(len(c))
for m, col in zip(("5.6", "6.0", "7.0"), (C1, C2, C3)):
    ax.plot(xx, c[f"rate_ratio_M{m}"], marker="o", ms=4, lw=2, color=col, label=f"$M_w \\geq$ {m}")
ax.axhline(1, color=INK2, lw=0.8, ls=":")
ax.set_xticks(xx); ax.set_xticklabels(c.period, fontsize=7)
ax.set_ylabel("Rate / rate 1964-2021")
ax.set_ylim(0, 1.4); ax.legend(fontsize=7.5, ncol=3, loc="lower right")
fig.savefig(FIG + "figS1_completeness.png")
plt.close(fig)

# ------------------------------------------------------------- Fig F: eruption record (supplementary)
v = pd.read_csv(RES + "s6_eruption_record_completeness.csv")
fig, ax = plt.subplots(figsize=(6.3, 2.6))
xx = np.arange(len(v))
for k, col in zip((2, 3, 4), (C1, C2, C3)):
    ax.plot(xx, v[f"VEI>={k}"], marker="o", ms=3.5, lw=2, color=col, label=f"VEI $\\geq$ {k}")
ax.set_yscale("log")
ax.set_xticks(xx[::2]); ax.set_xticklabels([p[:4] for p in v.period[::2]], fontsize=7)
ax.set_ylabel("Confirmed eruptions per 25 years")
ax.set_xlabel("Start of the 25-year period")
for yr, lab in ((1900, "VEI$\\geq$4 complete"), (1950, "VEI$\\geq$2, 3 complete")):
    i = list(v.period.str[:4].astype(int)).index(yr)
    ax.axvline(i, color=INK2, lw=0.8, ls=":")
    ax.text(i + 0.15, 1.6, lab, color=INK2, fontsize=6.8, rotation=90, va="bottom")
ax.legend(fontsize=7.5, ncol=3, loc="upper left")
fig.savefig(FIG + "figS2_eruption_record.png")
plt.close(fig)
print("figures written to", FIG)
