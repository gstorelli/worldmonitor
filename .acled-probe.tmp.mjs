import { readFileSync } from 'node:fs';
import YAML from 'yaml';

const json = JSON.parse(readFileSync('docs/api/AviationService.openapi.json', 'utf8'));
const yaml = YAML.parse(readFileSync('docs/api/AviationService.openapi.yaml', 'utf8'));

for (const [path, ops] of Object.entries(json.paths)) {
  for (const [method, op] of Object.entries(ops)) {
    if (!['get', 'post', 'put', 'delete'].includes(method)) continue;
    const jp = (op.parameters || []).map((p) => p.name);
    const yop = ((yaml.paths?.[path]?.[method]?.parameters) || []).map((p) => p.name);
    if (JSON.stringify(jp) !== JSON.stringify(yop)) {
      console.log(`${method.toUpperCase()} ${path}`);
      console.log(`  json: ${JSON.stringify(jp)}`);
      console.log(`  yaml: ${JSON.stringify(yop)}`);
    }
  }
}