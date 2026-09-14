"""SENTINEL-ADM — Streamlit operator workbench.

Five workspaces over the API core:
  1. News Radar & Ripple Alerts  (scan + watchlist management)
  2. Legal Qualifying Assistant  (qualification + catalogue)
  3. Target OSINT Terminal       (dorking + job specs)
  4. Fast Sanctions Screener     (local Yente)
  5. Evidence Custody Vault      (capture, verify, seal)

Run with:  streamlit run app/ui/dashboard.py
"""

from __future__ import annotations

import json
import os
import urllib.request
from typing import Any

import streamlit as st  # type: ignore[import-not-found]

API = os.environ.get("SENTINEL_API_URL", "http://sentinel-api:8000")


def api_get(path: str) -> Any:
    with urllib.request.urlopen(f"{API}{path}", timeout=60) as response:  # noqa: S310 (local service)
        return json.loads(response.read().decode("utf-8"))


def api_post(path: str, payload: dict[str, Any]) -> Any:
    request = urllib.request.Request(
        f"{API}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=180) as response:  # noqa: S310 (local service)
        return json.loads(response.read().decode("utf-8"))


def api_delete(path: str) -> Any:
    request = urllib.request.Request(f"{API}{path}", method="DELETE")
    with urllib.request.urlopen(request, timeout=60) as response:  # noqa: S310 (local service)
        return json.loads(response.read().decode("utf-8"))


st.set_page_config(page_title="SENTINEL-ADM", layout="wide")
st.title("SENTINEL-ADM")
st.caption("Tactical OSINT, Early Warning and Legal Intelligence — Direzione Interregionale Puglia, Molise e Basilicata")

tab_radar, tab_legal, tab_osint, tab_screen, tab_vault = st.tabs(
    ["News Radar", "Legal Assistant", "Target OSINT", "Sanctions Screener", "Evidence Vault"]
)

# ── 1. News radar ────────────────────────────────────────────────────────────
with tab_radar:
    st.subheader("News Radar & Ripple Alerts")
    col_a, col_b = st.columns([1, 3])
    with col_a:
        if st.button("Esegui scansione", key="radar-scan"):
            try:
                st.session_state["radar"] = api_post("/radar/scan", {})
            except Exception as error:  # noqa: BLE001
                st.error(f"Scansione non riuscita: {error}")
    with col_b:
        feeds = st.session_state.get("radar_feeds")
        if st.button("Mostra feed configurati", key="radar-feeds"):
            try:
                st.session_state["radar_feeds"] = api_get("/radar/feeds")["feeds"]
                feeds = st.session_state["radar_feeds"]
            except Exception as error:  # noqa: BLE001
                st.error(str(error))
        if feeds:
            st.caption("Feed: " + ", ".join(feeds))

    radar = st.session_state.get("radar")
    if radar:
        if radar.get("errors"):
            st.warning("Feed con errori: " + "; ".join(radar["errors"]))
        alerts = radar.get("alerts", [])
        if alerts:
            st.dataframe(
                [
                    {
                        "titolo": alert["title"],
                        "livello": alert["level"],
                        "score": alert["score"],
                        "flash": alert["flash"],
                        "watchlist": ", ".join(match["name"] for match in alert["matched"]),
                        "link": alert["link"],
                    }
                    for alert in alerts
                ],
                use_container_width=True,
            )
        else:
            st.info("Nessuna notizia ha generato segnali di contagio.")

    with st.expander("Gestione watchlist"):
        try:
            entries = api_get("/watchlist")["entries"]
            st.dataframe(entries, use_container_width=True)
        except Exception as error:  # noqa: BLE001
            st.error(f"Watchlist non disponibile: {error}")
            entries = []
        with st.form("watchlist-add"):
            entry_id = st.text_input("ID voce")
            name = st.text_input("Ragione sociale")
            city = st.text_input("Comune", value="Bari")
            vat = st.text_input("Partita IVA")
            aliases = st.text_input("Alias (separati da virgola)")
            if st.form_submit_button("Salva voce"):
                try:
                    api_post(
                        "/watchlist",
                        {
                            "entry_id": entry_id,
                            "name": name,
                            "city": city,
                            "vat": vat,
                            "aliases": [alias.strip() for alias in aliases.split(",") if alias.strip()],
                        },
                    )
                    st.success("Voce salvata.")
                except Exception as error:  # noqa: BLE001
                    st.error(f"Salvataggio non riuscito: {error}")
        remove_id = st.text_input("ID da rimuovere", key="watchlist-remove")
        if st.button("Rimuovi", key="watchlist-remove-btn") and remove_id:
            try:
                api_delete(f"/watchlist/{remove_id}")
                st.success("Voce rimossa.")
            except Exception as error:  # noqa: BLE001
                st.error(str(error))

# ── 2. Legal ─────────────────────────────────────────────────────────────────
with tab_legal:
    st.subheader("Legal Qualifying Assistant")
    incident = st.text_area(
        "Descrizione del fatto",
        placeholder="Es.: controllo su deposito con gasolio non assoggettato ad accisa e e-DAS mancante…",
        height=160,
    )
    if st.button("Qualifica illeciti", key="legal-run") and incident.strip():
        st.json(api_post("/legal/qualify", {"text": incident}))
    with st.expander("Catalogo atti (customs, accise, tributario, penale, giochi)"):
        if st.button("Mostra catalogo", key="legal-catalog"):
            st.json(api_get("/legal/catalog"))

# ── 3. OSINT ─────────────────────────────────────────────────────────────────
with tab_osint:
    st.subheader("Target OSINT Terminal")
    st.caption("L'API prepara i job; l'esecuzione avviene nel container osint-toolbox (nessuna shell nell'API).")

    terms = st.text_input("Termini per dorking (separati da virgola)", value="Fratelli Rossi S.r.l.")
    portals = st.multiselect(
        "Portali",
        ["pvp", "opencoesione", "bdap", "anac", "gazzetta", "agenziaentrate"],
        default=["pvp", "opencoesione"],
    )
    if st.button("Genera dork", key="dork-run") and terms.strip():
        response = api_post(
            "/osint/dorks",
            {"terms": [term.strip() for term in terms.split(",") if term.strip()], "portals": portals},
        )
        st.dataframe(response["queries"], use_container_width=True)

    tool = st.selectbox("Strumento", ["maigret", "holehe"])
    target = st.text_input("Target (username o email)")
    if st.button("Prepara job", key="osint-job") and target.strip():
        try:
            job = api_post("/osint/job", {"tool": tool, "target": target, "output_dir": "/dossiers"})
            st.code(" ".join(job["spec"]["args"]), language="bash")
            st.caption(job["note"])
        except Exception as error:  # noqa: BLE001
            st.error(str(error))

# ── 4. Sanctions ─────────────────────────────────────────────────────────────
with tab_screen:
    st.subheader("Fast Sanctions Screener")
    names = st.text_area("Nomi (uno per riga)", height=120)
    schema = st.selectbox("Schema", ["Person", "Company", "Organization"])
    if st.button("Screening locale", key="screen-run") and names.strip():
        payload = {"names": [line.strip() for line in names.splitlines() if line.strip()], "schema": schema}
        st.json(api_post("/sanctions/screen", payload))

# ── 5. Vault ─────────────────────────────────────────────────────────────────
with tab_vault:
    st.subheader("Evidence Custody Vault")
    capture_url = st.text_input("URL da archiviare (ArchiveBox → WARC → SHA-256 → RFC 3161)")
    seal = st.checkbox("Sigilla con TSA", value=True)
    if st.button("Cattura e sigilla", key="vault-capture") and capture_url.strip():
        try:
            result = api_post("/evidence/capture", {"url": capture_url, "seal": seal})
            st.success(f"Evidenza {result['evidence']['evidence_id']} — integrità: {result['verification']['status']}")
        except Exception as error:  # noqa: BLE001
            st.error(f"Cattura non riuscita: {error}")

    if st.button("Aggiorna elenco", key="vault-load"):
        st.session_state["evidence"] = api_get("/evidence")
    for record in st.session_state.get("evidence", []):
        with st.expander(f"{record.get('evidence_id')} — {record.get('source_url', '')[:70]}"):
            st.write(f"SHA-256: `{record.get('sha256')}`")
            st.write(f"TSA: {(record.get('tsa') or {}).get('status', 'pending')}")
            if st.button("Verifica integrità", key=f"verify-{record.get('evidence_id')}"):
                st.json(api_get(f"/evidence/{record.get('evidence_id')}/verify"))
