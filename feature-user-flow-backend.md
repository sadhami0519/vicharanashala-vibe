# Feature User Flow — Spaced Repetition (Backend)

> Backend-only walkthrough of how the ViBe spaced-repetition feature
> behaves from the student's perspective. The frontend review session
> screen has shipped (Steps 13–16 + E1/E3/E4/E6 in `feature-context.md`);

---

## The Flow

### 1. Course Completion → Review Items Seeded

**What happens:** A student finishes a quiz-type item inside a course.

**Behind the scenes:**
```
ProgressService.stopItem()
  → triggerSpacedRepetitionSeed(userId, courseId, courseVersionId)
    → getQuizQuestionIds(courseVersionId)       // walks course tree → quiz type → question bank → question IDs
    → ReviewItemRepository.createMany([...])    // one ReviewItem per question
```

**Each `ReviewItem` starts with:**
- `n = 0` (never reviewed)
- `EF = 2.5` (default easiness)
- `interval_days = 1` (short first interval)
- `next_review_at = now` (due immediately for first pass)
- `notification_opt_out = false`

**User sees:** Nothing yet — this all happens silently on the server.

---

### 2. Daily Cron Job → In-App Notification

**What runs:** `reviewNotificationJob` — fires daily at midnight (India timezone).

**Behind the scenes:**
```
reviewNotificationJob.run()
  → findDueItems(now)                           // all students, all courses, due items
  → for each student:
      → NotificationService.notifyReviewReminder(studentId, courseIds, count)
        → fetches first 3 course names
        → creates in-app notification: "You have X items due for review in [Course A], [Course B], ..."
```

**User sees:** A notification in their in-app notification tray: *"You have 12 items due for review in Biology 101, Chemistry Basics..."* and an email if `SMTP_USER`/`SMTP_PASS` is configured.

---

### 3. Student Opens Review Dashboard

**Request:** `GET /api/spaced-repetition/due?courseId=...`

**Behind the scenes:**
```
SpacedRepetitionController.getDueItems(courseId, studentId)
  → findDueItems(now)                           // filtered by student + optional course
  → returns ReviewItemResponse[] (mapped: questionId, courseId, SM2 state, nextReviewAt)
```

**User sees:** A list of cards due for review — showing the SM-2 state (which
bucket/interval they're on, when the next review is due). Each card's question
text is fetched separately via `GET /api/quizzes/questions/:questionId/review`.

---

### 4. Student Submits a Review Answer

**Request:** `POST /api/spaced-repetition/review`
```json
{ "reviewItemId": "...", "quality": 4 }
```

**`quality` map (frontend sends 0–5, backend maps to SM-2 q):**
- `0, 1, 2` → incorrect (q < 3) → **reset**: n→0, interval→1, EF unchanged
- `3` → unsure (q = 3) → EF drops slightly, short interval
- `4, 5` → correct (q ≥ 3) → **advance**: n++, interval compounds, EF increases

**Behind the scenes:**
```
SpacedRepetitionController.submitReview(reviewItemId, studentId, quality)
  → submitReview(reviewItemId, quality)
    → _applySM2(item, q)                         // private algorithm
      → if q < 3:  n=0, I=1, EF unchanged
      → if q ≥ 3: n=n+1, I=round(I*EF), EF+=0.1
      → EF floor at 1.3
    → ReviewItemRepository.update(id, { n, EF, interval_days, next_review_at, last_reviewed_at })
    → return updated ReviewItem
```

**User sees:** The card flips or updates — shows the new interval ("Review again in 6 days") and their updated streak/state.

---

### 5. Student Opts Out

**Request:** `PATCH /api/spaced-repetition/opt-out?courseId=...&disable=true`

**Behind the scenes:**
```
ReviewItemRepository.updateOptOut(studentId, courseId, true)
// future cron runs skip their items silently
```

**User sees:** They stop receiving review reminders for that course.

---

## What They Don't See Yet

| Item | Status |
|------|--------|
| Review session screen (frontend card UI) | ✅ **Shipped 2026-07-04** — Steps 13–16 + E1/E3/E4/E6 in `feature-context.md`; `frontend/src/app/pages/student/ReviewSession.tsx` |
| Email reminders via `MailService.sendReviewReminder()` | ✅ **Step 11 done** — `SMTP_USER`/`SMTP_PASS` needed in `.env` |

---

## SM-2 Algorithm Summary

**State per question (per student):**
```
n             — number of consecutive correct reviews
EF            — easiness factor (default 2.5, floor 1.3)
interval_days — days until next review
next_review_at
last_reviewed_at
```

**On correct (q ≥ 3):**
```
n             = n + 1
EF            = EF + 0.1
interval_days = round(interval_days * EF)
```

**On incorrect (q < 3):**
```
n             = 0
interval_days = 1
EF            unchanged
```

**EF update formula:**
```
EF = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
```

**EF floor: 1.3** — never drops below this even with repeated poor recalls.

**Interval sequence over 5 consecutive correct reviews (q=4–5):**
```
Review 1:  1 day
Review 2:  6 days
Review 3: 15 days
Review 4: 43 days
Review 5: 120 days
```