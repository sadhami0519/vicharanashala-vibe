import { IReviewItem } from '#spacedRepetition/interfaces/IReviewItem.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { MongoDatabase } from '#shared/database/providers/mongo/MongoDatabase.js';
import { injectable, inject } from 'inversify';
import { Collection, ClientSession, ObjectId } from 'mongodb';

@injectable()
class ReviewItemRepository {
  private reviewItemCollection: Collection<IReviewItem>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  private async init() {
    this.reviewItemCollection =
      await this.db.getCollection<IReviewItem>('review_items');
  }

  /**
   * Insert a single ReviewItem.
   * Called when seeding a schedule for one question on course completion.
   */
  async create(
    item: Omit<IReviewItem, '_id'>,
    session?: ClientSession,
  ): Promise<IReviewItem> {
    await this.init();
    const result = await this.reviewItemCollection.insertOne(
      item as IReviewItem,
      { session },
    );
    return { ...item, _id: result.insertedId };
  }

  /**
   * Bulk-insert multiple ReviewItems in one operation.
   * Called when seeding the full schedule on course completion —
   * one item per question in the course question bank.
   */
  async createMany(
    items: Omit<IReviewItem, '_id'>[],
    session?: ClientSession,
  ): Promise<number> {
    await this.init();
    const result = await this.reviewItemCollection.insertMany(
      items as IReviewItem[],
      { session },
    );
    return result.insertedCount;
  }

  /**
   * Find all items whose next_review_at is on or before `now`.
   * Called by the cron job to determine which students need a notification.
   */
  async findDueItems(
    now: Date,
    session?: ClientSession,
  ): Promise<IReviewItem[]> {
    await this.init();
    return this.reviewItemCollection
      .find({ next_review_at: { $lte: now } }, { session })
      .toArray();
  }

  /**
   * Find all ReviewItems for a given student across all courses.
   * Called by the dashboard endpoint to show upcoming review schedule.
   */
  async findByStudent(
    studentId: string,
    session?: ClientSession,
  ): Promise<IReviewItem[]> {
    await this.init();
    return this.reviewItemCollection
      .find({ student_id: studentId }, { session })
      .toArray();
  }

  /**
   * Find all ReviewItems for a given student within a specific course.
   * Called by the per-course retention view on the student dashboard.
   */
  async findByStudentAndCourse(
    studentId: string,
    courseId: string,
    session?: ClientSession,
  ): Promise<IReviewItem[]> {
    await this.init();
    return this.reviewItemCollection
      .find({ student_id: studentId, course_id: courseId }, { session })
      .toArray();
  }

  /**
   * Find the specific ReviewItem for a (student, question) pair.
   * Called by the service before running the SM-2 update after a review response.
   */
  async findByStudentAndQuestion(
    studentId: string,
    questionId: string,
    session?: ClientSession,
  ): Promise<IReviewItem | null> {
    await this.init();
    return this.reviewItemCollection.findOne(
      { student_id: studentId, question_id: questionId },
      { session },
    );
  }

  /**
   * Persist updated SM-2 state and scheduling fields after a review response.
   * Only the fields that change after a review are updated — _id, student_id,
   * course_id, and question_id are never mutated.
   */
  async update(
    id: string,
    updates: Partial<
      Pick<
        IReviewItem,
        | 'n'
        | 'EF'
        | 'interval_days'
        | 'next_review_at'
        | 'last_reviewed_at'
        | 'remediationHint'
      >
    >,
    session?: ClientSession,
  ): Promise<IReviewItem | null> {
    await this.init();
    return this.reviewItemCollection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: updates },
      { returnDocument: 'after', session },
    );
  }

  /**
   * Flip the notification_opt_out flag for every ReviewItem belonging to
   * a student in a given course. Called when the student toggles
   * notification preferences for that course.
   */
  async updateOptOut(
    studentId: string,
    courseId: string,
    optOut: boolean,
    session?: ClientSession,
  ): Promise<number> {
    await this.init();
    const result = await this.reviewItemCollection.updateMany(
      { student_id: studentId, course_id: courseId },
      { $set: { notification_opt_out: optOut } },
      { session },
    );
    return result.modifiedCount;
  }

/**
   * Bulk flip the notification_opt_out flag for an array of students within a given course.
   * Called by the teacher dashboard for cohort-level management.
   */
  async updateOptOutBulk(
    studentIds: string[],
    courseId: string,
    optOut: boolean,
    session?: ClientSession,
  ): Promise<number> {
    await this.init();
    const result = await this.reviewItemCollection.updateMany(
      { 
        student_id: { $in: studentIds }, 
        course_id: courseId 
      },
      { $set: { notification_opt_out: optOut } },
      { session },
    );
    return result.modifiedCount;
  }

  /**
   * Bulk flip the exam_prep_mode flag for an array of students within a given course.
   */
  async updateExamPrepBulk(
    studentIds: string[],
    courseId: string,
    enabled: boolean,
    session?: ClientSession,
  ): Promise<number> {
    await this.init();
    const result = await this.reviewItemCollection.updateMany(
      { 
        student_id: { $in: studentIds }, 
        course_id: courseId 
      },
      { $set: { exam_prep_mode: enabled } },
      { session },
    );
    return result.modifiedCount;
  }

  /**
   * Gets a list of unique student IDs who have active review items for a specific course.
   */
  async getDistinctStudentsForCourse(
    courseId: string,
    session?: ClientSession,
  ): Promise<string[]> {
    await this.init();
    const studentIds = await this.reviewItemCollection.distinct(
      'student_id',
      { course_id: courseId },
      { session }
    );
    return studentIds as string[];
  }

}

export { ReviewItemRepository };