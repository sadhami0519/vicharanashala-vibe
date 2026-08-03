import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RecallQuality } from '@/types/spaced-repetition.types';
import {
  getSchedule,
  getCourseRetention,
  submitReview,
  updateNotificationPreference,
  seedSchedule,
  boostReview,
  setRemediationHint,
  bulkUpdateNotificationPreference,
  bulkUpdateExamPrepMode,
  getCourseStudents,
  getCourseStudentsRich,
  getCourses,
  resetReview,
  getStudentSRStatus,
  setStudentSRDisabled,
  bulkSetStudentSRDisabled,
  getAssignableQuestions,
  assignReview,
} from '@/lib/spaced-repetition-api';

// ── Query keys ─────────────────────────────────────────────────────────────

export const spacedRepetitionKeys = {
  schedule: (studentId: string) =>
    ['spaced-repetition', 'schedule', studentId] as const,
  courseRetention: (studentId: string, courseId: string) =>
    ['spaced-repetition', 'retention', studentId, courseId] as const,
  courseStudents: (courseId: string) =>
    ['spaced-repetition', 'course-students', courseId] as const,
  srStatus: (studentId: string) =>
    ['spaced-repetition', 'sr-status', studentId] as const,
  assignableQuestions: (courseId: string) =>
    ['spaced-repetition', 'assignable-questions', courseId] as const,
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
  // F5: tighten the enabled gate. A 6-char floor matches the existing
  // useGetAssignableQuestions pattern (F2) and rejects accidental
  // empty/short strings that would otherwise trigger a backend call
  // destined to 404. Mongo ObjectIds are 24 hex chars, so anything
  // shorter than 6 is almost certainly a bug upstream.
  const safeCourseId = (courseId ?? '').trim();
  return useQuery({
    queryKey: spacedRepetitionKeys.courseRetention(studentId, safeCourseId),
    queryFn: () => getCourseRetention(studentId, safeCourseId),
    enabled: !!studentId && safeCourseId.length >= 6,
  });
}

// ── Mutations ──────────────────────────────────────────────────────────────

export function useSubmitReview(studentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      questionId,
      quality,
      selectedOptionIndices,
      numericAnswer,
    }: {
      questionId: string;
      quality: RecallQuality;
      /**
       * Knob 8 (Phase D prep, 2026-07-21): indices into the review-mode
       * `options[]` array the student clicked. Pass for MCQ question
       * types so the backend can compute `isCorrect` and the frontend
       * can light up green/red feedback. Omit for numeric/descriptive.
       */
      selectedOptionIndices?: number[];
      /**
       * Knob 8c (2026-07-29): string the student typed for a
       * NUMERIC_ANSWER question. Pass for NATs so the backend can
       * exact-match it against the canonical solution. Omit for MCQ
       * and ungraded question types.
       */
      numericAnswer?: string;
    }) =>
      submitReview(
        studentId,
        questionId,
        quality,
        selectedOptionIndices,
        numericAnswer,
      ),
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

// ── Card-Specific Mutations (Updated for Multi-Student Support) ────────────

export function useBoostReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ 
      studentId, 
      questionId, 
      targetEF 
    }: { 
      studentId: string; 
      questionId: string; 
      targetEF?: number 
    }) => boostReview(studentId, questionId, targetEF),
    onSuccess: (_, variables) => {
      // Use variables.studentId to invalidate the correct cache
      queryClient.invalidateQueries({ 
        queryKey: spacedRepetitionKeys.schedule(variables.studentId) 
      });
    },
  });
}

export function useSetRemediationHint() {
  return useMutation({
    mutationFn: ({ 
      studentId, 
      questionId, 
      hint 
    }: { 
      studentId: string; 
      questionId: string; 
      hint: string | null 
    }) => setRemediationHint(studentId, questionId, hint),
  });
}

export function useResetReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ 
      studentId, 
      questionId 
    }: { 
      studentId: string; 
      questionId: string 
    }) => resetReview(studentId, questionId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: spacedRepetitionKeys.schedule(variables.studentId) 
      });
    },
  });
}

export function useBulkUpdateNotifications() {
  return useMutation({
    mutationFn: ({ courseId, studentIds, optOut }: { courseId: string; studentIds: string[]; optOut: boolean }) =>
      bulkUpdateNotificationPreference(courseId, studentIds, optOut),
  });
}

export function useBulkUpdateExamPrep() {
  return useMutation({
    mutationFn: ({ courseId, studentIds, enabled }: { courseId: string; studentIds: string[]; enabled: boolean }) =>
      bulkUpdateExamPrepMode(courseId, studentIds, enabled),
  });
}

/**
 * useGetCourses (added 2026-08-03).
 * Returns the list of courses the teacher can manage, with student-count
 * chips so the teacher can pick a course by name instead of typing IDs.
 */
export function useGetCourses() {
  return useQuery({
    queryKey: ['spaced-repetition', 'courses'] as const,
    queryFn: () => getCourses(),
  });
}

export function useGetCourseStudents(courseId: string) {
  return useQuery({
    queryKey: spacedRepetitionKeys.courseStudents(courseId),
    queryFn: () => getCourseStudents(courseId),
    enabled: !!courseId && courseId.length > 5, // Only run if a plausible courseId is typed
  });
}

/**
 * Rich variant of useGetCourseStudents (added 2026-08-03).
 * Returns human-readable student rows (name + email) instead of raw IDs.
 * Used by the new teacher SR dashboards; legacy useGetCourseStudents
 * stays for backward compat with any other consumers.
 */
export function useGetCourseStudentsRich(courseId: string) {
  return useQuery({
    queryKey: [...spacedRepetitionKeys.courseStudents(courseId), 'rich'] as const,
    queryFn: () => getCourseStudentsRich(courseId),
    enabled: !!courseId && courseId.length > 5, // Same enablement rule as the legacy hook
  });
}

// ── SR-disabled hooks (Knob 6, Phase C, 2026-07-21) ───────────────────

export function useGetStudentSRStatus(studentId: string) {
  return useQuery({
    queryKey: spacedRepetitionKeys.srStatus(studentId),
    queryFn: () => getStudentSRStatus(studentId),
    enabled: !!studentId,
  });
}

export function useSetStudentSRDisabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      studentId,
      sr_disabled,
    }: {
      studentId: string;
      sr_disabled: boolean;
    }) => setStudentSRDisabled(studentId, sr_disabled),
    onSuccess: (_, variables) => {
      // Invalidate the per-student SR status cache so subsequent reads
      // (e.g. student-side dashboard re-fetch) see the new value.
      queryClient.invalidateQueries({
        queryKey: spacedRepetitionKeys.srStatus(variables.studentId),
      });
    },
  });
}

export function useBulkSetStudentSRDisabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      studentIds,
      sr_disabled,
    }: {
      studentIds: string[];
      sr_disabled: boolean;
    }) => bulkSetStudentSRDisabled(studentIds, sr_disabled),
    onSuccess: (_, variables) => {
      // Invalidate every per-student status cache we know about.
      for (const id of variables.studentIds) {
        queryClient.invalidateQueries({
          queryKey: spacedRepetitionKeys.srStatus(id),
        });
      }
    },
  });
}

// ── Manual Review Assignment hooks (Knob 7, Phase C, 2026-07-21) ────────

export function useGetAssignableQuestions(
  courseId: string,
  enabled: boolean = true,
) {
  return useQuery({
    queryKey: spacedRepetitionKeys.assignableQuestions(courseId),
    queryFn: () => getAssignableQuestions(courseId),
    enabled: !!courseId && courseId.length > 5 && enabled,
  });
}

export function useAssignReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      studentId: string;
      questionId: string;
      courseId: string;
    }) => assignReview(args),
    onSuccess: (_, variables) => {
      // Force the schedule to refetch (the new item shows up in the
      // student's queue immediately) and the course-assignable list
      // doesn't change (GET is a read-only metadata fetch).
      queryClient.invalidateQueries({
        queryKey: spacedRepetitionKeys.schedule(variables.studentId),
      });
      queryClient.invalidateQueries({
        queryKey: spacedRepetitionKeys.srStatus(variables.studentId),
      });
    },
  });
}