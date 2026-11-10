"""PGA of the GEM Global Seismic Hazard Map v2026.1 at the critical nodes.

Compares an independent probabilistic hazard model (GEM, PGA with a 10%
probability of exceedance in 50 years on rock, Vs30 = 800 m/s) with the
catalogue-based rates of Chapter 3 (rate of expected intensity >= V and >= VI
at the node reference point, t1_node_seismic_statistics.csv).

The GeoPackage (table v2026: lon, lat, pga in g, R-tree on geom) comes from
https://zenodo.org/records/20735384 (CC BY-NC-SA 4.0): not in the repository.

Usage:
  python gem_pga_nodes.py <gem_gshm_v2026.1.gpkg> <t1_node_seismic_statistics.csv> <out.csv> [tab_gem_nodes.tex]

The optional fourth argument writes the LaTeX rows of the Supplementary table
(read by \inputrows in Chapter 3).
"""
import math
import sqlite3
import sys

import pandas as pd

from hazard_lib import NODES_DF, hav

RADIUS_KM = 50.0


def pga_around(con, lat, lon, radius_km=RADIUS_KM):
    dlat = radius_km / 111.0
    dlon = radius_km / (111.0 * math.cos(math.radians(lat)))
    rows = con.execute(
        "select v.lon, v.lat, v.pga from v2026 v join rtree_v2026_geom r on v.fid = r.id "
        "where r.minx >= ? and r.maxx <= ? and r.miny >= ? and r.maxy <= ?",
        (lon - dlon, lon + dlon, lat - dlat, lat + dlat),
    ).fetchall()
    pts = [(hav(lat, lon, y, x), p) for x, y, p in rows]
    within = [p for d, p in pts if d <= radius_km]
    d_near, p_near = min(pts)
    return d_near, p_near, min(within), max(within), len(within)


def spearman(a, b):
    return pd.Series(a).rank().corr(pd.Series(b).rank())


def fmt_rank(r):
    return f"{r:.1f}" if r % 1 else f"{int(r)}"


def fmt_period(t):
    return "$>$1{,}000" if t > 1000 else f"{t:,.0f}".replace(",", "{,}") if t >= 100 else f"{t:.0f}"


def write_tex_rows(out, path):
    order = out.sort_values(["kind", "rank_pga"], key=lambda c: c.map({"strait": 0, "production": 1}) if c.name == "kind" else c)
    lines = []
    prev = None
    for r in order.itertuples():
        if prev is not None and r.kind != prev:
            lines.append("\\midrule")
        prev = r.kind
        lines.append(
            f"{r.node} & {r.pga_g:.2f} & {r.pga_g_min_50km:.2f}--{r.pga_g_max_50km:.2f} & "
            f"{fmt_rank(r.rank_pga)} & {fmt_period(r.T_I6)} & {fmt_rank(r.rank_rate_I6)} \\\\"
        )
    with open(path, "w") as f:
        f.write("\n".join(lines) + "\n")


def main(gpkg, t1_path, out_path, tex_path=None):
    con = sqlite3.connect(f"file:{gpkg}?mode=ro", uri=True)
    rows = []
    for n in NODES_DF.itertuples():
        d, p, lo, hi, k = pga_around(con, n.lat, n.lon)
        rows.append({"nodo": n.nodo, "node": n.node, "kind": n.kind, "lat": n.lat, "lon": n.lon,
                     "nearest_grid_km": round(d, 1), "pga_g": round(p, 3),
                     "pga_g_min_50km": round(lo, 3), "pga_g_max_50km": round(hi, 3), "grid_points_50km": k})
    gem = pd.DataFrame(rows)
    t1 = pd.read_csv(t1_path)[["nodo", "rate_I5", "rate_I6", "T_I6", "P50_I6"]]
    out = gem.merge(t1, on="nodo", how="left", validate="one_to_one")
    out["rank_pga"] = out["pga_g"].rank(ascending=False)
    out["rank_rate_I6"] = out["rate_I6"].rank(ascending=False)
    out.to_csv(out_path, index=False)
    if tex_path:
        write_tex_rows(out, tex_path)
    print(out[["node", "pga_g", "pga_g_min_50km", "pga_g_max_50km", "T_I6", "rank_pga", "rank_rate_I6"]].to_string(index=False))
    print(f"Spearman PGA vs rate I>=VI: {spearman(out.pga_g, out.rate_I6):.2f}")
    print(f"Spearman PGA vs rate I>=V:  {spearman(out.pga_g, out.rate_I5):.2f}")
    for kind in ("strait", "production"):
        sub = out[out.kind == kind]
        print(f"  {kind}: n={len(sub)}, Spearman (I>=VI) {spearman(sub.pga_g, sub.rate_I6):.2f}")


if __name__ == "__main__":
    main(*sys.argv[1:5])
