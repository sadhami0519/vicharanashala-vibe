// Mirrors the backend IReviewItem shape with dates as strings (JSON serialised)
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
