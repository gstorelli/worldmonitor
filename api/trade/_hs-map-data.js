// Edge-compatible ESM literal mirror (no node: built-ins, no JSON import attributes).
// Source of truth: data/hs-commodity-map.json
// Regenerate when the JSON changes; tests/api-data-mirrors.test.mjs enforces parity.
export default [
  {
    "commodity": "Nickel",
    "strategicTier": 1,
    "hsCodes": [
      {
        "code": "7501",
        "label": "Matte e prodotti intermedi del nichel (sinters)"
      },
      {
        "code": "7502",
        "label": "Nichel greggio (non legato)"
      }
    ],
    "chokepointExposure": [
      "Suez",
      "Malacca",
      "Lombok/Sunda"
    ],
    "downstreamApplications": [
      "Acciaio inox",
      "Batterie EV (NMC)",
      "Superleghe aerospaziali"
    ],
    "keyIndustrialNodes": [
      "Morowali Industrial Park (IMIP, Indonesia)"
    ],
    "sources": [
      "UN Comtrade",
      "LME nickel",
      "CRMA Annex"
    ]
  },
  {
    "commodity": "Semiconduttori avanzati",
    "strategicTier": 1,
    "hsCodes": [
      {
        "code": "8541",
        "label": "Diodi, transistor e dispositivi a semiconduttore; LED"
      },
      {
        "code": "8542",
        "label": "Circuiti integrati elettronici (IC)"
      }
    ],
    "chokepointExposure": [
      "Stretto di Taiwan",
      "Malacca"
    ],
    "downstreamApplications": [
      "Fonderia TSMC",
      "AI acceleratori",
      "Automotive",
      "Difesa"
    ],
    "keyIndustrialNodes": [
      "Hsinchu Science Park (Taiwan)"
    ],
    "sources": [
      "UN Comtrade",
      "Taiwan customs stats",
      "NZIA Annex"
    ]
  },
  {
    "commodity": "Fertilizzanti",
    "strategicTier": 1,
    "hsCodes": [
      {
        "code": "3102",
        "label": "Concimi azotati (urea, nitrato ammonico)"
      },
      {
        "code": "3104",
        "label": "Concimi potassici"
      },
      {
        "code": "3105",
        "label": "Concimi composti NPK"
      }
    ],
    "chokepointExposure": [
      "Suez",
      "Hormuz",
      "Baltico"
    ],
    "downstreamApplications": [
      "Sicurezza alimentare",
      "Cereali (grano, mais, riso)"
    ],
    "keyIndustrialNodes": [
      "Cluster urea Golfo Persico",
      "Potash Bielorussia/Russia"
    ],
    "sources": [
      "UN Comtrade",
      "FAO FPMA",
      "World Bank pink sheet"
    ]
  },
  {
    "commodity": "Petrolio e GNL",
    "strategicTier": 1,
    "hsCodes": [
      {
        "code": "2709",
        "label": "Oli greggi di petrolio"
      },
      {
        "code": "2710",
        "label": "Prodotti raffinati (benzina, diesel, jet)"
      },
      {
        "code": "2711",
        "label": "Gas naturale liquefatto (GNL) e GPL"
      }
    ],
    "chokepointExposure": [
      "Hormuz",
      "Suez",
      "Bab el-Mandeb",
      "Malacca"
    ],
    "downstreamApplications": [
      "Trasporti",
      "Petrolchimica",
      "Generazione elettrica"
    ],
    "keyIndustrialNodes": [
      "Raffinerie Golfo Persico",
      "Terminal GNL mediterranei"
    ],
    "sources": [
      "UN Comtrade",
      "EIA",
      "JODI"
    ]
  },
  {
    "commodity": "Terre rare e critical raw materials",
    "strategicTier": 1,
    "hsCodes": [
      {
        "code": "2805",
        "label": "Metalli alcalini/alcalino-terrosi; terre rare, scandio e ittrio"
      },
      {
        "code": "2846",
        "label": "Composti di terre rare"
      },
      {
        "code": "8103",
        "label": "Tantalio"
      },
      {
        "code": "8112",
        "label": "Metalli minori (germanio, gallio, indio, niobio)"
      }
    ],
    "chokepointExposure": [
      "Stretto di Taiwan",
      "Malacca",
      "Suez"
    ],
    "downstreamApplications": [
      "Magneti permanenti",
      "Catalizzatori",
      "Ottica/elettronica",
      "Difesa"
    ],
    "keyIndustrialNodes": [
      "Impianti di separazione REE (Cina)",
      "Raffinazione gallio/germanio (Cina)"
    ],
    "sources": [
      "UN Comtrade",
      "CRMA Annex I/II",
      "USGS Mineral Commodity Summaries"
    ]
  },
  {
    "commodity": "Cereali",
    "strategicTier": 2,
    "hsCodes": [
      {
        "code": "1001",
        "label": "Frumento e segale"
      },
      {
        "code": "1005",
        "label": "Mais"
      },
      {
        "code": "1006",
        "label": "Riso"
      }
    ],
    "chokepointExposure": [
      "Suez",
      "Bosforo/Dardanelli"
    ],
    "downstreamApplications": [
      "Sicurezza alimentare",
      "Mangimi",
      "Bioetanolo"
    ],
    "keyIndustrialNodes": [
      "Corridoio granario Mar Nero"
    ],
    "sources": [
      "UN Comtrade",
      "FAO AMIS"
    ]
  },
  {
    "commodity": "Alluminio",
    "strategicTier": 2,
    "hsCodes": [
      {
        "code": "7601",
        "label": "Alluminio greggio"
      },
      {
        "code": "7606",
        "label": "Lamiere e nastri di alluminio"
      }
    ],
    "chokepointExposure": [
      "Suez",
      "Hormuz"
    ],
    "downstreamApplications": [
      "Trasporti",
      "Imballaggio",
      "Energia (conduttori)"
    ],
    "keyIndustrialNodes": [
      "Smelter Golfo Persico (Alba, EGA)"
    ],
    "sources": [
      "UN Comtrade",
      "LME aluminium"
    ]
  },
  {
    "commodity": "Rame",
    "strategicTier": 2,
    "hsCodes": [
      {
        "code": "7403",
        "label": "Rame raffinato e leghe di rame"
      },
      {
        "code": "2603",
        "label": "Minerali e concentrati di rame"
      }
    ],
    "chokepointExposure": [
      "Panama",
      "Suez"
    ],
    "downstreamApplications": [
      "Elettrificazione",
      "Reti",
      "EV"
    ],
    "keyIndustrialNodes": [
      "Smelter cinesi",
      "Miniera Escondida (Cile)"
    ],
    "sources": [
      "UN Comtrade",
      "LME copper"
    ]
  }
];
