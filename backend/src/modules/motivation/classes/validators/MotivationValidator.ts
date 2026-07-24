/**
 * Motivation module — request validator classes.
 *
 * Mirrors the spaced-repetition pattern: every request body and
 * path param has a class-validator decorated class. The routing-
 * controllers `validation: true` setting wires these up automatically.
 */

import { IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

/** Path params for `/:studentId/...` endpoints. */
export class StudentIdParam {
  @IsString()
  @IsNotEmpty()
  studentId!: string;
}

/** Path params for `/courses/:courseId/...` endpoints. */
export class CourseIdParam {
  @IsString()
  @IsNotEmpty()
  courseId!: string;
}

/** Optional query for the leaderboard endpoint. v1 ignores limit. */
export class LeaderboardQuery {
  @IsOptional()
  @Min(1)
  limit?: number;
}

/** Query for the mentor-view endpoint. courseId is required. */
export class MentorViewQuery {
  @IsString()
  @IsNotEmpty()
  courseId!: string;
}
