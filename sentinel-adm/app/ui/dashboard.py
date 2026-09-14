"""SENTINEL-ADM — Streamlit operator workbench.

Five workspaces over the API core:
  1. News Radar & Ripple Alerts
  2. Legal Qualifying Assistant
  3. Target OSINT Terminal
  4. Fast Sanctions Screener
  5. Evidence Custody Vault

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
    with urllib.request.urlopen(f"{API}{path}", timeout=30) as response:  # noqa: S310 (local service)
        return json.loads(response.read().decode("utf-8"))


def api_post(path: str, payload: dict[str, Any]) -> Any:
    request = urllib.request.Request(
        f"{API}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=120) as response:  # noqa: S310 (local service)
        return json.loads(response.read().decode("utf-8"))


st.set_page_config(page_title="SENTINEL-ADM", layout="wide")
st.title("SENTINEL-ADM")
st.caption("Tactical OSINT, Early Warning and Legal Intelligence — Direzione Interregionale Puglia, Molise e Basilicata")

tabs = st.tabs([
    "News Radar",
    "Legal Assistant",
    "Target OSINT",
    "Sanctions Screener",
    "Evidence Vault",
])

with tabs[0]:
    st.subheader("News Radar & Ripple Alerts")
    st.caption("Feed institucionali e regionali, entità estratte, match con la watchlist locale e livello di contagio.")
    if st.button("Carica evidenze radar", key="radar-load"):
        try:
            st.session_state["radar_health"] = api_get("/health")
        except Exception as error:  # noqa: BLE001
            st.error(f"API non raggiungibile: {error}")
    if st.session_state.get("radar_health"):
        st.json(st.session_state["radar_health"])

with tabs[1]:
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

with tabs[2]:
    st.subheader("Target OSINT Terminal")
    username = st.text_input("Username da verificare")
    email = st.text_input("Email da verificare")
    query = st.text_input("Query di dorking (portali PA, PVP, OpenCoesione, BDAP)")
    st.info("I wrapper di ricognizione (Maigret/Holehe/ArchiveBox) sono eseguiti dai servizi dedicati: questa console prepara i job e raccoglie i dossier.")

with tabs[3]:
    st.subheader("Fast Sanctions Screener")
    names = st.text_area("Nomi (uno per riga)", height=120)
    schema = st.selectbox("Schema", ["Person", "Company", "Organization"])
    if st.button("Screening locale", key="screen-run") and names.strip():
        payload = {"names": [line.strip() for line in names.splitlines() if line.strip()], "schema": schema}
        st.json(api_post("/sanctions/screen", payload))

with tabs[4]:
    st.subheader("Evidence Custody Vault")
    if st.button("Aggiorna elenco", key="vault-load"):
        st.session_state["evidence"] = api_get("/evidence")
    for record in st.session_state.get("evidence", []):
        with st.expander(f"{record.get('evidence_id')} — {record.get('source_url', '')[:70]}"):
            st.write(f"SHA-256: `{record.get('sha256')}`")
            st.write(f"TSA: {record.get('tsa', {}).get('status', 'pending')}")
            if st.button("Verifica integrità", key=f"verify-{record.get('evidence_id')}"):
                st.json(api_get(f"/evidence/{record.get('evidence_id')}/verify"))
