// Edge-compatible ESM literal mirror (no node: built-ins, no JSON import attributes).
// Source of truth: data/zotero-sources.json
// Regenerate when the JSON changes; tests/api-data-mirrors.test.mjs enforces parity.
export default [
  {
    "ref": 1,
    "authors": "European Commission",
    "year": 2024,
    "title": "Customs Risk Management Framework (CRMF) — Taxation and Customs Union",
    "type": "institutional",
    "venue": "European Commission",
    "doi": null,
    "url": "https://taxation-customs.ec.europa.eu/customs/customs-risk-management/customs-risk-management-framework-crmf_en",
    "themeArea": "E",
    "summary": "Framework istituzionale UE che standardizza l'approccio alla gestione del rischio doganale europeo.",
    "limitation": "Quadro normativo/organizzativo, non tecnico: nessuna architettura di fusione multimodale né early-warning operativo.",
    "contribution": "Base normativa e istituzionale del progetto; ancora per la dimensione Customs Relevance e per la validazione ADM.",
    "dimensions": [
      "customsRelevance"
    ],
    "verified": true
  },
  {
    "ref": 2,
    "authors": "International Monetary Fund",
    "year": 2024,
    "title": "IMF PortWatch — Data & Methodology",
    "type": "institutional",
    "venue": "IMF",
    "doi": null,
    "url": "https://portwatch.imf.org/pages/data-and-methodology",
    "themeArea": "E",
    "summary": "Dati satellitari su 2065 porti e 28 chokepoint maggiori, incrociati con gli alert di disastro GDACS.",
    "limitation": "Dataset di riferimento, non un sistema di rischio: nessun early-warning AI né scoring doganale.",
    "contribution": "Fonte di riferimento per il monitoraggio di porti/chokepoint (Route Criticality, Geophysical/Climate).",
    "dimensions": [
      "routeCriticality",
      "geophysicalClimate"
    ],
    "verified": true
  },
  {
    "ref": 3,
    "authors": "Anderson, D.; Belcineanu, A. I.; Tzvetkova, M. (European Commission JRC)",
    "year": 2025,
    "title": "AI for border management and customs controls",
    "type": "report",
    "venue": "Publications Office of the European Union (EUR)",
    "doi": "10.2760/1286492",
    "url": "https://data.europa.eu/doi/10.2760/1286492",
    "themeArea": "A",
    "summary": "Antologia di 75 progetti UE finanziati 2015-2024 (~EUR 376M): fusione multi-sensore (radar, AIS, ottica, OSINT) e NLP documentale doganale; explainability come requisito emergente.",
    "limitation": "È una mappa, non una soluzione: i progetti restano prototipi, senza architetture di fusione multimodale unificate né segnali di hazard esterni in tempo reale.",
    "contribution": "Legittima il gap del progetto e la richiesta istituzionale di XAI per l'enforcement.",
    "dimensions": [
      "customsRelevance",
      "sourceConfidence"
    ],
    "verified": true
  },
  {
    "ref": 4,
    "authors": "n8n GmbH",
    "year": 2023,
    "title": "n8n: Workflow Automation Platform",
    "type": "software",
    "venue": "n8n GmbH",
    "doi": null,
    "url": "https://n8n.io",
    "themeArea": "E",
    "summary": "Piattaforma open-source di automazione workflow per l'orchestrazione di sorgenti eterogenee e servizi AI.",
    "limitation": "General-purpose: nessuna capacità doganale, nessuna Knowledge Graph integration, nessun reasoning LLM nativo.",
    "contribution": "Strato di orchestrazione agentica del progetto (pipeline di ingestione e notifiche, explainability audit trail).",
    "dimensions": [
      "sourceConfidence"
    ],
    "verified": true
  },
  {
    "ref": 5,
    "authors": "Key, R.; Parrado, R.; Delpiazzo, E.; King, R.; Bosello, F.",
    "year": 2024,
    "title": "Potential climate-induced impacts on trade: the case of agricultural commodities and maritime chokepoints",
    "type": "journal",
    "venue": "Journal of Shipping and Trade, 9(1):11",
    "doi": "10.1186/s41072-024-00170-3",
    "url": "https://jshippingandtrade.springeropen.com/articles/10.1186/s41072-024-00170-3",
    "themeArea": "B",
    "summary": "Modello logistico marittimo accoppiato a CGE per stimare impatti climatici su Panama, Suez e Stretti Turchi: perdite GDP fino a USD 34 miliardi (prezzi 2014) con effetti a cascata sull'UE.",
    "limitation": "Statico e scenario-based: nessun metodo AI/ML, nessun monitoraggio real-time, livello aggregato di flussi e non targeting a livello di spedizione.",
    "contribution": "Quantifica la cascata esposizione→perdita economica che motiva il foresight pre-arrival 7-30 giorni.",
    "dimensions": [
      "tradeExposure",
      "routeCriticality",
      "geophysicalClimate"
    ],
    "verified": true
  },
  {
    "ref": 6,
    "authors": "Lee, E.; Kim, S.; Kim, S.; Jung, S.; Kim, H.; Cha, M.",
    "year": 2023,
    "title": "Explainable Product Classification for Customs",
    "type": "preprint",
    "venue": "arXiv:2311.10922",
    "doi": "10.8080/1020220078265",
    "url": "https://arxiv.org/abs/2311.10922",
    "themeArea": "A",
    "summary": "Modello XAI a due stadi per la classificazione HS: 93.9% top-3 accuracy con evidence retrieval interpretabile dai manuali HS; esplora anche zero-shot LLM con spiegazioni.",
    "limitation": "Limiti dichiarati dagli autori: distribution shift, assenza di dati esterni real-time, nessuna capacità di early-warning.",
    "contribution": "Valida la fattibilità dell'XAI nella classificazione HS — il mattone della spiegabilità per i codici doganali.",
    "dimensions": [
      "customsRelevance"
    ],
    "verified": true
  },
  {
    "ref": 7,
    "authors": "Mai, T.-D.; Hoang, K.; Baigutanova, A.; Alina, G.; Kim, S.",
    "year": 2021,
    "title": "Customs Fraud Detection in the Presence of Concept Drift",
    "type": "preprint",
    "venue": "arXiv:2109.14155",
    "doi": null,
    "url": "https://arxiv.org/abs/2109.14155",
    "themeArea": "A",
    "summary": "Framework ADAPT: rilevamento frode doganale con concept drift (Earth Mover's Distance) come trigger di warning per pattern fraudolenti in evoluzione.",
    "limitation": "Opera solo su dati dichiarativi: nessuna fusione multimodale, nessuna XAI per operatori umani; cattura il 'quando' del drift ma non il 'perché' causale esterno.",
    "contribution": "Dimostra che l'adattamento continuo è necessario; motiva il monitoraggio del drift sulle nostre pipeline OSINT.",
    "dimensions": [
      "customsRelevance",
      "escalationMomentum"
    ],
    "verified": true
  },
  {
    "ref": 8,
    "authors": "Mercer, D. R.",
    "year": 2026,
    "title": "AI-Driven Risk Identification and Early-Warning Systems: A Cross-Domain Systematic Survey of Methods, Applications, and Trustworthiness",
    "type": "journal",
    "venue": "Annals of Applied Sciences, 7(1)",
    "doi": null,
    "url": "https://annalsofappliedsciences.com/index.php/aas/article/view/44",
    "themeArea": "D",
    "summary": "Survey sistematica cross-domain di 196 studi (2023-2026): pipeline concettuale unificata per early-warning AI, con fusione multi-sorgente, XAI (feature attribution, calibrazione) e graph learning per il contagio di rischio.",
    "limitation": "Omette il dominio doganale, nessuna valutazione empirica, identifica ma non risolve i problemi di affidabilità LLM in contesti ad alto rischio.",
    "contribution": "Fornisce la pipeline concettuale di riferimento per la nostra architettura di early-warning.",
    "dimensions": [
      "sourceConfidence",
      "escalationMomentum"
    ],
    "verified": true
  },
  {
    "ref": 9,
    "authors": "Novelli, C.; Taddeo, M.; Floridi, L.",
    "year": 2023,
    "title": "Accountability in artificial intelligence: what it is and how it works",
    "type": "journal",
    "venue": "AI & Society",
    "doi": "10.1007/s00146-023-01635-y",
    "url": "https://doi.org/10.1007/s00146-023-01635-y",
    "themeArea": "D",
    "summary": "Definisce l'accountability come relazione di 'answerability': architettura a 7 elementi (contesto, raggio, agente, foro, standard, processo, implicazioni) e 4 obiettivi (compliance, report, oversight, enforcement).",
    "limitation": "Concettuale: nessuna fusione multimodale, nessun early-warning real-time, nessuna sfida doganale specifica.",
    "contribution": "Spina dorsale di governance del progetto: ogni alert spiegabile e auditable (EU AI Act, GDPR).",
    "dimensions": [
      "customsRelevance"
    ],
    "verified": true
  },
  {
    "ref": 10,
    "authors": "OECD",
    "year": 2025,
    "title": "OECD Supply Chain Resilience Review: Navigating Risks",
    "type": "report",
    "venue": "OECD Publishing",
    "doi": null,
    "url": "https://www.oecd.org/en/publications/oecd-supply-chain-resilience-review_94e3a8ea-en.html",
    "themeArea": "B",
    "summary": "Quantifica vulnerabilità da dipendenze commerciali e cascate di disruption (COVID-19, guerra Russia-Ucraina, eventi Suez/Panama), integrando indici di rischio geopolitico da analisi news (OSINT) con flussi commerciali.",
    "limitation": "Metodi econometrici tradizionali, nessun monitoraggio real-time, livello macro-policy e non targeting doganale operativo.",
    "contribution": "Valida che le disruption ai chokepoint generano cascate globali rilevabili come pattern commerciali anomali.",
    "dimensions": [
      "tradeExposure",
      "routeCriticality"
    ],
    "verified": true
  },
  {
    "ref": 11,
    "authors": "Outram, M.; Swartz, P.",
    "year": 2026,
    "title": "Modern Border Management: Leveraging AI Systems for Strategic Advantage",
    "type": "journal",
    "venue": "World Customs Journal, 20(1)",
    "doi": "10.55596/001c.159458",
    "url": "https://www.worldcustomsjournal.org/article/159458-modern-border-management-leveraging-ai-systems-for-strategic-advantage",
    "themeArea": "A",
    "summary": "Visione strategica di border management AI basato sul loop OODA: mapping value-chain real-time, architetture federate multi-agenzia, explainability come requisito di primo livello; 'weaponization of economic interdependence'.",
    "limitation": "Strategico, non tecnico: nessuna metodologia di fusione multimodale, nessun dato hazard ambientale, nessuna valutazione quantitativa.",
    "contribution": "Fonte del paradigma 'networked targeting' e 'see beyond the border' del progetto.",
    "dimensions": [
      "customsRelevance",
      "tradeExposure"
    ],
    "verified": true
  },
  {
    "ref": 12,
    "authors": "Peffers, K.; Tuunanen, T.; Rothenberger, M. A.; Chatterjee, S.",
    "year": 2007,
    "title": "A Design Science Research Methodology for Information Systems Research",
    "type": "journal",
    "venue": "Journal of Management Information Systems, 24(3):45-77",
    "doi": "10.2753/MIS0742-1222240302",
    "url": "https://www.tandfonline.com/doi/full/10.2753/MIS0742-1222240302",
    "themeArea": "E",
    "summary": "DSRM: framework a 6 attività (identificazione problema, definizione obiettivi, design e sviluppo, dimostrazione, valutazione, comunicazione) per artefatti IS.",
    "limitation": "Metodologico: nessuna prescrizione tecnica di dominio.",
    "contribution": "Metodologia fondante della tesi, dal problema (falsi positivi, assenza di early-warning multimodale) alla valutazione dell'artefatto.",
    "dimensions": [],
    "verified": true
  },
  {
    "ref": 13,
    "authors": "van Maanen, N.; de Ruiter, M.; Jäger, W.; et al.",
    "year": 2025,
    "title": "Bridging science and practice on multi-hazard risk drivers: stakeholder insights from five pilot studies in Europe",
    "type": "journal",
    "venue": "Earth System Dynamics, 16(6):2295-2311",
    "doi": "10.5194/esd-16-2295-2025",
    "url": "https://esd.copernicus.org/articles/16/2295/2025/",
    "themeArea": "C",
    "summary": "Interviste a stakeholder in 5 regioni europee: il problema principale del multi-hazard non è ambientale ma burocratico — la frammentazione istituzionale crea feedback loop con impatti a cascata.",
    "limitation": "Focus su disaster risk, non doganale; nessun dato commerciale né illicit-trade.",
    "contribution": "Insight cruciale: l'efficacia del sistema dipende dal modellare anche la risposta istituzionale che mitiga o amplifica il rischio.",
    "dimensions": [
      "customsRelevance",
      "geophysicalClimate"
    ],
    "verified": true
  },
  {
    "ref": 14,
    "authors": "Verschuur, J.; Lumma, J.; Hall, J. W.",
    "year": 2025,
    "title": "Systemic impacts of disruptions at maritime chokepoints",
    "type": "journal",
    "venue": "Nature Communications, 16(1):10421",
    "doi": "10.1038/s41467-025-65403-w",
    "url": "https://www.nature.com/articles/s41467-025-65403-w",
    "themeArea": "B",
    "summary": "Framework multi-hazard quantitativo per i chokepoint marittimi: USD 192 miliardi/anno di commercio atteso interrotto (Stretto di Taiwan, Suez, Bab el-Mandeb), perdite USD 10.7 miliardi/anno + USD 3.4 miliardi di noli.",
    "limitation": "Retrospettivo e scenario-based: nessun monitoraggio real-time, nessun ML/LLM; dice 'quanto siamo esposti', non come rilevare una disruption in corso.",
    "contribution": "La prova quantitativa più forte che l'early-warning doganale deve incorporare segnali di hazard esterni.",
    "dimensions": [
      "tradeExposure",
      "routeCriticality",
      "eventSeverity"
    ],
    "verified": true
  },
  {
    "ref": 15,
    "authors": "Vijayakumar, S.",
    "year": 2025,
    "title": "Technology-centric and Data-Driven Customs Risk Management for Supply Chain Security",
    "type": "journal",
    "venue": "World Customs Journal, 19(1)",
    "doi": "10.55596/001c.131745",
    "url": "https://www.worldcustomsjournal.org/article/131745-technology-centric-and-data-driven-customs-risk-management-for-supply-chain-security",
    "themeArea": "A",
    "summary": "Benchmark dell'esperienza doganale indiana: anomaly detection ML, network analysis delle relazioni tra trader, NLP per la verifica delle dichiarazioni; necessità di XAI per decisioni sotto scrutinio legale.",
    "limitation": "Nessuna integrazione OSINT/weather/seismica real-time, nessuna fusione multimodale, approccio reattivo post-clearance.",
    "contribution": "Conferma la necessità di spiegabilità nelle decisioni di targeting sotto scrutinio legale.",
    "dimensions": [
      "customsRelevance",
      "sourceConfidence"
    ],
    "verified": true
  },
  {
    "ref": 16,
    "authors": "Ward, P. J.; Buijs, S. L.; Ciurean, R.; et al.",
    "year": 2026,
    "title": "Reducing risk together: moving towards a more holistic approach to multi-hazard and multi-risk assessment and management",
    "type": "journal",
    "venue": "Natural Hazards and Earth System Sciences, 26(3):1325-1345",
    "doi": "10.5194/nhess-26-1325-2026",
    "url": "https://nhess.copernicus.org/articles/26/1325/2026/",
    "themeArea": "C",
    "summary": "Sintesi del progetto MYRIAD-EU: 88% dei casi analizzati confonde terminologia e framework di multi-risk e multi-hazard; la fusione multi-hazard migliora significativamente l'accuratezza.",
    "limitation": "Nessun dominio doganale/commerciale; focus su disaster risk.",
    "contribution": "Impone definizioni rigorose di hazard vs risk e giustifica empiricamente la fusione multimodale (Risk = H×E×V).",
    "dimensions": [
      "eventSeverity",
      "geophysicalClimate"
    ],
    "verified": true
  },
  {
    "ref": 17,
    "authors": "Yadav, S.; Gajcin, J.; Miehling, E.; Daly, E.",
    "year": 2026,
    "title": "Who Sees the Risk? Stakeholder Conflicts and Explanatory Policies in LLM-based Risk Assessment",
    "type": "report",
    "venue": "IBM Research",
    "doi": null,
    "url": "https://research.ibm.com/publications/who-sees-the-risk-stakeholder-conflicts-and-explanatory-policies-in-llm-based-risk-assessment",
    "themeArea": "D",
    "summary": "Framework stakeholder-grounded: LLM come 'giudice' che predice e spiega i rischi da prospettive multiple, generando spiegazioni a livello di policy dove emergono accordi/divergenze.",
    "limitation": "Statico, solo tassonomie testuali di rischio, nessun dato multimodale real-time, nessun early-warning.",
    "contribution": "Blueprint metodologico per il nostro modulo di reasoning LLM multi-stakeholder.",
    "dimensions": [
      "customsRelevance",
      "sourceConfidence"
    ],
    "verified": true
  },
  {
    "ref": 18,
    "authors": "Zhou, J.; Zhang, Y.; Luo, Q.; Parker, A. G.; De Choudhury, M.",
    "year": 2023,
    "title": "Synthetic Lies: Understanding AI-Generated Misinformation and Evaluating Algorithmic and Human Solutions",
    "type": "conference",
    "venue": "CHI '23 (ACM), doi 10.1145/3544548.3581318",
    "doi": "10.1145/3544548.3581318",
    "url": "https://doi.org/10.1145/3544548.3581318",
    "themeArea": "D",
    "summary": "La misinformazione generata da LLM (GPT-3) mostra pattern linguistici distinti che la rendono più credibile del contenuto umano; i rilevatori esistenti degradano nettamente sul testo AI.",
    "limitation": "Solo testo, nessuna fusione multimodale, nessuna spiegabilità dei fallimenti di rilevamento.",
    "contribution": "Valida l'architettura neuro-simbolica con vincoli Knowledge-Graph e corroborazione multi-fonte contro l'OSINT sintetico.",
    "dimensions": [
      "sourceConfidence"
    ],
    "verified": true
  }
];
