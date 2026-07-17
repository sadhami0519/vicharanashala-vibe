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
} from 'routing-controllers';
import { OpenAPI, ResponseSchema } from 'routing-controllers-openapi';
import { SPACED_REPETITION_TYPES } from '../types.js';
import { SpacedRepetitionService } from '../services/SpacedRepetitionService.js';
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
} from '../classes/validators/SpacedRepetitionValidator.js';

@OpenAPI({ tags: ['Spaced Repetition'] })
@injectable()
@JsonController('/spaced-repetition')
class SpacedRepetitionController {
  constructor(
    @inject(SPACED_REPETITION_TYPES.SpacedRepetitionService)
    private readonly spacedRepetitionService: SpacedRepetitionService,
  ) {}

  @OpenAPI({
    summary: 'Seed a spaced repetition schedule',
    description: `Creates one ReviewItem per question for a student on course completion.
    Called by the course completion hook with the full list of question IDs
    from the completed course's question bank.`,
  })
  @Authorized()
  @Post('/:studentId/seed')
  @HttpCode(201)
  @ResponseSchema(SeedScheduleResponse, {
    description: 'Number of review items seeded',
    statusCode: 201,
  })
  async seedSchedule(
    @Params() params: StudentIdParam,
    @Body() body: SeedScheduleBody,
  ): Promise<SeedScheduleResponse> {
    const { studentId } = params;
    const { courseId, questionIds } = body;
    return this.spacedRepetitionService.seedSchedule(studentId, courseId, questionIds);
  }

  @OpenAPI({
    summary: 'Submit a review response',
    description: `Processes a student's recall quality response for a single question.
    Runs the SM-2 algorithm and persists the updated state and next review date.
    Returns the updated ReviewItem.`,
  })
  @Authorized()
  @Post('/:studentId/review')
  @HttpCode(200)
  @ResponseSchema(ReviewItemResponse, {
    description: 'Updated ReviewItem after SM-2 recalculation',
    statusCode: 200,
  })
  async submitReview(
    @Params() params: StudentIdParam,
    @Body() body: SubmitReviewBody,
  ): Promise<ReviewItemResponse> {
    const { studentId } = params;
    const { questionId, quality } = body;
    return this.spacedRepetitionService.submitReview(studentId, questionId, quality) as unknown as Promise<ReviewItemResponse>;
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
    @Params() params: StudentIdParam,
  ): Promise<ReviewItemResponse[]> {
    const { studentId } = params;
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
    @Params() params: StudentCourseParams,
  ): Promise<CourseRetentionResponse> {
    const { studentId, courseId } = params;
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
    @Params() params: StudentIdParam,
    @Body() body: UpdateOptOutBody,
  ): Promise<UpdateOptOutResponse> {
    const { studentId } = params;
    const { courseId, optOut } = body;
    return this.spacedRepetitionService.updateNotificationPreference(studentId, courseId, optOut);
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
    @Params() params: StudentIdParam,
    @Body() body: BoostReviewBody,
  ): Promise<BoostResponse> {
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
    @Params() params: StudentIdParam,
    @Body() body: SetRemediationHintBody,
  ): Promise<SetRemediationHintResponse> {
    const { studentId } = params;
    const { questionId, hint } = body;
    return this.spacedRepetitionService.setRemediationHint(
      studentId,
      questionId,
      hint,
    );
  }
}

export { SpacedRepetitionController };