// Mirrors the backend IReviewItem shape with dates as strings (JSON serialised).
// `remediation_hint` is mock-only — the backend Phase B exposes hint as a
// separate endpoint response, not embedded on the item. We attach it to the
// mock item for the demo so the student dashboard can render it without a
// separate fetch. Backend `USE_MOCK = false` mode ignores the field entirely.
export interface ReviewItem {
  _id: string;
  student_id: string;
  course_id: string;
  question_id: string;
  n: number;
  EF: number;
  interval_days: number;
  next_review_at: string; // ISO datetime string
  last_reviewed_at: string | null;
  notification_opt_out: boolean;
  exam_prep_mode?: boolean;
  remediation_hint?: string | null;
  /**
   * Knob 7 (Phase C, 2026-07-21): origin of this ReviewItem.
   * - 'auto-seed' (default for backward-compat): created by the backend
   *   seedSchedule() when the student completed a course.
   * - 'manual': created by a teacher via POST /:studentId/assign.
   * Mirrors the backend IReviewItem.source field. Mock items use this to
   * distinguish teacher-driven from algorithm-driven assignments in the
   * retention dashboard / cohort table.
   */
  source?: 'auto-seed' | 'manual';
  /**
   * Mock-only breadcrumb (2026-07-31): timestamp at which the student
   * explicitly skipped this review card because the question wasn't
   * findable in the mock set. Used by the fail-open flow in
   * ReviewSession.tsx so the broken card doesn't reappear on every
   * page reload. The mock item is *not* deleted — teachers can still
   * see it in cohort views; only the student-side "due" filter hides
   * it. Ignored entirely in the live (USE_MOCK=false) code path.
   */
  skipped_at?: string | null;
}

export interface CourseRetentionSummary {
  courseId: string;
  totalItems: number;
  overdueCount: number;
  dueSoonCount: number;
  averageEF: number;
  items: ReviewItem[];
}

export type RecallQuality = 'got_it' | 'unsure' | 'missed';

export interface SeedScheduleResponse {
  seeded: number;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SubmitReviewResponse {
  item: ReviewItem;
  /**
   * Knob 8 (Phase D prep, 2026-07-21): true/false for MCQ question types
   * when the student submits their selected option indices. Also true/
   * false for NUMERIC_ANSWER when `numericAnswer` is supplied. undefined
   * for ungraded question types (DESCRIPTIVE, ORDER_THE_LOTS) or when
   * no answer signal was sent. Backend uses this to drive green/red
   * feedback on the picked options without ever revealing the correct
   * answer to the student when they got it wrong (per the 2026-07-21
   * UX rule).
   */
  isCorrect?: boolean;
  /**
   * Knob 8c (2026-07-29): true when the server capped the student's
   * quality (e.g. wrong pick that was rated `got_it` was downgraded to
   * `unsure` before SM-2 ran). Always undefined when the student's
   * claim was honest OR when no objective answer signal was provided.
   */
  qualityAdjusted?: boolean;
  /**
   * Knob 8c (2026-07-29): the quality the client claimed before the
   * server cap. Populated only when `qualityAdjusted === true`. Today
   * always `"got_it"` (the only quality the cap applies to).
   */
  qualityAdjustedFrom?: RecallQuality;
  /**
   * Knob 8c (2026-07-29): short human-readable canonical answer,
   * populated ONLY when the (post-cap) quality is `missed` AND the
   * question was objectively gradable (NAT or MCQ). The reveal-on-
   * missed affordance rewards honest self-report; we never leak the
   * answer on `got_it` or `unsure`.
   */
  canonicalAnswer?: string;
}

export interface UpdateOptOutResponse {
  updatedCount: number;
}

/**
 * Response shape for the teacher bulk-toggle endpoints
 * (PATCH /api/spaced-repetition/bulk/notifications and
 * PATCH /api/spaced-repetition/bulk/exam-prep).
 *
 * Bug 3 fix (2026-08-01): the response now distinguishes between the
 * number of distinct students whose items were mutated
 * (`studentsAffected`) and the raw review-item count (`itemsAffected`).
 * Previously the response only had `updatedCount`, which was always the
 * item count but was being mislabelled as a student count in the
 * teacher UI. UI must use `studentsAffected` for any "for N students"
 * wording.
 *
 * `updatedCount` is kept for back-compat. It is ALWAYS the item count
 * (alias of `itemsAffected`) and must NOT be presented as a student
 * count in user-facing UI.
 */
export interface BulkUpdateResponse {
  /** @deprecated Item count, NOT student count. Use `studentsAffected` for student-facing UI and `itemsAffected` when item-level accuracy matters. */
  updatedCount: number;
  /** Distinct student count whose items were mutated. Use this in teacher toasts. */
  studentsAffected: number;
  /** Raw review-item count mutated. Same value as `updatedCount`. */
  itemsAffected: number;
  /** Human-readable summary, e.g. "Updated notifications for 3 students (6 review items)." */
  message: string;
}