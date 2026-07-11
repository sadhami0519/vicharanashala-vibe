// Builds a complete augmented openapi.json with spaced-repetition endpoints
// Reads extract-output.html (the Scalar reference page), extracts the spec object,
// adds the missing component schemas, and writes openapi-augmented.json

const fs = require('fs');
const path = require('path');

const html = fs.readFileSync('extract-output.html', 'utf8');

// ── 1. Find the spec object ───────────────────────────────────────────────
// Strategy: Find "paths" in the HTML, back up to the nearest '{' that starts the
// root spec object, then parse forward using brace-counting.
//
// The spec object structure is:
// { "components": { "schemas": { ... } } }, "info": { ... }, "openapi": "3.0.3", "paths": { ... } }
//
// The key insight: "openapi" and "info" are NOT the first keys in the root object.
// The root object starts much earlier (with "components"). So we back up from "paths"
// far enough to reliably hit the root '{'.

const openapiIdx = html.indexOf('"openapi"');
if (openapiIdx === -1) { console.error('"openapi" not found'); process.exit(1); }

// Search 5000 chars before "openapi" for the last '{' that's the root spec opener
const nearOpenapi = html.substring(Math.max(0, openapiIdx - 5000), openapiIdx);
const lastBraceBeforeOpenapi = nearOpenapi.lastIndexOf('{');
const globalObjStart = openapiIdx - 5000 + lastBraceBeforeOpenapi;
console.log('Spec object starts at global index:', globalObjStart);
console.log('Char at start:', JSON.stringify(html[globalObjStart]));

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

let spec;
try {
  spec = JSON.parse(specJson);
} catch (e) {
  console.error('JSON parse failed:', e.message);
  // Try to find error position
  const m = e.message.match(/position (\d+)/);
  if (m) {
    const pos = parseInt(m[1]);
    console.error('Context around error:', specJson.substring(Math.max(0,pos-80), pos+80));
  }
  process.exit(1);
}

console.log('✅ Spec parsed. Paths:', Object.keys(spec.paths || {}).length);
console.log('OpenAPI:', spec.openapi);

// ── 2. Add missing component schemas ─────────────────────────────────────
const ReviewItemResponse = {
  type: 'object',
  properties: {
    _id: { type: 'string', description: 'Review item ID' },
    student_id: { type: 'string', description: 'Student ID' },
    course_id: { type: 'string', description: 'Course ID' },
    question_id: { type: 'string', description: 'Question ID' },
    n: { type: 'integer', description: 'Consecutive correct review count' },
    EF: { type: 'number', description: 'Easiness factor (min 1.3)' },
    interval_days: { type: 'integer', description: 'Current interval in days' },
    next_review_at: { type: 'string', format: 'date-time', description: 'ISO datetime of next review' },
    last_reviewed_at: { type: 'string', format: 'date-time', nullable: true, description: 'ISO datetime of last review, null if never reviewed' },
    notification_opt_out: { type: 'boolean', description: 'Whether notifications are opted out for this item' },
  },
  required: ['_id', 'student_id', 'course_id', 'question_id', 'n', 'EF', 'interval_days', 'next_review_at', 'last_reviewed_at', 'notification_opt_out'],
};

const CourseRetentionResponse = {
  type: 'object',
  properties: {
    courseId: { type: 'string', description: 'Course ID' },
    totalItems: { type: 'integer', description: 'Total review items for this course' },
    overdueCount: { type: 'integer', description: 'Number of items past their next_review_at' },
    dueSoonCount: { type: 'integer', description: 'Number of items due within 24 hours' },
    averageEF: { type: 'number', description: 'Average easiness factor across all items' },
    items: {
      type: 'array',
      items: { '$ref': '#/components/schemas/ReviewItemResponse' },
    },
  },
  required: ['courseId', 'totalItems', 'overdueCount', 'dueSoonCount', 'averageEF', 'items'],
};

const StudentIdParam = {
  type: 'object',
  properties: {
    studentId: { type: 'string', minLength: 1 },
  },
  required: ['studentId'],
};

const StudentCourseParams = {
  type: 'object',
  properties: {
    studentId: { type: 'string', minLength: 1 },
    courseId: { type: 'string', minLength: 1 },
  },
  required: ['studentId', 'courseId'],
};

// Add schemas to components
if (!spec.components) spec.components = {};
if (!spec.components.schemas) spec.components.schemas = {};
Object.assign(spec.components.schemas, {
  ReviewItemResponse,
  CourseRetentionResponse,
  StudentIdParam,
  StudentCourseParams,
});
console.log('✅ Added component schemas');

// ── 3. Add/update Spaced Repetition tag ───────────────────────────────────
const spacedRepTag = { name: 'Spaced Repetition', description: 'Spaced repetition SM-2 endpoints' };
if (!spec.tags) spec.tags = [];
const srTagIdx = spec.tags.findIndex(t => t.name === 'Spaced Repetition');
if (srTagIdx >= 0) spec.tags[srTagIdx] = spacedRepTag;
else spec.tags.push(spacedRepTag);

// Add to x-tagGroups
if (spec['x-tagGroups']) {
  const srGroup = spec['x-tagGroups'].find(g => g.name === 'Spaced Repetition');
  if (!srGroup) spec['x-tagGroups'].push({ name: 'Spaced Repetition', tags: ['Spaced Repetition'] });
}

// ── 4. Add path entries ───────────────────────────────────────────────────
const spacedRepPaths = {
  '/api/spaced-repetition/{studentId}/seed': {
    post: {
      operationId: 'SpacedRepetitionController.seedSchedule',
      parameters: [{ in: 'path', name: 'studentId', required: true, schema: { type: 'string', minLength: 1 } }],
      requestBody: {
        content: { 'application/json': { schema: { '$ref': '#/components/schemas/SeedScheduleBody' } } },
        description: 'SeedScheduleBody',
        required: false,
      },
      responses: {
        201: { content: { 'application/json': { schema: { '$ref': '#/components/schemas/SeedScheduleResponse' } } }, description: 'Number of review items seeded' },
      },
      summary: 'Seed a spaced repetition schedule',
      tags: ['Spaced Repetition'],
      description: 'Creates one ReviewItem per question for a student on course completion.\n    Called by the course completion hook with the full list of question IDs\n    from the completed course\'s question bank.',
    },
  },
  '/api/spaced-repetition/{studentId}/review': {
    post: {
      operationId: 'SpacedRepetitionController.submitReview',
      parameters: [{ in: 'path', name: 'studentId', required: true, schema: { type: 'string', minLength: 1 } }],
      requestBody: {
        content: { 'application/json': { schema: { '$ref': '#/components/schemas/SubmitReviewBody' } } },
        description: 'SubmitReviewBody',
        required: false,
      },
      responses: {
        200: { content: { 'application/json': { schema: { '$ref': '#/components/schemas/ReviewItemResponse' } } }, description: 'Updated ReviewItem after SM-2 recalculation' },
      },
      summary: 'Submit a review response',
      tags: ['Spaced Repetition'],
      description: 'Processes a student\'s recall quality response for a single question.\n    Runs the SM-2 algorithm and persists the updated state and next review date.\n    Returns the updated ReviewItem.',
    },
  },
  '/api/spaced-repetition/{studentId}/schedule': {
    get: {
      operationId: 'SpacedRepetitionController.getSchedule',
      parameters: [{ in: 'path', name: 'studentId', required: true, schema: { type: 'string', minLength: 1 } }],
      responses: {
        200: { content: { 'application/json': { schema: { type: 'array', items: { '$ref': '#/components/schemas/ReviewItemResponse' } } } }, description: 'All ReviewItems for the student' },
      },
      summary: 'Get full review schedule for a student',
      tags: ['Spaced Repetition'],
      description: 'Returns all ReviewItems for a student across all completed courses.\n    Used by the student dashboard to display upcoming review sessions.',
    },
  },
  '/api/spaced-repetition/{studentId}/course/{courseId}': {
    get: {
      operationId: 'SpacedRepetitionController.getCourseRetention',
      parameters: [
        { in: 'path', name: 'studentId', required: true, schema: { type: 'string', minLength: 1 } },
        { in: 'path', name: 'courseId', required: true, schema: { type: 'string', minLength: 1 } },
      ],
      responses: {
        200: { content: { 'application/json': { schema: { '$ref': '#/components/schemas/CourseRetentionResponse' } } }, description: 'Course retention summary and items' },
      },
      summary: 'Get retention health for a course',
      tags: ['Spaced Repetition'],
      description: 'Returns all ReviewItems for a student within a specific course,\n    along with a computed retention health summary — overdue count, due-soon count,\n    and average easiness factor.',
    },
  },
  '/api/spaced-repetition/{studentId}/notifications': {
    patch: {
      operationId: 'SpacedRepetitionController.updateNotificationPreference',
      parameters: [{ in: 'path', name: 'studentId', required: true, schema: { type: 'string', minLength: 1 } }],
      requestBody: {
        content: { 'application/json': { schema: { '$ref': '#/components/schemas/UpdateOptOutBody' } } },
        description: 'UpdateOptOutBody',
        required: false,
      },
      responses: {
        200: { content: { 'application/json': { schema: { '$ref': '#/components/schemas/UpdateOptOutResponse' } } }, description: 'Number of items updated' },
      },
      summary: 'Update notification preferences',
      tags: ['Spaced Repetition'],
      description: 'Toggles notification opt-out for all ReviewItems belonging to\n    a student in a given course. When opted out, the cron job skips sending\n    notifications but SM-2 state still updates on review.',
    },
  },
};

// Add paths to spec (merge to avoid overwriting existing)
if (!spec.paths) spec.paths = {};
Object.assign(spec.paths, spacedRepPaths);
console.log('✅ Added 5 spaced-repetition paths');

// ── 5. Write augmented spec ────────────────────────────────────────────────
fs.writeFileSync('openapi-augmented.json', JSON.stringify(spec, null, 2));
console.log('✅ Written to openapi-augmented.json');
console.log('Total paths:', Object.keys(spec.paths).length);

// Verify our paths are present
const srInSpec = Object.keys(spec.paths).filter(p => p.includes('spaced-repetition'));
console.log('SR paths in spec:', srInSpec);