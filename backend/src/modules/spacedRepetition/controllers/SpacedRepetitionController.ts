import { injectable, inject } from 'inversify';
import {
  JsonController,
  Post,
  Get,
  Patch,
  Params,
  Body,
  HttpCode,
  OnUndefined,
  Authorized,
  ForbiddenError,
  CurrentUser,
  Param,
} from 'routing-controllers';
import { OpenAPI, ResponseSchema } from 'routing-controllers-openapi';
import { SPACED_REPETITION_TYPES } from '../types.js';
import { SpacedRepetitionService } from '../services/SpacedRepetitionService.js';
import { IUser } from '#root/shared/interfaces/models.js';
import {
  SeedScheduleBody,
  SeedScheduleResponse,
  SubmitReviewBody,
  UpdateOptOutBody,
  UpdateOptOutResponse,
  BoostReviewBody,
  BoostResponse,
  StudentIdParam,
  StudentCourseParams,
  ReviewItemResponse,
  CourseRetentionResponse,
  SetRemediationHintBody,
  SetRemediationHintResponse,
  ResetResponse,
  ResetReviewBody,
  BulkUpdateOptOutBody,
  BulkUpdateOptOutResponse,
  BulkExamPrepBody,
  BulkExamPrepResponse,
  SetStudentSRDisabledBody,
  SetStudentSRDisabledResponse,
  StudentSRStatusResponse,
  BulkSetStudentSRDisabledBody,
  BulkSetStudentSRDisabledResponse,
  AssignReviewBody,
  AssignReviewResponse,
  GetAssignableQuestionsResponse,
  CourseIdParam,
} from '../classes/validators/SpacedRepetitionValidator.js';

@OpenAPI({ tags: ['Spaced Repetition'] })
@injectable()
@JsonController('/spaced-repetition')
class SpacedRepetitionController {
  constructor(
    @inject(SPACED_REPETITION_TYPES.SpacedRepetitionService)
    private readonly spacedRepetitionService: SpacedRepetitionService,
  ) {}

  /**
   * B1-actual guard — self-or-admin on per-student endpoints.
   * A student may only read or mutate their own review schedule; only
   * admins may act on another student's schedule. Throws ForbiddenError
   * otherwise so the request 403s before the service runs.
   *
   * The project-wide `authorizationChecker` already verifies the bearer
   * token; this helper layers ownership on top of that.
   */
  private _assertCanActOnStudent(user: IUser, studentId: string): void {
    const isAdmin = user.roles?.includes('admin');
    const isSelf = user.firebaseUID === studentId;
    if (!isAdmin && !isSelf) {
      throw new ForbiddenError(
        'Cannot read or mutate another student\'s review schedule',
      );
    }
  }

  /**
   * B1-actual guard — admin-only on cohort/course endpoints.
   * Any endpoint that operates on multiple students or a course-wide
   * teacher surface (bulk toggles, cohort enumeration, question
   * picker) is admin-gated. Throws ForbiddenError otherwise.
   */
  private _assertAdmin(user: IUser): void {
    if (!user.roles?.includes('admin')) {
      throw new ForbiddenError(
        'This action requires an admin or teacher role',
      );
    }
  }

  @OpenAPI({
    summary: 'Seed a spaced repetition schedule',
    description: `Creates one ReviewItem per question for a student on course completion.
    Called by the course completion hook with the full list of question IDs
    from the completed course's question bank.

    N1 (re-enabled 2026-07-24): this endpoint was previously flagged
    with \`//@Authorized()\` to allow Emie to inspect student UIDs
    manually during the school's initial SR setup. That demo-only
    bypass is now closed. Endpoint is admin-only:
      - @Authorized() requires a valid bearer token
      - _assertAdmin() requires the caller be in user.roles
    The course-completion hook (\`ProgressService.triggerSpacedRepetitionSeed\`)
    invokes the same service method directly via the container, NOT
    via HTTP, so the auto-seed path is unaffected by the gate.
    `,
  })
  @Authorized()
  @Post('/:studentId/seed')
  @HttpCode(201)
  @ResponseSchema(SeedScheduleResponse, {
    description: 'Number of review items seeded',
    statusCode: 201,
  })
  async seedSchedule(
    @CurrentUser() user: IUser,
    @Params() params: StudentIdParam,
    @Body() body: SeedScheduleBody,
  ): Promise<SeedScheduleResponse> {
    this._assertAdmin(user);
    const { studentId } = params;
    const { courseId, questionIds } = body;
    return this.spacedRepetitionService.seedSchedule(studentId, courseId, questionIds);
  }

  @OpenAPI({
    summary: 'Bulk update notification preferences (teacher control)',
    description: `Toggles notification opt-out for an array of students in a given course.
    Used for cohort-level schedule pausing/resuming.
    Teacher or admin role required.`,
  })
  @Authorized()
  @Patch('/bulk/notifications')
  @HttpCode(200)
  @ResponseSchema(BulkUpdateOptOutResponse, {
    description: 'Number of items updated',
    statusCode: 200,
  })
  async bulkUpdateNotificationPreference(
    @CurrentUser() user: IUser,
    @Body() body: BulkUpdateOptOutBody,
  ): Promise<BulkUpdateOptOutResponse> {
    this._assertAdmin(user);
    const { studentIds, courseId, optOut } = body;
    return this.spacedRepetitionService.bulkUpdateNotificationPreference(
      studentIds,
      courseId,
      optOut
    ) as unknown as Promise<BulkUpdateOptOutResponse>;
  }

  @OpenAPI({
    summary: 'Get students with review schedules for a course',
    description: `Returns an array of unique student IDs who have seeded review items for a specific course. 
    Used by the teacher dashboard to populate bulk-action cohorts.`,
  })
  @Authorized()
  @Get('/courses/:courseId/students')
  @HttpCode(200)
  async getCourseStudents(
    @CurrentUser() user: IUser,
    @Param('courseId') courseId: string,
  ): Promise<{ courseId: string; studentIds: string[]; totalStudents: number }> {
    this._assertAdmin(user);
    return this.spacedRepetitionService.getStudentsWithSchedules(courseId);
  }

  @OpenAPI({
    summary: 'Bulk toggle exam-prep mode (teacher control)',
    description: `Toggles exam-prep mode for an array of students in a given course.
    When enabled, the weakest cards (lowest EF) surface first in the review queue.
    Teacher or admin role required.`,
  })
  @Authorized()
  @Patch('/bulk/exam-prep')
  @HttpCode(200)
  @ResponseSchema(BulkExamPrepResponse, {
    description: 'Number of items updated',
    statusCode: 200,
  })
  async bulkUpdateExamPrepMode(
    @CurrentUser() user: IUser,
    @Body() body: BulkExamPrepBody,
  ): Promise<BulkExamPrepResponse> {
    this._assertAdmin(user);
    const { studentIds, courseId, enabled } = body;
    return this.spacedRepetitionService.bulkUpdateExamPrepMode(
      studentIds,
      courseId,
      enabled
    ) as unknown as Promise<BulkExamPrepResponse>;
  }

  @OpenAPI({
    summary: 'Submit a review response',
    description: `Processes a student's recall quality response for a single question.
    Runs the SM-2 algorithm and persists the updated state and next review date.
    For MCQ question types, the optional \`selectedOptionIndices\` array
    lets the service compute whether the student's pick matched the
    canonical correct option(s); the result is returned in
    \`isCorrect\`. The correct option indices themselves are NEVER
    returned — only the boolean — so the review endpoint can never be
    used as an answer-key oracle.`,
  })
  @Authorized()
  @Post('/:studentId/review')
  @HttpCode(200)
  @ResponseSchema(ReviewItemResponse, {
    description: 'Updated ReviewItem after SM-2 recalculation',
    statusCode: 200,
  })
  async submitReview(
    @CurrentUser() user: IUser,
    @Params() params: StudentIdParam,
    @Body() body: SubmitReviewBody,
  ): Promise<ReviewItemResponse> {
    const { studentId } = params;
    this._assertCanActOnStudent(user, studentId);
    const { questionId, quality, selectedOptionIndices } = body;
    const result = await this.spacedRepetitionService.submitReview(
      studentId,
      questionId,
      quality,
      selectedOptionIndices,
    );
    return result.item as unknown as ReviewItemResponse;
  }

  @OpenAPI({
    summary: 'Get full review schedule for a student',
    description: `Returns all ReviewItems for a student across all completed courses.
    Used by the student dashboard to display upcoming review sessions.`,
  })
  @Authorized()
  @Get('/:studentId/schedule')
  @HttpCode(200)
  @ResponseSchema(ReviewItemResponse, {
    isArray: true,
    description: 'All ReviewItems for the student',
    statusCode: 200,
  })
  async getSchedule(
    @CurrentUser() user: IUser,
    @Params() params: StudentIdParam,
  ): Promise<ReviewItemResponse[]> {
    const { studentId } = params;
    this._assertCanActOnStudent(user, studentId);
    return this.spacedRepetitionService.getSchedule(studentId) as unknown as Promise<ReviewItemResponse[]>;
  }

  @OpenAPI({
    summary: 'Get retention health for a course',
    description: `Returns all ReviewItems for a student within a specific course,
    along with a computed retention health summary — overdue count, due-soon count,
    and average easiness factor.`,
  })
  @Authorized()
  @Get('/:studentId/course/:courseId')
  @HttpCode(200)
  @ResponseSchema(CourseRetentionResponse, {
    description: 'Course retention summary and items',
    statusCode: 200,
  })
  async getCourseRetention(
    @CurrentUser() user: IUser,
    @Params() params: StudentCourseParams,
  ): Promise<CourseRetentionResponse> {
    const { studentId, courseId } = params;
    this._assertCanActOnStudent(user, studentId);
    return this.spacedRepetitionService.getCourseRetention(studentId, courseId) as unknown as Promise<CourseRetentionResponse>;
  }

  @OpenAPI({
    summary: 'Update notification preferences',
    description: `Toggles notification opt-out for all ReviewItems belonging to
    a student in a given course. When opted out, the cron job skips sending
    notifications but SM-2 state still updates on review.`,
  })
  @Authorized()
  @Patch('/:studentId/notifications')
  @HttpCode(200)
  @ResponseSchema(UpdateOptOutResponse, {
    description: 'Number of items updated',
    statusCode: 200,
  })
  async updateNotificationPreference(
    @CurrentUser() user: IUser,
    @Params() params: StudentIdParam,
    @Body() body: UpdateOptOutBody,
  ): Promise<UpdateOptOutResponse> {
    const { studentId } = params;
    this._assertCanActOnStudent(user, studentId);
    const { courseId, optOut } = body;
    return this.spacedRepetitionService.updateNotificationPreference(studentId, courseId, optOut);
  }

  @OpenAPI({
    summary: 'Reset a review question (teacher control)',
    description: `Deletes a student's review history for a specific card, returning it to the default SM-2 state as if never seen.
    Teacher or admin role required.`,
  })
  @Authorized()
  @Post('/:studentId/reset')
  @HttpCode(200)
  @ResponseSchema(ResetResponse, {
    description: 'Confirmation of reset',
    statusCode: 200,
  })
  async resetReview(
    @CurrentUser() user: IUser,
    @Params() params: StudentIdParam,
    @Body() body: ResetReviewBody,
  ): Promise<ResetResponse> {
    this._assertAdmin(user);
    const { studentId } = params;
    const { questionId } = body;
    return this.spacedRepetitionService.resetReview(studentId, questionId);
  }

  @OpenAPI({
    summary: 'Boost a review question (teacher control)',
    description: `Forces a specific question to become due immediately for a student.
    Optionally resets the easiness factor to a target value.
    Use case: teacher/admin boosts a student who needs extra practice after an exam.
    Teacher or admin role required.`,
  })
  @Authorized()
  @Post('/:studentId/boost')
  @HttpCode(200)
  @ResponseSchema(BoostResponse, {
    description: 'Updated state after boost',
    statusCode: 200,
  })
  async boostReview(
    @CurrentUser() user: IUser,
    @Params() params: StudentIdParam,
    @Body() body: BoostReviewBody,
  ): Promise<BoostResponse> {
    this._assertAdmin(user);
    const { studentId } = params;
    const { questionId, targetEF } = body;
    return this.spacedRepetitionService.boostReview(studentId, questionId, targetEF);
  }

  @OpenAPI({
    summary: 'Set remediation hint for a student (teacher control)',
    description: `Attaches a targeted hint to a specific (student, question) review item.
    The hint is shown to the student ONLY after they answer incorrectly in a review session.
    Pass null or omit the hint field to clear an existing hint.
    Teacher or admin role required.`,
  })
  @Authorized()
  @Patch('/:studentId/remediation-hint')
  @HttpCode(200)
  @ResponseSchema(SetRemediationHintResponse, {
    description: 'Confirmation with current hint value',
    statusCode: 200,
  })
  async setRemediationHint(
    @CurrentUser() user: IUser,
    @Params() params: StudentIdParam,
    @Body() body: SetRemediationHintBody,
  ): Promise<SetRemediationHintResponse> {
    this._assertAdmin(user);
    const { studentId } = params;
    const { questionId, hint } = body;
    return this.spacedRepetitionService.setRemediationHint(
      studentId,
      questionId,
      hint,
    );
  }

  // ── SR-disabled endpoints (Knob 6, Phase C, 2026-07-21) ──────────────

  @OpenAPI({
    summary: 'Get SR-enabled status for a student',
    description: `Returns whether spaced repetition is currently enabled for the student.
    Used by the student dashboard to choose between the 'no reviews yet'
    and 'disabled by teacher' empty-state copy.`,
  })
  @Authorized()
  @Get('/students/:studentId/status')
  @HttpCode(200)
  @ResponseSchema(StudentSRStatusResponse, {
    description: 'Whether SR is enabled for this student',
    statusCode: 200,
  })
  async getStudentSRStatus(
    @CurrentUser() user: IUser,
    @Param('studentId') studentId: string,
  ): Promise<StudentSRStatusResponse> {
    this._assertCanActOnStudent(user, studentId);
    const sr_disabled =
      await this.spacedRepetitionService.getStudentSRStatus(studentId);
    return { studentId, sr_disabled };
  }

  @OpenAPI({
    summary: 'Enable or disable SR for a student (teacher control)',
    description: `Flips the SR-disabled flag for one student. When set to true,
    the student's review schedule stops accumulating and reminders stop firing.
    The student dashboard shows a 'disabled by teacher' empty state.
    Re-enabling (sr_disabled: false) does NOT auto-seed — it just allows the
    next course completion to seed normally. Teacher or admin role required.`,
  })
  @Authorized()
  @Patch('/students/:studentId/sr-disabled')
  @HttpCode(200)
  @ResponseSchema(SetStudentSRDisabledResponse, {
    description: 'New SR-enabled status',
    statusCode: 200,
  })
  async setStudentSRDisabled(
    @CurrentUser() user: IUser,
    @Param('studentId') studentId: string,
    @Body() body: SetStudentSRDisabledBody,
  ): Promise<SetStudentSRDisabledResponse> {
    this._assertAdmin(user);
    const { sr_disabled } = body;
    const result = await this.spacedRepetitionService.setStudentSRStatus(
      studentId,
      sr_disabled,
    );
    return {
      studentId: result.studentId,
      sr_disabled: result.sr_disabled,
      message: sr_disabled
        ? `Spaced repetition disabled for ${studentId}.`
        : `Spaced repetition re-enabled for ${studentId}.`,
    };
  }

  @OpenAPI({
    summary: 'Bulk enable or disable SR for a cohort (teacher control)',
    description: `Flips the SR-disabled flag for an array of students in one call.
    Used by the teacher dashboard to disable SR across a whole class.
    Teacher or admin role required.`,
  })
  @Authorized()
  @Patch('/bulk/sr-disabled')
  @HttpCode(200)
  @ResponseSchema(BulkSetStudentSRDisabledResponse, {
    description: 'Number of students whose flag was updated',
    statusCode: 200,
  })
  async bulkSetStudentSRDisabled(
    @CurrentUser() user: IUser,
    @Body() body: BulkSetStudentSRDisabledBody,
  ): Promise<BulkSetStudentSRDisabledResponse> {
    this._assertAdmin(user);
    const { studentIds, sr_disabled } = body;
    const result = await this.spacedRepetitionService.bulkSetStudentSRStatus(
      studentIds,
      sr_disabled,
    );
    return result;
  }

  // ── Manual Review Assignment (Knob 7, Phase C, 2026-07-21) ─────────────

  /**
   * GET /api/spaced-repetition/courses/:courseId/assignable-questions
   *
   * Returns the question list used by the teacher-side assign dialog.
   * Sorted so questions from the course's banks come first (the
   * `fromCourse: true` flag) followed by every other question from
   * any bank (the cross-bank policy).
   */
  @Authorized()
  @Get('/courses/:courseId/assignable-questions')
  @ResponseSchema(GetAssignableQuestionsResponse)
  async getAssignableQuestions(
    @CurrentUser() user: IUser,
    @Params() params: CourseIdParam,
  ): Promise<GetAssignableQuestionsResponse> {
    this._assertAdmin(user);
    const questions =
      await this.spacedRepetitionService.getAssignableQuestions(
        params.courseId,
      );
    return {
      courseId: params.courseId,
      count: questions.length,
      questions,
    };
  }

  /**
   * POST /api/spaced-repetition/:studentId/assign
   *
   * Manually put a question on a student's next-review queue. If a
   * ReviewItem already exists for (student, question) returns 409
   * ConflictError; the frontend offers Boost instead.
   *
   * If SR is disabled for the student, this auto-enables it (with
   * `autoEnabled: true` in the response) so the assignment is
   * actually actionable. The frontend surfaces this in a toast.
   */
  @Authorized()
  @Post('/:studentId/assign')
  @HttpCode(200)
  @ResponseSchema(AssignReviewResponse)
  async assignReview(
    @CurrentUser() user: IUser,
    @Params() params: StudentIdParam,
    @Body() body: AssignReviewBody,
  ): Promise<AssignReviewResponse> {
    this._assertAdmin(user);
    return this.spacedRepetitionService.assignReview(
      params.studentId,
      body.questionId,
      body.courseId,
    );
  }
}

export { SpacedRepetitionController };