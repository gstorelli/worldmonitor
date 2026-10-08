# Analisi dei pericoli sismici e vulcanici dei nodi critici

Script che conta terremoti (ISC-GEM), vulcani ed eruzioni (GVP) e impatti (EM-DAT) attorno ai nodi critici di Risk Sentinel. Produce `results.pkl`, la base dell'Excel e delle slide dell'ottobre 2026.

## Dati da scaricare (non inclusi nella repo)

Mettere i file in una cartella, per esempio `research/hazard-stats/data/`, già esclusa da git:

| File atteso | Fonte | Licenza |
|---|---|---|
| `iscgem_main.csv`, `iscgem_suppl.csv` | https://www.isc.ac.uk/iscgem/download.php (catalogo principale e supplemento, v12.1) | CC-BY-SA 3.0 |
| `gvp_volcanoes.xls` | https://volcano.si.edu/database/list_volcano_holocene_excel.cfm | Smithsonian GVP, con citazione |
| `gvp_eruptions.xlsx` | https://volcano.si.edu/database/GVP_Eruption_List_Holocene_20260424.xlsx | Smithsonian GVP, con citazione |
| `emdat.xlsx` | https://public.emdat.be (login; export di tutti i disastri naturali) | **Vietata la ridistribuzione: non committare** |

## Esecuzione

```bash
pip install pandas numpy openpyxl
python analisi_pericoli_nodi.py research/hazard-stats/data
```

## Scelte di metodo

- Raggio 300 km dal punto di riferimento del nodo, con test a 150 km.
- Periodo 1922-2021 per i terremoti; i confronti nel tempo usano Mw ≥ 6.
- Repliche incluse; eventi del supplemento ISC-GEM esclusi.
- EM-DAT: solo eventi con coordinate, con un controllo di plausibilità sul paese.

Da aggiungere: declustering, stima della magnitudo di completezza, zone di pericolo su base geologica.
