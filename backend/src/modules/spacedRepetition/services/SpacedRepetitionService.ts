import { injectable, inject } from 'inversify';
import { NotFoundError, InternalServerError, ForbiddenError } from 'routing-controllers';
import { SPACED_REPETITION_TYPES } from '../types.js';
import { BaseService } from '#root/shared/classes/BaseService.js';
import { MongoDatabase } from '#shared/database/providers/mongo/MongoDatabase.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { ReviewItemRepository, StudentSRStatusRepository } from '#spacedRepetition/repositories/index.js';
import {
  IReviewItem,
  ISM2State,
  RecallQuality,
  RECALL_QUALITY_MAP,
  DEFAULT_SM2_STATE,
} from '../interfaces/IReviewItem.js';

// ── Retention health summary returned per course ───────────────────────────

export interface ICourseRetentionSummary {
  courseId: string;
  totalItems: number;

  /** Items whose next_review_at is in the past — student is overdue. */
  overdueCount: number;

  /** Items due within the next 7 days. */
  dueSoonCount: number;

  /** Average EF across all items — proxy for overall ease of retention. */
  averageEF: number;

  items: IReviewItem[];
}

@injectable()
class SpacedRepetitionService extends BaseService {
  constructor(
    @inject(GLOBAL_TYPES.Database)
    public readonly database: MongoDatabase,

    @inject(SPACED_REPETITION_TYPES.ReviewItemRepo)
    private readonly reviewItemRepo: ReviewItemRepository,

    @inject(SPACED_REPETITION_TYPES.StudentSRStatusRepo)
    private readonly studentSRStatusRepo: StudentSRStatusRepository,
  ) {
    super(database);
  }

  // ── SR-disabled guards (Knob 6, Phase C, 2026-07-21) ───────────────────

  /**
   * Throws ForbiddenError if the student has SR disabled.
   * Used to short-circuit any write path (seed, review) when SR is off.
   */
  private async _assertSREnabled(studentId: string): Promise<void> {
    const disabled = await this.studentSRStatusRepo.getStatus(studentId);
    if (disabled) {
      throw new ForbiddenError(
        'Spaced repetition is disabled for this student.',
      );
    }
  }

  /**
   * Returns the SR-disabled flag for one student.
   * Used by the frontend to choose between the empty-state copy
   * ("no reviews yet") and the disabled copy ("disabled by teacher").
   */
  async getStudentSRStatus(studentId: string): Promise<boolean> {
    return this.studentSRStatusRepo.getStatus(studentId);
  }

  /**
   * Sets the SR-disabled flag for one student.
   * Returns the new flag value.
   */
  async setStudentSRStatus(
    studentId: string,
    disabled: boolean,
  ): Promise<{ studentId: string; sr_disabled: boolean }> {
    return this._withTransaction(async session => {
      const matched = await this.studentSRStatusRepo.setStatus(
        studentId,
        disabled,
        session,
      );
      if (!matched) {
        throw new NotFoundError(
          `No user found with firebaseUID '${studentId}'.`,
        );
      }
      return { studentId, sr_disabled: disabled };
    });
  }

  /**
   * Bulk-set the SR-disabled flag for many students.
   * Returns the number of users whose flag was actually changed.
   */
  async bulkSetStudentSRStatus(
    studentIds: string[],
    disabled: boolean,
  ): Promise<{ updatedCount: number; message: string }> {
    return this._withTransaction(async session => {
      const updatedCount = await this.studentSRStatusRepo.setStatusForMany(
        studentIds,
        disabled,
        session,
      );
      return {
        updatedCount,
        message: disabled
          ? `Disabled SR for ${updatedCount} student(s).`
          : `Re-enabled SR for ${updatedCount} student(s).`,
      };
    });
  }

  // ── SM-2 algorithm (private, pure — no DB calls) ─────────────────────────

  /**
   * Applies the SM-2 algorithm to an existing ReviewItem and returns the
   * updated SM-2 state fields plus the next review date.
   *
   * Formula (from the spec):
   *   if q >= 3:
   *     n = 0 → I = 1; n = 1 → I = 6; else → I = round(I_prev * EF)
   *     n = n + 1
   *     EF = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
   *     EF = max(EF, 1.3)
   *   if q < 3:
   *     n = 0
   *     I = 1
   */
  private _applySM2(
    item: IReviewItem,
    quality: RecallQuality,
  ): ISM2State & { next_review_at: Date; last_reviewed_at: Date } {
    const q = RECALL_QUALITY_MAP[quality];
    let { n, EF, interval_days } = item;

    if (q >= 3) {
      // Correct response — advance the interval
      if (n === 0) {
        interval_days = 1;
      } else if (n === 1) {
        interval_days = 6;
      } else {
        interval_days = Math.round(interval_days * EF);
      }
      n = n + 1;
      EF = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
      EF = Math.max(EF, 1.3);
    } else {
      // Incorrect response — reset to start
      n = 0;
      interval_days = 1;
      // EF is not changed on an incorrect response per SM-2 spec
    }

    const now = new Date();
    const next_review_at = new Date(now);
    next_review_at.setDate(next_review_at.getDate() + interval_days);

    return {
      n,
      EF,
      interval_days,
      next_review_at,
      last_reviewed_at: now,
    };
  }

  // ── Public service methods ────────────────────────────────────────────────

  /**
   * Seeds a spaced repetition schedule for a student on course completion.
   * Creates one ReviewItem per questionId with DEFAULT_SM2_STATE.
   * next_review_at is set to 1 day from now (the first review interval).
   *
   * Called by the course completion hook (Step 7).
   */
  seedSchedule(
    studentId: string,
    courseId: string,
    questionIds: string[],
  ) {
    return this._withTransaction(async session => {
      if (!questionIds.length) {
        throw new InternalServerError(
          'Cannot seed schedule: no questions provided.',
        );
      }

      // Knob 6: refuse to seed if the student has SR disabled.
      // The teacher must re-enable first. This is a teacher-coach lever, not
      // an automatic gate — the auto-seeding course-completion hook will
      // silently no-op (caught upstream), and explicit seeds from the
      // teacher UI will surface a clear 403.
      await this._assertSREnabled(studentId);

      const now = new Date();
      const firstReviewAt = new Date(now);
      firstReviewAt.setDate(firstReviewAt.getDate() + DEFAULT_SM2_STATE.interval_days);

      const items: Omit<IReviewItem, '_id'>[] = questionIds.map(questionId => ({
        student_id: studentId,
        course_id: courseId,
        question_id: questionId,
        ...DEFAULT_SM2_STATE,
        next_review_at: firstReviewAt,
        last_reviewed_at: null,
        notification_opt_out: false,
        exam_prep_mode: false,
      }));

      // Guard against double-seeding: skip if items already exist for this student+course
      const existing = await this.reviewItemRepo.findByStudentAndCourse(
        studentId,
        courseId,
        session,
      );
      if (existing.length > 0) {
        return { seeded: 0 };
      }

      const insertedCount = await this.reviewItemRepo.createMany(items, session);

      if (insertedCount !== questionIds.length) {
        throw new InternalServerError(
          `Schedule seeding incomplete: expected ${questionIds.length} items, inserted ${insertedCount}.`,
        );
      }

      return { seeded: insertedCount };
    });
  }

  /**
   * Processes a student's response to a review question.
   * Fetches the ReviewItem, applies SM-2, and persists the updated state.
   *
   * Called by the controller when a student submits a review response.
   */
  submitReview(
    studentId: string,
    questionId: string,
    quality: RecallQuality,
  ) {
    return this._withTransaction(async session => {
      // Knob 6: refuse to accept reviews if SR is disabled.
      // The student-facing empty state already gates the review session,
      // but this is a belt-and-braces guard for direct API calls.
      await this._assertSREnabled(studentId);

      const item = await this.reviewItemRepo.findByStudentAndQuestion(
        studentId,
        questionId,
        session,
      );

      if (!item) {
        throw new NotFoundError(
          'Review item not found for this student and question.',
        );
      }

      const updatedState = this._applySM2(item, quality);

      const updated = await this.reviewItemRepo.update(
        item._id.toString(),
        updatedState,
        session,
      );

      if (!updated) {
        throw new InternalServerError('Failed to update review item after SM-2 calculation.');
      }

      return updated;
    });
  }

  /**
   * Returns all ReviewItems for a student across all courses.
   * Used by the student dashboard to show the full upcoming review schedule.
   */
/**
   * Returns all ReviewItems for a student across all courses.
   * Used by the student dashboard to show the full upcoming review schedule.
   */
  getSchedule(studentId: string) {
    return this._withTransaction(async session => {
      const items = await this.reviewItemRepo.findByStudent(studentId, session);
      
      // Apply Exam-Prep Mode priority sorting
      items.sort((a, b) => {
        // 1. Exam Prep items float to the absolute top of the queue
        if (a.exam_prep_mode && !b.exam_prep_mode) return -1;
        if (!a.exam_prep_mode && b.exam_prep_mode) return 1;
        
        // 2. Within Exam Prep Mode, sort by weakest cards first (lowest EF)
        if (a.exam_prep_mode && b.exam_prep_mode) {
          if (a.EF !== b.EF) return a.EF - b.EF;
        }
        
        // 3. Default: Standard chronological sort for normal items
        return a.next_review_at.getTime() - b.next_review_at.getTime();
      });

      return items;
    });
  }

  /**
   * Returns all ReviewItems for a student within a specific course,
   * along with a computed retention health summary.
   * Used by the per-course retention view on the student dashboard.
   */
/**
   * Returns all ReviewItems for a student within a specific course,
   * along with a computed retention health summary.
   * Used by the per-course retention view on the student dashboard.
   */
  getCourseRetention(
    studentId: string,
    courseId: string,
  ): Promise<ICourseRetentionSummary> {
    return this._withTransaction(async session => {
      const items = await this.reviewItemRepo.findByStudentAndCourse(
        studentId,
        courseId,
        session,
      );

      if (!items.length) {
        throw new NotFoundError(
          'No review schedule found for this student and course.',
        );
      }

      // Apply Exam-Prep Mode priority sorting for dashboard consistency
      items.sort((a, b) => {
        if (a.exam_prep_mode && !b.exam_prep_mode) return -1;
        if (!a.exam_prep_mode && b.exam_prep_mode) return 1;
        
        if (a.exam_prep_mode && b.exam_prep_mode) {
          if (a.EF !== b.EF) return a.EF - b.EF;
        }
        
        return a.next_review_at.getTime() - b.next_review_at.getTime();
      });

      const now = new Date();
      const sevenDaysFromNow = new Date(now);
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

      const overdueCount = items.filter(
        item => item.next_review_at <= now,
      ).length;

      const dueSoonCount = items.filter(
        item => item.next_review_at > now && item.next_review_at <= sevenDaysFromNow,
      ).length;

      const averageEF =
        items.reduce((sum, item) => sum + item.EF, 0) / items.length;

      return {
        courseId,
        totalItems: items.length,
        overdueCount,
        dueSoonCount,
        averageEF: Math.round(averageEF * 100) / 100,
        items,
      };
    });
  }

  /**
   * Returns a list of all student IDs who have an active spaced repetition
   * schedule for the given course.
   */
  getStudentsWithSchedules(courseId: string) {
    return this._withTransaction(async session => {
      const studentIds = await this.reviewItemRepo.getDistinctStudentsForCourse(
        courseId,
        session
      );
      
      return { 
        courseId, 
        studentIds,
        totalStudents: studentIds.length 
      };
    });
  }

  /**
   * Updates the notification opt-out preference for all ReviewItems
   * belonging to a student in a given course.
   * Called when the student toggles notifications for a course.
   */
  updateNotificationPreference(
    studentId: string,
    courseId: string,
    optOut: boolean,
  ) {
    return this._withTransaction(async session => {
      const modifiedCount = await this.reviewItemRepo.updateOptOut(
        studentId,
        courseId,
        optOut,
        session,
      );

      if (modifiedCount === 0) {
        throw new NotFoundError(
          'No review items found for this student and course.',
        );
      }

      return { updatedCount: modifiedCount };
    });
  }

  /**
   * Bulk updates the notification opt-out preference for multiple students
   * within a given course.
   * Called by the teacher dashboard for cohort-level management.
   */
  bulkUpdateNotificationPreference(
    studentIds: string[],
    courseId: string,
    optOut: boolean,
  ) {
    return this._withTransaction(async session => {
      const modifiedCount = await this.reviewItemRepo.updateOptOutBulk(
        studentIds,
        courseId,
        optOut,
        session,
      );

      return { 
        updatedCount: modifiedCount,
        message: `Updated notifications for ${modifiedCount} review items.` 
      };
    });
  }

  /**
   * Bulk updates the exam prep mode for multiple students within a given course.
   */
  bulkUpdateExamPrepMode(
    studentIds: string[],
    courseId: string,
    enabled: boolean,
  ) {
    return this._withTransaction(async session => {
      const modifiedCount = await this.reviewItemRepo.updateExamPrepBulk(
        studentIds,
        courseId,
        enabled,
        session,
      );

      return { 
        updatedCount: modifiedCount,
        message: `${enabled ? 'Enabled' : 'Disabled'} exam-prep mode for ${modifiedCount} review items.` 
      };
    });
  }

  /**
   * Forces a specific question to become due immediately for a student.
   * Optionally resets the easiness factor.
   *
   * Called by a teacher or admin to "boost" a student who needs
   * extra practice on a specific question or topic.
   *
   * @param studentId  - the student whose review item to boost
   * @param questionId - the specific question to force-due
   * @param targetEF   - optional; if provided, EF is set to this exact value
   */
  boostReview(
    studentId: string,
    questionId: string,
    targetEF?: number,
  ): Promise<{
    boosted: boolean;
    questionId: string;
    next_review_at: Date;
    EF: number;
    interval_days: number;
    message: string;
  }> {
    return this._withTransaction(async session => {
      const item = await this.reviewItemRepo.findByStudentAndQuestion(
        studentId,
        questionId,
        session,
      );

      if (!item) {
        throw new NotFoundError(
          'Review item not found for this student and question.',
        );
      }

      const now = new Date();

      const updates: Partial<IReviewItem> = {
        next_review_at: now,
        // If targetEF is provided, override directly.
        // Otherwise leave EF unchanged — the card is just brought forward.
        ...(targetEF !== undefined ? { EF: targetEF } : {}),
      };

      const updated = await this.reviewItemRepo.update(
        item._id.toString(),
        updates,
        session,
      );

      if (!updated) {
        throw new InternalServerError('Failed to boost review item.');
      }

      const message =
        targetEF !== undefined
          ? `Question boosted and EF reset to ${targetEF.toFixed(1)}.`
          : 'Question boosted — due immediately.';

      return {
        boosted: true,
        questionId,
        next_review_at: updated.next_review_at,
        EF: updated.EF,
        interval_days: updated.interval_days,
        message,
      };
    });
  }

  /**
   * Resets a specific question's review history for a student, returning it
   * to the default SM-2 state as if they had never seen it.
   */
  resetReview(
    studentId: string,
    questionId: string,
  ): Promise<{
    reset: boolean;
    questionId: string;
    message: string;
  }> {
    return this._withTransaction(async session => {
      const item = await this.reviewItemRepo.findByStudentAndQuestion(
        studentId,
        questionId,
        session,
      );

      if (!item) {
        throw new NotFoundError(
          'Review item not found for this student and question.',
        );
      }

      const now = new Date();
      const next_review_at = new Date(now);
      next_review_at.setDate(next_review_at.getDate() + DEFAULT_SM2_STATE.interval_days);

      const updates: Partial<IReviewItem> = {
        n: DEFAULT_SM2_STATE.n,
        EF: DEFAULT_SM2_STATE.EF,
        interval_days: DEFAULT_SM2_STATE.interval_days,
        next_review_at,
        last_reviewed_at: null, // Clear the review timestamp
      };

      const updated = await this.reviewItemRepo.update(
        item._id.toString(),
        updates,
        session,
      );

      if (!updated) {
        throw new InternalServerError('Failed to reset review item.');
      }

      return {
        reset: true,
        questionId,
        message: 'Card history successfully reset to default state.',
      };
    });
  }

  /**
   * Sets or clears the remediation hint for a (student, question) pair.
   * The hint is shown to the student ONLY after they answer incorrectly
   * in a review session.
   *
   * Called by a teacher/admin to attach targeted post-failure guidance.
   *
   * @param studentId  - the student who will see the hint
   * @param questionId - the specific question the hint relates to
   * @param hint       - the hint text, or null/undefined to clear it
   */
  setRemediationHint(
    studentId: string,
    questionId: string,
    hint: string | null | undefined,
  ): Promise<{
    questionId: string;
    remediationHint: string | null;
    message: string;
  }> {
    return this._withTransaction(async session => {
      const item = await this.reviewItemRepo.findByStudentAndQuestion(
        studentId,
        questionId,
        session,
      );

      if (!item) {
        throw new NotFoundError(
          'Review item not found for this student and question.',
        );
      }

      const resolvedHint = hint === undefined ? null : hint;

      const updated = await this.reviewItemRepo.update(
        item._id.toString(),
        { remediationHint: resolvedHint ?? undefined },
        session,
      );

      if (!updated) {
        throw new InternalServerError(
          'Failed to update remediation hint.',
        );
      }

      return {
        questionId,
        remediationHint: updated.remediationHint ?? null,
        message:
          resolvedHint != null
            ? 'Remediation hint set.'
            : 'Remediation hint cleared.',
      };
    });
  }
}

export { SpacedRepetitionService };