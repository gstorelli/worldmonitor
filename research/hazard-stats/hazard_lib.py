"""Shared functions for the hazard characterisation of the critical nodes (thesis, Chapter 3).

ISC-GEM reader, magnitude of completeness (maximum curvature), window declustering
(Gardner-Knopoff, Uhrhammer), Weichert (1980) estimator, distance from the PB2002 plate
boundaries (Bird 2003) and the intensity prediction equation of Allen, Wald and Worden (2012).
Dependencies: numpy, pandas, scipy; shapely only for the orogen polygons.
"""
import json
import math
import numpy as np
import pandas as pd

EARTH_R = 6371.0

# ------------------------------------------------------------------ nodi
# Node reference points (same as analisi_pericoli_nodi.py and src/config/thesis-model.ts).
# Single, approximate points: see the limitations in Chapter 3.
NODES = [  # nome, nome inglese, tipo, bene, lat, lon
    ("Suez", "Suez Canal", "strait", "", 30.60, 32.33),
    ("Bab el-Mandeb", "Bab el-Mandeb Strait", "strait", "", 12.60, 43.33),
    ("Hormuz", "Strait of Hormuz", "strait", "", 26.57, 56.25),
    ("Malacca", "Strait of Malacca", "strait", "", 2.50, 101.40),
    ("Stretto di Taiwan", "Taiwan Strait", "strait", "", 24.00, 119.50),
    ("Panama", "Panama Canal", "strait", "", 9.08, -79.68),
    ("Gibilterra", "Strait of Gibraltar", "strait", "", 35.95, -5.60),
    ("Antofagasta", "Antofagasta", "production", "copper", -23.30, -69.00),
    ("Morowali", "Morowali", "production", "nickel", -2.83, 122.16),
    ("Weda Bay", "Weda Bay", "production", "nickel", 0.47, 127.94),
    ("Hsinchu", "Hsinchu", "production", "chips", 24.78, 121.01),
    ("Tainan", "Tainan", "production", "chips", 23.11, 120.27),
]
NODES_DF = pd.DataFrame(NODES, columns=["nodo", "node", "kind", "good", "lat", "lon"])


def hav(lat1, lon1, lat2, lon2):
    """Great-circle distance in km (haversine)."""
    lat1, lon1, lat2, lon2 = map(np.radians, (lat1, lon1, lat2, lon2))
    h = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_R * np.arcsin(np.sqrt(np.clip(h, 0, 1)))


# ------------------------------------------------------------------ ISC-GEM
ISC_COLS = ["date", "lat", "lon", "smajax", "sminax", "strike", "q_loc", "depth", "depth_unc", "q_depth",
            "mw", "mw_unc", "q_mw", "mw_src", "mo", "fac", "mo_auth", "mpp", "mpr", "mrr", "mrt", "mtp", "mtt",
            "str1", "dip1", "rake1", "str2", "dip2", "rake2", "type", "eventid"]


def read_isc(path):
    lines = [l for l in open(path, encoding="utf-8", errors="replace") if not l.startswith("#") and l.strip()]
    recs = [[x.strip() for x in l.rstrip("\n").split(",")][:31] for l in lines]
    df = pd.DataFrame(recs, columns=ISC_COLS)
    for c in ["lat", "lon", "depth", "mw", "mw_unc"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df["date"] = pd.to_datetime(df["date"].str.slice(0, 19), errors="coerce")
    df["year"] = df["date"].dt.year
    df["t"] = df["year"] + (df["date"].dt.dayofyear - 1 + df["date"].dt.hour / 24.0) / 365.25  # decimal years
    df = df.dropna(subset=["lat", "lon", "mw", "date"]).sort_values("date").reset_index(drop=True)
    return df


# ------------------------------------------------------------------ completezza
def mc_maxc(m, bin_w=0.1, correction=0.2):
    """Magnitude of completeness by maximum curvature (Wiemer and Wyss 2000): the most
    populated bin of the non-cumulative distribution, plus a correction (0.2 by default)
    for the tendency of the method to underestimate Mc (Woessner and Wiemer 2005)."""
    m = np.asarray(m)
    if len(m) < 50:
        return np.nan
    bins = np.round(m / bin_w) * bin_w
    vals, counts = np.unique(np.round(bins, 2), return_counts=True)
    return float(vals[np.argmax(counts)] + correction)


def mc_bootstrap(m, n=500, seed=1, **kw):
    rng = np.random.default_rng(seed)
    m = np.asarray(m)
    est = [mc_maxc(rng.choice(m, len(m), replace=True), **kw) for _ in range(n)]
    return float(np.nanmean(est)), float(np.nanstd(est))


def b_value_aki(m, mc, bin_w=0.1):
    """Maximum-likelihood b-value with the correction for binned magnitudes."""
    m = np.asarray(m)
    m = m[m >= mc - 1e-9]
    if len(m) < 2:
        return np.nan, np.nan, len(m)
    b = 1.0 / (math.log(10) * (m.mean() - (mc - bin_w / 2)))
    return b, b / math.sqrt(len(m)), len(m)


# ------------------------------------------------------------------ declustering
def window_gk(m):
    """Gardner and Knopoff (1974) windows as parameterised in van Stiphout et al. (2012) and
    in the OpenQuake HMTK: distance in km, time in days."""
    m = np.asarray(m, float)
    L = 10 ** (0.1238 * m + 0.983)
    T = np.where(m >= 6.5, 10 ** (0.032 * m + 2.7389), 10 ** (0.5409 * m - 0.547))
    return L, T


def window_uhrhammer(m):
    """Uhrhammer (1986) windows as parameterised in van Stiphout et al. (2012) and OpenQuake."""
    m = np.asarray(m, float)
    return np.exp(-1.024 + 0.804 * m), np.exp(-2.87 + 1.235 * m)


def decluster_window(df, window=window_gk, fs_prop=1.0):
    """Window declustering (Gardner-Knopoff logic). Events are visited by decreasing
    magnitude; each unassigned event opens a cluster with the unassigned events inside its
    space window and its time window (after the event; before it with fs_prop times the
    window, for foreshocks). Returns (dependent flag, cluster id; 0 = isolated event)."""
    t = df["t"].to_numpy()  # decimal years, ordinati
    lat, lon, m = df["lat"].to_numpy(), df["lon"].to_numpy(), df["mw"].to_numpy()
    L, T = window(m)
    T = T / 365.25
    n = len(df)
    dependent = np.zeros(n, bool)
    cluster = np.zeros(n, int)
    assigned = np.zeros(n, bool)
    order = np.argsort(-m, kind="stable")
    cid = 0
    for i in order:
        if assigned[i]:
            continue
        lo = np.searchsorted(t, t[i] - fs_prop * T[i], side="left")
        hi = np.searchsorted(t, t[i] + T[i], side="right")
        idx = np.arange(lo, hi)
        idx = idx[(idx != i) & ~assigned[idx]]
        if len(idx):
            d = hav(lat[i], lon[i], lat[idx], lon[idx])
            idx = idx[d <= L[i]]
        assigned[i] = True
        if len(idx):
            cid += 1
            cluster[i] = cid
            cluster[idx] = cid
            dependent[idx] = True
            assigned[idx] = True
    return dependent, cluster


# ------------------------------------------------------------------ Weichert (1980)
def weichert(mags, periods, m_bins, bin_w=0.1, b0=1.0, iters=200):
    """Maximum-likelihood b-value and annual rate for magnitude classes with different
    observation periods (Weichert 1980). mags: magnitudes already filtered for completeness;
    periods: {class centre -> years of complete observation}; m_bins: class centres.
    Returns b, sigma_b, annual rate of M >= m_bins[0] - bin_w/2, number of events."""
    mags = np.asarray(mags)
    mc = np.asarray(m_bins, float)
    t = np.array([periods[k] for k in m_bins], float)
    nk = np.array([np.sum(np.abs(mags - k) < bin_w / 2 + 1e-9) for k in mc], float)
    N = nk.sum()
    if N < 5:
        return np.nan, np.nan, np.nan, int(N)
    beta = b0 * math.log(10)
    for _ in range(iters):
        e = t * np.exp(-beta * mc)
        snm = (nk * mc).sum()
        f = (e * mc).sum() / e.sum() - snm / N
        fp = -((e * mc * mc).sum() * e.sum() - ((e * mc).sum()) ** 2) / e.sum() ** 2
        step = f / fp
        beta -= step
        if abs(step) < 1e-8:
            break
    e = t * np.exp(-beta * mc)
    var_beta = (e.sum() ** 2) / (N * ((e * mc * mc).sum() * e.sum() - ((e * mc).sum()) ** 2))
    b = beta / math.log(10)
    sb = math.sqrt(var_beta) / math.log(10)
    rate = N * np.exp(-beta * mc).sum() / e.sum()  # eventi/anno nelle classi considerate
    return b, sb, rate, int(N)


# ------------------------------------------------------------------ Poisson
def poisson_ci(n, alpha=0.05):
    """Exact (Garwood) confidence interval for a Poisson count."""
    from scipy.stats import chi2
    lo = 0.0 if n == 0 else chi2.ppf(alpha / 2, 2 * n) / 2
    hi = chi2.ppf(1 - alpha / 2, 2 * (n + 1)) / 2
    return lo, hi


# ------------------------------------------------------------------ PB2002 (Bird 2003)
STEP_CLASSES = {
    "SUB": "subduction zone", "OCB": "oceanic convergent boundary", "CCB": "continental convergent boundary",
    "CTF": "continental transform fault", "OTF": "oceanic transform fault",
    "CRB": "continental rift boundary", "OSR": "oceanic spreading ridge",
}


def load_pb2002(steps_path, orogens_path, spacing_km=10.0):
    """Points resampled along the PB2002 boundary steps, with their class and plate pair,
    and the orogen polygons (zones of distributed deformation)."""
    s = json.load(open(steps_path))
    plat, plon, pcls, pbound = [], [], [], []
    for f in s["features"]:
        p = f["properties"]
        la0, lo0, la1, lo1 = p["STARTLAT"], p["STARTLONG"], p["FINALLAT"], p["FINALLONG"]
        if abs(lo1 - lo0) > 180:  # steps across the antimeridian
            lo1 = lo1 - 360 if lo1 > lo0 else lo1 + 360
        n = max(2, int(math.ceil(p["STEPLENGTH"] / spacing_km)) + 1)
        for a in np.linspace(0, 1, n):
            plat.append(la0 + a * (la1 - la0))
            lo = lo0 + a * (lo1 - lo0)
            plon.append(((lo + 180) % 360) - 180)
            pcls.append(p["STEPCLASS"])
            pbound.append(p["PLATEBOUND"])
    pts = pd.DataFrame({"lat": plat, "lon": plon, "cls": pcls, "bound": pbound})
    from shapely.geometry import shape
    o = json.load(open(orogens_path))
    orogens = [(f["properties"]["Name"], shape(f["geometry"])) for f in o["features"]]
    return pts, orogens


def nearest_boundary(lat, lon, pts, chunk=400):
    lat, lon = np.atleast_1d(lat), np.atleast_1d(lon)
    dist = np.empty(len(lat))
    cls = np.empty(len(lat), object)
    bnd = np.empty(len(lat), object)
    PL, PO = pts["lat"].to_numpy(), pts["lon"].to_numpy()
    for a in range(0, len(lat), chunk):
        d = hav(lat[a:a + chunk, None], lon[a:a + chunk, None], PL[None, :], PO[None, :])
        j = d.argmin(axis=1)
        dist[a:a + chunk] = d[np.arange(len(j)), j]
        cls[a:a + chunk] = pts["cls"].to_numpy()[j]
        bnd[a:a + chunk] = pts["bound"].to_numpy()[j]
    return dist, cls, bnd


def in_orogen(lat, lon, orogens):
    from shapely.geometry import Point
    out = []
    for la, lo in zip(np.atleast_1d(lat), np.atleast_1d(lon)):
        name = ""
        for nm, g in orogens:
            if g.contains(Point(lo, la)):
                name = nm
                break
        out.append(name)
    return np.array(out, object)


# ------------------------------------------------------------------ intensita' (Allen et al. 2012)
def mmi_allen2012_rhyp(mw, rhyp):
    """Median Modified Mercalli intensity from the IPE of Allen, Wald and Worden (2012) for
    active crustal regions, hypocentral-distance form, no site term. Coefficients as in the
    OpenQuake implementation (AllenEtAl2012Rhypo). Stated domain: Mw 5.0-7.9, R < 300 km."""
    mw, rhyp = np.asarray(mw, float), np.asarray(rhyp, float)
    c0, c1, c2, c4, m1, m2 = 2.085, 1.428, -1.402, 0.078, -0.209, 2.042
    rm = m1 + m2 * np.exp(mw - 5.0)
    f = c2 * np.log(np.sqrt(rhyp ** 2 + rm ** 2))
    f = f + np.where(rhyp > 50.0, c4 * np.log(np.maximum(rhyp, 1e-6) / 50.0), 0.0)
    return c0 + c1 * mw + f


def sigma_allen2012_rhyp(rhyp):
    rhyp = np.asarray(rhyp, float)
    return 0.82 + 0.37 / (1.0 + (rhyp / 22.9) ** 2)


def r_threshold(mw, mmi_thr, depth=15.0, rmax=300.0):
    """Largest epicentral distance (km, capped at rmax) at which an event of magnitude mw at
    the given depth yields a median intensity >= mmi_thr at the node."""
    from scipy.optimize import brentq
    g = lambda r: mmi_allen2012_rhyp(mw, math.hypot(r, depth)) - mmi_thr
    if g(0) < 0:
        return 0.0
    if g(rmax) >= 0:
        return rmax
    return brentq(g, 0, rmax)
