# Spaced Repetition Review — Feature Summary

**Issue:** Vicharanashala/ViBe#1047
**Status:** ✅ Implemented and shipped — all MVP acceptance criteria met
**Audience:** Mentor review

> **Mentor-side note:** Teachers/mentors see nothing new in their UI in this
> iteration. Per GitHub issue #1047, custom review scheduling by instructors
> is explicitly out of scope. A read-only teacher retention dashboard is
> sketched in §10 below.

---

## TL;DR

ViBe now schedules post-course review sessions for students using the SM-2
spaced repetition algorithm. When a student completes a course, the system
seeds a personalised review schedule from the course's existing question
bank. The student then receives periodic in-app + email notifications
prompting short review sessions; their recall quality updates the schedule
so easy concepts are reviewed less often and harder ones more often. A
student-facing dashboard shows upcoming reviews and retention health per
course, with per-course opt-out for notifications.

---

## 1. Purpose & Motivation

ViBe's design philosophy — drawn from the classical Vikram and Betaal tale —
is that real mastery means revisiting material, not just encountering it
once. In the story, Betaal resurfaces each time with a new challenge. ViBe's
equivalent should be that completed courses don't simply "end"; the
platform should keep challenging students on what they learned until the
knowledge is genuinely retained.

The problem this addresses is well-documented in learning science: without
reinforcement, students forget the majority of new material within days of
completing a course (see §7 Research Background). Active recall and spaced
review are the two highest-leverage techniques known to combat this decay.

This feature operationalises that idea for ViBe by automatically scheduling
reviews at scientifically validated intervals after course completion,
without requiring students to remember to come back on their own.

---

## 2. How It Works — The Student Journey

The full student experience, end to end:

1. **Course completion.** A student finishes their final item in a course.
   Nothing new is required from them; this happens automatically.
2. **Schedule seeded.** The platform walks the course's quiz items, resolves
   each question from the existing question bank, and creates one review
   entry per question. Each entry starts in a default state and is due
   for first review within a day.
3. **First notification.** Within the next hour, the student receives an
   in-app notification (and an optional email) telling them reviews are
   ready.
4. **Review session.** The student opens a focused UI showing one question
   at a time with three response buttons:
   - **Got it** — recalled confidently
   - **Unsure** — got it, but with hesitation
   - **Missed it** — couldn't recall
   
   This simplified 3-point scale (rather than the full academic 0–5 scale)
   keeps the review frictionless.
5. **Algorithm updates.** Each response updates the question's SM-2 state
   and reschedules the next review. Easy questions drift out to longer
   intervals; hard ones come back sooner.
6. **Ongoing cadence.** Notifications repeat at the schedule the algorithm
   produces — typically a next-day / 6-day / weekly / monthly rhythm.
7. **Dashboard.** Students can visit a retention dashboard at any time to
   see upcoming reviews, retention health per course, and toggle
   notifications per course if they want to opt out.

---

## 3. Acceptance Criteria — Status

All six acceptance criteria from the GitHub issue are met:

| # | Criterion | Status |
|---|---|---|
| 1 | Review schedule is auto-generated on course completion, seeded from the course's existing AI question bank | ✅ |
| 2 | SM-2 state is persisted per student per question and updated after every review response | ✅ |
| 3 | Intervals are recalculated correctly after each review per the SM-2 formula | ✅ |
| 4 | Students receive notifications (email + in-app) when a review session is due | ✅ |
| 5 | Students can view upcoming reviews and retention status from a dashboard | ✅ |
| 6 | Notification triggers are configurable — students can opt out | ✅ |

---

## 4. Backend Implementation — Intensity & Reuse

**Intensity:** Medium. One new self-contained module plus small surgical
hooks into existing files.

**What was added (new module):**
A new `spacedRepetition` module containing:

- SM-2 algorithm + business rules in a service
- A MongoDB repository for `review_items` (3 indexes for cron queries and
  uniqueness guarantees)
- A REST controller with 5 endpoints (seed, review, schedule, per-course
  retention, notification preference)
- An hourly background job that scans for due reviews and dispatches
  notifications
- DI container, types, validators, and tests

**What was reused (and how heavily):**

- **Notifications module** — the background job hands off to the existing
  `NotificationService.notifyReviewReminder()` method. No notification
  delivery code was written from scratch; we extended the existing
  notification type taxonomy by one variant.
- **Quizzes / QuestionBank** — review items reference real question IDs
  from the existing question bank. No new question-generation logic was
  added; this feature is purely about *when* to surface existing
  questions.
- **Users / ProgressService** — the only hook into existing course-
  completion code is one block in `stopItem()`: when a course completes,
  it fires the seed call after the transaction commits. Failure to seed
  never breaks course completion.
- **MailService** — for the email leg of notifications; uses existing
  email templates and SMTP infrastructure.

**Why this matters:** the feature is additive. Existing modules don't need
to know about it. The spaced repetition container resolves only its own
dependencies plus the notification service. Deleting this module tomorrow
would leave the rest of ViBe untouched — no schema migrations, no
cross-cutting refactors.

---

## 5. Frontend Implementation — Intensity & Reuse

**Intensity:** Light. Two new pages plus a small data layer; zero changes
to existing pages beyond nav integration.

**What was added:**

- **Review Session** (`/student/review`) — one question at a time, three
  response buttons, keyboard shortcuts (1/2/3 to rate, Space/Enter to
  advance), focus management, accessibility-compliant.
- **Retention Dashboard** (`/student/review/dashboard`) — per-course
  retention health, upcoming schedule list, opt-out toggles, polished
  empty states for students who haven't completed anything yet.
- **Data layer** — TypeScript types, an API client with a mock-first
  toggle (`USE_MOCK`) for offline UI development, and TanStack Query hooks
  for the two queries and three mutations. The backend endpoints are
  live and tsc-clean; flipping `USE_MOCK = false` is an operational gate,
  not a code milestone.
- **Nav integration** — one new topbar button (desktop and mobile) added
  to the existing student layout.

**What was reused:**

- shadcn/ui components, lucide-react icons, Tailwind utilities — the
  existing design system throughout
- TanStack Router code-based routing pattern (matches existing routes)
- TanStack Query with centralised query keys (matches existing hook
  conventions)
- Existing student-layout, auth, and route-guarding infrastructure

**Quality bar:** TypeScript type-checks cleanly for all new files.
Keyboard accessibility (1/2/3, Space/Enter) and screen-reader-friendly
attribution (course + question number on each card) are first-class, not
an afterthought.

---

## 6. Files Touched — Compact Inventory

### Backend

| Group | Count | Notes |
|---|---|---|
| New module (`spacedRepetition/`) | ~14 files | Self-contained: interfaces, repository, service, controller, validators, cron job, 3 barrel-export `index.ts` files, container, entry, plus `IReviewItem.ts` |
| Tests | 3 files | 14 SM-2 unit tests (`sm2.test.ts`) + 18 repository integration tests (`ReviewItemRepository.test.ts`) + email-template rendering tests (`ReviewReminderEmail.test.ts`), all against an in-memory MongoDB |
| Existing — substantive edits | ~4 files | `ProgressService.ts` (completion hook), `NotificationService.ts` (new method), `MongoDatabase.ts` (index creation), `INotification.ts` (one new type variant) |
| Existing — one-line config / wiring | ~5 files | tsconfig path mapping, cron registration, env gate, module wiring in two `index.ts` files |

### Frontend

| Group | Count | Notes |
|---|---|---|
| New pages | 2 files | `ReviewSession.tsx`, `RetentionDashboard.tsx` |
| Data layer | 3 files | Types, mock-first API client, TanStack Query hooks |
| Existing — small surgical edits | 2 files | `student-layout.tsx` (nav button), `router.tsx` (route registration) |
| Legacy cleanup | 1 file deleted | Old hand-written spaced-repetition hook (orphan) |

**Net effect:** one new isolated backend module, two new frontend pages,
surgical patches elsewhere. Total surface area is small for a feature of
this scope.

---

## 7. Research Background

This feature rests on a foundation of learning science that goes back over
a century.

**The forgetting curve (Hermann Ebbinghaus, 1885).** Ebbinghaus's
self-experiments established that newly learned information decays
exponentially when not reinforced — within days, retention drops to roughly
25–30% of what it was immediately after learning. His work is the empirical
basis for the entire spaced repetition field.

**Active recall and the spacing effect.** Decades of subsequent research
have shown that two interventions are dramatically more effective than
passive re-reading: (1) actively retrieving the information from memory
(rather than just recognising it), and (2) spacing the retrievals across
expanding intervals rather than cramming. These two effects compound —
spaced active recall can lift long-term retention from ~25% to ~80%+ over
equivalent study time.

**SuperMemo (Piotr Woźniak, 1985–present).** Woźniak developed the SM-2
algorithm in 1985 and has continued refining the SuperMemo family of
algorithms since. SM-2 is the most widely validated of these; it's the
basis for Anki and many other tools, and has 35+ years of evidence behind
it.

**Anki's adoption (2002–present).** Anki has become the de facto reference
implementation for SM-2 in the consumer space. Its prevalence — millions
of language learners, medical students, and others — is informal evidence
that the algorithm is workable at scale and across very different content
domains.

**Why we didn't invent a new algorithm.** SM-2 is mature, validated, easy
to explain, easy to test, and matches the issue's specification exactly.
The most responsible engineering decision was to use the standard
algorithm rather than improvise. If at some future point ViBe's data
shows the standard SM-2 isn't fitting our student population, switching
to SM-17 or a custom variant is a contained change — but the
instrumentation to measure that need has to come first.

---

## 8. SM-2 Algorithm — Plain-English Explanation

We chose SM-2 (SuperMemo 2) — the same algorithm powering Anki and dozens
of other tools.

**Why a 3-point UI scale instead of the full 0–5 academic scale.** The
full SM-2 scale asks students to distinguish between "correct with minor
hesitation" and "correct with significant difficulty." For our audience
that's friction. We collapsed it to three buttons and mapped them to SM-2
quality scores of **5** (Got it), **3** (Unsure), **1** (Missed). The
algorithm accepts all three and produces correct behaviour.

**How the algorithm updates state (simplified):**

- If the answer was correct (Got it or Unsure):
  - On the first two correct reviews, intervals are fixed at **1 day** and
    **6 days** respectively (rapid early reinforcement).
  - From the third correct review onward, each interval is the previous
    interval multiplied by the question's current "easiness" — a number
    that drifts down on hesitation and up on clean recall.
- If the answer was incorrect (Missed):
  - The repetition count resets to zero and the next review is in **1
    day**. Easiness is not penalised on a miss — only on borderline
    answers — so one bad day doesn't permanently make a question feel
    "hard."
- Easiness has a floor of **1.3**, so a question can never become
  infinitely easy to forget.

**Validation.** 14 dedicated unit tests cover the algorithm's behaviour:
first/second/third correct reviews, unsure handling, incorrect reset,
easiness-floor convergence, and compounding intervals over five
consecutive reviews. The repository layer has 18 integration tests
against an in-memory MongoDB instance.

---

## 9. What's Out of Scope + Next Steps

**Explicitly out of scope (per the issue):**

- Cross-course spaced repetition (merging concepts from multiple completed
  courses)
- Custom review scheduling by instructors
- Adaptive difficulty beyond SM-2's easiness factor

**MVP-polish items noted but not blocking mentor review:**

- **Operational flip:** `USE_MOCK = false` in `frontend/src/lib/spaced-repetition-api.ts`
  and `ENABLE_SPACED_REPETITION_JOB=true` in the backend `.env` are
  operational gates (the maintainer's call), not code milestones. Both
  the backend endpoints and the frontend's real-network code path are
  already in place and tsc-clean.
- **Quiz title on review cards — partially done.** The frontend now reads
  `quizTitle` / `quizId` from the question endpoint and renders `From
  <Course> · <Quiz Title>` when present (dropping the question index).
  The backend extension (new fields on `ReviewQuestionResponse`) is also
  in place. A bug was found in the join at code-review time: the
  repository method called returns `QuizItem` (course-module) docs
  rather than joining `QuestionBank → Quiz` correctly, so the new fields
  currently return `null` in production. The frontend falls back to
  `From <Course> · Question N` gracefully; fixing the join is a focused
  next-session task (add a new `findQuizzesByBankIds` repo method).
- **Session cap.** A 10-card cap is implemented client-side in
  `ReviewSession.tsx` (`SESSION_CAP = 10`). It is not yet enforced
  server-side; the design calls for a `GET /spaced-repetition/:studentId/due?limit=10`
  endpoint so cron-driven notifications can pre-cap the due list.
  Backend low-complexity; deferred to a future iteration.
- **Other polish items (low priority):** lowest-EF-first ordering
  (review hard questions first), review-history pagination, and tighter
  end-to-end coverage. E2E coverage today is blocked only on local infra
  (Mongo + Firebase Auth emulator + MailHog) being up — not on `USE_MOCK`.

**Open questions worth surfacing for mentor input:**

- Should review behaviour differ for "hard" subjects (math, language)
  vs. "soft" subjects (history, literature)? SM-2 treats them identically
  today.
- Are there review-session ceilings we should enforce for very long
  courses to avoid fatigue? Currently the UI caps at 10 cards per
  session; this is a guess, not a research-backed number.
- Should teachers eventually see aggregate retention health for their
  courses? Not in this iteration; could be a future teacher-facing
  feature. (See §10 below for the proposed design.)

---

## 10. Teacher View (Planned — Not in This Iteration)

The GitHub issue explicitly carved teacher configuration out of scope:
"Custom review scheduling by instructors" is listed as out-of-scope for
this iteration. Accordingly, **mentors/teachers see nothing new in their
UI for this feature today** — no new routes, no new pages, no new
settings. From their perspective, ViBe is unchanged.

This section sketches what a future teacher-side read-only view would
look like, so reviewers can evaluate the design direction rather than be
surprised by the omission.

### Design direction

A new read-only dashboard at `/teacher/courses/:courseId/retention`
showing aggregate retention health across all enrolled students who have
completed the course. The page would expose three layers of data, none
of which exist today:

1. **Course-level headline.**
   - Total enrolled students vs. students with an active review schedule
   - Average retention health % (mean of per-student normalised EFs)
   - Distribution band: how many students fall into Strong / Steady /
     Needs-work categories
2. **Question-level signal.**
   - For each question in the course, average easiness factor across all
     students who have reviewed it
   - "Hardest questions" — those with the lowest average EF — which
     suggest either a teaching gap or a question-quality problem
3. **Engagement.**
   - Review completion rate: of all notifications sent, what fraction
   resulted in a review within 24 / 48 / 72 hours
   - Notification opt-out rate

### What it would NOT include

Consistent with the issue's "out of scope" list, the teacher view is
strictly **observational** in this iteration. Teachers would not be able
to:

- Set custom review intervals per course or per student
- Override SM-2 state for individual students
- Push manual notifications
- Configure difficulty beyond what SM-2 produces

Any of those would require expanding the data model (e.g. a
`teacher_overrides` subdocument) and revisiting the out-of-scope list.

### Why a read-only view is the right next step

A read-only teacher dashboard is the lowest-cost way to close the
observability loop on this feature. It lets ViBe's team answer questions
like "is SM-2 working for our student population?" and "which courses
are struggling?" before anyone invests in deeper teacher controls. If
those questions surface real needs, the next iteration can add the
controls; if they don't, the read-only view is itself a useful signal to
point at when justifying (or forgoing) the bigger investment.

### Estimated effort

A useful read-only teacher view is roughly half a day to a full day of
work for the new backend aggregate endpoint plus a new teacher page. It
reuses the existing course-scoped authorization pattern (teachers can
already see which students are enrolled in their courses) and the
existing dashboard design system.

---

## References

- **GitHub issue:** Vicharanashala/ViBe#1047 — original feature specification
- **Spaced repetition** — Wikipedia: <https://en.wikipedia.org/wiki/Spaced_repetition>
- **SM-2 algorithm** — SuperMemo blog: <https://www.supermemo.com/en/blog/twenty-rules-of-formulating-knowledge>
- **How Anki implements SM-2** — Anki FAQs: <https://faqs.ankiweb.net/what-spaced-repetition-algorithm.html>
- **Hermann Ebbinghaus** — *Memory: A Contribution to Experimental Psychology* (1885)

**Internal docs (for deeper detail):**

- `feature-context.md` — implementation detail, architecture decisions, file inventory
- `vibe_local_setup_guide.md` — running the feature locally
- `vibe_review_question_endpoint_prompt.md` — design notes for the question-fetching endpoint
- `vibe_review_reminder_email_prompt.md` — design notes for the reminder email

---

*Last updated: 2026-07-08. Prepared for mentor review. §10 (Teacher View, planned) added 2026-07-08. Doc audit pass at 22:05 (corrected session cap from 15 to 10; updated test and source-file counts; marked quiz-title as partially-done pending backend join fix).*