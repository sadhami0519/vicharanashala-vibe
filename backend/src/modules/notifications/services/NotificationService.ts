import 'reflect-metadata';
import {injectable, inject} from 'inversify';
import {ObjectId, ClientSession} from 'mongodb';
import {NotificationRepository} from '#root/shared/database/providers/mongo/repositories/NotificationRepository.js';
import {NOTIFICATIONS_TYPES} from '../types.js';
import {INotification} from '#root/shared/database/interfaces/INotification.js';
import {EnrollmentRepository} from '#root/shared/database/providers/mongo/repositories/EnrollmentRepository.js';
import {USERS_TYPES} from '#root/modules/users/types.js';
import {UserRepository} from '#root/shared/database/providers/mongo/repositories/UserRepository.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {ICourseRepository} from '#root/shared/database/interfaces/ICourseRepository.js';
import {EJECTION_POLICY_TYPES} from '#root/modules/ejectionPolicy/types.js';
import {AppealRepository} from '#root/shared/database/providers/mongo/repositories/AppealRepository.js';
import {MailService} from './MailService.js';
import {ReviewReminderEmail} from '../classes/transformers/ReviewReminderEmail.js';

@injectable()
export class NotificationService {
  constructor(
    @inject(NOTIFICATIONS_TYPES.NotificationRepo)
    private readonly notificationRepo: NotificationRepository,
    @inject(USERS_TYPES.EnrollmentRepo)
    private readonly enrollmentRepo: EnrollmentRepository,
    @inject(GLOBAL_TYPES.UserRepo)
    private readonly userRepo: UserRepository,
    @inject(GLOBAL_TYPES.CourseRepo)
    private readonly courseRepo: ICourseRepository,
    @inject(EJECTION_POLICY_TYPES.AppealRepo)
    private readonly appealRepo: AppealRepository,
    @inject(NOTIFICATIONS_TYPES.MailService)
    private readonly mailService: MailService,
  ) {}

  // ── Core Methods ────────────────────────────────────────────────

  async getUserNotifications(
    userId: string,
    limit: number = 20,
    onlyUnread: boolean = false,
  ): Promise<INotification[]> {
    return this.notificationRepo.findByUserId(userId, limit, onlyUnread);
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationRepo.countUnread(userId);
  }

  async markAsRead(notificationId: string, userId: string): Promise<void> {
    return this.notificationRepo.markAsRead(notificationId, userId);
  }

  async markAllAsRead(userId: string): Promise<void> {
    return this.notificationRepo.markAllAsRead(userId);
  }

  // ── Ejection Notification ────────────────────────────────────────

  async notifyEjection(
    userId: string,
    courseId: string,
    courseVersionId: string,
    reason: string,
    cohortId?: string,
    session?: ClientSession,
    policy?: any,
    enrollmentId?: string,
  ): Promise<void> {
    const course = await this.courseRepo.read(courseId);
    const courseName = course?.name ?? 'your course';
    const appealDeadline = policy?.actions?.appealDeadlineDays
      ? new Date(
          Date.now() + policy.actions.appealDeadlineDays * 24 * 60 * 60 * 1000,
        )
      : null;

    const notification: Omit<INotification, '_id'> = {
      userId: new ObjectId(userId),
      type: 'ejection',
      title: 'You have been ejected from a course',
      message: `You have been removed from "${courseName}". Reason: ${reason}`,
      courseId: new ObjectId(courseId),
      courseVersionId: new ObjectId(courseVersionId),
      ...(cohortId ? {cohortId: new ObjectId(cohortId)} : {}),
      metadata: {
        allowAppeal: policy?.actions?.allowAppeal ?? false,
        appealDeadline,
        ...(enrollmentId ? {enrollmentId: new ObjectId(enrollmentId)} : {}),
      },
      read: false,
      createdAt: new Date(),
    };

    await this.notificationRepo.create(notification, session);
  }

  // ── Reinstatement Notification ───────────────────────────────────

  async notifyReinstatement(
    userId: string,
    courseId: string,
    courseVersionId: string,
    cohortId?: string,
    session?: ClientSession,
  ): Promise<void> {
    const course = await this.courseRepo.read(courseId);
    const courseName = course?.name ?? 'your course';

    const notification: Omit<INotification, '_id'> = {
      userId: new ObjectId(userId),
      type: 'reinstatement',
      title: 'You have been reinstated to a course',
      message: `Your access to "${courseName}" has been restored. You can continue from where you left off.`,
      courseId: new ObjectId(courseId),
      courseVersionId: new ObjectId(courseVersionId),
      ...(cohortId ? {cohortId: new ObjectId(cohortId)} : {}),
      read: false,
      createdAt: new Date(),
    };

    await this.notificationRepo.create(notification, session);
  }

  // ── Policy Notification (notify all students in cohort) ──────────

  async notifyPolicyChange(
    courseId: string,
    courseVersionId: string,
    cohortId: string,
    policyName: string,
    isNew: boolean,
    policyId?: string,
    session?: ClientSession,
  ): Promise<void> {
    const course = await this.courseRepo.read(courseId);
    const courseName = course?.name ?? 'your course';

    // Find all active non-ejected students in this cohort
    const enrollments = await this.enrollmentRepo.findActiveEnrollmentsByCohort(
      courseId,
      courseVersionId,
      cohortId,
    );

    if (!enrollments.length) return;

    const notifications: Omit<INotification, '_id'>[] = enrollments.map(
      enrollment => ({
        userId: new ObjectId(enrollment.userId.toString()),
        type: (isNew
          ? 'policy_created'
          : 'policy_updated') as INotification['type'],
        title: isNew
          ? `New ejection policy for "${courseName}"`
          : `Ejection policy updated for "${courseName}"`,
        message: isNew
          ? `A new ejection policy "${policyName}" has been created for your cohort in "${courseName}".`
          : `The ejection policy "${policyName}" has been updated for your cohort in "${courseName}".`,
        courseId: new ObjectId(courseId),
        courseVersionId: new ObjectId(courseVersionId),
        cohortId: new ObjectId(cohortId),
        ...(policyId ? {policyId: new ObjectId(policyId)} : {}),
        read: false,
        createdAt: new Date(),
      }),
    );

    await this.notificationRepo.createMany(notifications, session);
  }
  async notifyPolicyChangeToUser(
    userId: string,
    courseId: string,
    courseVersionId: string,
    cohortId: string,
    policyName: string,
    policyId?: string,
    session?: ClientSession,
  ): Promise<void> {
    const course = await this.courseRepo.read(courseId);
    const courseName = course?.name ?? 'your course';

    const notification: Omit<INotification, '_id'> = {
      userId: new ObjectId(userId),
      type: 'policy_updated',
      title: `Policy updated — re-acknowledgement required`,
      message: `The ejection policy "${policyName}" was updated while you were away. Re-acknowledge it to access "${courseName}".`,
      courseId: new ObjectId(courseId),
      courseVersionId: new ObjectId(courseVersionId),
      cohortId: new ObjectId(cohortId),
      ...(policyId ? {policyId: new ObjectId(policyId)} : {}),
      read: false,
      createdAt: new Date(),
    };

    await this.notificationRepo.create(notification, session);
  }
  // ── Spaced Repetition Reminder ──────────────────────────────────

  async notifyReviewReminder(
    studentId: string,
    courseIds: string[],
    dueCount: number,
  ): Promise<void> {
    const courseCount = courseIds.length;
    const courseLabel = courseCount === 1 ? '1 course' : `${courseCount} courses`;

    // Build a readable course-name list for the message body (first 3 only).
    // Names are fetched in parallel; if any fail they fall back to IDs.
    const displayCourseIds = courseIds.slice(0, 3);
    const courseNameResults = await Promise.allSettled(
      displayCourseIds.map(cid => this.courseRepo.read(cid)),
    );
    const displayNames = courseNameResults
      .map((r, i) =>
        r.status === 'fulfilled' ? r.value?.name ?? displayCourseIds[i] : displayCourseIds[i],
      );
    const courseList =
      displayNames.length < courseIds.length
        ? displayNames.join(', ') + ` and ${courseIds.length - displayNames.length} more`
        : displayNames.join(', ');

    const notification: Omit<INotification, '_id'> = {
      userId: new ObjectId(studentId),
      type: 'review_reminder',
      title: '📝 Time to review — memory refresh needed',
      message:
        `You have ${dueCount} question${dueCount === 1 ? '' : 's'} due for review ` +
        `across ${courseLabel}: ${courseList}. ` +
        `Regular review keeps knowledge strong — tap to start now.`,
      read: false,
      createdAt: new Date(),
    };

    await this.notificationRepo.create(notification);

    // ── Email (best-effort) ─────────────────────────────────────────
    try {
      const student = await this.userRepo.findById(studentId);
      if (!student?.email) {
        console.warn(
          `[ReviewReminder] No email on file for student ${studentId} — skipping email.`,
        );
        return;
      }

      const emailMessage = ReviewReminderEmail.createMessage({
        studentEmail: student.email,
        studentName: student.firstName,
        dueCount,
        courseNames: displayNames,
        totalCourseCount: courseCount,
      });

      await this.mailService.sendMail(emailMessage);
      console.log(
        `[ReviewReminder] In-app + email sent for student ${studentId}: ` +
        `${dueCount} item(s) due across ${courseCount} course(s).`,
      );
    } catch (err) {
      // Fail-open: in-app notification is already created — log and continue.
      console.warn(
        `[ReviewReminder] Email send failed for student ${studentId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // ── Inactivity Warning ────────────────────────────────────────────

  async notifyInactivityWarning(
    userId: string,
    courseId: string,
    courseVersionId: string,
    daysInactive: number,
    thresholdDays: number,
    cohortId?: string,
    session?: ClientSession,
  ): Promise<void> {
    const course = await this.courseRepo.read(courseId);
    const courseName = course?.name ?? 'your course';

    const notification: Omit<INotification, '_id'> = {
      userId: new ObjectId(userId),
      type: 'inactivity_warning',
      title: 'You are at risk of being removed',
      message: `You have been inactive in "${courseName}" for ${daysInactive} days. You will be removed if you remain inactive for ${thresholdDays} days.`,
      courseId: new ObjectId(courseId),
      courseVersionId: new ObjectId(courseVersionId),
      ...(cohortId ? {cohortId: new ObjectId(cohortId)} : {}),
      read: false,
      createdAt: new Date(),
    };

    await this.notificationRepo.create(notification, session);
  }
  async createNotification(
    notification: Omit<INotification, '_id'>,
    session?: ClientSession,
  ): Promise<void> {
    await this.notificationRepo.create(notification, session);
  }

  async enrichWithAppealStatus(
    userId: string,
    notifications: INotification[],
  ): Promise<INotification[]> {
    return Promise.all(
      notifications.map(async n => {
        if (
          n.type !== 'ejection' ||
          !n.courseId ||
          !n.courseVersionId ||
          !n.cohortId
        )
          return n;

        // const hasPending = await this.appealRepo.existsPending(
        //   userId,
        //   n.courseId.toString(),
        //   n.courseVersionId.toString(),
        //   n.cohortId.toString(),
        // );

        // return {
        //   ...n,
        //   metadata: {
        //     ...(n.metadata ?? {}),
        //     appealPending: hasPending,
        //   },
        //   extra: {
        //     ...(n.extra ?? {}),
        //   },
        // };
        const hasAnyAppeal = await this.appealRepo.existsAnyAfterDate(
          userId,
          n.courseId.toString(),
          n.courseVersionId.toString(),
          n.cohortId.toString(),
          n.createdAt, // ejection notification timestamp as lower bound
        );

        return {
          ...n,
          metadata: {
            ...(n.metadata ?? {}),
            appealPending: hasAnyAppeal,
          },
        };
      }),
    );
  }
}
