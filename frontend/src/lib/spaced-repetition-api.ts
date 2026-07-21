import {
  ReviewItem,
  CourseRetentionSummary,
  RecallQuality,
  SeedScheduleResponse,
  SubmitReviewResponse,
  UpdateOptOutResponse,
} from '@/types/spaced-repetition.types';

// â”€â”€ Toggle this to false when the backend is ready â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const USE_MOCK = true;
const BASE_URL = import.meta.env.VITE_BASE_URL ?? '';

// â”€â”€ Mock state persistence (localStorage) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// In mock mode, teacher and student use the same browser session. We persist
// MOCK_REVIEW_ITEMS to localStorage so that:
//   1. A teacher mutation (boost, hint, reset, bulk opt-out, bulk exam-prep)
//      survives a logout/login cycle.
//   2. The student's dashboard reflects those mutations on next load.
// localStorage is per-origin so this also works across browser tabs on the
// same dev server. Bump the version key if the mock schema changes
// incompatibly â€” a stale payload would cause the hydration to fail and we'd
// silently reseed.
const MOCK_STORAGE_KEY = 'vibe_sr_mock_v2'; // v2: +2 helper students in mock-course-1 (was 6 items, now 8)

function loadMockState(): ReviewItem[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(MOCK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReviewItem[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed;
  } catch (err) {
    console.warn('[spaced-repetition-api] Failed to load mock state from localStorage, reseeding:', err);
    return null;
  }
}

function persistMockState(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(MOCK_REVIEW_ITEMS));
  } catch (err) {
    // Quota exceeded, private mode, etc. â€” log and continue. The demo will
    // still work in-memory for this session; we just lose cross-logout
    // persistence until the user clears the issue.
    console.warn('[spaced-repetition-api] Failed to persist mock state to localStorage:', err);
  }
}

/** Dev-only escape hatch: clears localStorage and reloads the page. */
export function resetMockState(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(MOCK_STORAGE_KEY);
    window.location.reload();
  } catch (err) {
    console.warn('[spaced-repetition-api] Failed to reset mock state:', err);
  }
}

// â”€â”€ Mock data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);

const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);

function futureDate(daysFromNow: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d;
}

// â”€â”€ Demo-mode student resolution â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// In mock mode, the seed items are keyed to a *demo* student id. When the user
// signs in via the Firebase emulator (`student@test.com`), Firebase returns a
// different auto-generated uid. To make the demo work without seeding the
// emulator with the demo uid, consumers map the auth uid to DEMO_STUDENT_ID
// when the email matches a known demo credential.
export const DEMO_STUDENT_ID = 'dJDsxeP9kqOkHEygUHWu45DmJkQz';
export const DEMO_STUDENT_EMAILS: ReadonlySet<string> = new Set([
  'student@test.com',
]);
export function isDemoStudentEmail(email: string | null | undefined): boolean {
  return !!email && DEMO_STUDENT_EMAILS.has(email);
}

// Seed array â€” the initial state used when localStorage has no mock payload
// yet (first run, after `resetMockState()`, or in SSR / private mode).
// Used to bootstrap `MOCK_REVIEW_ITEMS` on module init; thereafter the live
// array is the source of truth and `persistMockState()` writes it back to
// localStorage after every mutation.
function buildSeedItems(): ReviewItem[] {
  return [
    // â”€â”€ mock-course-1: mixed state (overdue + due soon + healthy) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
      _id: 'mock-item-1',
      student_id: DEMO_STUDENT_ID, // Demo student
      course_id: 'mock-course-1',
      question_id: 'mock-question-1',
      n: 0,
      EF: 2.5,
      interval_days: 1,
      next_review_at: yesterday.toISOString(), // overdue â€” for testing
      last_reviewed_at: null,
      notification_opt_out: false,
    },
    {
      _id: 'mock-item-2',
      student_id: DEMO_STUDENT_ID, // Demo student
      course_id: 'mock-course-1',
      question_id: 'mock-question-2',
      n: 1,
      EF: 2.6,
      interval_days: 6,
      next_review_at: tomorrow.toISOString(), // due soon â€” for testing
      last_reviewed_at: yesterday.toISOString(),
      notification_opt_out: false,
    },
    {
      _id: 'mock-item-3',
      student_id: DEMO_STUDENT_ID, // Demo student (2nd card in this course)
      course_id: 'mock-course-1',
      question_id: 'mock-question-3',
      n: 2,
      EF: 2.7,
      interval_days: 16,
      next_review_at: yesterday.toISOString(), // overdue â€” for testing
      last_reviewed_at: yesterday.toISOString(),
      notification_opt_out: false,
    },
    {
      _id: 'mock-item-6',
      student_id: DEMO_STUDENT_ID, // Demo student
      course_id: 'mock-course-1',
      question_id: 'mock-question-4',
      n: 0,
      EF: 2.5,
      interval_days: 1,
      next_review_at: yesterday.toISOString(), // overdue â€” for testing
      last_reviewed_at: null,
      notification_opt_out: false,
    },
    {
      // Helper student A â€” visible only in teacher cohort view for mock-course-1.
      // The demo student's `getSchedule()` filters on `student_id` so this
      // never leaks into the student dashboard.
      _id: 'mock-item-7',
      student_id: 'stu-helper-A',
      course_id: 'mock-course-1',
      question_id: 'mock-question-2',
      n: 0,
      EF: 2.5,
      interval_days: 1,
      next_review_at: yesterday.toISOString(),
      last_reviewed_at: null,
      notification_opt_out: false,
    },
    {
      // Helper student B â€” same purpose as above.
      _id: 'mock-item-8',
      student_id: 'stu-helper-B',
      course_id: 'mock-course-1',
      question_id: 'mock-question-3',
      n: 1,
      EF: 2.6,
      interval_days: 6,
      next_review_at: yesterday.toISOString(),
      last_reviewed_at: yesterday.toISOString(),
      notification_opt_out: false,
    },

    // â”€â”€ mock-course-2: healthy / mastered state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
      _id: 'mock-item-4',
      student_id: DEMO_STUDENT_ID, // Demo student enrolled in this course too
      course_id: 'mock-course-2',
      question_id: 'mock-question-1',
      n: 4,
      EF: 2.8,
      interval_days: 30,
      next_review_at: futureDate(20).toISOString(), // far away â€” mastered
      last_reviewed_at: yesterday.toISOString(),
      notification_opt_out: false,
    },
    {
      _id: 'mock-item-5',
      student_id: 'stu-helper-002', // Helper student â€” keeps teacher cohort UI varied
      course_id: 'mock-course-2',
      question_id: 'mock-question-2',
      n: 5,
      EF: 3.0,
      interval_days: 60,
      next_review_at: futureDate(45).toISOString(), // far away â€” mastered
      last_reviewed_at: yesterday.toISOString(),
      notification_opt_out: true, // opted out
    },
  ];
}

// Live, mutable mock state. Hydrated from localStorage on first load; on
// every mutation we call `persistMockState()` to write back. The helper
// students (stu-helper-002) live in this same array but are only visible to
// teacher cohort views, since `getSchedule()` filters by student_id.
const _hydrated = loadMockState();
const MOCK_REVIEW_ITEMS: ReviewItem[] = _hydrated ?? buildSeedItems();
if (!_hydrated) persistMockState(); // first-run: write seed into localStorage

/**
 * Derive a CourseRetentionSummary from the mock schedule.
 * Mirrors what SpacedRepetitionService.getCourseRetention computes on the
 * backend: totalItems + overdueCount (next_review_at < now) + dueSoonCount
 * (next_review_at within 7 days, not overdue) + averageEF across all items
 * for the course.
 */
function deriveMockRetention(courseId: string, studentId?: string): CourseRetentionSummary {
  const items = MOCK_REVIEW_ITEMS.filter(
    i => i.course_id === courseId && (studentId ? i.student_id === studentId : true),
  );
  const now = Date.now();
  const inSevenDays = now + 7 * 24 * 60 * 60 * 1000;
  const overdueCount = items.filter(
    i => new Date(i.next_review_at).getTime() < now,
  ).length;
  const dueSoonCount = items.filter(i => {
    const t = new Date(i.next_review_at).getTime();
    return t >= now && t <= inSevenDays;
  }).length;
  const averageEF =
    items.length === 0
      ? 0
      : items.reduce((sum, i) => sum + i.EF, 0) / items.length;
  return {
    courseId,
    totalItems: items.length,
    overdueCount,
    dueSoonCount,
    averageEF: Number(averageEF.toFixed(2)),
    items,
  };
}

// â”€â”€ Helper â€” get auth token â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getToken(): string {
  return localStorage.getItem('firebase-auth-token') ?? '';
}

// â”€â”€ Helper â€” base fetch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

// â”€â”€ API functions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Seed a review schedule for a student on course completion.
 * POST /api/spaced-repetition/:studentId/seed
 */
export async function seedSchedule(
  studentId: string,
  courseId: string,
  questionIds: string[],
): Promise<SeedScheduleResponse> {
  if (USE_MOCK) {
    await new Promise(r => setTimeout(r, 400));
    return { seeded: questionIds.length };
  }
  return apiFetch(`/api/spaced-repetition/${studentId}/seed`, {
    method: 'POST',
    body: JSON.stringify({ courseId, questionIds }),
  });
}

/**
 * Submit a recall quality response for a single question.
 * POST /api/spaced-repetition/:studentId/review
 */
export async function submitReview(
  studentId: string,
  questionId: string,
  quality: RecallQuality,
): Promise<SubmitReviewResponse> {
  if (USE_MOCK) {
    await new Promise(r => setTimeout(r, 300));
    const idx = MOCK_REVIEW_ITEMS.findIndex(
      i => i.student_id === studentId && i.question_id === questionId,
    );
    if (idx === -1) throw new Error('Mock: review item not found');
    // Mutate in place so the change survives logout/login via localStorage.
    // Faithful-enough SM-2: q âˆˆ {5,3,1}, EF delta formula, intervals.
    const item = MOCK_REVIEW_ITEMS[idx];
    const q = quality === 'got_it' ? 5 : quality === 'unsure' ? 3 : 1;
    const newEF = Math.max(1.3, item.EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
    const newN = q < 3 ? 0 : item.n + 1;
    const nextInterval = newN === 1 ? 1 : newN === 2 ? 6 : Math.round(item.interval_days * newEF);
    MOCK_REVIEW_ITEMS[idx] = {
      ...item,
      n: newN,
      EF: Number(newEF.toFixed(2)),
      interval_days: nextInterval,
      last_reviewed_at: new Date().toISOString(),
      next_review_at: futureDate(nextInterval).toISOString(),
    };
    persistMockState();
    return MOCK_REVIEW_ITEMS[idx];
  }
  return apiFetch(`/api/spaced-repetition/${studentId}/review`, {
    method: 'POST',
    body: JSON.stringify({ questionId, quality }),
  });
}

/**
 * Get the full review schedule for a student across all courses.
 * GET /api/spaced-repetition/:studentId/schedule
 */
export async function getSchedule(studentId: string): Promise<ReviewItem[]> {
  if (USE_MOCK) {
    await new Promise(r => setTimeout(r, 500));
    // Filter mock data by student so the demo student sees only their own
    // schedule. Mirrors the backend's `find({ student_id })` behaviour.
    // Other mock students (e.g. stu-helper-002) remain in the source array
    // for teacher cohort views on /teacher/spaced-repetition.
    return MOCK_REVIEW_ITEMS.filter(i => i.student_id === studentId);
  }
  return apiFetch(`/api/spaced-repetition/${studentId}/schedule`);
}

/**
 * Get retention health summary for a student in a specific course.
 * GET /api/spaced-repetition/:studentId/course/:courseId
 */
export async function getCourseRetention(
  studentId: string,
  courseId: string,
): Promise<CourseRetentionSummary> {
  if (USE_MOCK) {
    await new Promise(r => setTimeout(r, 400));
    // Derive from mock schedule so any courseId yields a realistic summary.
    // Filter by student_id so the demo student only sees their own cards'
    // retention health (not helper students' data leaking in).
    return deriveMockRetention(courseId, studentId);
  }
  return apiFetch(`/api/spaced-repetition/${studentId}/course/${courseId}`);
}

/**
 * Toggle notification opt-out for all items in a course.
 * PATCH /api/spaced-repetition/:studentId/notifications
 */
export async function updateNotificationPreference(
  studentId: string,
  courseId: string,
  optOut: boolean,
): Promise<UpdateOptOutResponse> {
  if (USE_MOCK) {
    await new Promise(r => setTimeout(r, 300));
    let count = 0;
    MOCK_REVIEW_ITEMS.forEach((item, idx) => {
      if (item.course_id === courseId) {
        MOCK_REVIEW_ITEMS[idx] = { ...item, notification_opt_out: optOut };
        count++;
      }
    });
    if (count > 0) persistMockState();
    return { updatedCount: count };
  }
  return apiFetch(`/api/spaced-repetition/${studentId}/notifications`, {
    method: 'PATCH',
    body: JSON.stringify({ courseId, optOut }),
  });
}

/**
 * Force a question to be due immediately.
 * POST /api/spaced-repetition/:studentId/boost
 */
export async function boostReview(
  studentId: string,
  questionId: string,
  targetEF?: number,
): Promise<{ boosted: boolean; message: string }> {
  if (USE_MOCK) {
    await new Promise(r => setTimeout(r, 300));
    const idx = MOCK_REVIEW_ITEMS.findIndex(
      i => i.student_id === studentId && i.question_id === questionId,
    );
    if (idx === -1) throw new Error('Mock: review item not found for boost');
    // Boost: lower EF (default 1.3 = weakest possible), push next_review_at
    // to now so the student sees the question at the top of the session.
    const newEF = targetEF ?? 1.3;
    MOCK_REVIEW_ITEMS[idx] = {
      ...MOCK_REVIEW_ITEMS[idx],
      EF: newEF,
      n: 0,
      interval_days: 1,
      next_review_at: new Date().toISOString(),
      last_reviewed_at: null,
    };
    persistMockState();
    return { boosted: true, message: `Mock: Boosted question ${questionId}` };
  }
  return apiFetch(`/api/spaced-repetition/${studentId}/boost`, {
    method: 'POST',
    body: JSON.stringify({ questionId, targetEF }),
  });
}

/**
 * Set a remediation hint for a specific question.
 * PATCH /api/spaced-repetition/:studentId/remediation-hint
 */
export async function setRemediationHint(
  studentId: string,
  questionId: string,
  hint: string | null,
): Promise<{ message: string }> {
  if (USE_MOCK) {
    await new Promise(r => setTimeout(r, 300));
    const idx = MOCK_REVIEW_ITEMS.findIndex(
      i => i.student_id === studentId && i.question_id === questionId,
    );
    if (idx === -1) throw new Error('Mock: review item not found for hint');
    MOCK_REVIEW_ITEMS[idx] = {
      ...MOCK_REVIEW_ITEMS[idx],
      remediation_hint: hint,
    };
    persistMockState();
    return { message: `Mock: Hint ${hint ? 'set' : 'cleared'} for ${questionId}` };
  }
  return apiFetch(`/api/spaced-repetition/${studentId}/remediation-hint`, {
    method: 'PATCH',
    body: JSON.stringify({ questionId, hint }),
  });
}

/**
 * Bulk toggle notification opt-out for a cohort.
 * PATCH /api/spaced-repetition/bulk/notifications
 */
export async function bulkUpdateNotificationPreference(
  courseId: string,
  studentIds: string[],
  optOut: boolean,
): Promise<{ updatedCount: number }> {
  if (USE_MOCK) {
    await new Promise(r => setTimeout(r, 400));
    let count = 0;
    const studentIdSet = new Set(studentIds);
    MOCK_REVIEW_ITEMS.forEach((item, idx) => {
      if (item.course_id === courseId && studentIdSet.has(item.student_id)) {
        MOCK_REVIEW_ITEMS[idx] = { ...item, notification_opt_out: optOut };
        count++;
      }
    });
    if (count > 0) persistMockState();
    return { updatedCount: count };
  }
  return apiFetch(`/api/spaced-repetition/bulk/notifications`, {
    method: 'PATCH',
    body: JSON.stringify({ courseId, studentIds, optOut }),
  });
}

/**
 * Bulk toggle exam-prep mode for a cohort.
 * PATCH /api/spaced-repetition/bulk/exam-prep
 */
export async function bulkUpdateExamPrepMode(
  courseId: string,
  studentIds: string[],
  enabled: boolean,
): Promise<{ updatedCount: number }> {
  if (USE_MOCK) {
    await new Promise(r => setTimeout(r, 400));
    let count = 0;
    const studentIdSet = new Set(studentIds);
    MOCK_REVIEW_ITEMS.forEach((item, idx) => {
      if (item.course_id === courseId && studentIdSet.has(item.student_id)) {
        MOCK_REVIEW_ITEMS[idx] = { ...item, exam_prep_mode: enabled };
        count++;
      }
    });
    if (count > 0) persistMockState();
    return { updatedCount: count };
  }
  return apiFetch(`/api/spaced-repetition/bulk/exam-prep`, {
    method: 'PATCH',
    body: JSON.stringify({ courseId, studentIds, enabled }),
  });
}

/**
 * Get all unique students who have review schedules for a specific course.
 * GET /api/spaced-repetition/courses/:courseId/students
 */
export async function getCourseStudents(courseId: string): Promise<{ studentIds: string[] }> {
  if (USE_MOCK) {
    await new Promise(r => setTimeout(r, 400));
    // Find all unique students in the mock array for this course
    // MOCK_REVIEW_ITEMS uses 'mock-student'
    const students = Array.from(new Set(
      MOCK_REVIEW_ITEMS.filter(i => i.course_id === courseId).map(i => i.student_id)
    ));
    return { studentIds: students };
  }
  return apiFetch(`/api/spaced-repetition/courses/${courseId}/students`);
}

/**
 * Reset a specific question's review history.
 * POST /api/spaced-repetition/:studentId/reset
 */
export async function resetReview(
  studentId: string,
  questionId: string,
): Promise<{ reset: boolean; message: string }> {
  if (USE_MOCK) {
    await new Promise(r => setTimeout(r, 300));
    const idx = MOCK_REVIEW_ITEMS.findIndex(
      i => i.student_id === studentId && i.question_id === questionId,
    );
    if (idx === -1) throw new Error('Mock: review item not found for reset');
    // Reset to seed defaults: weakest possible, due immediately, no hint.
    MOCK_REVIEW_ITEMS[idx] = {
      ...MOCK_REVIEW_ITEMS[idx],
      n: 0,
      EF: 1.3,
      interval_days: 1,
      next_review_at: new Date().toISOString(),
      last_reviewed_at: null,
      remediation_hint: null,
    };
    persistMockState();
    return { reset: true, message: `Mock: Reset history for question ${questionId}` };
  }
  return apiFetch(`/api/spaced-repetition/${studentId}/reset`, {
    method: 'POST',
    body: JSON.stringify({ questionId }),
  });
}
