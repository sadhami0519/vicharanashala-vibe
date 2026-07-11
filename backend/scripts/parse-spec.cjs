const fs = require('fs');
const html = fs.readFileSync('extract-output.html', 'utf8');

const openapiIdx = html.indexOf('"openapi"');
if (openapiIdx === -1) { console.error('"openapi" not found'); process.exit(1); }

// Search 20000 chars back for the last '{' that starts the root spec object
const SEARCH_WINDOW = 20000;
const window = html.substring(Math.max(0, openapiIdx - SEARCH_WINDOW), openapiIdx);
const lastBrace = window.lastIndexOf('{');
const globalObjStart = openapiIdx - SEARCH_WINDOW + lastBrace;
console.log('globalObjStart:', globalObjStart, 'char:', JSON.stringify(html[globalObjStart]));

// Extract JSON by brace-counting from globalObjStart
let braceCount = 0, inString = false, escaped = false, objEnd = -1;
for (let i = globalObjStart; i < html.length; i++) {
  const ch = html[i];
  if (escaped) { escaped = false; continue; }
  if (ch === '\\' && inString) { escaped = true; continue; }
  if (ch === '"' && !escaped) { inString = !inString; continue; }
  if (inString) continue;
  if (ch === '{') braceCount++;
  else if (ch === '}') { braceCount--; if (braceCount === 0) { objEnd = i; break; } }
}

if (objEnd === -1) { console.error('Could not find closing brace'); process.exit(1); }
const specJson = html.substring(globalObjStart, objEnd + 1);
console.log('Spec JSON length:', specJson.length);

try {
  const spec = JSON.parse(specJson);
  console.log('Parsed OK');
  console.log('Paths:', Object.keys(spec.paths || {}).length);
  const srPaths = Object.keys(spec.paths || {}).filter(p => p.includes('spaced'));
  console.log('SR paths:', srPaths);

  // Write to openapi-augmented.json
  fs.writeFileSync('openapi-augmented.json', JSON.stringify(spec, null, 2));
  console.log('Written to openapi-augmented.json');
} catch(e) {
  console.log('Parse error:', e.message);
  const m = e.message.match(/position (\d+)/);
  if (m) {
    const pos = parseInt(m[1]);
    console.log('Context:', JSON.stringify(specJson.substring(Math.max(0,pos-100), pos+100)));
  }
}