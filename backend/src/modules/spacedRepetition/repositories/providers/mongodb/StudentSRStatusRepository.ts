import { injectable, inject } from 'inversify';
import { Collection, ClientSession } from 'mongodb';
import { GLOBAL_TYPES } from '#root/types.js';
import { MongoDatabase } from '#shared/database/providers/mongo/MongoDatabase.js';
import { IUser } from '#root/shared/interfaces/models.js';

/**
 * Tiny repository that owns reads + writes to the `users.sr_disabled` flag
 * from within the spaced repetition module.
 *
 * Why a dedicated repo instead of inlining into the service?
 *  - Cross-module coupling stays narrow: the SR module reads exactly one
 *    field, and all its reads/writes are concentrated in this class.
 *  - If we later need to extend (e.g. add `sr_paused_until`, `exam_window`),
 *    the surface area is already encapsulated.
 *
 * Storage note:
 *  - `sr_disabled` lives on the `users` collection (denormalised per student).
 *  - Backward-compatible: documents created before this field exist read as
 *    `undefined`, which we treat as `false` (SR enabled).
 *
 * Added 2026-07-21 for Phase C (Knob 6: Disable SR for a student).
 */
@injectable()
class StudentSRStatusRepository {
  private usersCollection: Collection<IUser>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  private async init() {
    this.usersCollection = await this.db.getCollection<IUser>('users');
  }

  /**
   * Read the SR-disabled flag for one student.
   * Returns `false` when the flag is unset (default = enabled).
   *
   * Opt-in `session` parameter so callers running inside a MongoDB
   * transaction can fold the read into the same snapshot as their
   * writes. This closes the race window where a concurrent
   * setStatus() could disable SR between the read and the write
   * (audit finding B2).
   */
  async getStatus(
    studentId: string,
    session?: ClientSession,
  ): Promise<boolean> {
    await this.init();
    const doc = await this.usersCollection.findOne(
      { firebaseUID: studentId },
      { projection: { sr_disabled: 1 }, ...(session ? { session } : {}) },
    );
    return Boolean(doc?.sr_disabled);
  }

  /**
   * Read the SR-disabled flag for many students in one round trip.
   * Used by the cron job to filter out disabled students cheaply.
   * Returns a Map keyed by studentId (firebaseUID) for O(1) lookup.
   */
  async getStatusForMany(
    studentIds: string[],
  ): Promise<Map<string, boolean>> {
    await this.init();
    if (studentIds.length === 0) {
      return new Map();
    }
    const docs = await this.usersCollection
      .find(
        { firebaseUID: { $in: studentIds } },
        { projection: { firebaseUID: 1, sr_disabled: 1 } },
      )
      .toArray();
    const map = new Map<string, boolean>();
    for (const d of docs) {
      map.set(d.firebaseUID, Boolean(d.sr_disabled));
    }
    return map;
  }

  /**
   * Set the SR-disabled flag for one student.
   * Uses `updateOne` + `$set` so the rest of the user doc is untouched.
   * Returns true if a document was matched (even if value unchanged).
   */
  async setStatus(
    studentId: string,
    disabled: boolean,
    session?: ClientSession,
  ): Promise<boolean> {
    await this.init();
    const result = await this.usersCollection.updateOne(
      { firebaseUID: studentId },
      { $set: { sr_disabled: disabled } },
      { session },
    );
    return result.matchedCount > 0;
  }

  /**
   * Set the SR-disabled flag for many students in one round trip.
   * Used by the cohort-bulk endpoint.
   * Returns the number of students whose flag was changed (modifiedCount).
   */
  async setStatusForMany(
    studentIds: string[],
    disabled: boolean,
    session?: ClientSession,
  ): Promise<number> {
    await this.init();
    if (studentIds.length === 0) {
      return 0;
    }
    const result = await this.usersCollection.updateMany(
      { firebaseUID: { $in: studentIds } },
      { $set: { sr_disabled: disabled } },
      { session },
    );
    return result.modifiedCount;
  }
}

export { StudentSRStatusRepository };