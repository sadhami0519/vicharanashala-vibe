import {
  ReviewItem,
  CourseRetentionSummary,
  RecallQuality,
  SeedScheduleResponse,
  SubmitReviewResponse,
  UpdateOptOutResponse,
} from '@/types/spaced-repetition.types';

// ── Toggle this to false when the backend is ready ─────────────────────────
const USE_MOCK = true;
const BASE_URL = import.meta.env.VITE_BASE_URL ?? '';

// ── Mock data ──────────────────────────────────────────────────────────────

const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);

const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);

const MOCK_REVIEW_ITEMS: ReviewItem[] = [
  // ── mock-course-1: mixed state (overdue + due soon + healthy) ──────────
  {
    _id: 'mock-item-1',
    student_id: 'mock-student',
    course_id: 'mock-course-1',
    question_id: 'mock-question-1',
    n: 0,
    EF: 2.5,
    interval_days: 1,
    next_review_at: yesterday.toISOString(), // overdue — for testing
    last_reviewed_at: null,
    notification_opt_out: false,
  },
  {
    _id: 'mock-item-2',
    student_id: 'mock-student',
    course_id: 'mock-course-1',
    question_id: 'mock-question-2',
    n: 1,
    EF: 2.6,
    interval_days: 6,
    next_review_at: tomorrow.toISOString(), // due soon — for testing
    last_reviewed_at: yesterday.toISOString(),
    notification_opt_out: false,
  },
  {
    _id: 'mock-item-3',
    student_id: 'mock-student',
    course_id: 'mock-course-1',
    question_id: 'mock-question-3',
    n: 2,
    EF: 2.7,
    interval_days: 16,
    next_review_at: yesterday.toISOString(), // overdue — for testing
    last_reviewed_at: yesterday.toISOString(),
    notification_opt_out: false,
  },
  // ── mock-course-2: healthy / mastered state ─────────────────────────────
  {
    _id: 'mock-item-4',
    student_id: 'mock-student',
    course_id: 'mock-course-2',
    question_id: 'mock-question-1',
    n: 4,
    EF: 2.8,
    interval_days: 30,
    next_review_at: futureDate(20).toISOString(), // far away — mastered
    last_reviewed_at: yesterday.toISOString(),
    notification_opt_out: false,
  },
  {
    _id: 'mock-item-5',
    student_id: 'mock-student',
    course_id: 'mock-course-2',
    question_id: 'mock-question-2',
    n: 5,
    EF: 3.0,
    interval_days: 60,
    next_review_at: futureDate(45).toISOString(), // far away — mastered
    last_reviewed_at: yesterday.toISOString(),
    notification_opt_out: true, // opted out
  },
];

function futureDate(daysFromNow: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d;
}

/**
 * Derive a CourseRetentionSummary from the mock schedule.
 * Mirrors what SpacedRepetitionService.getCourseRetention computes on the
 * backend: totalItems + overdueCount (next_review_at < now) + dueSoonCount
 * (next_review_at within 7 days, not overdue) + averageEF across all items
 * for the course.
 */
function deriveMockRetention(courseId: string): CourseRetentionSummary {
  const items = MOCK_REVIEW_ITEMS.filter(i => i.course_id === courseId);
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

// ── Helper — get auth token ────────────────────────────────────────────────

function getToken(): string {
  return localStorage.getItem('firebase-auth-token') ?? '';
}

// ── Helper — base fetch ────────────────────────────────────────────────────

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

// ── API functions ──────────────────────────────────────────────────────────

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
    const item = MOCK_REVIEW_ITEMS.find(i => i.question_id === questionId);
    if (!item) throw new Error('Mock: review item not found');
    // Simulate SM-2 update for got_it
    const updated: ReviewItem = {
      ...item,
      n: quality === 'missed' ? 0 : item.n + 1,
      last_reviewed_at: new Date().toISOString(),
      next_review_at: tomorrow.toISOString(),
    };
    return updated;
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
    return MOCK_REVIEW_ITEMS;
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
    return deriveMockRetention(courseId);
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
    MOCK_REVIEW_ITEMS.forEach(i => {
      if (i.course_id === courseId) i.notification_opt_out = optOut;
    });
    return {
      updatedCount: MOCK_REVIEW_ITEMS.filter(i => i.course_id === courseId)
        .length,
    };
  }
  return apiFetch(`/api/spaced-repetition/${studentId}/notifications`, {
    method: 'PATCH',
    body: JSON.stringify({ courseId, optOut }),
  });
}
