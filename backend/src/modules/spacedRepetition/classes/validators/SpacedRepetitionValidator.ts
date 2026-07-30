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
  remediation_hint: string | null;
  message: string;
}

// ── SR-disabled DTOs (Knob 6) ───────────────────────────────────────────────

/**
 * Body for PATCH /students/:studentId/sr-disabled
 * Sent by a teacher to enable or disable SR for a specific student.
 * When true, the student's reviews stop accumulating and reminders stop firing.
 */
export class SetStudentSRDisabledBody {
  @IsBoolean()
  sr_disabled: boolean;
}

/**
 * Response for PATCH /students/:studentId/sr-disabled
 */
export class SetStudentSRDisabledResponse {
  studentId: string;
  sr_disabled: boolean;
  message: string;
}

/**
 * Response for GET /students/:studentId/status
 * Lightweight read used by the student dashboard to choose empty-state copy.
 */
export class StudentSRStatusResponse {
  studentId: string;
  sr_disabled: boolean;
}

/**
 * Body for PATCH /bulk/sr-disabled
 * Sent by a teacher to bulk enable/disable SR for a cohort.
 * studentIds is optional — if omitted, applies to every student with a
 * review schedule in the given course.
 */
export class BulkSetStudentSRDisabledBody {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  studentIds: string[];

  @IsBoolean()
  sr_disabled: boolean;
}

/**
 * Response for PATCH /bulk/sr-disabled
 */
export class BulkSetStudentSRDisabledResponse {
  updatedCount: number;
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
 *
 * `selectedOptionIndices` is OPTIONAL and only used for MCQ question types
 * (SELECT_ONE_IN_LOT, SELECT_MANY_IN_LOT). When present, the service
 * compares the indices against the question's correct option(s) and
 * returns `isCorrect` in the response. The frontend uses this to light
 * up the chosen option(s) green (correct) or red (incorrect) — without
 * ever revealing the correct option to the student when they got it
 * wrong (per the 2026-07-21 UX rule).
 *
 * Omitted for NUMERIC_ANSWER_TYPE and DESCRIPTIVE question types.
 */
export class SubmitReviewBody {
  @IsString()
  @IsNotEmpty()
  questionId: string;

  @IsEnum(['got_it', 'unsure', 'missed'] as const satisfies RecallQuality[])
  quality: RecallQuality;

  /**
   * Indices into the review-mode `options[]` array (the order the
   * student saw them in). For SELECT_ONE_IN_LOT this is a single
   * element; for SELECT_MANY_IN_LOT it can be multiple. Optional —
   * omitted for non-MCQ question types.
   */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsNumber({}, { each: true })
  @Min(0, { each: true })
  @Max(7, { each: true })
  selectedOptionIndices?: number[];

  /**
   * String the student typed for a NUMERIC_ANSWER question. The server
   * parses it with `parseFloat` and compares against the question's
   * `solution.numericAnswer` (exact match, no tolerance).
   *
   * Optional — omitted for MCQ question types (which use
   * `selectedOptionIndices`) and for question types we can't grade
   * server-side (DESCRIPTIVE, ORDER_THE_LOTS).
   */
  @IsOptional()
  @IsString()
  numericAnswer?: string;
}

/**
 * Response for POST /:studentId/review.
 * Returns the updated ReviewItem after SM-2 recalculation plus
 * integrity feedback (Knob 8c, 2026-07-29).
 *
 * Field semantics:
 *   - `item` — the updated ReviewItem docs.
 *   - `isCorrect` — populated when the request included an objective
 *      answer signal (`selectedOptionIndices` for MCQ, or `numericAnswer`
 *      for NUMERIC_ANSWER). `undefined` for ungraded question types.
 *   - `qualityAdjusted` — `true` when the server capped the student's
 *      quality (e.g. a wrong pick that was rated `got_it` was
 *      downgraded to `unsure`). Always `false`/undefined if the
 *      student's claim was honest.
 *   - `qualityAdjustedFrom` — the quality the client claimed before
 *      the cap (`got_it` only today). Only set when `qualityAdjusted`
 *      is true. Lets the frontend surface a "downgraded" notice.
 *   - `canonicalAnswer` — short human-readable canonical answer,
 *      populated ONLY when the (post-cap) quality is `missed` AND
 *      the question was objectively gradable (NAT or MCQ). The
 *      reveal-on-missed affordance rewards honest self-report; we
 *      never leak the answer on `got_it` or `unsure`.
 */
export class SubmitReviewResponse {
  item: any; // IReviewItem shape; left `any` to avoid an extra import
  isCorrect?: boolean;
  qualityAdjusted?: boolean;
  qualityAdjustedFrom?: RecallQuality;
  canonicalAnswer?: string;
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
 * Body for PATCH /bulk/notifications
 * Sent by a teacher to bulk pause/resume notifications for a cohort of students in a course.
 */
export class BulkUpdateOptOutBody {
  @IsString()
  @IsNotEmpty()
  courseId: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  studentIds: string[];

  @IsBoolean()
  optOut: boolean;
}

/**
 * Response for PATCH /bulk/notifications
 */
export class BulkUpdateOptOutResponse {
  updatedCount: number;
  message: string;
}

/**
 * Body for PATCH /bulk/exam-prep
 */
export class BulkExamPrepBody {
  @IsString()
  @IsNotEmpty()
  courseId: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  studentIds: string[];

  @IsBoolean()
  enabled: boolean;
}

/**
 * Response for PATCH /bulk/exam-prep
 */
export class BulkExamPrepResponse {
  updatedCount: number;
  message: string;
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

/**
 * Body for POST /:studentId/reset
 * Sent by a teacher to completely wipe a student's history for a specific card.
 */
export class ResetReviewBody {
  @IsString()
  @IsNotEmpty()
  questionId: string;
}

/**
 * Response for POST /:studentId/reset
 */
export class ResetResponse {
  reset: boolean;
  questionId: string;
  message: string;
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
  remediation_hint?: string | null;
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

// ── Manual Review Assignment (Knob 7, Phase C, 2026-07-21) ───────────────

/**
 * Params for routes scoped to a specific courseId alone.
 * e.g. GET /courses/:courseId/assignable-questions
 */
export class CourseIdParam {
  @IsString()
  @IsNotEmpty()
  courseId: string;
}

/**
 * Body for POST /:studentId/assign
 * Sent by a teacher to manually put a question on a student's next-review queue.
 */
export class AssignReviewBody {
  @IsString()
  @IsNotEmpty()
  questionId: string;

  @IsString()
  @IsNotEmpty()
  courseId: string;
}

/**
 * One entry in the question picker. Mirrors the service-level shape.
 */
export class AssignableQuestionItem {
  id: string;
  body: string;
  type: string;
  hint: string | null;
  bankIds: string[];
  bankTitles: (string | null)[];
  fromCourse: boolean;
}

/**
 * Response for GET /courses/:courseId/assignable-questions
 */
export class GetAssignableQuestionsResponse {
  courseId: string;
  count: number;
  questions: AssignableQuestionItem[];
}

/**
 * Response for POST /:studentId/assign. The `autoEnabled` flag tells the
 * frontend whether the assignment auto-re-enabled SR for the student (when
 * it had been turned off by a teacher). Distinct from the `item` payload
 * so the toast can surface it independently.
 */
export class AssignReviewResponse {
  item: any; // IReviewItem shape; left `any` to avoid an extra import
  autoEnabled: boolean;
  message: string;
}
