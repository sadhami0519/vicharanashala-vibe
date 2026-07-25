import { injectable, inject } from 'inversify';
import {
  JsonController,
  Get,
  Params,
  ForbiddenError,
  HttpCode,
  Authorized,
  CurrentUser,
  Param,
  QueryParams,
} from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';
import { SPACED_REPETITION_TYPES } from '../../spacedRepetition/types.js';
import { ReviewItemRepository } from '../../spacedRepetition/repositories/providers/mongodb/ReviewItemRepository.js';
import { MOTIVATION_TYPES } from '../types.js';
import { UserDirectoryRepository } from '../repositories/index.js';
import { IUser } from '#root/shared/interfaces/models.js';
import {
  computeBadgeProgress,
  computeStatusSnapshots,
  computeRetention30d,
  computeLearnerCategory,
  computeNextBadgeProximity,
} from '../services/MotivationService.js';
import {
  StudentIdParam,
  LeaderboardQuery,
  MentorViewQuery,
} from '../classes/validators/MotivationValidator.js';
import {
  LeaderboardResponse,
  MentorViewResponse,
  MotivationResponse,
} from '../interfaces/IMotivation.js';
import { IReviewItem } from '../../spacedRepetition/interfaces/IReviewItem.js';

@OpenAPI({ tags: ['Motivation'] })
@injectable()
@JsonController('/motivation')
export class MotivationController {
  constructor(
    @inject(SPACED_REPETITION_TYPES.ReviewItemRepo)
    private readonly reviewItemRepo: ReviewItemRepository,
    @inject(MOTIVATION_TYPES.UserDirectoryRepo)
    private readonly userDirectoryRepo: UserDirectoryRepository,
  ) {}

  // ── Self-or-admin guard ─────────────────────────────────────────────────

  private _assertCanActOnStudent(user: IUser, studentId: string): void {
    const isAdmin = user.roles?.includes('admin');
    const isSelf = user.firebaseUID === studentId;
    if (!isAdmin && !isSelf) {
      throw new ForbiddenError(
        'Cannot read another student\'s motivation data',
      );
    }
  }

  private _assertAdmin(user: IUser): void {
    if (!user.roles?.includes('admin')) {
      throw new ForbiddenError(
        'Motivation overview endpoints require an admin or teacher role',
      );
    }
  }

  // ── GET /motivation/:studentId/me ───────────────────────────────────────

  @OpenAPI({
    summary: "Get a student's motivation dashboard",
    description: `Returns the per-student badge progress and status snapshots.
    Self-or-admin: a student can only read their own data; admins can read
    any student's data.`,
  })
  @Authorized()
  @Get('/:studentId/me')
  @HttpCode(200)
  async getMyMotivation(
    @CurrentUser() user: IUser,
    @Params() params: StudentIdParam,
  ): Promise<MotivationResponse> {
    this._assertCanActOnStudent(user, params.studentId);
    const items = await this.reviewItemRepo.findByStudent(params.studentId);
    return {
      studentId: params.studentId,
      badges: computeBadgeProgress(items),
      status: computeStatusSnapshots(items),
      asOf: new Date(),
    };
  }

  // ── GET /motivation/courses/:courseId/leaderboard ───────────────────────

  @OpenAPI({
    summary: 'Get the motivation leaderboard for a course',
    description: `Returns ranking of students by 30-day retention, scoped to a course.
    Admin or teacher role required.`,
  })
  @Authorized()
  @Get('/courses/:courseId/leaderboard')
  @HttpCode(200)
  async getCourseLeaderboard(
    @CurrentUser() user: IUser,
    @Param('courseId') courseId: string,
    @QueryParams() _query: LeaderboardQuery,
  ): Promise<LeaderboardResponse> {
    this._assertAdmin(user);
    const students = await this.reviewItemRepo.getDistinctStudentsForCourse(courseId);
    const nameMap = await this.userDirectoryRepo.getDisplayNamesByFirebaseUIDs(students);

    const rows = await Promise.all(
      students.map(async (studentId) => {
        const studentItems = await this.reviewItemRepo.findByStudentAndCourse(
          studentId,
          courseId,
        );
        const retention30d = computeRetention30d(studentItems);
        const snapshots = computeStatusSnapshots(studentItems);
        const volume = snapshots.find((s) => s.metric === 'volume');
        const coverage =
          volume && volume.last30Days.value > 0
            ? Math.min(
                100,
                Math.round((volume.last30Days.value / studentItems.length) * 100),
              )
            : 0;
        return {
          studentId,
          retention30d,
          coverage,
          isOptedOut: false,
          studentName: nameMap.get(studentId) ?? studentId,
          isCurrentUser: studentId === user.firebaseUID,
          rank: null,
        };
      }),
    );

    // Sort by retention30d desc, with opted-out last.
    rows.sort((a, b) => {
      if (a.isOptedOut !== b.isOptedOut) return a.isOptedOut ? 1 : -1;
      const ar = a.retention30d ?? -1;
      const br = b.retention30d ?? -1;
      return br - ar;
    });

    // Assign ranks.
    const entries = rows.map((r, idx) => ({
      ...r,
      rank: r.isOptedOut ? null : idx + 1,
    }));

    const totalStudents = entries.length;
    const myIdx = entries.findIndex((e) => e.isCurrentUser);
    const currentUserRank = myIdx >= 0 ? (entries[myIdx].rank ?? null) : null;
    const currentUserPercentile =
      myIdx >= 0 && totalStudents > 1
        ? Math.round(((totalStudents - myIdx) / totalStudents) * 100)
        : null;

    return {
      entries,
      currentUserRank,
      currentUserPercentile,
      totalStudents,
    };
  }

  // ── GET /motivation/courses/:courseId/mentor-view ───────────────────────

  @OpenAPI({
    summary: 'Get the mentor view for a course',
    description: `Returns three derived panels for mentors:
      - stuck cards: students struggling with specific items
      - next-badge proximity: students close to unlocking a badge
      - learner categories: 2×2 quadrant of retention × coverage
    Admin or teacher role required.`,
  })
  @Authorized()
  @Get('/courses/:courseId/mentor-view')
  @HttpCode(200)
  async getCourseMentorView(
    @CurrentUser() user: IUser,
    @QueryParams() query: MentorViewQuery,
  ): Promise<MentorViewResponse> {
    this._assertAdmin(user);
    const students = await this.reviewItemRepo.getDistinctStudentsForCourse(
      query.courseId,
    );

    // Resolve display names once for the cohort (single batched Mongo
    // query). Per-row lookup is O(1) from the map. Missing rows in the
    // map fall back to `studentId` so the UI degrades gracefully.
    const nameMap = await this.userDirectoryRepo.getDisplayNamesByFirebaseUIDs(students);

    // Per-student aggregation.
    const perStudent = await Promise.all(
      students.map(async (studentId) => {
        const studentItems = await this.reviewItemRepo.findByStudentAndCourse(
          studentId,
          query.courseId,
        );
        const retention30d = computeRetention30d(studentItems);
        const snapshots = computeStatusSnapshots(studentItems);
        const volume = snapshots.find((s) => s.metric === 'volume');
        const coverage =
          volume && volume.last30Days.value > 0
            ? Math.min(
                100,
                Math.round((volume.last30Days.value / studentItems.length) * 100),
              )
            : 0;
        // Per-student: their single closest unearned badge. Service
        // returns null if all 12 badges are earned. studentName is the
        // resolved display name (fallback to studentId if missing).
        const proximity = computeNextBadgeProximity(studentItems);
        const nextBadge =
          proximity === null
            ? null
            : {
                studentId,
                studentName: nameMap.get(studentId) ?? studentId,
                badgeId: proximity.badgeId,
                badgeName: proximity.badgeName,
                distance: proximity.distance,
                unit: proximity.unit,
              };

        return {
          studentId,
          studentName: nameMap.get(studentId) ?? studentId,
          retention30d,
          coverage,
          stuckCount: studentItems.filter(
            (i) => i.n === 0 && (i.EF ?? 0) > 0 && (i.EF ?? 0) < 2.0,
          ).length,
          dippingCount: studentItems.filter(
            (i) => i.n === 0 && (i.EF ?? 0) <= 2.0,
          ).length,
          nextBadge,
        };
      }),
    );

    // Panel A — Stuck cards
    const stuckCards = perStudent
      .filter((r) => r.stuckCount > 0 || r.dippingCount > 0)
      .map(({ studentId, studentName, stuckCount, dippingCount }) => ({
        studentId,
        studentName,
        stuckCount,
        dippingCount,
      }));

    // Panel B — Next-badge proximity. Each student contributes at most
    // one row (their closest unearned badge). Sort by distance asc;
    // tie-break by alphabetic badgeId for deterministic ordering.
    const nextBadges: MentorViewResponse['nextBadges'] = perStudent
      .map((r) => r.nextBadge)
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        return a.badgeId.localeCompare(b.badgeId);
      });

    // Panel C — Learner categories 2×2 quadrant
    const learnerCategories = perStudent.map(
      ({ studentId, studentName, retention30d, coverage }) => ({
        studentId,
        studentName,
        category: computeLearnerCategory(retention30d, coverage),
        retention30d,
        coverage,
      }),
    );

    return { stuckCards, nextBadges, learnerCategories };
  }
}
