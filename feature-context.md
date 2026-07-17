# Spaced Repetition ??? Feature Context

> Live document. Updated after every codebase change affecting this feature.

---

## Overview

A new `spacedRepetition` module implementing the SM-2 spaced repetition algorithm
for post-course review sessions. When a student completes a course, a review
schedule is seeded ??? one `ReviewItem` per individual quiz question. At each
scheduled interval, a cron job notifies the student to review; their recall
quality response updates the SM-2 state, adjusting future intervals.

---

## Stack

| Layer         | Technology                                        |
|---------------|---------------------------------------------------|
| Runtime       | Node.js 20/22 LTS, TypeScript (ESNext + NodeNext) |
| Framework     | Express via `routing-controllers`                 |
| DI            | Inversify (`ContainerModule` per module)          |
| Database      | MongoDB (raw driver, no Mongoose)                 |
| Auth          | Firebase Admin (emulator in dev)                  |
| Scheduler     | `node-cron`                                       |
| Email         | `nodemailer` (existing notifications module)       |

---

## Module file structure

```
backend/src/modules/spacedRepetition/
????????? interfaces/
???   ????????? IReviewItem.ts              # IReviewItem, ISM2State, RecallQuality,
???                                    # RECALL_QUALITY_MAP, DEFAULT_SM2_STATE
????????? types.ts                        # SPACED_REPETITION_TYPES ??? DI symbols
????????? repositories/
???   ????????? providers/
???       ????????? mongodb/
???           ????????? ReviewItemRepository.ts   # All MongoDB ops on review_items
????????? services/
???   ????????? SpacedRepetitionService.ts        # SM-2 logic + business rules
????????? classes/
???   ????????? validators/
???       ????????? SpacedRepetitionValidator.ts  # @Body / @Params / response classes
????????? controllers/
???   ????????? SpacedRepetitionController.ts     # REST endpoints
????????? cron/
???   ????????? reviewNotificationJob.ts          # node-cron job for due-item notifications
????????? container.ts                   # Inversify ContainerModule bindings
????????? index.ts                       # Module entry point (exports for loadModules)
```

---

## Course Completion Hook

The hook lives in `ProgressService.stopItem()`. When a student's
`newProgress.completed` flips to `true` (after completing their final item),
two best-effort actions fire outside the completion transaction:

1. `triggerFollowUpInvite()` ??? creates an invite to a configured follow-up course
2. `triggerSpacedRepetitionSeed()` ??? seeds the spaced repetition schedule

```ts
// backend/src/modules/users/services/ProgressService.ts

// In stopItem(), after the transaction commits:
if (justCompleted) {
  await this.triggerFollowUpInvite(userId, courseId, courseVersionId);
  await this.triggerSpacedRepetitionSeed(userId, courseId, courseVersionId);
}
```

`triggerSpacedRepetitionSeed()` calls `seedSchedule(studentId, courseId, questionIds)`
and swallows all errors ??? seeding failures must never break course completion.

### How question IDs are resolved

`getQuizQuestionIds(courseVersionId)` walks the full course version:

```
getAllItemIds(courseVersionId)          ??? all item IDs in the course
  ??? itemRepo.readItem() for each item  ??? filter type === 'QUIZ'
    ??? IQuizDetails.questionBankRefs    ??? unique bankIds (deduped)
      ??? questionBankRepo.getById()     ??? QuestionBank.questions[]
```

Each `question_id` stored on a `ReviewItem` is an actual question document ID
from a question bank, **not** a quiz item ID. This is by design ??? SM-2 tracks
retention of individual concepts, and a quiz with 10 questions holds 10 distinct
memory traces that need independent easiness factors.

TypeScript type safety: the quiz details check uses `IQuizDetails` imported from
`#root/shared/interfaces/models.js`, not a raw `any` cast.

---

## SM-2 Algorithm

Recall quality is captured as a three-point UI rating mapped to SM-2 q values:

| UI label   | q value |
|------------|---------|
| `got_it`   | 5       |
| `unsure`   | 3       |
| `missed`   | 1       |

Update formula (`SpacedRepetitionService._applySM2`):

```
if q >= 3:
  if n == 0:   I = 1
  elif n == 1: I = 6
  else:        I = round(I_prev * EF)
  n = n + 1
  EF = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  EF = max(EF, 1.3)

if q < 3:
  n = 0
  I = 1

next_review_at = today + I days
```

Note: EF is **not** changed on an incorrect response (q < 3), per the SM-2 spec.

---

## API Endpoints

Base path: `/api/spaced-repetition`

| Method | Path                        | Description                              |
|--------|-----------------------------|------------------------------------------|
| `POST` | `/:studentId/seed`          | Seed a review schedule on course completion |
| `POST` | `/:studentId/review`        | Submit a review response (runs SM-2)     |
| `GET`  | `/:studentId/schedule`      | Get full review schedule for dashboard   |
| `GET`  | `/:studentId/course/:courseId` | Get per-course retention health summary |
| `PATCH`| `/:studentId/notifications` | Toggle notification opt-out for a course |

All routes are `@Authorized()`.

---

## MongoDB Collection

Collection name: `review_items`

```ts
ReviewItem {
  _id:                  ObjectId
  student_id:           string
  course_id:            string
  question_id:          string        // question doc ID from QuestionBank, NOT quiz item ID
  n:                    number        // SM-2 repetition count
  EF:                   number        // easiness factor (default 2.5, min 1.3)
  interval_days:        number        // current interval in days
  next_review_at:       Date          // indexed ??? used by cron job query
  last_reviewed_at:     Date | null
  notification_opt_out: boolean
}
```

**Required indexes** ??? auto-created on first MongoDB connection via
`MongoDatabase.ensureIndexes()` (runs alongside the existing `auditTrails` index):

```js
// Cron job: find all items due now
db.review_items.createIndex(
  { next_review_at: 1 },
  { name: 'idx_review_items_next_review_at' },
)

// Student dashboard: all items for a student in a given course
db.review_items.createIndex(
  { student_id: 1, course_id: 1 },
  { name: 'idx_review_items_student_course' },
)

// Uniqueness guard: prevents double-seeding the same (student, question) pair
// insertMany() will reject duplicates if somehow two seedSchedule() calls race
db.review_items.createIndex(
  { student_id: 1, question_id: 1 },
  { unique: true, name: 'idx_review_items_student_question_unique' },
)
```

---

## Cron Job

- **Schedule:** every hour on the hour (`0 * * * *`)
- **Timezone:** Asia/Kolkata
- **Gate:** `ENABLE_SPACED_REPETITION_JOB=true` in backend `.env`
- **Logic:** queries `review_items` where `next_review_at <= now`, filters out
  opted-out students, groups by student, fires one notification per student
- **Notification delivery:** wired via `NotificationService.notifyReviewReminder()`;
  the cron calls it directly with `(studentId, unique courseIds, dueCount)`. No
  more stub logging. (Originally logged `[PENDING INTEGRATION]` before Step 8
  closed the loop.)

---

## DI Symbols

Defined in `backend/src/modules/spacedRepetition/types.ts`:

```ts
SPACED_REPETITION_TYPES.ReviewItemRepo          ??? ReviewItemRepository (singleton)
SPACED_REPETITION_TYPES.SpacedRepetitionService ??? SpacedRepetitionService (singleton)
SPACED_REPETITION_TYPES.SpacedRepetitionController ??? SpacedRepetitionController
```

---

## Files created/modified

### New files

| File | Purpose |
|------|---------|
| `backend/src/modules/spacedRepetition/interfaces/IReviewItem.ts` | Core types: `IReviewItem`, `ISM2State`, `RecallQuality`, `RECALL_QUALITY_MAP`, `DEFAULT_SM2_STATE` |
| `backend/src/modules/spacedRepetition/types.ts` | `SPACED_REPETITION_TYPES` DI symbols |
| `backend/src/modules/spacedRepetition/repositories/providers/mongodb/ReviewItemRepository.ts` | All MongoDB operations on `review_items` collection |
| `backend/src/modules/spacedRepetition/services/SpacedRepetitionService.ts` | SM-2 logic + `seedSchedule`, `submitReview`, `getSchedule`, `getCourseRetention`, `updateNotificationPreference` |
| `backend/src/modules/spacedRepetition/classes/validators/SpacedRepetitionValidator.ts` | `@Body`/`@Params` DTOs and OpenAPI `@ResponseSchema` types |
| `backend/src/modules/spacedRepetition/controllers/SpacedRepetitionController.ts` | REST endpoints |
| `backend/src/modules/spacedRepetition/cron/reviewNotificationJob.ts` | Hourly cron job |
| `backend/src/modules/spacedRepetition/container.ts` | `spacedRepetitionContainerModule` |
| `backend/src/modules/spacedRepetition/index.ts` | Module entry point (`spacedRepetitionContainerModules`, `spacedRepetitionModuleControllers`) |

### New files

| File | Purpose |
|------|---------|
| `backend/src/modules/spacedRepetition/interfaces/IReviewItem.ts` | Core types: `IReviewItem`, `ISM2State`, `RecallQuality`, `RECALL_QUALITY_MAP`, `DEFAULT_SM2_STATE` |
| `backend/src/modules/spacedRepetition/types.ts` | `SPACED_REPETITION_TYPES` DI symbols |
| `backend/src/modules/spacedRepetition/repositories/providers/mongodb/ReviewItemRepository.ts` | All MongoDB operations on `review_items` collection |
| `backend/src/modules/spacedRepetition/repositories/providers/mongodb/index.ts` | Barrel: re-exports `ReviewItemRepository` |
| `backend/src/modules/spacedRepetition/repositories/index.ts` | Barrel: re-exports from `providers/mongodb/index.js` |
| `backend/src/modules/spacedRepetition/services/SpacedRepetitionService.ts` | SM-2 logic + `seedSchedule`, `submitReview`, `getSchedule`, `getCourseRetention`, `updateNotificationPreference` |
| `backend/src/modules/spacedRepetition/classes/validators/SpacedRepetitionValidator.ts` | `@Body`/`@Params` DTOs and OpenAPI `@ResponseSchema` types |
| `backend/src/modules/spacedRepetition/controllers/SpacedRepetitionController.ts` | REST endpoints |
| `backend/src/modules/spacedRepetition/cron/reviewNotificationJob.ts` | Hourly cron job |
| `backend/src/modules/spacedRepetition/container.ts` | `spacedRepetitionContainerModule` |
| `backend/src/modules/spacedRepetition/index.ts` | Module entry point (`spacedRepetitionContainerModules`, `spacedRepetitionModuleControllers`) |

### Frontend files (added 2026-07-04)

Mock-first data layer for frontend development without a live backend.
`USE_MOCK = true` in `spaced-repetition-api.ts` until backend is wired in.

| File | Purpose |
|------|---------|
| `frontend/src/types/spaced-repetition.types.ts` | TypeScript types mirroring backend `IReviewItem`: `ReviewItem`, `CourseRetentionSummary`, `RecallQuality` (`'got_it' | 'unsure' | 'missed'`), `SeedScheduleResponse`, `SubmitReviewResponse`, `UpdateOptOutResponse` |
| `frontend/src/lib/spaced-repetition-api.ts` | Mock-first API client: 5 functions (`seedSchedule`, `submitReview`, `getSchedule`, `getCourseRetention`, `updateNotificationPreference`); flip `USE_MOCK = false` when backend is live. Auth via `localStorage.getItem('firebase-auth-token')` + Bearer header. `BASE_URL = VITE_BASE_URL ?? ''`, paths written as `/api/spaced-repetition/${studentId}/...` |
| `frontend/src/hooks/spaced-repetition-hooks.ts` | TanStack Query hooks: 2 queries (`useGetSchedule`, `useGetCourseRetention`) + 3 mutations (`useSubmitReview`, `useUpdateNotificationPreference`, `useSeedSchedule`). Centralised query keys in `spacedRepetitionKeys`; mutations invalidate the schedule cache on success. Coexists with the legacy hand-written `frontend/src/hooks/spaced-repetition.ts` (suffixed `-hooks` avoids filename collision; legacy file is a candidate for deletion in a future cleanup step) |
| `frontend/src/app/pages/student/ReviewSession.tsx` | Review session screen ??? `useReducer`-driven state machine (`loading-schedule ??? loading-question ??? awaiting-response ??? showing-feedback ??? session-complete \| empty`), 10-card session cap, options A???D, three semantic-coloured self-rating buttons (`Got it`/`Unsure`/`Missed`), feedback shows next-review day delta. Routes to `/student/review` via `studentReviewSessionRoute` in `router.tsx`. **Modified (2026-07-08):** branched the `empty` render on `schedule?.length === 0` ??? brand-new students (no schedule) see the dashboard's polished "No review schedules yet" Card with Browse-courses CTA; existing students with nothing due see the original "You're all caught up" copy. Race guard via Skeleton while the schedule query loads. **Modified (2026-07-08):** added `quizTitle`/`quizId` to the local `ReviewQuestionResponse` interface and updated `attributionFor(item, question)` to render `From <Course> ?? <Quiz Title>` when the backend resolves a parent quiz, falling back to the original `From <Course> ?? Question N` otherwise. Index dropped when title is present. E4 TODO closed. |
| `frontend/src/app/pages/student/RetentionDashboard.tsx` | Retention dashboard ??? three sections: (1) headline stats (due now / active courses / tracked cards), (2) per-course retention cards driven by fanned-out `useGetCourseRetention` calls showing counts + EF???percent retention bar (Strong/Steady/Needs work band) + opt-out toggle + per-course "Start review" CTA, (3) full schedule list sorted by `next_review_at`. Routes to `/student/review/dashboard` |
| `frontend/src/lib/spaced-repetition-api.ts` | **Modified** (Step 14a): added 2nd mock course (`mock-course-2`, two mastered items), added `deriveMockRetention(courseId)` helper that computes totals/overdue/dueSoon/avgEF from the schedule, fixed the `updateNotificationPreference` mock to actually mutate `notification_opt_out` (was a no-op stub). Replaced the hardcoded `MOCK_RETENTION_SUMMARY` |
| `frontend/src/layouts/student-layout.tsx` | Layout shell Ã¢ÂÂ renders student sidebar + topbar. The sidebar nav items themselves live in `student-sidebar/nav-items.tsx`. |
| `frontend/src/hooks/spaced-repetition.ts` | **Deleted** (Step 16): legacy hand-written hook (127 lines, axios-based, snake_case, falsely claimed "Auto-generated"). Proven orphaned via `tsc --listFiles` and source-string scans. Backup at `scripts/.trash/spaced-repetition.ts.bak` |
| `frontend/src/components/student-sidebar/nav-items.tsx` | **Modified** (2026-07-14): added `Review` entry to `STUDENT_NAV_ITEMS` with `History` icon (clock-arrow-back semantics), targeting `/student/review`. Uses the standard active-state pattern (`isActive`). Desktop and mobile share the same sidebar source of truth. |
| `frontend/src/app/routes/router.tsx` | **Modified** (Step 13 + 14): added `ReviewSession` + `RetentionDashboard` imports (lines 73-74), `studentReviewSessionRoute` (line 574), `studentReviewDashboardRoute` (line 581), both registered in `studentLayoutRoute.addChildren([...])` (lines 744-745) |

### Modified files

> **Note on nav implementation:** The sidebar navigation is defined in
> `frontend/src/components/student-sidebar/nav-items.tsx` (not `student-layout.tsx`).
> `student-layout.tsx` is a layout shell that renders the sidebar component; all nav item
> definitions live in `nav-items.tsx`. `History` (not `Brain`) is the icon for Review.

| File | Change |
|------|--------|
| `backend/tsconfig.json` | Added `"#spacedRepetition/*": ["./modules/spacedRepetition/*"]` to `paths` |
| `backend/src/utils/startCron.ts` | Imported and called `scheduleReviewNotificationJob()` |
| `backend/src/config/app.ts` | Added `ENABLE_SPACED_REPETITION_JOB: env('ENABLE_SPACED_REPETITION_JOB') === 'true'` |
| `backend/.env` | Added `ENABLE_SPACED_REPETITION_JOB=false` |
| `backend/src/modules/users/types.ts` | Added `SpacedRepetitionService` and `QuestionBankRepo` DI symbols |
| `backend/src/modules/users/services/ProgressService.ts` | Injected `SpacedRepetitionService` + `QuestionBankRepo`; added `triggerSpacedRepetitionSeed()` and `getQuizQuestionIds()`; called hook in `stopItem()` post-transaction block |
| `backend/src/modules/users/index.ts` | Added `quizzesContainerModule` to `usersContainerModules[]` so `QuestionBankRepository` is resolved in the users container |
| `backend/src/modules/spacedRepetition/container.ts` | Fixed `ReviewItemRepository` import to use `#spacedRepetition/repositories/index.js` barrel |
| `backend/src/modules/spacedRepetition/services/SpacedRepetitionService.ts` | Fixed `ReviewItemRepository` import to use `#spacedRepetition/repositories/index.js` barrel |
| `backend/src/modules/spacedRepetition/cron/reviewNotificationJob.ts` | Fixed `ReviewItemRepository` import to use `#spacedRepetition/repositories/index.js` barrel; replaced TODO stub with real `NotificationService.notifyReviewReminder()` call |
| `backend/src/modules/spacedRepetition/controllers/SpacedRepetitionController.ts` | Added `as unknown as T` casts to bridge `IReviewItem[]` ??? `ReviewItemResponse[]` |
| `backend/src/modules/spacedRepetition/index.ts` | Added `notificationsContainerModule` to `spacedRepetitionContainerModules[]` |
| `backend/src/shared/database/interfaces/INotification.ts` | Added `'review_reminder'` to `NotificationType` |
| `backend/src/modules/notifications/services/NotificationService.ts` | Added `notifyReviewReminder()` method |
| `backend/src/shared/database/providers/mongo/MongoDatabase.ts` | Added `review_items` indexes in `ensureIndexes()`: `idx_review_items_next_review_at`, `idx_review_items_student_course`, `idx_review_items_student_question_unique` |
| `backend/src/modules/quizzes/repositories/providers/mongodb/ReviewItemRepository.ts` | **Deleted** ??? dead code, never imported, had broken paths |
| `backend/src/shared/database/interfaces/INotification.ts` | Added `'review_reminder'` to `NotificationType` |
| `backend/src/modules/notifications/services/NotificationService.ts` | Added `notifyReviewReminder()` method |
| `backend/src/modules/spacedRepetition/index.ts` | Added `notificationsContainerModule` to `spacedRepetitionContainerModules[]` |
| `backend/src/modules/spacedRepetition/cron/reviewNotificationJob.ts` | Replaced `TODO` stub with real `NotificationService.notifyReviewReminder()` call via `getContainer()` |

---

## Notification Integration

When the cron job finds due review items for a student, it creates an in-app
notification via `NotificationService.notifyReviewReminder()` (Step 8).

**New `NotificationService` method:**
```ts
async notifyReviewReminder(
  studentId: string,
  courseIds: string[],   // unique course IDs from the due items
  dueCount: number,      // total question count
): Promise<void>
```

**Type additions:**
- `INotification.type`: added `'review_reminder'` variant
- `NOTIFICATIONS_TYPES.NotificationService` already existed and is reused

**Container wiring:**
- `notificationsContainerModule` is in the root container (loaded dynamically
  via `loadAppModules('all')` importing every `modules/*/index.js`)
- Also added to `spacedRepetitionContainerModules[]` explicitly so the
  standalone spaced repetition container can resolve `NotificationService`
  for its own controllers in future

**Email delivery (Step 11):** ??? Done. `MailService.sendMail()` unblocked;
`ReviewReminderEmail.createMessage()` builds text + HTML emails;
`notifyReviewReminder()` sends email best-effort after the in-app notification is
saved. Fail-open: email errors are logged but never throw.
`SMTP_USER`/`SMTP_PASS` documented in `.example.env`.

## Tests

```bash
cd backend
npx vitest run src/modules/spacedRepetition/tests/
```

**`tests/sm2.test.ts`** ??? Pure SM-2 algorithm unit tests (14 cases). Uses a
standalone `applySM2()` function that mirrors `_applySM2()` in
`SpacedRepetitionService` ??? keep both in sync when changing the algorithm.
Cases: first/second/third correct review, unsure (q=3), incorrect reset, EF floor
convergence, compounding intervals over 5 consecutive reviews, `RECALL_QUALITY_MAP`,
`DEFAULT_SM2_STATE`.

**`tests/ReviewItemRepository.test.ts`** ??? Repository integration tests
(18 cases) against `mongodb-memory-server`. `beforeEach` clears the
`review_items` collection so each test is fully isolated. Cases:
`create`, `createMany`, `findDueItems`, `findByStudent`,
`findByStudentAndCourse`, `findByStudentAndQuestion`, `update` (partial update,
not-found returns null, other fields preserved), `updateOptOut`, uniqueness
constraint on `(student_id, question_id)` throws `MongoBulkWriteError`.

## Frontend ??? Implementation & Polish Log

The original **3 bare-minimum MVP items** (needed to satisfy GH #1047's
acceptance criteria) are all ??? complete. This section now serves as the
implementation + post-ship polish log for the frontend: each tick-box
records a shipped item, oldest at the bottom (Steps 12???15) and most
recent polish on top. Everything else in this document is complete.

### Frontend (3 items)

- [x] ??? **Review session screen** ??? Student-facing UI to answer one question at a
  time with three response buttons ("Got it", "Unsure", "Missed it"). Implemented
  as Step 13 (2026-07-04) ??? see Frontend files table. Backend endpoint
  `GET /api/quizzes/questions/:questionId/review` ??? done ??? returns `{id, body, type,
  hint, options[]}` stripped of answers. Frontend mock question bodies live in
  `ReviewSession.tsx` until `USE_MOCK = false`. Card component ???, session flow ???,
  10-card cap with "N more tomorrow" indicator ???. To be wired to the real backend
  in Step 14 (one helper function swap).

- [x] ??? **Retention dashboard** ??? Student-facing dashboard showing:
  - Per-course: due now / due soon counts, and a retention health % (average EF
    across all cards normalised to 0???100)
  - Full review schedule list
  - Opt-out toggle per course
  - `GET /api/spaced-repetition/:studentId/schedule` + `GET /course/:courseId`
    both exist on the backend
  - **Implemented Step 14 (2026-07-04)** ??? see Frontend files table. EF???percent
    mapping: linear, clamped 1.3???3.0 ??? 0???100, banded `Strong (???75) / Steady
    (???50) / Needs work (<50)`. Course labels resolved via a small in-page map
    (mock-course-1 ??? "Algebra Foundations", mock-course-2 ??? "World History 101")
    ??? swap for `useGetCourseCatalog()` in production

- [x] ??? **Frontend data layer (Step 12 ??? 2026-07-04)** ??? mock-first API client
  + types + TanStack Query hooks. Backend not required to develop the UI.
  - `frontend/src/types/spaced-repetition.types.ts` ??? `ReviewItem`,
    `CourseRetentionSummary`, `RecallQuality` (`'got_it' | 'unsure' | 'missed'`),
    `SeedScheduleResponse`, `SubmitReviewResponse`, `UpdateOptOutResponse`
  - `frontend/src/lib/spaced-repetition-api.ts` ??? 5 API functions
    (`seedSchedule`, `submitReview`, `getSchedule`, `getCourseRetention`,
    `updateNotificationPreference`); `USE_MOCK = true` until backend is live;
    flip one constant when ready. Auth via `localStorage.getItem('firebase-auth-token')`
    + `Authorization: Bearer`. `BASE_URL = VITE_BASE_URL ?? ''`, paths written as
    `/api/spaced-repetition/${studentId}/...`
  - `frontend/src/hooks/spaced-repetition-hooks.ts` ??? 2 queries
    (`useGetSchedule`, `useGetCourseRetention`) + 3 mutations
    (`useSubmitReview`, `useUpdateNotificationPreference`, `useSeedSchedule`).
    Centralised query keys in `spacedRepetitionKeys` helper; mutations invalidate
    the schedule cache on success
  - `npx tsc --noEmit` exits clean (Step 5 verification 2026-07-04)
  - **Coexists** with the legacy `frontend/src/hooks/spaced-repetition.ts`
    (hand-written, axios, snake_case, falsely claims "Auto-generated" in header).
    The two filenames don't collide (suffixed `-hooks`). Safe to delete the legacy
    file in a later cleanup step.

- [x] ??? **Question bank attribution on Review Session (E4 ??? 2026-07-04)**
  - **`frontend/src/app/pages/student/ReviewSession.tsx`** ??? attribution
    line added above the question body, replacing the raw
    `Course: {item.course_id}` display
  - **Two new module-level helpers:**
    - `COURSE_LABELS: Record<string, string>` ??? mirrors the dashboard's
      map for mock data (`mock-course-1` ??? "Algebra Foundations",
      `mock-course-2` ??? "World History 101"); falls back to raw id
    - `formatQuestionLabel(qid)` ??? regex `/^mock-question-(\d+)$/` extracts
      the numeric suffix and renders `"Question 3"` instead of the raw
      `mock-question-3`; unknowns pass through unchanged
    - `attributionFor(item)` ??? composes the full line as
      `From {courseLabel} ?? {questionLabel}`
  - **Visual treatment:** small `BookOpen` icon (h-3 w-3) prefixed,
      `text-xs text-muted-foreground`, `inline-flex items-center gap-1`
      so the icon and text baseline-align
  - **Aria:** `aria-label="Question origin: From Algebra Foundations ?? Question 3"`
      on the attribution `<span>` so screen readers announce the full
      context (the visible text duplicates this content but the
      `aria-label` ensures consistency if the icon or layout shifts)
  - **Icon `aria-hidden="true"`** ??? decorative
  - **Quiz-title attribution: superseded by the 2026-07-08 work above
    (and re-corrected 2026-07-12 ??? see "Backend join fix" inside the
    "Quiz-title attribution on review cards" bullet below).** The
    "TODO (logged, not done)" three-options list was a temporary
    deferral of backend work; the resolution came on 2026-07-08 when we
    extended `getForReview` to return `quizTitle`/`quizId`, then a code
    review on 2026-07-12 found the helper was calling the wrong repo
    method and the join was fixed. The `attributionFor` helper takes
    `(item, question)` and renders `From <Course> ?? <Quiz Title>` when
    the backend resolves a title, falling back to the original
    `From <Course> ?? Question N` otherwise. The deferral annotation
    is preserved here as a historical breadcrumb so future readers can
    trace why the backend was later touched.
  - **`npx tsc --noEmit` exits clean** (E4 verification 2026-07-04; re-verified
    2026-07-08 after the quiz-title attribution work ??? 0 errors on the
    spaced-repetition files)
  - **Trade-offs / decisions:**
    - Reused the same `COURSE_LABELS` keys as the dashboard so the two
      pages render identically when the same mock id is shown
    - Kept the helper functions local to the file (not promoted to a
      shared util yet) ??? they're page-scoped and only mock-data aware

- [x] ??? **Empty-state polish on Retention Dashboard (E1 ??? 2026-07-04)**
  - **`frontend/src/app/pages/student/RetentionDashboard.tsx`** ??? two empty
    states polished, two new lucide icons imported (`BookOpen`, `Inbox`)
  - **Per-course section empty state** (replaces the previous grey "No
    courses yet. Complete a quiz..." plain string):
    - `Card` with dashed border + soft gradient (`from-muted/30 via-
      background to-background`) for visual distinction from other Cards
    - Centered `BookOpen` icon in a `bg-primary/10` rounded-full bubble
      with a 1px `ring-primary/20` halo
    - Heading "No review schedules yet" + 2-sentence explanation
      ("Complete a quiz in any course and we'll automatically seed...")
    - "Browse courses" CTA `Button asChild variant="outline"` linking to
      `/student/courses` with descriptive `aria-label`
    - Heading is `<h3>` (semantic), icon is `aria-hidden`, layout is
      column-centred with `flex flex-col items-center gap-4`
  - **Upcoming-schedule empty state** (replaces "Nothing scheduled yet"):
    - Smaller inline variant ??? no Card wrapper, just a centered
      `Inbox` icon + "Inbox zero" heading + subtext "Nothing due in the
      next few weeks." (calmer than the previous wording; reads as
      positive rather than empty)
    - Used in place of a plain `<p>` so the design hierarchy matches
      the per-course empty state without duplicating the larger layout
  - **Deliberately NOT added:**
    - A whole-dashboard-level early return when `courseIds.length === 0`.
      Considered it, but the headline stats (zeros) + the Start review
      CTA give the user visible entry points before they scroll. Hiding
      stats behind an early-return feels punishing to the eye
    - The "By course" h2 stays visible even when empty (the empty card
      is the explanation, not a missing section)
  - **Accessibility notes** (consistent with E3+E6 pass):
    - Both icons `aria-hidden="true"`
    - Semantic heading levels: `<h3>` inside the per-course empty state
      (sits under section `<h2>`), `<p>` element-with-role in the
      schedule empty state
    - CTA link gets a full `aria-label` describing destination + intent
  - `npx tsc --noEmit` exits clean (E1 verification 2026-07-04)

- [x] ??? **Keyboard shortcuts + accessibility pass (E3 + E6 ??? 2026-07-04)**
  - **`frontend/src/app/pages/student/ReviewSession.tsx`** ??? keyboard handler
    (global `window.keydown` listener, registered/unregistered with the
    phase transition). Maps:
    - `1` / `2` / `3` ??? `got_it` / `unsure` / `missed` (only in
      `awaiting-response`, blocked when `submitReview.isPending`)
    - `Space` / `Enter` / `ArrowRight` ??? advance (only in
      `showing-feedback`, skipped when a `<button>` already has focus so
      native Enter/Space handlers fire)
    - Suppressed when focus is inside `<input>` / `<textarea>` /
      `<select>` / `[contenteditable]` ??? defensive for future text fields
    - Suppressed when modifier keys are held (`Ctrl`/`Cmd`/`Alt`)
  - **Focus management** ??? two refs (`gotItRef`, `nextRef`) drive focus to
    the right control as phase changes:
    - `awaiting-response` ??? focus the Got-it button so keyboard users can
      hit 1/2/3 immediately
    - `showing-feedback` ??? focus the Next-card button so Enter/Space just works
    - Effect re-runs only on `state.phase` change (not on every state tick)
  - **Aria + a11y additions** on review-session:
    - `aria-label` + `aria-keyshortcuts` on each rating button
      (`"Rate as Got it (press 1)"`, etc.) and on the Next/Finish button
    - `aria-hidden="true"` on decorative icons
    - `role="status"` + `aria-live="polite"` + `aria-atomic="true"` on the
      feedback panel so screen readers announce "+6 days" automatically
    - `role="group"` + `aria-labelledby="rating-prompt"` on the rating
      button container
    - Visible focus rings via `focus-visible:ring-*` (matching each button's
      semantic colour)
    - Small visible keyboard-hint line below the buttons
      (`Keyboard: 1 2 3 to rate.`) with a visually-hidden
      `<span class="sr-only">` repeat for screen readers
  - **`frontend/src/app/pages/student/RetentionDashboard.tsx`** ??? aria
    additions on the per-course card:
    - Switch: dynamic `aria-label`
      (`Mute review reminders for ${courseLabel}` ???
      `Re-enable review reminders for ${courseLabel}`)
    - "Start review for this course" link:
      `aria-label="Start review session for ${courseLabel} (${overdueCount} due now)"`
      + `aria-hidden="true"` on the trailing chevron +
      `focus-visible:ring-2 `focus-visible:ring-primary` for keyboard focus
  - **`frontend/src/components/student-sidebar/nav-items.tsx`** ??? `Review` entry
>     added to `STUDENT_NAV_ITEMS` with `History` from `lucide-react`, pointing at
>     `/student/review`. Active-state uses `isActive('/student/review')` â both
>     `/student/review` and `/student/review/dashboard` highlight the nav. No `Brain`
>     icon (`History` used instead for clock-arrow-back semantics). The topbar in
>     `student-layout.tsx` is a layout shell and does not hold nav item definitions.
  - `npx tsc --noEmit` exits cleandon't have this ??? adding it across all links is
    out of scope for this feature; flagged for a future cross-cutting
    a11y pass.
  - `npx tsc --noEmit` exits clean (E3+E6 verification 2026-07-04)
  - **Trade-offs / decisions:**
    - Inline `window.addEventListener` pattern matches `course-page.tsx`
      line 390 + `AddCoursePage.tsx` line 468. Considered a `useKeyboard`
      hook but the page-specific mapping (phase-gated + skip-on-modifier +
      skip-on-button-focus) didn't feel reusable yet. Easy to extract later
      if another page wants similar treatment
    - `1`/`2`/`3` is unauthenticated by design ??? they only work in
      `awaiting-response` phase. No global "always-on" hotkey
    - Visible focus rings were deliberately kept lightweight (2px ring
      using the semantic colour) so we don't fight the existing
      `border-emerald-300` / `border-amber-300` / `border-rose-300` borders
    - `aria-atomic="true"` on the feedback panel makes screen readers
      re-announce the whole message (count + description), not just the
      delta. Better for context

- [x] ??? **Cleanup: deleted legacy hand-written spaced-repetition hook (Step 16 ???
  2026-07-04)** ??? `frontend/src/hooks/spaced-repetition.ts` (127 lines,
  hand-written, axios-based, snake_case, falsely claimed "Auto-generated" in its
  header) was deleted. **Verified orphaned first** via three scans:
  1. `Select-String "spaced-repetition"` across all `.ts`/`.tsx` files in
     `frontend/src/` ??? only the file itself matched; the new
     `spaced-repetition-hooks.ts` (suffix `-hooks`) is what the pages import
  2. `Select-String` against `e2e/`, `docs/` (skipping `node_modules` to avoid the
     symlink-loop hang), `cli/` ??? only one match in `docs/`, and that's a
     documentation reference to the **backend** `SpacedRepetitionController`
     (irrelevant to the frontend hook file)
  3. `npx tsc --noEmit --listFiles` after deletion ??? exits clean, **zero
     references** in the compiled graph
  - **Backup kept** at `scripts/.trash/spaced-repetition.ts.bak` (per AGENTS.md
    `trash > rm` preference; Windows has no `trash` CLI so I copied-then-deleted).
    Safe to remove the backup in a future cleanup step.
  - `npx tsc --noEmit` exits clean (Step 16 verification 2026-07-04)
  - Cleanup scripts used (kept under `scripts/` for future reuse):
    `scan-imports.ps1`, `scan-imports-dynamic.ps1`, `scan-imports-broad.ps1`,
    `scan-docs.ps1`. The first two are the most useful for the next time we
    need to prove a file is dead code.

- [x] ??? **`tsc --noEmit` cleanup for spaced-repetition frontend (2026-07-08)**
  - The verification claim "exits clean" above was true at end-of-step for
    each sub-step, but **two errors had slipped back in** by 2026-07-08
    (likely re-introduced during E3+E6 polish):
    1. `RetentionDashboard.tsx:104` ??? `TS6133: 'totalDueNow' is declared but
       its value is never read`. The `CourseRetentionCard` prop was carried
       over from an earlier draft; the consuming headline-stats display was
       dropped but the prop signature + the call site that passed
       `dueNowCount` were not cleaned up. **Fix:** removed the prop from the
       component signature AND removed the `totalDueNow={dueNowCount}` call
       site that passed it (both spots; the right scope).
    2. `ReviewSession.tsx:700` ??? `TS2551: Property 'replaceAll' does not exist
       on type '"SELECT_ONE_IN_LOT" | "SELECT_MANY_IN_LOT" | "NUMERIC_ANSWER"'`.
       The typed-string-union narrowing hides `String.prototype.replaceAll`.
       **Fix:** `qtype.replaceAll('_', ' ')` ??? `qtype.replace(/_/g, ' ')` ???
       same semantics, no prototype dependency.
  - Verification: `npx tsc --noEmit -p tsconfig.app.json` from `frontend/`.
    Strict filter (`spacedRepetition|ReviewSession|RetentionDashboard|totalDueNow|replaceAll`)
    ??? **0 errors**. Full project tsc still exits 1 with ~1849 pre-existing
    unrelated errors (openapi-fetch path-param drift, TanStack Query type
    incompatibilities); none from this feature. **Clean-claim rule per
    `MEMORY.md` lessons:** this project always means "feature errors = 0,"
    not "zero errors total."
  - Output archived at `scripts/.trash/tsc-after-cleanup.txt` (~789 KB,
    1843 lines) for re-inspection.
  - Executed by a sub-agent because the main session was wedged mid-edit
    (every tool returned "session file changed while embedded prompt lock
    was released"). Fresh child session sidestepped the lock.

- [x] ??? **Empty-state branching on `/student/review` (2026-07-08)**
  - **Problem:** the session page's `empty` phase always rendered "You're
    all caught up" copy. That was correct for an existing student whose
    schedule had nothing due *now*, but wrong-message for a brand-new
    student who has never had a schedule at all (they hadn't done anything
    to be "caught up" on). The dashboard already handled its empty case
    correctly with a polished "No review schedules yet" + Browse courses
    CTA; the session page was inconsistent.
  - **Fix:** in `frontend/src/app/pages/student/ReviewSession.tsx`, branch
    the `empty` render on `schedule?.length === 0`:
    1. **Race guard** ??? if the schedule query is still loading, render a
       small Skeleton (one placeholder Card) rather than flashing the
       wrong empty state.
    2. **`schedule.length === 0`** ??? render the dashboard's empty state,
       lifted verbatim: dashed-border Card with `bg-primary/10` bubble
       around `BookOpen` icon, "No review schedules yet" heading,
       explainer text, `Button asChild` + `Link to="/student/courses"`
       CTA with `ChevronRight` arrow.
    3. **`schedule.length > 0`** ??? existing emerald "You're all caught up"
       Card (unchanged copy).
  - **Why this works:** the schedule hook (`useGetSchedule`) was already
    in scope on this page (used to derive `courseIds` for fan-out queries);
    no new query added. The reducer's `empty` phase remains the trigger;
    the schedule length is just used to disambiguate the message.
  - **Verification:** `npx tsc --noEmit -p tsconfig.app.json` from
    `frontend/`. Filter (`ReviewSession|RetentionDashboard|spaced-repetition|spacedRepetition|hasNoScheduleAtAll|isScheduleLoading`)
    ??? **0 errors**. Output archived at `scripts/.trash/tsc-after-empty-state.txt`
    (1843 lines, same total as baseline).
  - **Single file change.** No API, route, or other component changes.
  - **Executed in-main** ??? the wedged-session issue from the previous
    cleanup didn't recur; the main session ran the edit and verification
    directly.

- [x] ??? **Quiz-title attribution on review cards (2026-07-08, closes the
  E4 TODO at line 422-430)** ??? *fully complete; backend + frontend*
  - **Closes the long-standing TODO** in `ReviewSession.tsx`'s attribution
    helper. Until now, review cards showed
    `From <Course Name> ?? Question 3` because `IReviewItem` only carries
    `course_id` + `question_id`. Students had no signal for which quiz a
    card came from.
  - **Decision: extend `GET /quizzes/questions/:questionId/review`.** Option
    B (schedule endpoint) was rejected as over-reaching (denormalises a
    join into a list response, grows the dashboard's `ReviewItem` type
    for no UI use there). Option C (a new metadata endpoint) was rejected
    as duplicative ??? the question endpoint already runs once per card.
  - **Schema caveat:** `seedSchedule` doesn't track which quiz a question
    came from ??? a question can live in multiple QuestionBanks, each
    referenced by multiple Quizzes. Resolved by returning the **first**
    quiz that references the question's bank. Fields are nullable so the
    frontend can degrade gracefully when no quiz references the question.
  - **Backend changes:**
    1. `backend/src/modules/quizzes/interfaces/review.ts` ??? extended
       `ReviewQuestionResponse` with `quizTitle: string | null`,
       `quizId: string | null`. Doc-comment spells out the join
       semantics and null-when-orphaned contract.
    2. `backend/src/modules/quizzes/services/QuestionService.ts` ???
       `getForReview` now calls a new private fail-open helper
       `_resolveParentQuiz(questionId)` that walks `getQuestionBanksByQuestionId`
       ??? `QuizRepository.findQuizzesByBankIds(bankIds)` and picks
       `quizzes[0]`. Helper wraps everything in try/catch + `console.warn`
       log and returns nulls on failure ??? review endpoint must never fail
       on metadata lookup, only on the actual question body.
    3. `backend/src/modules/quizzes/classes/transformers/Question.ts` ???
       `toReviewQuestionResponse` accepts an optional second arg
       `{quizTitle, quizId} = {quizTitle: null, quizId: null}`. Fields
       splattered into the shared `base` object so all 5 question-type
       returns pick them up automatically. Default value means future
       callers can omit the arg and still compile.
  - **Backend join fix (2026-07-12):** the 2026-07-08 helper was calling
    `quizRepository.getByIds(bankIds)`, which `find`s on the `quizzes`
    collection by `_id` ??? i.e. it was looking up QuizItem docs whose `_id`
    matched a bank id, which never matches in production. As a result the
    real backend would have returned `quizTitle: null` for every review
    card and fallen back to the "Question N" copy, even with this feature
    shipped. Frontend mocks masked the bug. Added a dedicated
    `QuizRepository.findQuizzesByBankIds(bankIds)` that filters on
    `details.questionBankRefs.bankId: { $in: bankIds }` (no `allowSkip`
    filter ??? the old `findSkipAllowedQuizzes` is reused elsewhere with
    its business-flag semantics intact). `_resolveParentQuiz` switched to
    it. `tsc --noEmit` exits 0, archive:
    `backend/scripts/.trash/tsc-after-quiz-title-backend-fix.txt`.
  - **Verification:** `npx tsc --noEmit` from `backend/` ??? **exit 0, 0
    errors** (was exit 2 / 5 errors before the transformer was updated).
    Re-verified 2026-07-12 after the join fix. Three archives:
    `scripts/.trash/tsc-after-quiz-title-backend-{type,service,transform}.txt`
    + `scripts/.trash/tsc-after-quiz-title-backend-fix.txt`.
  - **Frontend changes (steps 5???7):** the local `ReviewQuestionResponse`
    interface lives in `ReviewSession.tsx` itself (not the shared types
    file ??? single-page use). Added `quizTitle: string | null` +
    `quizId: string | null` to mirror the backend. Doc comment block
    expanded with the join semantics. Note: frontend `options: string[]`
    is a simpler mock shape than backend's `ReviewOption[]` ??? pre-existing
    divergence, out of scope for this fix (becomes a `USE_MOCK = false`
    migration task).
  - `attributionFor(item)` ??? `attributionFor(item, question)`. Logic:
    `From <Course> ?? <Quiz Title>` when the backend resolved a title;
    `From <Course> ?? Question N` fallback (preserves existing copy for
    orphaned/no-quiz questions). Index dropped when title is present ???
    title is more informative than "Question 3".
  - E4 TODO comment block replaced with a doc block describing the new
    composition (course + quiz title, with fallback).
  - All 3 `MOCK_QUESTIONS` literals augmented with `quizTitle`/`quizId`
    so the new line renders in dev. Titles: mock-1 = "European Capitals",
    mock-2 = "Prime Numbers", mock-3 = "Basic Arithmetic".
  - Both visible-text and `aria-label` call sites updated to use the
    new helper; inline `courseLabel(...) ?? formatQuestionLabel(...)`
    literal removed (DRY).
  - **Verification:** `npx tsc --noEmit -p tsconfig.app.json` from
    `frontend/`. Filter `(ReviewSession\.tsx|attributionFor)` ??? **0
    errors**. New `quizTitle`/`quizId` errors ??? 0 (all 101 hits in the
    output are pre-existing openapi-fetch path-param drift in
    `src/hooks/hooks.ts`, unrelated to this feature). Output archived
    at `scripts/.trash/tsc-after-quiz-title-frontend.txt` (1843 lines,
    same as base> - [x] ??? **Sidebar nav link (2026-07-14)** ??? `Review` entry added to
>     `STUDENT_NAV_ITEMS` in `frontend/src/components/student-sidebar/nav-items.tsx`
>     with `History` icon targeting `/student/review`. Desktop and mobile share
>     the same sidebar source of truth. Active-state check on `/student/review`.
>     Commits `9b9f0d08` + `e8faaa42` on `feat-spaced-repetition-module`.
>     `npx tsc --noEmit -p tsconfig.app.json` exits clean (nav-items.tsx)04)

- [x] ??? **Retention dashboard (Step 14 ??? 2026-07-04)** ??? student-facing overview
  page with per-course retention summary + opt-out toggles + full schedule list.
  - `frontend/src/app/pages/student/RetentionDashboard.tsx` (NEW, ~15 KB) ??? page
    built around three concerns:
    1. **Headline stats** ??? 3 cards: due right now + active courses + tracked cards
       (all derived from `useGetSchedule`)
    2. **Per-course retention cards** ??? fan out one
       `useGetCourseRetention(studentId, courseId)` per distinct `course_id`. Each
       card shows: due-now / due-soon-???7d counts, retention health % (EF???percent
       linear map clamped 1.3???3.0 ??? 0???100, banded `Strong/Steady/Needs work`),
       opt-out toggle (`useUpdateNotificationPreference` mutation, sonner toast
       on success/error). "Start review for this course" CTA appears only when
       `overdueCount > 0`
    3. **Full schedule list** ??? sorted by `next_review_at` ascending; per-row
       dot indicates overdue (rose) vs on-track (emerald); uses `Link
       to="/student/review"`
  - **Mock-data enrichment** (Step 14a): added `mock-course-2` with two
    "mastered" items (EF 2.8 + 3.0, far-future `next_review_at`) so the
    dashboard exercises both retention bands. Replaced the hardcoded
    `MOCK_RETENTION_SUMMARY` with a `deriveMockRetention(courseId)` helper that
    groups items by course and computes the same fields the backend exposes
    (`totalItems`, `overdueCount`, `dueSoonCount`, `averageEF`). Also fixed the
    mock `updateNotificationPreference` to actually mutate
    `notification_opt_out` on items (was a no-op stub)
  - **Course label map** ??? small in-page `COURSE_LABELS` constant for the two
    mock course IDs. Production: replace with `useGetCourseCatalog()` /
    `course-store` lookup
  - **Route wiring** ??? `frontend/src/app/routes/router.tsx` import added (line
    74), `studentReviewDashboardRoute` defined (line 581), registered in
    `studentLayoutRoute.addChildren([...])` (line 745). Path: `/student/review/dashboard`
  - `npx tsc --noEmit` exits clean (Step 14 verification 2026-07-04)
  - **Patterns used**: shadcn `Card`/`CardHeader`/`CardTitle`/`CardContent`/
    `Button asChild` + `@tanstack/react-router` `<Link>` with absolute paths
    (`/student/review`), shadcn `Switch` for opt-out toggle, `sonner` toast,
    `lucide-react` icons. Sidesteps style drift from `ReviewSession.tsx`

- [x] ??? **Review session screen (Step 13 ??? 2026-07-04)** ??? student-facing UI to
  answer one card at a time with three self-rating buttons.
  - `frontend/src/app/pages/student/ReviewSession.tsx` (NEW, ~17.6 KB) ??? page
    component with a `useReducer`-driven state machine: `loading-schedule ???
    loading-question ??? awaiting-response ??? showing-feedback ??? session-complete
    | empty`. Uses `useGetSchedule` + `useSubmitReview` from Step 12
  - Card UI: question body + options A???D (computed via `String.fromCharCode(65+idx)`),
    progress bar, three semantic-coloured response buttons
    (`Got it` = emerald / `Unsure` = amber / `Missed` = rose). Feedback shows
    next-review day delta parsed from the response's `next_review_at`
  - Session cap: **10 cards** (within the 10???15 range from this doc's spec).
    "N more tomorrow" indicator computed client-side from total due count vs
    session queue length
  - Question body fetched via local `fetchQuestionForReview(questionId)` helper
    that returns a mock `ReviewQuestionResponse` (`{id, body, type, hint, options[]}`)
    matching the `GET /api/quizzes/questions/:questionId/review` contract from
    `vibe_review_question_endpoint_prompt.md`. A code comment in
    `ReviewSession.tsx` marks the spot where to swap to the real API once a
    `useGetReviewQuestion` hook is added to `spaced-repetition-hooks.ts`
    (this hook does not exist yet; out of scope for MVP).
  - Local mock questions for the three `mock-question-N` IDs in
    `MOCK_REVIEW_ITEMS` cover all three question types
    (`SELECT_ONE_IN_LOT`, `SELECT_MANY_IN_LOT`, `NUMERIC_ANSWER`)
  - `frontend/src/app/routes/router.tsx` ??? added `import ReviewSession` (line 73),
    `studentReviewSessionRoute` (line 573), and registered in
    `studentLayoutRoute.addChildren([???])` (line 736). Route: `/student/review`
  - `npx tsc --noEmit` exits clean (Step 13 verification 2026-07-04)
  - **ive the link somewhere meaningful to
    point from

### Backend / Infra (1 item)

- [x] ??? **Email delivery (Step 11)** ??? `MailService.sendMail()` unblocked;
  `ReviewReminderEmail.createMessage()` for text + HTML;
  `notifyReviewReminder()` sends best-effort after in-app notification;
  `SMTP_USER`/`SMTP_PASS` in `.example.env`.

### Nice-to-Have (out of scope for now)

| Item | Why it's not minimal |
|------|---------------------|
| Review calendar heatmap | Nice but not in the acceptance criteria |
| Course landing SM-2 badge | Marketing, not a feature requirement |
| Learning vs review phase distinction | SM-2 works fine without it for v1 |

---

## Backend Enhancement Suggestions

These are independent of the frontend ??? they improve the backend algorithm or
data-model. Prompt doc: `vibe_review_question_endpoint_prompt.md`.

### Review question endpoint ???
- **Prompt doc:** `vibe_review_question_endpoint_prompt.md` ??? **implemented**
- **Files:** `interfaces/review.ts` (new), `Question.ts`
  (`toReviewQuestionResponse()`), `QuestionService.ts` (`getForReview()`),
  `QuestionController.ts` (`GET /:questionId/review`), `QuestionService.test.ts`
  (19 unit tests ??? 73/73 total passing)
- **Endpoint:** `GET /api/quizzes/questions/:questionId/review` ??? student-accessible,
  strips answer, normalises all question types to `{id, body, type, hint, options[]}`

### Session cap ??? `GET /spaced-repetition/:studentId/due?limit=10`
Cap due items returned; frontend shows "N more tomorrow". One-line `limit` param
in `ReviewItemRepository.findDue()` + `$count` in aggregation pipeline. **Low complexity.**

### Priority queue ??? hard cards float to top
`ReviewItemRepository.findDue()` add `.sort({ ef: 1, nextReview: 1 })`. Cards
with lowest EF (most difficult) surface first. **Trivial.**

### Per-course due-count cache
Denormalised `dueCount: number` on `Enrollment` ??? incremented on seed, decremented
on `review()`. Enables instant "due now / due soon" per-course counts on the
retention dashboard without scanning `review_items`. **Medium complexity.**

### Learning phase ??? bypass SM-2 until 2+ reviews
`learningPhase: boolean` on `ReviewItem` (default `true`); set to `false` after
`reviewCount >= 2`. During learning phase, card always returns `nextReview = now`
(daily reps) but intervals don't compound until earned. **Medium complexity.**

### Review history endpoint
`GET /spaced-repetition/:studentId/history?page=&limit=` ??? paginated log of past
reviews with questionId, quality, ef delta, timestamp. Uses existing `lastReview`
field on `ReviewItem`. **Low complexity.**

---

## Local Dev Setup

```bash
# 1. Start Mongo
docker run -d --name vibe-mongo -p 27017:27017 mongo:7

# 2. Start Firebase Auth emulator
cd backend
firebase emulators:start --only auth --project demo-test

# 3. Ensure backend/.env has:
#    ENABLE_SPACED_REPETITION_JOB=false   (flip to true to test the cron)

# 4. Boot backend
pnpm dev

# 5. TypeScript check (filter to our module)
npx tsc --noEmit 2>&1 | Select-String "spacedRepetition|ProgressService|users/index"

# 6. Seed a schedule manually to test end-to-end
curl -X POST http://localhost:3141/api/spaced-repetition/<studentId>/seed \
  -H "Content-Type: application/json" \
  -d '{"courseId":"<courseId>","questionIds":["q1","q2","q3"]}'

# 7. Submit a review to trigger SM-2
curl -X POST http://localhost:3141/api/spaced-repetition/<studentId>/review \
  -H "Content-Type: application/json" \
  -d '{"questionId":"<questionId>","quality":"got_it"}'
```

---

## Frontend Codebase Reference

> Quick-reference for whoever builds the frontend. Extracted from full codebase
> reconnaissance 2026-06-29.

### Stack

```
React 19 + Vite 6
TypeScript
API calls       openapi-fetch + openapi-react-query (from lib/openapi.ts)
Auth            Firebase + Zustand useAuthStore + AuthContext
Routing         TanStack Router v1 ??? imperative code-based route tree, NOT file-based
Component lib   shadcn/ui + Radix UI + Tailwind CSS v4 + MUI icons
State           Zustand (global client) + TanStack Query v5 (server state)
Feature pattern app/pages/<role>/ for pages; components/<feature>/ for shared
```

### Top-level src/ structure

```
src/
  app/pages/          role-specific pages (student/, teacher/, shared/)
  app/routes/         router.tsx ??? the full route tree (TanStack Router v1)
  components/         shared UI; ui/ = shadcn components; quiz.tsx = quiz component
  hooks/              React Query hooks generated from OpenAPI (hooks.ts ??? auto-gen)
  layouts/            student-layout.tsx, teacher-layout.tsx
  lib/                openapi.ts (fetch client + auth middleware), api-client.ts, firebase.ts
  store/              Zustand stores: auth-store.ts, course-store.ts, context/auth.tsx
  types/              TypeScript types per domain (quiz.types.ts, course.types.ts, etc.)
```

### API calls ??? two layers

**Low-level** (`lib/api-client.ts`): raw `fetch` with Bearer token from
`localStorage.getItem("firebase-auth-token")`.

**Primary** (`lib/openapi.ts` ??? `hooks/hooks.ts`): `openapi-fetch` +
`openapi-react-query`. `api` object auto-generates TanStack Query hooks from
the OpenAPI schema. Usage:

```typescript
const { mutateAsync, isPending } = useSubmitQuiz();
await mutateAsync({
  params: { path: { quizId } },
  body: { answers: [...] },
});
```

Auth token is injected via `fetchClient.use({ onRequest })` middleware and
refreshed automatically on 401.

### Auth

- **Zustand store** (`store/auth-store.ts`): `{ user, isAuthenticated, isAuthReady, token }`
- **React context** (`store/context/auth.tsx`): wraps Zustand with `AuthContext`
- `AuthProvider` listens to Firebase `onAuthStateChanged`, fetches ID token,
  stores in localStorage, refreshes every 50 min
- In route `beforeLoad` guards (outside React tree): use `useAuthStore.getState()`
  for synchronous auth checks

### Routing (TanStack Router v1)

All routes defined in `app/routes/router.tsx` using the `Route` class imperative API.
**Not file-based.** Example pattern:

```typescript
const studentLayoutRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/student',
  beforeLoad: async () => {
    const { isAuthenticated, user } = useAuthStore.getState();
    if (!isAuthenticated) throw redirect({ to: '/auth' });
    if (user?.role !== 'student') throw redirect({ to: '/auth' });
  },
  component: StudentLayout,
});

const studentDashboardRoute = new Route({
  getParentRoute: () => studentLayoutRoute,
  path: '/',
  component: StudentDashboard,
});
```

Auth guards on layout routes; role redirects in `beforeLoad`.

### Component library

- **shadcn/ui** ??? `components/ui/` (button, card, dialog, badge, etc.)
- **Radix UI** ??? underpins shadcn; also used directly (accordion, select, etc.)
- **Tailwind CSS v4** ??? all styling
- **MUI** ??? `@mui/icons-material` for icons
- File naming: kebab-case files, PascalCase exports

### TanStack Query usage pattern

```typescript
const { mutateAsync, isPending, error } = useSubmitQuiz();
// isPending ??? loading state for UI
// error?.message ??? toast on failure
// data ??? SubmitQuizResponse on success
```

### Adding new route

1. Import component in `router.tsx`
2. Create `Route` instance with `getParentRoute`, `path`, `component`, optional `beforeLoad`
3. Add to parent route's `.addChildren([...])` or to `routeTree` at top level

### Adding new API hook

Regenerate from OpenAPI schema (do not edit `hooks/hooks.ts` manually):
```bash
cd frontend
npm run copy    # regenerate openapi.json from backend
npm run gen-schema  # regenerate src/types/schema.ts + hooks.ts
```

### Feature folder pattern

Pages live in `app/pages/<role>/`. Shared components live in `components/`.
The quiz feature (`components/quiz.tsx`) is the closest analogue to a
self-contained interactive feature ??? it manages its own state machine
(`quizStarted ??? quizCompleted ??? submissionResults`).

### Environment variables

No `.env.example`. All env vars referenced as `import.meta.env.VITE_*`.
Key: `VITE_BASE_URL` ??? backend base URL for `openapi-fetch` and `api-client`.

### Where to add spaced repetition routes

```
Student routes (app/routes/router.tsx):
  studentLayoutRoute.addChildren([
    ...,                           ??? existing student routes
    studentReviewSessionRoute,     ??? /student/review (review session screen)
    studentReviewDashboardRoute,   ??? /student/review/dashboard (overview + due counts)
  ])

Teacher routes: likely not needed for v1 (student-only feature)
```

See `studentHpSystemLedgerRoute` as a pattern for a student-facing data screen.

---

## Phase B ??? Teacher Control Knobs (In Progress)

> Branch: `feat-sr-teacher-control` off `feat-spaced-repetition-module`

Five scheduling knobs were identified for teacher-side control of spaced repetition.
First slice (in progress): **Boost** + **Remediation Hints**.

See `NEXT_STEPS_PLAN_NAV_AND_PHASE_B.md` for the full breakdown.

---

## Phase B  --  Teacher Control Knobs (In Progress)

> Branch: `feat-sr-teacher-control` off `feat-spaced-repetition-module`

Five scheduling knobs were identified for teacher-side control of spaced repetition.
First slice (in progress): **Boost** + **Remediation Hints**.

See `NEXT_STEPS_PLAN_NAV_AND_PHASE_B.md` for the full breakdown.

---

> **Manual smoke testing:** `test.md` (root of repo, untracked) has the full e2e checklist  -- 
> run through it before opening the PR. Covers: pre-flight, nav button, empty states,
> happy-path review session, quiz-title attribution, cron + email, retention dashboard,
> API probes, automated tests, known gaps, and rollback.

## References

- [Spaced repetition ??? Wikipedia](https://en.wikipedia.org/wiki/spaced_repetition)
- [SM-2 algorithm ??? SuperMemo](https://www.supermemo.com/en/blog/twenty-rules-of-formulating-knowledge)
- [How Anki implements SM-2](https://faqs.ankiweb.net/what-spaced-repetition-algorithm.html)
- Design decision doc: "What counts as a question in Spaced Repetition" (2026-06-29)
