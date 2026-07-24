/**
 * Motivation System — TanStack Query hooks.
 *
 * Mirrors `spaced-repetition-hooks.ts`. Three queries, no
 * mutations in v1 (motivation is read-only). All queries
 * fail-open: a thrown fetch returns the empty response.
 */

import { useQuery } from '@tanstack/react-query';
import {
  getCourseLeaderboard,
  getCourseMentorView,
  getMyMotivation,
} from '../lib/motivation-api';
import {
  LeaderboardResponse,
  MentorViewResponse,
  MotivationMeResponse,
} from '../types/motivation.types';

// ── Query keys ─────────────────────────────────────────────────────────────

/**
 * Centralised query key factory. Pattern matches
 * `spacedRepetitionKeys` so both modules compose well in
 * TanStack Query DevTools.
 */
export const motivationKeys = {
  all: ['motivation'] as const,
  me: (studentId: string) => ['motivation', 'me', studentId] as const,
  leaderboard: (courseId: string, studentId: string) =>
    ['motivation', 'leaderboard', courseId, studentId] as const,
  mentorView: (courseId: string) =>
    ['motivation', 'mentor-view', courseId] as const,
};

// ── Queries ────────────────────────────────────────────────────────────────

/**
 * Returns the student's badge progress and status snapshots.
 * Disabled when `studentId` is empty (no auth).
 */
export function useGetMyMotivation(studentId: string) {
  return useQuery<MotivationMeResponse>({
    queryKey: motivationKeys.me(studentId),
    queryFn: () => getMyMotivation(studentId),
    enabled: !!studentId,
  });
}

/**
 * Returns the course-scoped leaderboard. Disabled when either
 * `courseId` or `studentId` is empty — both are required to
 * build the response (the student ID is needed to mark the
 * current user's row).
 */
export function useGetCourseLeaderboard(courseId: string, studentId: string) {
  return useQuery<LeaderboardResponse>({
    queryKey: motivationKeys.leaderboard(courseId, studentId),
    queryFn: () => getCourseLeaderboard(courseId, studentId),
    enabled: !!courseId && !!studentId,
  });
}

/**
 * Returns the mentor view for a course. Disabled when `courseId`
 * is empty. (No student ID required — the mentor is identified
 * by their auth token on the backend.)
 */
export function useGetCourseMentorView(courseId: string) {
  return useQuery<MentorViewResponse>({
    queryKey: motivationKeys.mentorView(courseId),
    queryFn: () => getCourseMentorView(courseId),
    enabled: !!courseId,
  });
}
