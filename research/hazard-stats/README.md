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

## Caratterizzazione del Capitolo 3 (ottobre 2026)

`node_hazard_characterisation.py` sostituisce i conteggi entro 300 km con:

- magnitudo di completezza per periodo (massima curvatura + confronto dei tassi) e due classi complete: Mw 5,6-7,0 nel 1964-2021, Mw >= 7 nel 1922-2021;
- declustering di Gardner-Knopoff sul catalogo globale (Uhrhammer e "solo repliche" come sensibilità); una sequenza = un episodio di innesco;
- zone di pericolo basate sull'intensità prevista sul nodo (Allen, Wald e Worden 2012, distanza ipocentrale), con 300 km solo come distanza di selezione;
- tassi e tempi di ritorno di intensità >= V, VI, VII con periodi di osservazione diversi per classe (Weichert 1980);
- attribuzione geologica delle sorgenti con PB2002 (coppia di placche, profondità);
- statistiche GVP per VEI con anni di completezza e anelli di 10, 30, 100 e 300 km; EM-DAT solo come aggregati.

File in più da scaricare nella cartella `pb2002/`: `PB2002_steps.json` e `PB2002_orogens.json` da https://github.com/fraxen/tectonicplates (cartella GeoJSON, licenza ODC-BY); per le mappe `ne_50m_land.geojson` da https://github.com/nvkelso/natural-earth-vector (pubblico dominio).

```bash
pip install pandas numpy scipy openpyxl shapely matplotlib
python node_hazard_characterisation.py data pb2002 out   # risultati in out/results/*.csv
python make_tables.py out                                # tabelle LaTeX in out/tables/
python make_figures.py out pb2002/ne_50m_land.geojson    # figure in out/figures/
```

`out/results/figure_inputs.pkl` non contiene record EM-DAT. Le cartelle `data/`, `pb2002/` e `out/` non vanno committate.
