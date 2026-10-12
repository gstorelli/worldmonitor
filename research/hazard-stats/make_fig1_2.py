"""Figure 1.2: earthquakes, volcanoes and plate boundaries around the twelve nodes.

Matches the caption of chapter01_introduction.tex (fig:node-hazards).
Usage: python make_fig1_2.py <out_dir>/results/figure_inputs.pkl <ne_50m_land.geojson> <out.png>
"""
import json
import pickle
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.colors import LogNorm
from matplotlib.lines import Line2D

inp = pickle.load(open(sys.argv[1], "rb"))
land = json.load(open(sys.argv[2]))
isc, vol, er, pts, nodes = inp["isc"], inp["vol"], inp["er"], inp["pts"], inp["nodes"]

INK, INK2, GRID, LANDC = "#0b0b0b", "#52514e", "#e4e3df", "#ecebe7"
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 8, "savefig.dpi": 300, "savefig.bbox": "tight"})
EN = {"Stretto di Taiwan": "Taiwan Strait", "Gibilterra": "Gibraltar", "Panama": "Panama Canal",
      "Suez": "Suez Canal"}

eq = isc[(isc.mw >= 5.5) & (isc.year >= 1922) & (isc.year <= 2021)]
erupt = er[er["Start Year"] >= 1922][["Volcano Name", "Latitude", "Longitude"]].drop_duplicates("Volcano Name")
order = ["Suez", "Bab el-Mandeb", "Hormuz", "Malacca", "Stretto di Taiwan", "Panama", "Gibilterra",
         "Antofagasta", "Morowali", "Weda Bay", "Hsinchu", "Tainan"]
norm = LogNorm(vmin=5, vmax=700)
cmap = plt.get_cmap("viridis_r")

fig, axs = plt.subplots(3, 4, figsize=(6.6, 5.6))
for ax, n in zip(axs.flat, order):
    r = nodes.set_index("nodo").loc[n]
    h = 4.0
    k = h / np.cos(np.radians(r.lat))
    x0, x1, y0, y1 = r.lon - k, r.lon + k, r.lat - h, r.lat + h
    for f in land["features"]:
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        for poly in polys:
            xy = np.array(poly[0])
            if xy[:, 0].max() < x0 or xy[:, 0].min() > x1 or xy[:, 1].max() < y0 or xy[:, 1].min() > y1:
                continue
            ax.fill(xy[:, 0], xy[:, 1], color=LANDC, lw=0, zorder=0)
    p = pts[(pts.lon > x0 - 1) & (pts.lon < x1 + 1) & (pts.lat > y0 - 1) & (pts.lat < y1 + 1)]
    ax.scatter(p.lon, p.lat, s=0.3, color="#9a4d8f", lw=0, zorder=1)
    s = eq[(eq.lon > x0) & (eq.lon < x1) & (eq.lat > y0) & (eq.lat < y1)].sort_values("depth", ascending=False)
    ax.scatter(s.lon, s.lat, s=(s.mw - 5.0) ** 2.6 * 1.4, c=s.depth.clip(5, 700), cmap=cmap, norm=norm,
               alpha=0.8, lw=0.25, edgecolors="white", zorder=2)
    v = vol[(vol.Longitude > x0) & (vol.Longitude < x1) & (vol.Latitude > y0) & (vol.Latitude < y1)]
    ax.scatter(v.Longitude, v.Latitude, marker="^", s=10, facecolor="none", edgecolor=INK, lw=0.6, zorder=3)
    e = erupt[(erupt.Longitude > x0) & (erupt.Longitude < x1) & (erupt.Latitude > y0) & (erupt.Latitude < y1)]
    ax.scatter(e.Longitude, e.Latitude, marker="^", s=10, color="#d33f2f", edgecolor=INK, lw=0.4, zorder=3)
    t = np.linspace(0, 2 * np.pi, 240)
    for R, ls in ((300, "-"), (150, ":")):
        ax.plot(r.lon + R / 111.2 / np.cos(np.radians(r.lat)) * np.cos(t), r.lat + R / 111.2 * np.sin(t),
                color=INK, lw=0.8, ls=ls, zorder=4)
    prod = r.kind == "production"
    ax.scatter([r.lon], [r.lat], marker="D" if prod else "o", s=22, color="#d33f2f" if prod else "#2a78d6",
               edgecolor="white", lw=0.6, zorder=5)
    ax.set_xlim(x0, x1); ax.set_ylim(y0, y1); ax.set_aspect(1 / np.cos(np.radians(r.lat)))
    ax.set_xticks([]); ax.set_yticks([])
    for sp in ax.spines.values():
        sp.set_color(GRID)
    ax.set_title(EN.get(n, n), fontsize=7.5, pad=2)

sm = plt.cm.ScalarMappable(norm=norm, cmap=cmap)
cax = fig.add_axes([0.3, 0.075, 0.4, 0.011])
cb = fig.colorbar(sm, cax=cax, orientation="horizontal")
cb.set_ticks([10, 30, 70, 150, 300, 600]); cb.set_ticklabels(["10", "30", "70", "150", "300", "600"])
cb.ax.set_title("Hypocentral depth (km)", fontsize=7, pad=3); cb.ax.tick_params(labelsize=6.5)
handles = [Line2D([], [], marker="o", ls="", color=INK2, ms=s, label=f"$M_w$ {m}") for m, s in ((5.5, 1.2), (6.5, 2.0), (7.5, 3.9))]
handles += [Line2D([], [], marker="^", ls="", mfc="none", color=INK, label="Holocene volcano"),
            Line2D([], [], marker="^", ls="", mfc="#d33f2f", color=INK, label="eruption since 1922"),
            Line2D([], [], marker="o", ls="", color="#2a78d6", label="strait"),
            Line2D([], [], marker="D", ls="", color="#d33f2f", label="production area"),
            Line2D([], [], color=INK, lw=0.8, label="300 km"),
            Line2D([], [], color=INK, lw=0.8, ls=":", label="150 km"),
            Line2D([], [], marker=".", ls="", color="#9a4d8f", label="PB2002 boundary")]
fig.legend(handles=handles, loc="upper center", ncol=5, fontsize=6.3, frameon=False, bbox_to_anchor=(0.5, 0.045))
fig.subplots_adjust(wspace=0.05, hspace=0.18, bottom=0.13)
fig.savefig(sys.argv[3])
print("ok", len(eq), len(erupt))
