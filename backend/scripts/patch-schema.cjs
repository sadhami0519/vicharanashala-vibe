const fs = require('fs');
const path = require('path');

const schemaPath = path.resolve(__dirname, '../frontend/src/types/schema.ts');
let content = fs.readFileSync(schemaPath, 'utf8');

console.log('File size:', content.length);

// ── 1. Locate key sections ─────────────────────────────────────────────────
// Find the components.schemas section (inside the `components` type alias)
// Format: components["schemas"]["SomeSchema"]
const compIdx = content.indexOf('components["schemas"]');
console.log('components[\\"schemas\\"] at:', compIdx);

// ── 2. Find the end of the operations interface ────────────────────────────
// The last `}` in the file closes the operations interface
// Let's find the closing of the `components` type alias
// components["schemas"]["X"]; - each entry ends with `;`
// We need to find the last schema entry and insert after it

// The components type is: type components = { schemas: { ... } }
// It's a TypeScript type alias with inline object.
// Let's find where the schemas object ends (before the securitySchemes)

// Pattern: last schema entry ends with: };  (then securitySchemes follows)
const securityIdx = content.lastIndexOf('securitySchemes');
console.log('securitySchemes at:', securityIdx);

// Find the last `};` before securitySchemes
let lastSchemaEnd = securityIdx;
while (content.substring(lastSchemaEnd - 2, lastSchemaEnd) !== '};') lastSchemaEnd--;
console.log('Last schema ends at:', lastSchemaEnd, '->', JSON.stringify(content.substring(lastSchemaEnd - 3, lastSchemaEnd + 5)));

// ── 3. Find the end of the paths interface ────────────────────────────────
// The paths interface closes with `}`. The last path item is the last one
// before that closing brace. We need to find the paths interface closing `}`
// Look for the final `}` of the paths interface
// Since paths uses `;` as terminator between entries, the final `}` closes the interface

// Let me find the last path entry: the one that ends with UserNotFoundErrorResponse
const lastResponseIdx = content.lastIndexOf('components["schemas"]["UserNotFoundErrorResponse"]');
console.log('Last path entry marker at:', lastResponseIdx);

// Walk forward from lastResponseIdx to find the end of this path entry
let pathEnd = lastResponseIdx + 'components["schemas"]["UserNotFoundErrorResponse"]'.length;
let braceCount = 0, started = false;
for (let i = lastResponseIdx; i < content.length; i++) {
  const ch = content[i];
  if (ch === '{') { braceCount++; started = true; }
  else if (ch === '}') { braceCount--; if (started && braceCount === 0) { pathEnd = i + 1; break; } }
}
console.log('Last path entry ends at:', pathEnd, '->', JSON.stringify(content.substring(pathEnd - 20, pathEnd + 10)));

// ── 4. Build SR operation entries (for the operations interface) ────────────
const srOperations = `
    "SpacedRepetitionController.seedSchedule": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                studentId: string;
            };
            cookie?: never;
        };
        /** @description SeedScheduleBody */
        requestBody?: {
            content: {
                "application/json": components["schemas"]["SeedScheduleBody"];
            };
        };
        responses: {
            /** @description Number of review items seeded */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SeedScheduleResponse"];
                };
            };
        };
    };
    "SpacedRepetitionController.submitReview": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                studentId: string;
            };
            cookie?: never;
        };
        /** @description SubmitReviewBody */
        requestBody?: {
            content: {
                "application/json": components["schemas"]["SubmitReviewBody"];
            };
        };
        responses: {
            /** @description Updated ReviewItem after SM-2 recalculation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReviewItemResponse"];
                };
            };
        };
    };
    "SpacedRepetitionController.getSchedule": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                studentId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description All ReviewItems for the student */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: components["schemas"]["ReviewItemResponse"];
                        type: "array";
                    };
                };
            };
        };
    };
    "SpacedRepetitionController.getCourseRetention": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                studentId: string;
                courseId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Course retention summary and items */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CourseRetentionResponse"];
                };
            };
        };
    };
    "SpacedRepetitionController.updateNotificationPreference": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                studentId: string;
            };
            cookie?: never;
        };
        /** @description UpdateOptOutBody */
        requestBody?: {
            content: {
                "application/json": components["schemas"]["UpdateOptOutBody"];
            };
        };
        responses: {
            /** @description Number of items updated */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UpdateOptOutResponse"];
                };
            };
        };
    };`;

// ── 5. Build SR path entries ───────────────────────────────────────────────
const srPaths = `
    "/api/spaced-repetition/{studentId}/seed": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                studentId: string;
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Seed a spaced repetition schedule */
        post: operations["SpacedRepetitionController.seedSchedule"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/spaced-repetition/{studentId}/review": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                studentId: string;
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Submit a review response */
        post: operations["SpacedRepetitionController.submitReview"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/spaced-repetition/{studentId}/schedule": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                studentId: string;
            };
            cookie?: never;
        };
        /** @description Get full review schedule for a student */
        get: operations["SpacedRepetitionController.getSchedule"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/spaced-repetition/{studentId}/course/{courseId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                studentId: string;
                courseId: string;
            };
            cookie?: never;
        };
        /** @description Get retention health for a course */
        get: operations["SpacedRepetitionController.getCourseRetention"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/spaced-repetition/{studentId}/notifications": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                studentId: string;
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** @description Update notification preferences */
        patch: operations["SpacedRepetitionController.updateNotificationPreference"];
        trace?: never;
    };`;

// ── 6. Build SR component schema entries ───────────────────────────────────
const srSchemas = `
            ReviewItemResponse: {
                _id: string;
                student_id: string;
                course_id: string;
                question_id: string;
                n: number;
                EF: number;
                interval_days: number;
                next_review_at: string;
                last_reviewed_at: string | null;
                notification_opt_out: boolean;
            };
            CourseRetentionResponse: {
                courseId: string;
                totalItems: number;
                overdueCount: number;
                dueSoonCount: number;
                averageEF: number;
                items: {
                    _id: string;
                    student_id: string;
                    course_id: string;
                    question_id: string;
                    n: number;
                    EF: number;
                    interval_days: number;
                    next_review_at: string;
                    last_reviewed_at: string | null;
                    notification_opt_out: boolean;
                }[];
            };`;

// ── 7. Insert paths before final paths `}` ─────────────────────────────────
let insertAtPaths = pathEnd;
let beforeInsert = content.substring(0, insertAtPaths);
let afterInsert = content.substring(insertAtPaths);
let newContent = beforeInsert + srPaths + '\n' + afterInsert;

// ── 8. Insert schemas before securitySchemes in new content ────────────────
let newCompIdx = newContent.indexOf('securitySchemes');
// Find the last `};` before securitySchemes
let schemaInsEnd = newCompIdx;
while (newContent.substring(schemaInsEnd - 2, schemaInsEnd) !== '};') schemaInsEnd--;
console.log('Schema insert before:', schemaInsEnd, '->', JSON.stringify(newContent.substring(schemaInsEnd - 3, schemaInsEnd + 5)));

let beforeSchema = newContent.substring(0, schemaInsEnd);
let afterSchema = newContent.substring(schemaInsEnd);
let finalContent = beforeSchema + srSchemas + '\n            ' + afterSchema;

// ── 9. Write ───────────────────────────────────────────────────────────────
fs.writeFileSync(schemaPath, finalContent);
console.log('✅ Patched schema.ts. New size:', finalContent.length);

// Verify
const verify = fs.readFileSync(schemaPath, 'utf8');
console.log('spaced-repetition count:', (verify.match(/spaced-repetition/g) || []).length);
console.log('ReviewItemResponse present:', verify.includes('ReviewItemResponse'));
console.log('CourseRetentionResponse present:', verify.includes('CourseRetentionResponse'));
console.log('SeedScheduleBody present:', verify.includes('SeedScheduleBody'));
console.log('SubmitReviewBody present:', verify.includes('SubmitReviewBody'));
console.log('UpdateOptOutBody present:', verify.includes('UpdateOptOutBody'));
console.log('SeedScheduleResponse present:', verify.includes('SeedScheduleResponse'));
console.log('UpdateOptOutResponse present:', verify.includes('UpdateOptOutResponse'));
console.log('SpacedRepetitionController.seedSchedule present:', verify.includes('SpacedRepetitionController.seedSchedule'));