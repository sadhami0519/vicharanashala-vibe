# Prompt — Review Question Endpoint for Spaced Repetition

## 1. Goal

Add a new backend endpoint so the frontend review session screen can display a
question card. Currently `getDueItems` (Step 5) only returns SM-2 metadata
(nextReview, ef, interval) — the student has no question text or options to answer.

**Endpoint:** `GET /api/quizzes/questions/:questionId/review`

Returns the question body + multiple-choice options **without** the correct answer.
This is a read-only, student-accessible endpoint — any enrolled student can fetch
their own due questions. Auth is required (JWT), but no additional permission check.

---

## 2. What Exists

| File | Relevant for |
|------|-------------|
| `backend/src/modules/quizzes/repositories/providers/mongodb/QuestionRepository.ts` | `getById()` → raw `BaseQuestion` (SOL/SML/OTL/NAT/DES) |
| `backend/src/modules/quizzes/services/QuestionService.ts` | `getById()` → full question + attempt counts; calls `QuestionProcessor.render()` |
| `backend/src/modules/quizzes/classes/transformers/Question.ts` | `BaseQuestion`, `SOLQuestion`, `SMLQuestion`, etc. |
| `backend/src/modules/quizzes/question-processing/QuestionProcessor.ts` | `render()` → `IQuestionRenderView` (display-ready) |
| `backend/src/modules/quizzes/controllers/QuestionController.ts` | Existing `GET /quizzes/questions/:questionId` — uses ability check + `@Authorized`; returns full question including answers; student cannot access |
| `backend/src/modules/quizzes/types.ts` | `QUIZZES_TYPES.QuestionService`, `QUIZZES_TYPES.QuestionRepo` |

### Key Existing Types

`IQuestionRenderView` (from `#quizzes/question-processing/renderers/interfaces/RenderViews.js`):
```typescript
interface IQuestionRenderView {
  _id: string | ObjectId;
  text: string;
  type: QuestionType;         // 'SELECT_ONE_IN_LOT' | 'SELECT_MANY_IN_LOT' | ...
  hint?: string;
  timeLimitSeconds: number;
  points?: number;
  // type-specific display fields (e.g., lot[], ordering[], etc.)
}
```

`ILotItem`:
```typescript
interface ILotItem {
  _id?: string | ObjectId;
  text: string;       // option text
  explaination: string; // ← DO NOT expose to student
}
```

---

## 3. Design Decision — Response Shape

Normalize all question types into one `ReviewQuestionResponse` the frontend can
render uniformly:

```typescript
// ── backend/src/modules/quizzes/interfaces/review.ts (new file) ──

/** A single multiple-choice option exposed to the student in the review screen. */
export interface ReviewOption {
  key: string;        // 'A' | 'B' | 'C' | 'D'
  text: string;       // option display text
}

/** Unified review-screen question shape — all types normalised to this. */
export interface ReviewQuestionResponse {
  id: string;
  text: string;
  type: 'SELECT_ONE_IN_LOT' | 'SELECT_MANY_IN_LOT' | 'ORDER_THE_LOTS' | 'NUMERIC_ANSWER_TYPE' | 'DESCRIPTIVE';
  hint?: string;
  options: ReviewOption[];      // multiple-choice options; empty for NUMERIC/DESCRIPTIVE
  isParameterized: boolean;
}
```

**Why normalise:** The frontend review screen is a single card UI. It does not need
the full `IQuestionRenderView` with all type-specific nested structures. `options[]
+ text + hint` is sufficient.

**Mapping rules per type:**

| Type | `options` source | Notes |
|------|-----------------|-------|
| `SELECT_ONE_IN_LOT` | All `lot[]` items as A/B/C/D | `QuestionController` pattern — combines `correctLotItem` + `incorrectLotItems` into `lot[]` |
| `SELECT_MANY_IN_LOT` | All `lot[]` items as A/B/C/D | Same |
| `ORDER_THE_LOTS` | All `ordering[].lotItem.text` as A/B/C/D | Order shown as letter key; student sees numbered items in shuffled order |
| `NUMERIC_ANSWER_TYPE` | `[]` (empty) | No options — shows input field |
| `DESCRIPTIVE` | `[]` (empty) | No options — shows textarea |

---

## 4. Files to Modify

### `backend/src/modules/quizzes/interfaces/review.ts` *(new file)*

```typescript
// Defines ReviewOption and ReviewQuestionResponse exported from this module
```

### `backend/src/modules/quizzes/QuestionController.ts`

**Change:** Add a new action `GET /:questionId/review` that bypasses the ability
check. This is a thin, student-accessible endpoint — only for spaced repetition
review. No permission beyond JWT auth.

```typescript
@Get('/:questionId/review')
async getForReview(
  @Params() params: QuestionId,
): Promise<ReviewQuestionResponse> {
  return this.questionService.getForReview(params.questionId);
}
```

Add `@ResponseSchema(ReviewQuestionResponse)` decorator.

**Why add to existing controller:** Keeps all question endpoints in one place.
The existing `getById()` remains unchanged (ability-gated, returns full question).
The new action is on the same controller but a different route — no conflict.

**Note on `@Authorized`:** The existing controller methods use `@Authorized()`.
The new method should **NOT** require ability check (students must be able to
fetch their own due questions), but JWT auth is still required. Since the method
is on a class already marked `@Authorized()` at class level, the auth guard fires
but ability is not checked — the method calls `questionService.getForReview()`
directly with no ability call. This is the correct pattern.

---

### `backend/src/modules/quizzes/services/QuestionService.ts`

**Change:** Add new method `getForReview(questionId)`.

```typescript
public async getForReview(questionId: string): Promise<ReviewQuestionResponse> {
  const question = await this.questionRepository.getById(questionId, undefined);
  if (!question) {
    throw new NotFoundError(`Question ${questionId} not found`);
  }

  return toReviewQuestionResponse(question);
}
```

This method is intentionally _without_ `_withTransaction()` and without
`QuestionProcessor.render()` — we only need the raw question data to build the
normalised response. Direct repo access is fine for a read.

---

### `backend/src/modules/quizzes/classes/transformers/Question.ts`

**Change:** Add a `toReviewQuestionResponse()` free function (not a class method)
that converts a `BaseQuestion` into `ReviewQuestionResponse`.

```typescript
/**
 * Converts a BaseQuestion (SOL/SML/OTL/NAT/DES) into a student-facing
 * ReviewQuestionResponse — options WITHOUT correct-answer info.
 */
export function toReviewQuestionResponse(
  question: BaseQuestion,
): ReviewQuestionResponse {
  const base = {
    id: question._id?.toString() ?? '',
    text: question.text,
    type: question.type,
    hint: question.hint,
    isParameterized: question.isParameterized,
    options: [] as ReviewOption[],
  };

  switch (question.type) {
    case 'SELECT_ONE_IN_LOT':
    case 'SELECT_MANY_IN_LOT': {
      const sol = question as SOLQuestion | SMLQuestion;
      const allItems: ILotItem[] = [
        ...(sol.incorrectLotItems ?? []),
        ...(sol.correctLotItem
          ? [sol.correctLotItem]
          : sol.correctLotItems ?? []),
      ];
      const keys = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      return {
        ...base,
        options: allItems.slice(0, 8).map((item, i) => ({
          key: keys[i],
          text: item.text,
        })),
      };
    }

    case 'ORDER_THE_LOTS': {
      const otl = question as OTLQuestion;
      const keys = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      return {
        ...base,
        options: otl.ordering.slice(0, 8).map((order, i) => ({
          key: keys[i],
          text: order.lotItem.text,
        })),
      };
    }

    case 'NUMERIC_ANSWER_TYPE':
    case 'DESCRIPTIVE':
    default:
      return { ...base, options: [] };
  }
}
```

**Security note:** `toReviewQuestionResponse` only maps `text` from `ILotItem`.
`explaination` is intentionally excluded — it contains the answer reasoning and
must never be sent to the student.

---

## 5. Files to NOT Modify

- `backend/src/modules/quizzes/types.ts` — no new DI symbol needed; `QuestionService` already registered
- `backend/src/modules/quizzes/container.ts` — same; service already bound
- `backend/src/modules/quizzes/index.ts` — no new module, controller is already in the module
- `ReviewItemRepository` or any spaced repetition file — no changes needed
- `feature-user-flow-backend.md` — the user flow is unchanged; question text just becomes visible in step 4 (Review). The backend endpoint exists; no new flow step needed.

---

## 6. Acceptance Criteria

| # | Criterion | How to verify |
|---|-----------|--------------|
| 1 | `GET /quizzes/questions/:questionId/review` returns 200 with `id/text/type/options/hint` | Call endpoint in browser or Postman with a valid `questionId` |
| 2 | `SELECT_ONE_IN_LOT` / `SELECT_MANY_IN_LOT` return all options (A/B/C/D) without `explaination` | Inspect response — `explaination` absent |
| 3 | `ORDER_THE_LOTS` returns all ordering items as options | Inspect response |
| 4 | `NUMERIC_ANSWER_TYPE` and `DESCRIPTIVE` return `options: []` | Inspect response for these types |
| 5 | Invalid `questionId` → 404 | Call with non-existent ID |
| 6 | Unauthenticated request → 401 | Call without JWT |
| 7 | `toReviewQuestionResponse` unit tests pass | New test file |
| 8 | `tsc --noEmit` zero errors | `npx tsc --noEmit` |

---

## 7. Tests to Write

**File:** `backend/src/modules/quizzes/tests/QuestionService.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { toReviewQuestionResponse } from '#quizzes/classes/transformers/Question.js';
import { SOLQuestion, SMLQuestion, OTLQuestion, NATQuestion, DESQuestion } from '#quizzes/classes/transformers/Question.js';

// Test cases:
// 1. SOL → options A/B/C/D correct, no explaination
// 2. SML → all correctLotItems + incorrectLotItems merged into options
// 3. OTL → all ordering items as options
// 4. NAT → options: []
// 5. DES → options: []
// 6. Unknown type → options: []
```

---

## 8. Implementation Order

```
1. backend/src/modules/quizzes/interfaces/review.ts      — new, defines types
2. backend/src/modules/quizzes/classes/transformers/Question.ts — add toReviewQuestionResponse()
3. backend/src/modules/quizzes/services/QuestionService.ts     — add getForReview()
4. backend/src/modules/quizzes/controllers/QuestionController.ts — add GET /:questionId/review
5. backend/src/modules/quizzes/tests/QuestionService.test.ts    — unit tests for toReviewQuestionResponse
6. Run: npx vitest run src/modules/quizzes/tests/QuestionService.test.ts
7. Run: npx tsc --noEmit
```

---

## 9. Enhancement Suggestions to Add to feature-context.md

These are **not** in the prompt above — implement only if time permits.
Add to `feature-context.md` under a new "Backend Enhancement Suggestions" section.

| Suggestion | Description | Complexity |
|-----------|-------------|-----------|
| Session cap | `GET /spaced-repetition/:studentId/due?limit=10` — cap due items; "N more tomorrow" in response | Low — one-line `findDue()` change + new field |
| Priority queue | `ReviewItemRepository.findDue()` sort by lowest `ef` ascending first | Trivial — add `.sort({ ef: 1 })` |
| Learning phase | Bypass SM-2 scheduling for `reviewCount === 0` items until 2+ reviews | Medium — new field on schema + condition in `triggerSpacedRepetitionSeed()` |
| Per-course due-count cache | Denormalise `dueCount` onto `Enrollment`; increment on seed, decrement on review | Medium — new field + updates in 2 service methods |
| Review history | `GET /spaced-repetition/:studentId/history?page=&limit=` — paginated log of past reviews | Low — `ReviewItemRepository` already stores `lastReview` |

---

## 10. After This Step

- Mark "Review session screen" in `feature-context.md` Pending Work as **backend done, frontend pending**
- `vibe_local_setup_guide.md` — no change needed (this endpoint is purely API, no new env/config)
- `feature-user-flow-backend.md` — no change needed (flow unchanged, question text just visible in step 4)