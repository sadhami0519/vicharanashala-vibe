import { ObjectId } from 'mongodb';

/**
 * Recall quality rating after a review session.
 * Maps the simplified ViBe UI response to SM-2 q values:
 *   'got_it'  → q = 5 (perfect response)
 *   'unsure'  → q = 3 (correct with significant difficulty)
 *   'missed'  → q = 1 (incorrect, barely recognisable)
 */
export type RecallQuality = 'got_it' | 'unsure' | 'missed';

/**
 * The numeric q value (0–5) used internally by the SM-2 algorithm.
 * Derived from RecallQuality before running the update formula.
 */
export type SM2QValue = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * Maps the simplified three-point ViBe rating to SM-2 q values.
 */
export const RECALL_QUALITY_MAP: Record<RecallQuality, SM2QValue> = {
  got_it: 5,
  unsure: 3,
  missed: 1,
};

/**
 * Core SM-2 algorithm state tracked per student per question.
 *
 * n            — repetition count; number of consecutive correct reviews.
 * EF           — easiness factor (default 2.5, minimum 1.3).
 *                Higher = easier for this student; drives how fast intervals grow.
 * interval_days — current inter-repetition interval in days.
 *                After a correct review this grows; after incorrect it resets to 1.
 */
export interface ISM2State {
  n: number;
  EF: number;
  interval_days: number;
}

/**
 * A single spaced-repetition review item stored in the `review_items` collection.
 *
 * One document exists per (student, question) pair within a completed course.
 * The SM-2 state fields are updated after every review response.
 */
export interface IReviewItem {
  _id?: ObjectId;

  /** The student this item belongs to. */
  student_id: string;

  /** The course the question was drawn from. */
  course_id: string;

  /** The original question from the course question bank. */
  question_id: string;

  // ── SM-2 state ────────────────────────────────────────────────────────────

  /** Number of consecutive successful reviews. Resets to 0 on a miss. */
  n: number;

  /**
   * Easiness factor — how easy this item is for this student.
   * Starts at 2.5, minimum 1.3, updated after each review.
   */
  EF: number;

  /** Current interval in days until the next scheduled review. */
  interval_days: number;

  // ── Scheduling ────────────────────────────────────────────────────────────

  /** The datetime at which the next review session is due. Indexed for cron queries. */
  next_review_at: Date;

  /** The datetime of the most recent review. Null until first review is completed. */
  last_reviewed_at: Date | null;

  // ── Teacher-added remediation hint ────────────────────────────────────────

  /**
   * An optional, teacher-added hint shown to the student ONLY after they
   * answer incorrectly in a review session. Different from the pre-attempt
   * `hint` field on the Question schema — this is per-student, per-question,
   * and only disclosed post-failure.
   *
   * N3 (audit 2026-07-24): the field name uses camelCase (matching the
   * original Knob 7 commit) while every other field on this interface
   * uses snake_case. The frontend (`frontend/src/types/spaced-repetition.types.ts`
   * and `frontend/src/lib/spaced-repetition-api.ts`) reads and writes
   * this field as `remediation_hint` (snake_case). The mismatch was
   * silently masked by `USE_MOCK=true` — the mock layer used the
   * snake_case name end-to-end and never round-tripped through the
   * real backend.
   *
   * F1 (audit 2026-07-24) closed the visible bug in the student review
   * page by changing the frontend reads to use the snake_case name.
   * The live backend and mock data both store the field correctly;
   * future migrations that flip `USE_MOCK` to false will hit this
   * inconsistency directly.
   *
   * A full canonicalisation (rename to `remediation_hint`) is a NIT-
   * worthy refactor: it touches the repo, the service, the mock layer,
   * the type, the validation schema, and the OpenAPI doc. Defer until
   * either the schema gains an openapi-fetch regeneration step or a
   * second snake_case drift appears, at which point a single sweep
   * across all mismatches becomes the cheaper option than per-field
   * fixes.
   */
  remediationHint?: string;

  // ── Opt-out ───────────────────────────────────────────────────────────────

  /**
   * When true, the student has opted out of notifications for this item.
   * The cron job skips sending notifications but still updates state on review.
   */
  notification_opt_out: boolean;
  exam_prep_mode?: boolean;

  /**
   * Knob 7 (Phase C, 2026-07-21): origin of this ReviewItem.
   * - 'auto-seed' (default for backward-compat with existing seeded items):
   *   Created by `seedSchedule()` when the student completed a course.
   * - 'manual': Created by a teacher via `POST /:studentId/assign`
   *   (Manual Review Assignment). Distinct from algorithm-driven items
   *   so analytics can report on teacher-pushed reviews separately.
   */
  source?: 'auto-seed' | 'manual';
}

/**
 * The default SM-2 starting state assigned to every new ReviewItem
 * when a schedule is seeded on course completion.
 *
 * n = 0            → never reviewed yet
 * EF = 2.5         → SM-2 default easiness factor
 * interval_days = 1 → first review due 1 day after course completion
 */
export const DEFAULT_SM2_STATE: ISM2State = {
  n: 0,
  EF: 2.5,
  interval_days: 1,
};