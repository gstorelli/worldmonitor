"""SENTINEL-ADM — Streamlit operator workbench.

Two workspaces over the API core:
  1. News Radar & Ripple Alerts  (scan + watchlist management)
  2. Legal Qualifying Assistant  (qualification + catalogue)

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
st.caption("Early Warning and Legal Intelligence — Direzione Interregionale Puglia, Molise e Basilicata")

tab_radar, tab_legal = st.tabs(["News Radar", "Legal Assistant"])

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
