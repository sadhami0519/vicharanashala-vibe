import {
  IsString,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsNumber,
  Min,
  Max,
  ArrayMinSize,
} from 'class-validator';
import { RecallQuality } from '#spacedRepetition/interfaces/IReviewItem.js';

// ── Remediation hint DTOs (Knob 2) ─────────────────────────────────────────

/**
 * Body for PATCH /:studentId/remediation-hint
 * Sent by a teacher/admin to attach or update a targeted hint for a student
 * on a specific question. The hint is shown to the student ONLY after they
 * answer incorrectly in a review session.
 */
export class SetRemediationHintBody {
  @IsString()
  @IsNotEmpty()
  questionId: string;

  /** The hint text to show after an incorrect answer. Pass null to clear. */
  @IsOptional()
  @IsString()
  hint?: string | null;
}

/**
 * Response for PATCH /:studentId/remediation-hint
 */
export class SetRemediationHintResponse {
  questionId: string;
  remediationHint: string | null;
  message: string;
}

// ── Request bodies ─────────────────────────────────────────────────────────

/**
 * Body for POST /:studentId/seed
 * Sent by the course completion hook to seed a review schedule.
 */
export class SeedScheduleBody {
  @IsString()
  @IsNotEmpty()
  courseId: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  questionIds: string[];
}

/**
 * Body for POST /:studentId/review
 * Sent when a student submits their response to a review question.
 */
export class SubmitReviewBody {
  @IsString()
  @IsNotEmpty()
  questionId: string;

  @IsEnum(['got_it', 'unsure', 'missed'] as const satisfies RecallQuality[])
  quality: RecallQuality;
}

/**
 * Body for PATCH /:studentId/notifications
 * Sent when a student toggles notification preferences for a course.
 */
export class UpdateOptOutBody {
  @IsString()
  @IsNotEmpty()
  courseId: string;

  @IsBoolean()
  optOut: boolean;
}

/**
 * Body for POST /:studentId/boost
 * Sent by a teacher/admin to force a question to be due immediately
 * for a specific student, optionally resetting the easiness factor.
 *
 * Use cases:
 * - Student bombed an exam → boost all questions from that topic
 * - Re-teach a concept → make it due again today
 * - Set a question to maximum difficulty (targetEF = 1.3)
 */
export class BoostReviewBody {
  @IsString()
  @IsNotEmpty()
  questionId: string;

  /**
   * Optional target easiness factor. If provided, the question's EF is
   * set to this value directly (no SM-2 formula). Use 1.3 for "hardest"
   * or 2.5 for "reset to neutral". If omitted, only next_review_at changes.
   */
  @IsOptional()
  @IsNumber()
  @Min(1.3)
  @Max(3.0)
  targetEF?: number;
}

// ── Route params ───────────────────────────────────────────────────────────

/**
 * Params for routes that only need a studentId.
 * e.g. GET /:studentId/schedule
 */
export class StudentIdParam {
  @IsString()
  @IsNotEmpty()
  studentId: string;
}

/**
 * Params for routes that need both studentId and courseId.
 * e.g. GET /:studentId/course/:courseId
 */
export class StudentCourseParams {
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @IsString()
  @IsNotEmpty()
  courseId: string;
}

// ── Response schemas (for OpenAPI / @ResponseSchema) ──────────────────────

/**
 * Represents a single ReviewItem as returned over HTTP.
 * Mirrors IReviewItem with ObjectId fields serialised to strings.
 */
export class ReviewItemResponse {
  _id: string;
  student_id: string;
  course_id: string;
  question_id: string;
  n: number;
  EF: number;
  interval_days: number;
  next_review_at: Date;
  last_reviewed_at: Date | null;
  notification_opt_out: boolean;
  remediationHint?: string | null;
}

/**
 * Response for the GET /:studentId/course/:courseId retention endpoint.
 * Includes the computed health summary alongside the raw items.
 */
export class CourseRetentionResponse {
  courseId: string;
  totalItems: number;
  overdueCount: number;
  dueSoonCount: number;
  averageEF: number;
  items: ReviewItemResponse[];
}

/**
 * Response for the POST /:studentId/seed endpoint.
 */
export class SeedScheduleResponse {
  seeded: number;
}

/**
 * Response for the PATCH /:studentId/notifications endpoint.
 */
export class UpdateOptOutResponse {
  updatedCount: number;
}

/**
 * Response for POST /:studentId/boost
 * Returns the updated ReviewItem state after boosting.
 */
export class BoostResponse {
  boosted: boolean;
  questionId: string;
  next_review_at: Date;
  EF: number;
  interval_days: number;
  message: string;
}