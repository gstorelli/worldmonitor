# Estrazione dei dati aperti per la tesi

Scarica i dati del Capitolo 3 e dell'Anno 2 con un workflow di GitHub Actions (`.github/workflows/thesis-data-extract.yml`) che gira **solo sul ramo `thesis-data-extract`**, mai su `main`. Ogni push su quel ramo che tocca questa cartella rilancia l'estrazione; i risultati derivati vengono committati in `out/`.

| Script | Fonte | Output nella repo | Note |
|---|---|---|---|
| `fetch_comext.py` | Eurostat Comext DS-045409 (API) | `out/comext_imports_long.csv`, `out/comext_dependence.csv` | Import UE27 e Italia 2019-2024 per partner, valore e quantità; quote e HHI delle origini extra-UE. Fonte da citare: Eurostat. |
| `fetch_portwatch.py` | IMF PortWatch (ArcGIS Hub) | `out/portwatch_monthly.csv` | Medie mensili dei transiti giornalieri degli stretti della tesi. I record giornalieri grezzi restano solo come artifact del workflow (termini d'uso IMF). |
| `filter_taric.py` (manuale) | Export completo delle misure TARIC (xlsx) | `out/taric_measures_20261005_thesis_goods.csv` | Filtra l'export del 5/10/2026 ai codici NC dei beni della tesi (15.335 misure). Si lancia a mano: `python filter_taric.py <export.xlsx> <out.csv>`. |

Non sono automatizzati, per scelta:
- **TARIC**: nessuna API pubblica stabile; si parte da un export completo scaricato a mano dalla consultazione TARIC e lo si filtra con `filter_taric.py`.
- **ISTAT Coeweb**: applicazione web senza API documentata; da valutare l'export manuale.
- **Livelli del lago Gatún (Panama)**: fonte ufficiale da individuare prima di scriverne lo scaricamento.
