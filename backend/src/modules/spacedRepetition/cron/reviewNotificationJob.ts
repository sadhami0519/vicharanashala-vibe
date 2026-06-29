import cron from 'node-cron';
import { appConfig } from '#root/config/app.js';
import { getContainer } from '#root/bootstrap/loadModules.js';
import { SPACED_REPETITION_TYPES } from '../types.js';
import { ReviewItemRepository } from '#spacedRepetition/repositories/index.js';
import { IReviewItem } from '../interfaces/IReviewItem.js';
import { NOTIFICATIONS_TYPES } from '../../notifications/types.js';
import { NotificationService } from '../../notifications/services/NotificationService.js';

/**
 * Groups an array of due ReviewItems by student_id.
 * Each student gets one notification listing all their due questions,
 * rather than one notification per question.
 */
function groupByStudent(items: IReviewItem[]): Map<string, IReviewItem[]> {
  const map = new Map<string, IReviewItem[]>();
  for (const item of items) {
    if (!map.has(item.student_id)) {
      map.set(item.student_id, []);
    }
    map.get(item.student_id)!.push(item);
  }
  return map;
}

/**
 * Registers the spaced repetition review notification cron job.
 *
 * Schedule: every hour on the hour.
 * Gated by: ENABLE_SPACED_REPETITION_JOB=true in env.
 * Timezone: Asia/Kolkata (matches existing jobs in the codebase).
 *
 * On each tick:
 *   1. Query all ReviewItems where next_review_at <= now AND notification_opt_out = false
 *   2. Group by student
 *   3. Send one notification per student listing their due questions
 *
 * Note: actual email/in-app notification delivery is handled by the
 * existing notifications module. Plug in the notifier call where indicated
 * once the notifications module interface is confirmed (Step 7 / integration).
 */
export function scheduleReviewNotificationJob(): void {
  cron.schedule(
    '0 * * * *',
    async () => {
      if (!appConfig.ENABLE_SPACED_REPETITION_JOB) {
        return;
      }

      console.log('🔁 Spaced repetition review notification job started...');

      try {
        const container = getContainer();
        const reviewItemRepo = container.get<ReviewItemRepository>(
          SPACED_REPETITION_TYPES.ReviewItemRepo,
        );

        const now = new Date();
        const allDueItems = await reviewItemRepo.findDueItems(now);

        // Filter out students who have opted out of notifications
        const notifiableItems = allDueItems.filter(
          item => !item.notification_opt_out,
        );

        if (!notifiableItems.length) {
          console.log('✅ No review notifications to send.');
          return;
        }

        const grouped = groupByStudent(notifiableItems);

        console.log(
          `📬 Sending review notifications to ${grouped.size} student(s) ` +
          `(${notifiableItems.length} item(s) due)...`,
        );

        for (const [studentId, items] of grouped) {
          try {
            const notificationsService = getContainer().get<NotificationService>(
              NOTIFICATIONS_TYPES.NotificationService,
            );
            await notificationsService.notifyReviewReminder(
              studentId,
              [...new Set(items.map(i => i.course_id))],
              items.length,
            );
          } catch (notifyError) {
            // Per-student errors are caught individually so one failure
            // does not stop notifications for other students.
            console.error(
              `❌ Failed to notify student ${studentId}:`,
              notifyError,
            );
          }
        }

        console.log('✅ Spaced repetition review notification job completed.');
      } catch (error) {
        console.error('❌ Spaced repetition review notification job failed:', error);
      }
    },
    {
      timezone: 'Asia/Kolkata',
    },
  );
}