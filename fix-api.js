const fs = require('fs');
const path = require('path');

const exceptionsPath = 'api/api-route-exceptions.json';
const data = JSON.parse(fs.readFileSync(exceptionsPath, 'utf8'));

const toRemove = new Set(['api/create-checkout.ts', 'api/customer-portal.ts', 'api/product-catalog.js']);
data.exceptions = data.exceptions.filter(e => !toRemove.has(e.path));

const newExceptions = [
  'api/customs/acled.js',
  'api/customs/classify.js',
  'api/customs/comtrade.js',
  'api/customs/gdelt.js',
  'api/customs/open-meteo.js',
  'api/customs/usgs.js',
  'api/n8n/ingest.js'
];

for (const p of newExceptions) {
  if (!data.exceptions.find(e => e.path === p)) {
    data.exceptions.push({
      path: p,
      category: "upstream-proxy",
      reason: "Customs/n8n direct integration endpoints.",
      owner: "@SebastienMelki",
      removal_issue: null
    });
  }
}

fs.writeFileSync(exceptionsPath, JSON.stringify(data, null, 2) + '\n', 'utf8');

const services = ['giving', 'imagery', 'market', 'prediction', 'research', 'webcam'];
for (const svc of services) {
  const SvcCamel = svc.charAt(0).toUpperCase() + svc.slice(1);
  const dir = `api/${svc}/v1`;
  fs.mkdirSync(dir, { recursive: true });
  const content = `export const config = { runtime: 'edge' };\n\nimport { createDomainGateway, serverOptions } from '../../../server/gateway';\nimport { create${SvcCamel}ServiceRoutes } from '../../../src/generated/server/worldmonitor/${svc}/v1/service_server';\nimport { ${svc}Handler } from '../../../server/worldmonitor/${svc}/v1/handler';\n\nexport default createDomainGateway(\n  create${SvcCamel}ServiceRoutes(${svc}Handler, serverOptions),\n);\n`;
  fs.writeFileSync(`${dir}/[rpc].ts`, content, 'utf8');
}
