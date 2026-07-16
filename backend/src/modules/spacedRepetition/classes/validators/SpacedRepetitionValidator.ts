import {
  IsString,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsEnum,
  ArrayMinSize,
} from 'class-validator';
import { RecallQuality } from '#spacedRepetition/interfaces/IReviewItem.js';

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