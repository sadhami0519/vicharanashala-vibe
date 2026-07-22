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
   * when the student submits their selected option indices. undefined for
   * numeric/descriptive questions or when no selection was sent. Backend
   * uses this to drive green/red feedback on the picked options without
   * ever revealing the correct answer to the student when they got it
   * wrong (per the 2026-07-21 UX rule).
   */
  isCorrect?: boolean;
}

export interface UpdateOptOutResponse {
  updatedCount: number;
}