const fs = require('fs');
const { execSync } = require('child_process');

// 1. Delete obsolete commercial files
const toDelete = [
  'src/components/CotPositioningPanel.ts',
  'src/components/EarningsCalendarPanel.ts',
  'src/components/ETFFlowsPanel.ts',
  'src/components/FearGreedPanel.ts',
  'src/components/FSIPanel.ts',
  'src/components/GulfEconomiesPanel.ts',
  'src/components/LiquidityShiftsPanel.ts',
  'src/components/MarketBreadthPanel.ts',
  'src/components/MarketPanel.ts',
  'src/components/PositioningPanel.ts',
  'src/components/StablecoinPanel.ts',
  'src/components/StockAnalysisPanel.ts',
  'src/components/StockBacktestPanel.ts',
  'src/components/TechEventsPanel.ts',
  'src/services/giving',
  'src/services/insider-transactions.ts',
  'src/services/market',
  'src/services/prediction',
  'src/services/research',
  'src/services/stock-analysis-history.ts',
  'src/services/stock-analysis.ts',
  'src/services/stock-backtest.ts'
];

for (const p of toDelete) {
  try { execSync(`rm -rf ${p}`); } catch(e) {}
}

// 2. Fix ImageryScene imports by changing them to `type ImageryScene = any;`
const mapFiles = [
  'src/components/DeckGLMap.ts',
  'src/components/GlobeMap.ts',
  'src/components/MapContainer.ts',
  'src/components/Map.ts',
  'src/services/imagery.ts'
];

for (const f of mapFiles) {
  if (fs.existsSync(f)) {
    let content = fs.readFileSync(f, 'utf8');
    content = content.replace(/import\s+type\s+\{\s*ImageryScene\s*\}\s+from\s+'[^']+';/g, 'export type ImageryScene = any;');
    content = content.replace(/import\s+\{\s*fetchImageryScenes\s*\}\s+from\s+'[^']+';/g, 'const fetchImageryScenes = async () => [];');
    fs.writeFileSync(f, content);
  }
}

// 3. Remove imports in data-loader.ts and country-intel.ts that point to missing modules
const cleanImports = (file) => {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  const filtered = lines.filter(line => {
    return !line.includes('/market') &&
           !line.includes('/prediction') &&
           !line.includes('/research') &&
           !line.includes('/giving') &&
           !line.includes('StockAnalysis') &&
           !line.includes('StockBacktest') &&
           !line.includes('MarketPanel') &&
           !line.includes('PositioningPanel') &&
           !line.includes('TechEventsPanel') &&
           !line.includes('StablecoinPanel') &&
           !line.includes('LiquidityShiftsPanel') &&
           !line.includes('EarningsCalendarPanel') &&
           !line.includes('ETFFlowsPanel') &&
           !line.includes('CotPositioningPanel') &&
           !line.includes('FearGreedPanel') &&
           !line.includes('MarketBreadthPanel') &&
           !line.includes('FSIPanel') &&
           !line.includes('GulfEconomiesPanel');
  });
  fs.writeFileSync(file, filtered.join('\n'));
};

cleanImports('src/app/data-loader.ts');
cleanImports('src/app/country-intel.ts');
cleanImports('src/config/panels.ts');
