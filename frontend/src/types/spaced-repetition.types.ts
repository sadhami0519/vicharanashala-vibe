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
export interface SubmitReviewResponse extends ReviewItem {}

export interface UpdateOptOutResponse {
  updatedCount: number;
}