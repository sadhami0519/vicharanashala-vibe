import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RecallQuality } from '@/types/spaced-repetition.types';
import {
  getSchedule,
  getCourseRetention,
  submitReview,
  updateNotificationPreference,
  seedSchedule,
} from '@/lib/spaced-repetition-api';

// ── Query keys ─────────────────────────────────────────────────────────────

export const spacedRepetitionKeys = {
  schedule: (studentId: string) =>
    ['spaced-repetition', 'schedule', studentId] as const,
  courseRetention: (studentId: string, courseId: string) =>
    ['spaced-repetition', 'retention', studentId, courseId] as const,
};

// ── Queries ────────────────────────────────────────────────────────────────

export function useGetSchedule(studentId: string) {
  return useQuery({
    queryKey: spacedRepetitionKeys.schedule(studentId),
    queryFn: () => getSchedule(studentId),
    enabled: !!studentId,
  });
}

export function useGetCourseRetention(studentId: string, courseId: string) {
  return useQuery({
    queryKey: spacedRepetitionKeys.courseRetention(studentId, courseId),
    queryFn: () => getCourseRetention(studentId, courseId),
    enabled: !!studentId && !!courseId,
  });
}

// ── Mutations ──────────────────────────────────────────────────────────────

export function useSubmitReview(studentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      questionId,
      quality,
    }: {
      questionId: string;
      quality: RecallQuality;
    }) => submitReview(studentId, questionId, quality),
    onSuccess: () => {
      // Invalidate schedule so dashboard reflects updated next_review_at
      queryClient.invalidateQueries({
        queryKey: spacedRepetitionKeys.schedule(studentId),
      });
    },
  });
}

export function useUpdateNotificationPreference(studentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      courseId,
      optOut,
    }: {
      courseId: string;
      optOut: boolean;
    }) => updateNotificationPreference(studentId, courseId, optOut),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: spacedRepetitionKeys.schedule(studentId),
      });
    },
  });
}

export function useSeedSchedule(studentId: string) {
  return useMutation({
    mutationFn: ({
      courseId,
      questionIds,
    }: {
      courseId: string;
      questionIds: string[];
    }) => seedSchedule(studentId, courseId, questionIds),
  });
}