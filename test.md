# Spaced Repetition — End-to-End Verification Checklist

> **Date:** 2026-07-17
> **Status:** Pending — none of these have been executed end-to-end live yet. The nav-button gap was closed today (commit pending); once the frontend boots and a real student signs in, walk this top-to-bottom.

This file is the manual smoke test for the spaced-repetition module. Each section lists the prerequisite state, the action, and what "pass" looks like. The pass criteria are written so a single observer can run them without guessing.

---

## Pre-flight (every run)

1. **Mongo is up**
   - `mongod.exe` PID exists on `127.0.0.1:27017` (standalone Windows service).
   - Verify: `Test-NetConnection 127.0.0.1 -Port 27017` returns `TcpTestSucceeded : True`.
2. **Firebase Auth emulator is up**
   - `cd backend && firebase emulators:start --only auth --project demo-test`
   - Verify: emulator UI at `http://127.0.0.1:4000/auth` loads.
3. **Backend is up**
   - `cd backend && pnpm dev` → listens on `http://localhost:3141`.
   - Verify: `http://localhost:3141/reference` (Scalar UI) renders all 5 SR routes:
     - `POST /api/spaced-repetition/:studentId/seed`
     - `POST /api/spaced-repetition/:studentId/review`
     - `GET  /api/spaced-repetition/:studentId/schedule`
     - `GET  /api/spaced-repetition/:studentId/course/:courseId`
     - `PATCH /api/spaced-repetition/:studentId/notifications`
   - Also verify: `GET /api/quizzes/questions/:questionId/review` route exists.
4. **Frontend is up**
   - `cd frontend && pnpm dev` → listens on `http://localhost:5173`.
   - Verify: sidebar shows a **"Review"** entry with a `History` icon, below "My Submissions".
5. **`.env` configuration**
   - `backend/.env` has `ENABLE_SPACED_REPETITION_JOB=false` by default. Flip to `true` only when testing the cron (see §6).
   - `frontend/.env.local` has `VITE_BASE_URL=http://localhost:3141/api` (with trailing `/api` — confirmed working as of 2026-07-14).

---

## §1. Sidebar nav button (the 2026-07-17 fix)

**Prereq:** signed in as any student.

| Step | Expected |
|---|---|
| Open `http://localhost:5173/student` | Sidebar visible, "Review" entry present (icon: clock-arrow-back) |
| Click "Review" | Lands on `/student/review` |
| Visit `/student/some-other-page` | "Review" entry still visible in sidebar |
| Resize to mobile width | Sidebar collapses to off-canvas; "Review" present in the drawer |

**Pass:** Review is reachable via the sidebar on every student page, no URL-typing required.

---

## §2. Brand-new student empty state

**Prereq:** signed in as a student who has **never completed a course**. Seed is empty. `localStorage` cleared.

| Step | Expected |
|---|---|
| Navigate to `/student/review` | Skeleton briefly, then the polished empty Card: "No review schedules yet" + "Browse courses" CTA (NOT the emerald "all caught up" copy — that would be off-message for a brand-new student) |
| Click "Browse courses" | Lands on `/student/courses` |
| Navigate to `/student/review/dashboard` directly | Same empty-state Card rendered (consistency across the two pages) |

**Pass:** A brand-new student sees helpful copy, not a misleading "all caught up."

---

## §3. Existing-student empty state

**Prereq:** student has completed at least one course but has no items currently due (all scheduled in the future).

| Step | Expected |
|---|---|
| Navigate to `/student/review` | Skeleton, then the emerald "all caught up" empty state (the original copy — fine for an existing student with a populated schedule) |
| Navigate to `/student/review/dashboard` | "No reviews due yet" or similar copy; per-course cards visible |

**Pass:** the two pages are clearly differentiated by context (new vs existing student).

---

## §4. Happy-path review session

**Prereq:** student has at least 5 due items. Use `scripts/test-seed-review-items.ps1` to backdate `review_items` to "due now" if natural seeding isn't fast enough.

| Step | Expected |
|---|---|
| Navigate to `/student/review` | First card renders with question text + 2-4 options |
| Click an option | Option highlights green (correct) or red (wrong); the correct answer is revealed |
| Answer-reveal banner | Shows "Got it" / "You missed it — here's why" + remediation hint if `question.remediation` is set |
| Click "Got it" / "Unsure" / "Missed" | Buttons submit; backend `POST /api/spaced-repetition/:studentId/review` returns updated SM-2 state; next card loads |
| Card 10 (last in 10-card session) | "Session complete" screen shows next-interval feedback per card |

**Pass:** SM-2 advances correctly (n increments on correct, EF updates per formula, interval compounds). Mongo `review_items` document for that student+question reflects the update.

---

## §5. Quiz-title attribution

**Prereq:** a course with a quiz referencing one of the seed questions.

| Step | Expected |
|---|---|
| Open `/student/review` for a known-seeded student | Card sub-header reads `From <Course> · <Quiz Title>` (e.g. "From Algebra 101 · Mid-term review") |
| Mongo sanity check | `review_items` document shows `quizTitle` populated when question is referenced by a quiz |

**Pass:** Title renders against the live backend (NOT the mocked frontend data only).

**Known-broken note (carried from the 2026-07-08 audit):** if `quizTitle` is silently `null` despite the question being part of a known quiz, the join logic in `_resolveParentQuiz` (`backend/src/modules/quizzes/services/QuestionService.ts`) may still have a stale path. The 2026-07-12 backend join fix added `QuizRepository.findQuizzesByBankIds`, but verify this end-to-end.

---

## §6. Hourly cron + email

**Prereq:** at least one student has due items; `ENABLE_SPACED_REPETITION_JOB=true` in `backend/.env`; backend restarted.

**Two ways to run this:**

(a) **Wait for the top of the hour** — cron expression is `0 * * * *` Asia/Kolkata.

(b) **Fire it manually** without waiting:
- Get the cron handle from `backend/src/modules/spacedRepetition/cron/reviewNotificationJob.ts`.
- Either expose a debug endpoint or invoke the function directly via `node -e`.

| Step | Expected |
|---|---|
| Cron ticks | Mongo `notifications` collection gains a new doc with `type: 'review_reminder'` for the student |
| Email | Gmail inbox receives the reminder email (text + HTML); subject line includes course names |
| Idempotency | Running the cron twice in a row does NOT double-notify (or does, but the in-app notification is rate-limited) |

**Pass:** notification lands in Mongo + email arrives. **Requires Gmail SMTP App Password** in `backend/.env` — see `vibe_local_setup_guide.md`.

---

## §7. Retention dashboard

**Prereq:** student has items in multiple courses.

| Step | Expected |
|---|---|
| Navigate to `/student/review/dashboard` | One card per course: title, due-now count, retention health % (avg EF normalised to 0–100), opt-out toggle |
| Toggle opt-out for one course | Backend `PATCH /api/spaced-repetition/:studentId/notifications` succeeds; subsequent cron ticks skip that course |
| Toggle back on | Cron picks the course up again |

**Pass:** dashboard reflects state changes within one cron tick (~1 hour) or instantly under manual cron.

---

## §8. Backend API reference (manual curl probe)

```bash
# Replace $STUDENT_ID and $TOKEN with values from a real session
curl -X POST http://localhost:3141/api/spaced-repetition/$STUDENT_ID/seed \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"courseId":"abc123"}'

curl -X GET http://localhost:3141/api/spaced-repetition/$STUDENT_ID/schedule \
  -H "Authorization: Bearer $TOKEN"

curl -X POST http://localhost:3141/api/spaced-repetition/$STUDENT_ID/review \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"questionId":"q-1","quality":"got_it"}'
```

| Endpoint | Pass criteria |
|---|---|
| `POST /seed` | 200 with `{seeded: N}`; `N` matches the number of new `review_items` created (idempotent — re-running yields `seeded: 0`) |
| `GET /schedule` | 200 with array of due items, sorted by `next_review_at` ascending |
| `POST /review` | 200 with updated SM-2 state; `n` incremented on correct, `EF` updated, `next_review_at` advanced |
| `GET /course/:courseId` | 200 with per-course retention summary |
| `PATCH /notifications` | 200 with `{opt_out: bool}` echoed back |

---

## §9. Automated test suite

```bash
cd backend && npx vitest run src/modules/spacedRepetition/tests/
```

| File | Expected |
|---|---|
| `sm2.test.ts` | 14 passing — exercises the formula via `applySM2()` replica (drift risk: see Drift #5 below) |
| `ReviewItemRepository.test.ts` | 18 passing — including the "index-backed uniqueness" test (drift risk: see Drift #6 below) |
| `ReviewReminderEmail.test.ts` | 21 passing — subject, text body, HTML body, edge cases |

**Pass:** all 53 tests green.

---

## §10. Known gaps & risks (from Phase A audit, parked)

These don't block PR but should be tracked:

| # | Drift | Status |
|---|---|---|
| #1 | Sidebar nav button missing | **Closed 2026-07-17** (this commit) |
| #2 | `SeedScheduleResponse` returns only `{seeded}`, docs claim `{seeded, alreadyExisting}` | Doc rot; not a code bug |
| #3 | MEMORY.md claimed cron sent "first 3 course names" — actually sends all unique IDs | Doc rot |
| #4 | `spacedRepetitionModuleOptions.authorizationChecker` dead export | Dead code; delete or wire |
| #5 | `sm2.test.ts` calls a free-standing `applySM2()` replica, not the real `_applySM2` | Test smell; drift risk |
| #6 | `ReviewItemRepository` unique-index test never creates the index — likely false positive | Test bug; verify in Phase B |
| #7 | MEMORY.md claimed 4 emotion docs were deleted — they weren't (still tracked in git) | MEMORY rot; pre-existing on base branch |

---

## §11. Rollback

If anything goes wrong in production:

1. Revert this PR (or the SR-module commit(s) specifically).
2. Set `ENABLE_SPACED_REPETITION_JOB=false` in `.env` to silence the cron immediately.
3. Drop the `review_items` collection if you want a clean slate:
   ```javascript
   db.review_items.drop();
   ```
4. The SR module is fully isolated — `loadAppModules('all')` only registers it if the module folder exists, so deleting `backend/src/modules/spacedRepetition/` is a clean removal.

---

## Honest limitations

- I (Berry) have not run any of §1–§9 end-to-end myself since the SR module was committed. The backend boots, the routes register, the API responds correctly under auth, and tsc is clean — but a live student click-through is pending.
- The cron tick in §6 requires either waiting for top-of-hour or invoking manually.
- Email delivery in §6 depends on Gmail SMTP config that I haven't personally tested.