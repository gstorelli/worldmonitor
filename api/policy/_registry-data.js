// Edge-compatible ESM literal mirror (no node: built-ins, no JSON import attributes).
// Source of truth: data/policy-registry.json
// Regenerate when the JSON changes; tests/api-data-mirrors.test.mjs enforces parity.
export default [
  {
    "id": "eu-crma-2024-1252",
    "title": "Regulation (EU) 2024/1252 — Critical Raw Materials Act (CRMA)",
    "jurisdiction": "eu",
    "topic": "Terre rare e critical raw materials",
    "reference": "Reg. (UE) 2024/1252, OJ L 2024/1252",
    "url": "https://eur-lex.europa.eu/eli/reg/2024/1252/oj",
    "riskCategories": [
      "rareEarths",
      "geopolitical",
      "commodityPrices"
    ],
    "chokepoints": [
      "Suez",
      "Stretto di Taiwan",
      "Hormuz"
    ],
    "summary": "Quadro UE per garantire l'accesso sicuro e sostenibile alle materie prime critiche: benchmark di estrazione/raffinazione interna, diversificazione delle importazioni, stockpile strategici e monitoraggio delle dipendenze.",
    "gap": "I benchmark di monitoraggio dipendono da dati dichiarati ex-post e da stress test annuali; manca un meccanismo di early-warning operativo (7-30 giorni) che leghi eventi real-time su chokepoint/hazard a singoli codici HS delle materie critiche.",
    "customsImplication": "Il controllo doganale è il punto di verifica naturale della diversificazione e della provenienza dichiarata; un sistema di early-warning per HS-code critici rafforzerebbe l'enforcement del CRMA."
  },
  {
    "id": "eu-ai-act-2024-1689",
    "title": "Regulation (EU) 2024/1689 — Artificial Intelligence Act",
    "jurisdiction": "eu",
    "topic": "AI e accountability doganale",
    "reference": "Reg. (UE) 2024/1689, OJ L 2024/1689",
    "url": "https://eur-lex.europa.eu/eli/reg/2024/1689/oj",
    "riskCategories": [
      "customsEnforcement",
      "geopolitical"
    ],
    "chokepoints": [],
    "summary": "Classificazione del rischio dei sistemi AI e obblighi di trasparenza/accountability per i sistemi ad alto rischio, inclusi quelli usati dalle autorità di contrasto e di gestione delle frontiere.",
    "gap": "La norma definisce gli obblighi ma non fornisce pattern tecnici per la spiegabilità per-alert né per la tracciabilità delle fonti OSINT; senza standard operativi, il rischio è che i sistemi doganali AI restino 'black box' non auditabili.",
    "customsImplication": "Ogni alert di Risk Sentinel deve essere spiegabile e auditable (fonti, dimensioni di rischio, confidenza) per soddisfare i requisiti AI Act nel contesto di enforcement."
  },
  {
    "id": "eu-ucc-952-2013",
    "title": "Regulation (EU) No 952/2013 — Union Customs Code (UCC)",
    "jurisdiction": "eu",
    "topic": "Enforcement doganale e gestione del rischio",
    "reference": "Reg. (UE) n. 952/2013, OJ L 269",
    "url": "https://eur-lex.europa.eu/eli/reg/2013/952/oj",
    "riskCategories": [
      "customsEnforcement"
    ],
    "chokepoints": [],
    "summary": "Codice doganale dell'Unione: cornice legale per i controlli, la gestione del rischio e la semplificazione degli scambi, con analisi del rischio basata su criteri comuni e scambio di informazioni.",
    "gap": "L'analisi del rischio UCC è costruita su dati dichiarativi e criteri di rischio statici; non prevede l'integrazione di segnali esterni in tempo reale (OSINT, sismica, clima, geopolitica) né la loro proiezione pre-arrival sulle spedizioni.",
    "customsImplication": "È il punto di aggancio normativo del progetto: Risk Sentinel estende il risk framework UCC con foresight multimodale pre-arrival (7-30 giorni)."
  },
  {
    "id": "eu-crmf-2024",
    "title": "Customs Risk Management Framework (CRMF)",
    "jurisdiction": "eu",
    "topic": "Enforcement doganale e gestione del rischio",
    "reference": "Commissione UE — Taxation and Customs Union",
    "url": "https://taxation-customs.ec.europa.eu/customs/customs-risk-management/customs-risk-management-framework-crmf_en",
    "riskCategories": [
      "customsEnforcement"
    ],
    "chokepoints": [],
    "summary": "Quadro strategico della Commissione per standardizzare l'approccio alla gestione del rischio doganale negli Stati membri.",
    "gap": "Il framework è organizzativo e strategico: non fornisce un'architettura tecnica di fusione multimodale né metriche operative di riduzione dei falsi positivi per i sistemi di early-warning.",
    "customsImplication": "Risk Sentinel implementa concretamente ciò che il CRMF enuncia: targeting di rete invece di screening transazionale, con priorità di enforcement misurabili."
  },
  {
    "id": "eu-nzia-2024-1735",
    "title": "Regulation (EU) 2024/1735 — Net-Zero Industry Act (NZIA)",
    "jurisdiction": "eu",
    "topic": "Energia, semiconduttori e catene net-zero",
    "reference": "Reg. (UE) 2024/1735, OJ L 2024/1735",
    "url": "https://eur-lex.europa.eu/eli/reg/2024/1735/oj",
    "riskCategories": [
      "energyPrices",
      "geopolitical",
      "logistic"
    ],
    "chokepoints": [
      "Suez",
      "Malacca",
      "Stretto di Taiwan"
    ],
    "summary": "Obiettivi di capacità produttiva interna per tecnologie net-zero (solare, eolico, batterie, elettrolizzatori) e criteri di resilienza nelle gare pubbliche.",
    "gap": "I criteri di resilienza valutano la dipendenza dalla Cina ma non modellano l'esposizione delle catene di fornitura ai chokepoint fisici né ai rischi logistici/climatici real-time dei componenti (semiconduttori HS 8542, batterie).",
    "customsImplication": "La verifica dell'origine reale e della rotta delle componenti strategiche passa dai codici HS: un matching HS↔commodity↔rotta è lo strumento di controllo naturale."
  },
  {
    "id": "eu-gas-storage-2022-1032",
    "title": "Regulation (EU) 2022/1032 — Gas storage (amended by Reg. (EU) 2024/1789)",
    "jurisdiction": "eu",
    "topic": "Prezzo dell'energia e sicurezza energetica",
    "reference": "Reg. (UE) 2022/1032, OJ L 173",
    "url": "https://eur-lex.europa.eu/eli/reg/2022/1032/oj",
    "riskCategories": [
      "energyPrices",
      "geopolitical"
    ],
    "chokepoints": [
      "Suez"
    ],
    "summary": "Obblighi di riempimento degli stoccaggi gas al 90% entro il 1° novembre e condivisione degli stoccaggi tra Stati membri.",
    "gap": "Il regolamento gestisce il livello degli stoccaggi ma non il rischio di interruzione dei flussi GNL via Suez/Bab el-Mandeb né la loro interazione con i prezzi delle commodity energetiche in tempo quasi-reale.",
    "customsImplication": "Monitorare i transiti di GNL e prodotti energetici ai chokepoint (HS 2711) anticipa le pressioni sui prezzi che il regolamento cerca di mitigare ex-post."
  },
  {
    "id": "eu-emergency-prices-2022-1854",
    "title": "Council Regulation (EU) 2022/1854 — Emergency intervention on high energy prices",
    "jurisdiction": "eu",
    "topic": "Prezzo dell'energia",
    "reference": "Reg. (UE) 2022/1854, OJ L 261I",
    "url": "https://eur-lex.europa.eu/eli/reg/2022/1854/oj",
    "riskCategories": [
      "energyPrices"
    ],
    "chokepoints": [],
    "summary": "Intervento d'emergenza sui prezzi elevati dell'energia: cap sui ricavi inframarginali, contributo di solidarietà, riduzione della domanda elettrica.",
    "gap": "Misure ex-post, attivate dopo che i prezzi hanno già colpito imprese e famiglie: nessun collegamento preventivo con segnali di hazard a monte (chokepoint, clima, geopolitica) che avrebbero potuto anticipare lo shock.",
    "customsImplication": "Un early-warning sui flussi energetici in transito consente di anticipare le condizioni che rendono necessarie misure d'emergenza."
  },
  {
    "id": "eu-mcm-2022-2578",
    "title": "Council Regulation (EU) 2022/2578 — Market correction mechanism (gas price cap)",
    "jurisdiction": "eu",
    "topic": "Prezzo dell'energia",
    "reference": "Reg. (UE) 2022/2578, OJ L 335",
    "url": "https://eur-lex.europa.eu/eli/reg/2022/2578/oj",
    "riskCategories": [
      "energyPrices"
    ],
    "chokepoints": [],
    "summary": "Meccanismo di correzione del mercato TTF (price cap) per limitare i picchi estremi del gas.",
    "gap": "Il cap si attiva su soglie di prezzo ex-post (3 giorni oltre 180 €/MWh); nessuna integrazione di segnali di rischio fisico (interruzioni di flusso, transiti) come trigger anticipato.",
    "customsImplication": "I transiti fisici di gas/LNG rilevati ai valichi doganali sono un segnale anticipato rispetto alla formazione del prezzo sul TTF."
  },
  {
    "id": "eu-fdi-2019-452",
    "title": "Regulation (EU) 2019/452 — FDI screening framework",
    "jurisdiction": "eu",
    "topic": "Sicurezza degli asset strategici (chokepoint e infrastrutture)",
    "reference": "Reg. (UE) 2019/452, OJ L 79I",
    "url": "https://eur-lex.europa.eu/eli/reg/2019/452/oj",
    "riskCategories": [
      "geopolitical"
    ],
    "chokepoints": [
      "Suez",
      "Stretto di Taiwan",
      "Malacca"
    ],
    "summary": "Quadro UE per lo screening degli investimenti esteri diretti su infrastrutture critiche, tecnologie critiche e forniture strategiche.",
    "gap": "Lo screening valuta l'investitore, non la vulnerabilità fisica dell'asset: nessun modello di esposizione dei porti/hub europei ai chokepoint esteri né dei nodi industriali (es. IMIP/Hsinchu) da cui dipendono le catene.",
    "customsImplication": "Il monitoraggio dei flussi in entrata da/verso nodi industriali esposti rafforza la valutazione di sicurezza dell'approvvigionamento."
  },
  {
    "id": "it-tuld-43-1973",
    "title": "DPR 43/1973 — Testo Unico delle disposizioni legislative in materia doganale (TULD)",
    "jurisdiction": "it",
    "topic": "Enforcement doganale nazionale",
    "reference": "D.P.R. 23 gennaio 1973, n. 43 (G.U. n. 80/1973)",
    "url": "https://www.gazzettaufficiale.it/eli/id/1973/03/28/073U0043/sg",
    "riskCategories": [
      "customsEnforcement"
    ],
    "chokepoints": [],
    "summary": "Testo unico nazionale delle disposizioni doganali: base storica del controllo doganale italiano.",
    "gap": "Fondato su un modello documentale e reattivo antecedente alla digitalizzazione e alla fusione multimodale: nessuna previsione di segnali di rischio esterni in tempo reale né di targeting di rete.",
    "customsImplication": "Il progetto si inserisce nella modernizzazione del TULD verso il paradigma UCC/CRMF con strumenti di foresight."
  },
  {
    "id": "it-golden-power-21-2012",
    "title": "D.L. 15 marzo 2012, n. 21 (conv. L. 56/2012) — Golden Power",
    "jurisdiction": "it",
    "topic": "Sicurezza degli asset strategici nazionali (energia, materie prime, porti)",
    "reference": "D.L. 21/2012, G.U. n. 63/2012",
    "url": "https://www.gazzettaufficiale.it/eli/id/2012/03/15/012G0035/sg",
    "riskCategories": [
      "geopolitical",
      "energyPrices",
      "rareEarths"
    ],
    "chokepoints": [
      "Suez",
      "Hormuz"
    ],
    "summary": "Poteri speciali dello Stato su asset strategici (difesa, energia, trasporti, comunicazioni, materie prime critiche) per operazioni societarie di rilevanza strategica.",
    "gap": "L'esercizio dei poteri speciali richiede la notifica dell'operazione: il rischio non viene monitorato in via continuativa — nessun early-warning su minacce esterne (chokepoint, sanzioni, dipendenze) agli asset già vigilati.",
    "customsImplication": "Il monitoraggio doganale dei flussi verso gli asset golden-power (es. raffinerie, hub energetici) è un complemento preventivo naturale del golden power."
  },
  {
    "id": "it-dl-21-2022-energia",
    "title": "D.L. 1 marzo 2022, n. 21 (conv. L. 51/2022) — Misure urgenti per l'energia",
    "jurisdiction": "it",
    "topic": "Prezzo dell'energia e dipendenze",
    "reference": "D.L. 21/2022, G.U. n. 51/2022",
    "url": "https://www.gazzettaufficiale.it/eli/id/2022/03/01/22G00029/sg",
    "riskCategories": [
      "energyPrices",
      "geopolitical"
    ],
    "chokepoints": [],
    "summary": "Pacchetto nazionale di emergenza energetica post-invasione Ucraina: accelerazione rinnovabili, semplificazioni, sostegno a famiglie/imprese.",
    "gap": "Reazione ex-post allo shock: nessun sistema di previsione delle pressioni sui prezzi dell'energia basato su segnali di hazard a monte (transiti gas, clima, geopolitica).",
    "customsImplication": "Le importazioni energetiche transitate in dogana (HS 2709-2711) sono la base dati per un indicatore anticipato di pressione sui prezzi."
  },
  {
    "id": "eu-climate-law-2021-1119",
    "title": "Regulation (EU) 2021/1119 — European Climate Law",
    "jurisdiction": "eu",
    "topic": "Rischio climatico e adattamento",
    "reference": "Reg. (UE) 2021/1119, OJ L 243",
    "url": "https://eur-lex.europa.eu/eli/reg/2021/1119/oj",
    "riskCategories": [
      "climate",
      "commodityPrices"
    ],
    "chokepoints": [
      "Panama",
      "Suez"
    ],
    "summary": "Neutralità climatica 2050, obiettivo -55% al 2030, obblighi di adattamento e di valutazione dei rischi climatici.",
    "gap": "Gli obblighi di adattamento non si traducono in un monitoraggio operativo dell'impatto degli estremi climatici sulle catene di approvvigionamento (es. siccità e restrizioni di pescaggio a Panama, eventi estremi sulle rotte).",
    "customsImplication": "Le anomalie nei flussi commerciali causate dal clima sono rilevabili ai valichi doganali prima che diventino shock di prezzo."
  }
];
