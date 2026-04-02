export type CommodityCategory = 'dual-use' | 'critical-metals' | 'energy' | 'agrifood' | 'sanctioned';

export interface CustomsCommodity {
  id: string;
  name: string;
  category: CommodityCategory;
  hsCodePrefix: string;  // HS or TARIC chapter/code
  baselineRisk: number;  // 0-100 baseline vulnerability
  description: string;
}

export const SENSITIVE_COMMODITIES: CustomsCommodity[] = [
  {
    id: 'semiconductors',
    name: 'Advanced Semiconductors',
    category: 'dual-use',
    hsCodePrefix: '8541',
    baselineRisk: 85,
    description: 'Diodes, transistors, and semiconductor devices under strict tech-embargo monitoring.',
  },
  {
    id: 'processor-circuits',
    name: 'Electronic Integrated Circuits',
    category: 'dual-use',
    hsCodePrefix: '8542',
    baselineRisk: 90,
    description: 'Integrated circuits critical for military and high-tech applications.',
  },
  {
    id: 'lithium',
    name: 'Lithium Ores and Concentrates',
    category: 'critical-metals',
    hsCodePrefix: '2836.91',
    baselineRisk: 70,
    description: 'Strategic metal for battery production and electrification transition.',
  },
  {
    id: 'rare-earths',
    name: 'Rare-Earth Metals',
    category: 'critical-metals',
    hsCodePrefix: '2805.30',
    baselineRisk: 80,
    description: 'Scandium, yttrium and rare-earth metals essential for permanent magnets.',
  },
  {
    id: 'crude-oil',
    name: 'Petroleum Crude',
    category: 'energy',
    hsCodePrefix: '2709',
    baselineRisk: 60,
    description: 'Energy pillar currently subject to various international price caps and embargo paths.',
  },
  {
    id: 'lng',
    name: 'Liquefied Natural Gas',
    category: 'energy',
    hsCodePrefix: '2711.11',
    baselineRisk: 65,
    description: 'Critical heating and power grid commodity for European strategic reserves.',
  },
  {
    id: 'wheat',
    name: 'Wheat and Meslin',
    category: 'agrifood',
    hsCodePrefix: '1001',
    baselineRisk: 45,
    description: 'Food security staple heavily affected by Black Sea and Eastern European disruptions.',
  },
  {
    id: 'fertilizers',
    name: 'Mineral or Chemical Fertilizers',
    category: 'agrifood',
    hsCodePrefix: '3104',
    baselineRisk: 55,
    description: 'Potassic fertilizers crucial for agricultural yield sustainability.',
  }
];

export interface CriticalCustomsNode {
  id: string; // matches port or geographical ID
  type: 'entry_port' | 'chokepoint' | 'border_crossing';
  riskMultiplier: number;
}

export const CUSTOMS_STRATEGIC_NODES: CriticalCustomsNode[] = [
  { id: 'suez', type: 'chokepoint', riskMultiplier: 1.5 },
  { id: 'bosphorus', type: 'chokepoint', riskMultiplier: 1.3 },
  { id: 'rotterdam', type: 'entry_port', riskMultiplier: 1.2 },
  { id: 'gioia_tauro', type: 'entry_port', riskMultiplier: 1.4 },
  { id: 'trieste', type: 'entry_port', riskMultiplier: 1.1 },
  { id: 'algeciras', type: 'entry_port', riskMultiplier: 1.1 }
];
