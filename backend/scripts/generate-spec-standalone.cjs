// Standalone script to generate the full OpenAPI spec from the live backend modules.
// Run with: node scripts/generate-spec-standalone.cjs
// Output: ../frontend/openapi.json
// Requires: backend modules to be compiled (pnpm build / tsc)

'use strict';
require('reflect-metadata');

const path = require('path');
const fs = require('fs');

// Resolve project root (backend/)
const projectRoot = path.resolve(__dirname, '..');
process.chdir(projectRoot);

// ── Load app modules (same as src/index.ts) ────────────────────────────────
const { controllers, validators } = await import('./src/bootstrap/loadModules.js').then(m => 
  m.loadAppModules('spacedRepetition')
).catch(() => import('./build/bootstrap/loadModules.js').then(m => 
  m.loadAppModules('spacedRepetition')
));

// ── Import remaining dependencies ─────────────────────────────────────────
const { appConfig } = await import('./src/config/app.js').catch(() => 
  import('./build/config/app.js')
);
const { generateOpenAPISpec } = await import('./src/shared/functions/generateOpenApiSpec.js').catch(() =>
  import('./build/shared/functions/generateOpenApiSpec.js')
);
const { authorizationChecker } = await import('./src/shared/functions/authorizationChecker.js').catch(() =>
  import('./build/shared/functions/authorizationChecker.js')
);
const { currentUserChecker } = await import('./src/shared/functions/currentUserChecker.js').catch(() =>
  import('./build/shared/functions/currentUserChecker.js')
);
const { HttpErrorHandler } = await import('./src/shared/index.js').catch(() =>
  import('./build/shared/index.js')
);

// ── Build routing controllers options ─────────────────────────────────────
const moduleOptions = {
  controllers: controllers,
  middlewares: [HttpErrorHandler],
  routePrefix: appConfig.routePrefix,
  authorizationChecker: authorizationChecker,
  currentUserChecker: currentUserChecker,
  defaultErrorHandler: true,
  development: appConfig.isDevelopment,
  validation: true,
  cors: {
    origin: appConfig.origins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
  },
};

// ── Generate spec ──────────────────────────────────────────────────────────
console.log('Generating OpenAPI spec for module: spacedRepetition');
console.log('Controllers found:', controllers.map(c => c.name));

const spec = generateOpenAPISpec(moduleOptions, validators);

const outputPath = path.resolve(projectRoot, '../frontend/openapi.json');
fs.writeFileSync(outputPath, JSON.stringify(spec, null, 2));
console.log('✅ Written to:', outputPath);
console.log('Paths:', Object.keys(spec.paths || {}).length);
const srPaths = Object.keys(spec.paths || {}).filter(p => p.includes('spaced'));
console.log('Spaced repetition paths:', srPaths);