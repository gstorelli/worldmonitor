// Edge-compatible ESM literal mirror (no node: built-ins, no JSON import attributes).
// Source of truth: data/policy-registry.json
// Regenerate when the JSON changes; tests/api-data-mirrors.test.mjs enforces parity.
export default [
  {
    "id": "eu-reg-833-2014-energia-russa",
    "title": "Regolamento (UE) n. 833/2014 — misure restrittive (Russia): greggio, condensato e GNL (testo consolidato al 24/7/2026)",
    "jurisdiction": "eu",
    "topic": "Sanzioni e controlli all'export — energia",
    "reference": "Reg. (UE) 833/2014, CELEX 02014R0833-20260724 (artt. 3 quaterdecies e 3 novodecies bis); modifica M38: Reg. (UE) 2025/2033",
    "url": "https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=CELEX:02014R0833-20260724",
    "riskCategories": [
      "geopolitical",
      "energyPrices"
    ],
    "chokepoints": [],
    "summary": "Art. 3 quaterdecies: divieto su greggio e prodotti dell'Allegato XXV; condensato degli impianti di GNL (NC 2709 00 10) dal 1/1/2027; esenzione del greggio via oleodotto finché il Consiglio non decide. Art. 3 novodecies bis: GNL (NC 2711 11 00) vietato dal 25/4/2026; per i contratti di durata superiore a un anno conclusi prima del 17/6/2025 e non modificati, dal 1/1/2027.",
    "gap": "",
    "customsImplication": "Nel modello è un modulatore: un divieto per origine crea una differenza di trattamento tra origini, quindi un incentivo a dichiarare un'origine diversa (direzione, non entità). Vedi Cap. 3 §3.3.",
    "status": "verificata (T, 13/10/2026)",
    "role": "modulatore",
    "goods": [
      "2709",
      "2711"
    ],
    "thesisKey": "reg_833_consolidated_2026"
  },
  {
    "id": "eu-reg-2025-395-alluminio",
    "title": "Regolamento (UE) 2025/395 — alluminio russo (NC 7601) nell'Allegato XXI del Reg. 833/2014",
    "jurisdiction": "eu",
    "topic": "Sanzioni — metalli",
    "reference": "Reg. (UE) 2025/395, art. 1(9) (art. 3 decies, parr. 3cg e 3ch) e Allegato VI",
    "url": "http://data.europa.eu/eli/reg/2025/395/oj",
    "riskCategories": [
      "geopolitical",
      "commodityPrices"
    ],
    "chokepoints": [],
    "summary": "NC 7601 aggiunto all'Allegato XXI. Quota transitoria di 275.000 t dal 25/2/2025 al 26/2/2026; contratti conclusi prima del 25/2/2025 eseguibili dal 26/2/2026 al 31/12/2026, per al massimo 50.000 t.",
    "gap": "",
    "customsImplication": "Modulatore sul bene alluminio (NC 7601): differenza di trattamento per origine e scadenze della quota, Cap. 3 §3.3.",
    "status": "verificata (T, 13/10/2026)",
    "role": "modulatore",
    "goods": [
      "7601"
    ],
    "thesisKey": "reg_2025_395"
  },
  {
    "id": "eu-reg-2025-1227-fertilizzanti",
    "title": "Regolamento (UE) 2025/1227 — dazi su alcune merci originarie o esportate da Russia e Bielorussia, tra cui i fertilizzanti",
    "jurisdiction": "eu",
    "topic": "Dazi — fertilizzanti",
    "reference": "Reg. (UE) 2025/1227, art. 1, parr. 2-3, e Allegato II",
    "url": "http://data.europa.eu/eli/reg/2025/1227/oj",
    "riskCategories": [
      "geopolitical",
      "commodityPrices"
    ],
    "chokepoints": [],
    "summary": "Dal 1/7/2025 dazio del 6,5% più una parte specifica crescente: per i prodotti della voce 31.02 40, 60, 80 €/t e 315 €/t dal 1/7/2028; per le voci 31.05 indicate 45, 70, 95 e 430 €/t. Soglie cumulative di 2,7, 1,8 e 0,9 Mt, oltre le quali si applica l'importo massimo. Si applica alle merci originarie o esportate, direttamente o indirettamente, da Russia e Bielorussia.",
    "gap": "",
    "customsImplication": "Modulatore sulla catena dei fertilizzanti, prima catena del pilota di Bari: il dazio per origine e le soglie cumulative creano un incentivo a dichiarare un'origine diversa (direzione, non entità). Cap. 3 §3.3.",
    "status": "verificata (T, 13/10/2026)",
    "role": "modulatore",
    "goods": [
      "3102",
      "3105"
    ],
    "thesisKey": "reg_2025_1227"
  },
  {
    "id": "eu-reg-2021-2012-inox",
    "title": "Regolamento di esecuzione (UE) 2021/2012 — antidumping sui laminati piani a freddo di acciaio inossidabile da India e Indonesia",
    "jurisdiction": "eu",
    "topic": "Difesa commerciale — catena del nichel",
    "reference": "Reg. di esecuzione (UE) 2021/2012",
    "url": "http://data.europa.eu/eli/reg_impl/2021/2012/oj",
    "riskCategories": [
      "commodityPrices",
      "geopolitical"
    ],
    "chokepoints": [],
    "summary": "Dazio antidumping definitivo con scadenza il 19/11/2026. Secondo una fonte secondaria (SteelOrbis, 16/9/2026), a settembre 2026 è stato aperto un riesame in previsione della scadenza su richiesta di EUROFER; durante il riesame i dazi restano in vigore (Reg. (UE) 2016/1036, art. 11, par. 2). L'avviso di apertura in GU C è ancora da trovare.",
    "gap": "",
    "customsImplication": "Modulatore sui prodotti piani in acciaio inossidabile, a valle della catena del nichel trattata nel Cap. 3: l'esito del riesame cambia la differenza di trattamento tra origini.",
    "status": "in riesame (P + fonte secondaria; avviso in GU C da trovare)",
    "role": "modulatore",
    "goods": [],
    "thesisKey": "reg_2021_2012"
  },
  {
    "id": "eu-chpl-2024",
    "title": "Common High Priority Items List (versione di febbraio 2024)",
    "jurisdiction": "eu",
    "topic": "Controlli all'export e anti-elusione",
    "reference": "Commissione europea, elenco CHPL del 22/2/2024",
    "url": "https://finance.ec.europa.eu/publications/list-common-high-priority-items_en",
    "riskCategories": [
      "geopolitical"
    ],
    "chokepoints": [],
    "summary": "Le sottovoci HS 8542.31, 8542.32, 8542.33 e 8542.39 (circuiti integrati) sono nel Tier 1 dell'elenco degli articoli ad alta priorità contro l'elusione delle sanzioni.",
    "gap": "",
    "customsImplication": "Modulatore sul bene semiconduttori (HS 8542): i codici del Tier 1 sono quelli su cui l'elusione è considerata più rilevante. Cap. 3.",
    "status": "verificata (P)",
    "role": "modulatore",
    "goods": [
      "8542"
    ],
    "thesisKey": "chpl_2024"
  },
  {
    "id": "eu-cereali-russi-2024",
    "title": "Dazi più alti su cereali e prodotti derivati di Russia e Bielorussia (Consiglio, 30/5/2024)",
    "jurisdiction": "eu",
    "topic": "Dazi — cereali",
    "reference": "Comunicato del Consiglio del 30/5/2024; base giuridica indicata da TARIC: Reg. (UE) 2024/1652 (titolo non ancora verificato)",
    "url": "https://www.eeas.europa.eu/delegations/ukraine/council-sets-higher-tariffs-russian-and-belarusian-grain-products_en",
    "riskCategories": [
      "geopolitical",
      "commodityPrices"
    ],
    "chokepoints": [],
    "summary": "Il Consiglio ha fissato dazi più alti sui cereali e prodotti derivati di Russia e Bielorussia. Il testo del regolamento non è ancora stato letto: valgono solo le informazioni del comunicato.",
    "gap": "",
    "customsImplication": "Modulatore sulla catena del grano (HS 1001), prima catena del pilota di Bari insieme ai fertilizzanti. Cap. 3.",
    "status": "da verificare sul testo del regolamento (P: comunicato)",
    "role": "modulatore",
    "goods": [
      "1001"
    ],
    "thesisKey": "council_cereals_2024"
  },
  {
    "id": "wto-ds592-nichel-indonesia",
    "title": "OMC, controversia DS592 — Indonesia, misure sulle materie prime (divieto di export del minerale di nichel)",
    "jurisdiction": "wto",
    "topic": "Politica dei paesi produttori — nichel",
    "reference": "WTO DS592, rapporto del panel del 30/11/2022, appellato dall'Indonesia",
    "url": "https://www.wto.org/english/tratop_e/dispu_e/cases_e/ds592_e.htm",
    "riskCategories": [
      "commodityPrices",
      "geopolitical"
    ],
    "chokepoints": [],
    "summary": "Il panel ha dato torto all'Indonesia sul divieto di esportazione del minerale di nichel (rapporto del 30/11/2022); l'Indonesia ha presentato appello.",
    "gap": "",
    "customsImplication": "Modulatore di tipo 'politica del paese produttore' sulla catena del nichel. Cap. 3.",
    "status": "verificata (P)",
    "role": "modulatore",
    "goods": [
      "7502"
    ],
    "thesisKey": "wto_ds592"
  },
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
    "customsImplication": "Il controllo doganale è il punto di verifica naturale della diversificazione e della provenienza dichiarata; un sistema di early-warning per HS-code critici rafforzerebbe l'enforcement del CRMA.",
    "status": "verificata (P)",
    "role": "quadro",
    "goods": [],
    "thesisKey": "crma_2024"
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
    "customsImplication": "Ogni alert di Risk Sentinel deve essere spiegabile e auditable (fonti, dimensioni di rischio, confidenza) per soddisfare i requisiti AI Act nel contesto di enforcement.",
    "status": "da verificare",
    "role": "",
    "goods": [],
    "thesisKey": null
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
    "customsImplication": "È il punto di aggancio normativo del progetto: Risk Sentinel estende il risk framework UCC con foresight multimodale pre-arrival (7-30 giorni).",
    "status": "da verificare",
    "role": "",
    "goods": [],
    "thesisKey": null
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
    "customsImplication": "Risk Sentinel implementa concretamente ciò che il CRMF enuncia: targeting di rete invece di screening transazionale, con priorità di enforcement misurabili.",
    "status": "da verificare",
    "role": "",
    "goods": [],
    "thesisKey": null
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
    "customsImplication": "La verifica dell'origine reale e della rotta delle componenti strategiche passa dai codici HS: un matching HS↔commodity↔rotta è lo strumento di controllo naturale.",
    "status": "da verificare",
    "role": "",
    "goods": [],
    "thesisKey": null
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
    "customsImplication": "Monitorare i transiti di GNL e prodotti energetici ai chokepoint (HS 2711) anticipa le pressioni sui prezzi che il regolamento cerca di mitigare ex-post.",
    "status": "da verificare",
    "role": "",
    "goods": [],
    "thesisKey": null
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
    "customsImplication": "Un early-warning sui flussi energetici in transito consente di anticipare le condizioni che rendono necessarie misure d'emergenza.",
    "status": "da verificare: misura di emergenza del 2022, vigenza non controllata",
    "role": "",
    "goods": [],
    "thesisKey": null
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
    "customsImplication": "I transiti fisici di gas/LNG rilevati ai valichi doganali sono un segnale anticipato rispetto alla formazione del prezzo sul TTF.",
    "status": "da verificare: misura di emergenza del 2022, vigenza non controllata",
    "role": "",
    "goods": [],
    "thesisKey": null
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
    "customsImplication": "Il monitoraggio dei flussi in entrata da/verso nodi industriali esposti rafforza la valutazione di sicurezza dell'approvvigionamento.",
    "status": "da verificare",
    "role": "",
    "goods": [],
    "thesisKey": null
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
    "customsImplication": "Il progetto si inserisce nella modernizzazione del TULD verso il paradigma UCC/CRMF con strumenti di foresight.",
    "status": "da verificare: con il D.Lgs. 141/2024 le disposizioni nazionali complementari al CDU sono state riordinate; quali parti del TULD restino in vigore va controllato",
    "role": "",
    "goods": [],
    "thesisKey": null
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
    "customsImplication": "Il monitoraggio doganale dei flussi verso gli asset golden-power (es. raffinerie, hub energetici) è un complemento preventivo naturale del golden power.",
    "status": "da verificare",
    "role": "",
    "goods": [],
    "thesisKey": null
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
    "customsImplication": "Le importazioni energetiche transitate in dogana (HS 2709-2711) sono la base dati per un indicatore anticipato di pressione sui prezzi.",
    "status": "da verificare: misure urgenti del 2022, vigenza non controllata",
    "role": "",
    "goods": [],
    "thesisKey": null
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
    "customsImplication": "Le anomalie nei flussi commerciali causate dal clima sono rilevabili ai valichi doganali prima che diventino shock di prezzo.",
    "status": "da verificare",
    "role": "",
    "goods": [],
    "thesisKey": null
  }
];
