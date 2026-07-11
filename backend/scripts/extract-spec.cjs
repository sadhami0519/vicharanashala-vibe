// Extract OpenAPI spec from Scalar reference HTML
const fs = require('fs');

const content = fs.readFileSync('extract-output.html', 'utf8');
console.log('File size:', content.length);

// Find "openapi" key to locate the spec object
const openapiIdx = content.indexOf('"openapi"');
if (openapiIdx === -1) { console.log('No openapi key found'); process.exit(1); }

// Back up to find the start of the object (variable assignment or object literal)
const startSearch = Math.max(0, openapiIdx - 500);
const beforeOpenapi = content.substring(startSearch, openapiIdx);
const varMatch = beforeOpenapi.match(/(\w+)\s*=\s*$/);
const objStart = varMatch ? startSearch + beforeOpenapi.indexOf(varMatch[0]) + varMatch[0].length - 1 : openapiIdx - 1;
console.log('Spec object starts around index:', objStart, '→ char:', content[objStart]);

// Find the closing semicolon by counting braces
let braceCount = 0;
let inString = false;
let escaped = false;
let specEnd = -1;

for (let i = objStart; i < content.length; i++) {
  const ch = content[i];
  if (escaped) { escaped = false; continue; }
  if (ch === '\\' && inString) { escaped = true; continue; }
  if (ch === '"') { inString = !inString; continue; }
  if (inString) continue;
  if (ch === '{') { braceCount++; }
  else if (ch === '}') {
    braceCount--;
    if (braceCount === 0) { specEnd = i; break; }
  }
}

if (specEnd === -1) { console.log('Could not find closing brace'); process.exit(1); }

const specJson = content.substring(objStart, specEnd + 1);
console.log('Spec JSON length:', specJson.length);

// Validate it's valid JSON and check paths
try {
  const spec = JSON.parse(specJson);
  console.log('✅ Valid JSON');
  console.log('OpenAPI version:', spec.openapi);
  console.log('Path count:', Object.keys(spec.paths || {}).length);
  const srPaths = Object.keys(spec.paths || {}).filter(p => p.includes('spaced'));
  console.log('Spaced-repetition paths:', srPaths.length ? srPaths : 'NONE FOUND');
  
  fs.writeFileSync('openapi-extracted.json', JSON.stringify(spec, null, 2));
  console.log('✅ Written to openapi-extracted.json');
} catch (e) {
  console.log('❌ JSON parse error:', e.message);
  // Try to find the error location
  const errMatch = e.message.match(/at position (\d+)/);
  if (errMatch) {
    const pos = parseInt(errMatch[1]);
    console.log('Error context:', specJson.substring(Math.max(0, pos-50), pos+50));
  }
}