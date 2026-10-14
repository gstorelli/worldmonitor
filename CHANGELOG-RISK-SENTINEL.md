# Changelog di Risk Sentinel

Cambiamenti del fork `gstorelli/worldmonitor` (Risk Sentinel), una voce per pull request unita, dalla più recente. Il file `CHANGELOG.md` è quello dell'upstream WorldMonitor e non descrive questo fork.

Ogni merge su `main` ripubblica la produzione (`risksentinel.opencyber.org`). Chi unisce una PR aggiunge qui la sua voce, nella stessa PR o subito dopo. Le motivazioni di ricerca sono in `docs/DECISIONI.md` del repository della tesi.

Formato di ogni voce: numero della PR, cosa cambia per chi usa il portale, eventuale azione sul server dopo il merge.

## 14 ottobre 2026

- **#39**: Policy, scheda "Atti UE recenti": regolamenti, decisioni e direttive degli ultimi 30 giorni che nominano uno degli 8 beni o una misura commerciale, dall'endpoint SPARQL dell'Ufficio delle pubblicazioni (nuovo seeder `seed-policy-eu-acts`, livello `slow`). Il workflow n8n 06 non trovava nulla, perché EUR-Lex blocca le richieste automatiche. *Server:* lancio una tantum facoltativo, altrimenti si riempie al giro `slow` successivo.
- **#38**: OSINT riscritto come strato "Segnali" del modello: tabella dei 12 nodi (inneschi entro 300 km, transiti, clima della zona vicina, stato della catena), tabella degli 8 beni (prezzi, primi fornitori dell'Italia da Comtrade, misure del registro Policy) e ultimi segnali sui nodi. Nuovo endpoint `/api/osint/signals`; il digest n8n per le notifiche non cambia.
- **#37**: World Brief (#100 della tesi). Se la sintesi viene scartata da un controllo editoriale, si fa un secondo tentativo con una nota sulla regola violata (una chiamata LLM in più). Se fallisce anche quello, si pubblica la sintesi ridotta a un titolo invece di conservare la precedente. I controlli non cambiano.
- **#36**: il job informativo "data" dei test (suite ereditata, non bloccante) ha un limite di 20 minuti: senza limite restava appeso fino a 6 ore e, dopo una serie di merge, bloccava i runner e quindi il deploy.
- **#35**: le normali climatiche 1991-2020 (Open-Meteo) si scaricano una zona alla volta, all'inizio del giro settimanale e con un tempo massimo proprio: prima venivano bloccate dai 429 di Open-Meteo, e senza di esse il pannello climate restava vuoto. *Server:* serve un lancio manuale una tantum per non aspettare domenica.
- **#34**: il tooltip "Fonti dei dati" di Alert feed e OSINT dice che il workflow n8n 01 (notizie GDELT) non esiste nell'istanza, come risulta dal log di `n8n-sync`.
- **#33**: questo changelog; autorizzazione permanente al merge per gli agenti, registrata in `AGENTS.md`.
- **#32**: icona "Fonti dei dati" accanto al titolo di ogni pannello della vista tesi, sulla mappa e in ogni sezione di OSINT, Research e Policy. Il tooltip cita la fonte esatta, l'indirizzo chiamato dal codice e il file che la chiama. Registro in `src/config/data-sources.ts`, da aggiornare quando un pannello cambia fonte.
- **#31**: i pannelli di notizie rispettano perimetro, regole admin e allowlist dell'app. La vista tesi mostra solo i suoi 12 pannelli; spariscono ovunque `finance`, `tech`, `ai` e `layoffs`.
- **#30**: tolti la pipeline GDELT con adjudicator LLM mai usata e le rotte `/api/trigger-ingestion` e `/api/customs-events`, che restituiva coordinate casuali. L'Alert feed legge solo il digest n8n.
- **#29**: tolto il tema "Conflitti (ACLED)" dalle Impostazioni → Notifiche e dal workflow n8n 07. Al merge l'Action `n8n-sync` aggiorna il nodo nell'istanza.
- **#28**: il monitor inneschi legge i terremoti da Redis (`thesis:triggers:v1`), scritti ogni ora da `seed-thesis-triggers` (EMSC, USGS di riserva) nel livello `thesis`. *Server:* nessuna azione obbligatoria, la chiave si scrive al primo giro orario.
- **#27**: niente Google Fonts bloccanti né preconnect a `maps.worldmonitor.app`; il carattere arabo si carica solo con l'arabo.
- **#26**: la vista tesi non carica più segnali d'intelligence, macro e borsa che non mostra. Nella sonda d'avvio le chiamate passano da 55 a 33.
- **#25**: regola "niente righe di attribuzione" nei commit e nelle PR (`CLAUDE.md`, `.claude/settings.json`).
- **#24**: con `OPENALEX_API_KEY` le Novità accademiche di Research cercano prima su OpenAlex, poi su Crossref.
- **#23**: spenti per sempre cinque gruppi ereditati: finanza speculativa e mercati, tech/startup, indici di consumo, webcam e dirette, militare (`src/config/scope.ts`).
- **#22**: sintesi dei gruppi di notizie sbloccate in modalità self-hosted (via il controllo "Pro" dell'upstream).
- **#21**: PortWatch ogni 6 ore (livello `context`); la scheda Punti di strozzatura distingue "in caricamento" da "nessun dato".
- **#20**: World Brief senza il falso positivo del validatore; soglie di salute a 90 minuti per i seeder orari; README nuovo.
- **#16**: modelli LLM in un solo punto (`scripts/_llm-models.mjs`): Claude Haiku 5.5 veloce, Mistral Large 4 qualità; usi di mercato ereditati spenti.

## 13 ottobre 2026

- **#19**: testi pubblici (`llms.txt`, `llms-full.txt`, `ai-search.md`) riscritti su Risk Sentinel; OSINT senza ACLED e senza score v0.
- **#18**: registro Policy con le misure del Cap. 3 come modulatori e uno stato di verifica per ogni voce.
- **#17**: bibliografia di Research generata dal repository della tesi, copertura per strato del modello, conferenze sfoltite.
- **#15**: Groq rimosso dal fork.
- **#14**: stabilità dopo il fermo del 12-13/10: limitatore delle chiamate in uscita, watchdog, limiti del bootstrap, tetto di memoria dei seeder.
- **#13**: avvio più leggero, distanze dai limiti di placca allineate alla tesi, bibliografia e conferenze, livello cron `context`.

## 8-10 ottobre 2026

- **#10**: pannello Risposta e scenari (prospettiva futura, proof of concept).
- **#9**: `CLAUDE.md` tracciato nel repository (contesto di ricerca per ogni agente).
- **#8**: ACLED disattivato ovunque (la licenza esclude l'uso con IA/LLM); i conflitti vengono da UCDP.
- **#7**: livello cron `thesis` orario (terremoti, eventi naturali, anomalie climatiche).
- **#6** e **#5**: piattaforma allineata al modello a sei strati: catena di rischio, inneschi misurati, beni strategici, vista tesi predefinita.
- **#4**: `sentinel-adm` spostato fuori dal repository (ramo `archive/sentinel-adm`).

## Giugno 2026

- **#3** e **#1**: correzione del deploy su Netlify (segreti tolti dal codice). Netlify non è più usato: la produzione è sulla VPS Contabo.

## Aperte (non unite)

- **#11**: script della caratterizzazione del pericolo del Cap. 3.
- **#12** (bozza): regola degli inneschi basata sull'intensità prevista, in attesa del via delle tutor.
