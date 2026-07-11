# Manual test — Spaced Repetition (SM-2)

> **What this is:** A checklist for manually testing everything shipped for the
> spaced-repetition feature up to 2026-07-08. End-to-end smoke test; covers
> backend seed, cron, frontend review session, frontend retention dashboard,
> and the quiz-title attribution change.
>
> **What this is *not*:** A replacement for unit/integration tests. The backend
> has 32 tests (`backend/src/modules/spacedRepetition/tests/`) that run with
> `npx vitest run src/modules/spacedRepetition/tests/` against an in-memory
> MongoDB. Run those first as a faster signal.

---

## 0. Pre-flight

| Step | Command | Expected |
|---|---|---|
| Start MongoDB | `docker start vibe-mongo` (or `docker run -d --name vibe-mongo -p 27017:27017 mongo:7` first time) | Container up on port 27017 |
| Start Firebase Auth emulator | `cd backend && firebase emulators:start --only auth --project demo-test` | Emulator UI on http://localhost:4000, Auth on 9099 |
| Start backend | `cd backend && pnpm dev` | Listening on http://localhost:3141, Scalar API docs on http://localhost:3141/reference |
| Start frontend | `cd frontend && pnpm dev` | Listening on http://localhost:5173 |
| Sanity check API | Open http://localhost:3141/reference | Scalar UI loads; 5 spaced-repetition endpoints visible |

**Status of new env var:** `ENABLE_SPACED_REPETITION_JOB` is now in the
`.env` template (`vibe_local_setup_guide.md` updated 2026-07-08). Defaults
to `false`. For cron test (§6), flip to `true` in `backend/.env`.

**Status of `USE_MOCK`:** in `frontend/src/lib/spaced-repetition-api.ts`.
Default `true` (frontend uses mock data). For tests against the real
backend (§§ 3, 5, 6), flip to `false`.

---

## 1. Brand-new student — empty state on `/student/review`

This is the empty-state branching we added 2026-07-08. Validates the
race-condition guard and the "No review schedules yet" copy.

**Setup:** brand-new account, no completed courses, `USE_MOCK = true`.

1. Sign up a new student.
2. Navigate to http://localhost:5173/student/review.
3. **Expected (race-condition guard):** Skeleton visible briefly while
   the schedule query loads.
4. **Expected (empty state):** Card with title **"No review schedules
   yet"**, body explaining that the student needs to complete a course
   first, and a **"Browse courses"** button as the primary CTA.
5. Click **"Browse courses"** → navigates to `/student/courses` (or
   the platform's course-list page).
6. **Negative check:** the *previous* message ("You're all caught up!")
   should NOT appear. That was the off-message copy the empty-state
   branching was designed to replace.

**Validated by:** `frontend/src/app/pages/student/ReviewSession.tsx`
lines 552-590 (the `hasNoScheduleAtAll` branch and the
`isScheduleLoading` Skeleton guard).

---

## 2. Existing student with no due items — "all caught up" state

This is the *other* empty state — a student who has completed courses
but has nothing due right now. Should still show the emerald
"You're all caught up" copy.

**Setup:** student has at least one completed course. Either (a) flip
`USE_MOCK = true` and ensure the mock schedule has no `due` items
today, or (b) flip `USE_MOCK = false` and use a real student whose
schedule is all in the future.

1. Sign in as the existing student.
2. Navigate to http://localhost:5173/student/review.
3. **Expected:** Skeleton briefly, then the **emerald "You're all
   caught up"** card (NOT the "No review schedules yet" card from §1).
4. The dashboard link "Open retention dashboard" should still work.

**Validated by:** `ReviewSession.tsx` — the `empty` render branches
on `schedule.length === 0`. With `schedule.length > 0` and no items
due, the original copy is used.

---

## 3. Review session — happy path

**Setup:** `USE_MOCK = false`. Real student, real schedule with at
least 1 due item. The easiest way to set this up: complete a course
end-to-end first; that fires the seed hook in `ProgressService.stopItem`
(line 2666 of `ProgressService.ts`).

1. Sign in as a student who has completed a course (or use the seed
   endpoint manually — see §3a).
2. Navigate to http://localhost:5173/student/review.
3. **Expected:** First due question card renders with:
   - Question body
   - Hint (if the question has one)
   - Multiple-choice options A–D (radio buttons)
   - Three response buttons: **"Got it"**, **"Unsure"**, **"Missed"**
   - Attribution line: `From <Course Name> · <Quiz Title>` — see §4
     for the known-broken note about this
4. Click **"Got it"** → POST `/api/spaced-repetition/:studentId/review`
   with quality `got_it` (mapped to SM-2 q=5).
5. **Expected:** card flips to a "Next review in N day(s)" feedback
   panel, then auto-advances to the next due item (or shows
   "Session complete" if that was the last).
6. Click **"Missed"** on a different card → quality `missed` (q=1)
   fires the same flow. The next interval should be **shorter** than
   for "Got it".
7. Click **"Unsure"** → quality `unsure` (q=3) — interval should be
   intermediate.
8. **Session cap check:** if more than 10 items are due, only the
   first 10 should appear; the page should show a "N more tomorrow"
   indicator (or similar) below the last card.
9. **Empty after session:** after submitting the last card, the
   page should return to the "You're all caught up" emerald state
   (the path that was already correct).

### 3a. Manual seed (if no completed courses)

POST to the seed endpoint directly:

```bash
curl -X POST http://localhost:3141/api/spaced-repetition/<studentId>/seed \
  -H "Authorization: Bearer <firebase-id-token>" \
  -H "Content-Type: application/json" \
  -d '{"courseId":"<courseId>","courseVersionId":"<versionId>"}'
```

The student must own the course. The endpoint reads the course
structure, walks quiz items → question banks → questions, and creates
one `ReviewItem` per question (not per quiz item — a quiz with 10
questions = 10 ReviewItems).

**Expected response:** `{seeded: N, alreadyExisting: M}` where
`N + M` = total questions in the course.

---

## 4. Quiz-title attribution (⚠️ known-broken join)

**Status:** The frontend change shipped (2026-07-08). The backend
extension shipped (new `quizTitle` / `quizId` fields on
`ReviewQuestionResponse`). **But the backend join has a bug found
in tonight's code review:** the `_resolveParentQuiz` helper in
`QuestionService.ts` calls the wrong repository method
(`getByIds` instead of a proper QuestionBank → Quiz join), so in
production `quizTitle` is always `null`.

**What you should see:**
- ✅ With `USE_MOCK = true`: the three mock questions each have
  hardcoded `quizTitle` ("European Capitals", "Prime Numbers",
  "Basic Arithmetic"), so attribution shows
  `From <Course> · <Quiz Title>`. **This is the dev path that
  *looks* like the feature works.**
- ❌ With `USE_MOCK = false` (real backend): `quizTitle` returns
  `null` for every card. The frontend falls back to
  `From <Course> · Question 3` — the same attribution as before
  the fix.

**This is graceful degradation working correctly** — the feature
was designed to fail-soft — but the underlying join is broken and
must be fixed in a future session. See the
`2026-07-08 code review of the quiz-title changes` bullet in
`MEMORY.md` for the bug details and the
`Quiz-title attribution — partially done` bullet in
`spaced-repetition.md` §9 for the user-facing summary.

**Test:** run §3 once with each `USE_MOCK` value. With `true`,
attribution shows quiz title; with `false`, attribution shows
"Question N". The fact that both paths *render without error* is
the success criterion for graceful degradation. The fact that the
real backend path *doesn't show the quiz title* is the open bug.

---

## 5. Retention dashboard

**Setup:** student with at least one completed course. `USE_MOCK`
either value works — the dashboard mostly reads aggregate stats.

1. Navigate to http://localhost:5173/student/review/dashboard.
2. **Expected:** Per-course card for each completed course showing:
   - Course name
   - Retention health % (avg EF normalised to 0-100)
   - Count of due items (in green if zero, in red if >0)
   - Opt-out toggle for review notifications
3. **Schedule list:** a chronological list of all upcoming reviews
   (per-question, not per-quiz).
4. **Opt-out toggle:** click → PATCH
   `/api/spaced-repetition/:studentId/notifications` with
   `{enabled: false}`. **Expected:** the toggle flips off, the
   API returns `{enabled: false}`, and the student's cron-scheduled
   notifications (§6) will skip them on the next run.
5. **Empty state for new students:** a student with zero completed
   courses should see the dashboard's "No review schedules yet"
   empty card (with Browse-courses CTA). The same Card is rendered
   on the review session page when `schedule.length === 0` (see §1).

**Validated by:** `frontend/src/app/pages/student/RetentionDashboard.tsx`
+ 2 GET endpoints (`/schedule`, `/course/:courseId`) +
1 PATCH endpoint (`/notifications`).

---

## 6. Hourly cron + email reminder

**Setup:** `ENABLE_SPACED_REPETITION_JOB=true` in `backend/.env`.
Backend restarted. Student has at least one `ReviewItem` whose
`next_review_at` is in the past. SMTP creds set (`SMTP_HOST`,
`SMTP_USER`, `SMTP_PASS` — Gmail SMTP App Password, not login
password).

1. Wait for the next top-of-hour (`0 * * * *`, Asia/Kolkata).
2. **In-app notification:** the student should see a new
   `review_reminder` notification in their in-app inbox.
3. **Email:** the student should receive an email from
   `ReviewReminderEmail.createReviewReminderEmailMessage()`
   — see `backend/src/modules/spacedRepetition/services/email/ReviewReminderEmail.ts`
   for the body template. Email lists up to 3 courses whose items
   are due.
4. **Opt-out respected:** a student with `notifications_enabled: false`
   should be skipped (cron logs the skip but doesn't send).
5. **Fail-open on email failure:** if SMTP is misconfigured, the
   cron should log a warning and *not* throw — notifications are
   best-effort. Confirm by setting `SMTP_PASS=wrong` and verifying
   the cron still runs at the next hour.

**Cron config:** `backend/src/modules/spacedRepetition/cron/reviewNotificationJob.ts`,
`node-cron` schedule `0 * * * *`, timezone `Asia/Kolkata`.

**If you want to trigger the cron without waiting an hour:** add a
one-off `await reviewNotificationJob()` call in a script (or a
debug `console.log` in the cron itself), restart, and re-roll. Don't
do this in a real env.

---

## 7. Backend API reference

All 5 spaced-repetition endpoints are documented in
http://localhost:3141/reference (Scalar UI). Quick reference:

```
POST   /api/spaced-repetition/:studentId/seed
POST   /api/spaced-repetition/:studentId/review
GET    /api/spaced-repetition/:studentId/schedule
GET    /api/spaced-repetition/:studentId/course/:courseId
PATCH  /api/spaced-repetition/:studentId/notifications

GET    /api/quizzes/questions/:questionId/review
       (returns {id, body, type, hint, options[]}, plus the
       broken-in-prod quizTitle/quizId fields — see §4)
```

All endpoints require Firebase Auth bearer token. Auth is wired via
Firebase emulator in dev; in prod it's the real Firebase project.

---

## 8. Automated test suite (fast signal)

```bash
cd backend
npx vitest run src/modules/spacedRepetition/tests/
```

**Expected:** all 32 tests pass across 3 files:
- `sm2.test.ts` (14 unit tests for the SM-2 algorithm — EF math,
  interval compounding, 1.3 floor, q<3 behaviour)
- `ReviewItemRepository.test.ts` (18 integration tests against
  `mongodb-memory-server` — seed, query by student/course, update
  on review, unique-index guards)
- `ReviewReminderEmail.test.ts` (email template rendering)

**Tsc check (the one we've been using as our "is it clean?" signal):**
- Backend: `cd backend && npx tsc --noEmit` → **exit 0, 0 errors**
- Frontend: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
  → spaced-repetition files contribute 0 errors (the 1843 pre-existing
  project hygiene errors from openapi-fetch path-param drift and
  TanStack Query type incompat are unrelated; ignore).

---

## 9. Known gaps / not yet tested

These are documented in `MEMORY.md` and `spaced-repetition.md` as
known-open. **Don't add tests for them; they're future work.**

- Backend session-cap endpoint
  (`GET /:studentId/due?limit=10?sortBy=easyFactor-asc`). Currently
  the cap is enforced client-side (`SESSION_CAP = 10` in
  `ReviewSession.tsx`); server has no equivalent.
- Lowest-EF-first ordering (review hard questions first). Today the
  order is whatever Mongo returns.
- Review-history pagination. No history endpoint exists yet.
- Quiz-title precise attribution (would require the seed contract
  to pass `quizId` per question, not just `questionId`).
- The bug in `_resolveParentQuiz` (see §4). Fix is a new repo method
  `findQuizzesByBankIds(bankIds)`; tracked for next session.

---

## 10. Rollback

If something is wrong mid-test and you need to bail:

| Symptom | Action |
|---|---|
| Frontend broken | `cd frontend && rm -rf node_modules/.vite && pnpm dev` |
| Backend broken | `cd backend && pkill -f "pnpm dev" && pnpm dev` |
| Bad data in Mongo | `docker stop vibe-mongo && docker rm vibe-mongo && docker run -d --name vibe-mongo -p 27017:27017 mongo:7` (drops DB) |
| Want to abandon a single spaced-rep PR's data | `mongosh vibe --eval "db.review_items.deleteMany({})"` (preserves everything else) |

---

*Last updated: 2026-07-08 22:56. Covers the work shipped 2026-07-04
(review session + dashboard) and 2026-07-08 (tsc cleanup, empty-state
branching, quiz-title extension with the join bug).*
